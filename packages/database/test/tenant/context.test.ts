import { afterEach, describe, expect, it, vi } from 'vitest';

import { resetTenantAuditSink, setTenantAuditSink } from '../../src/tenant/audit.js';
import type { TenantAuditEvent } from '../../src/tenant/audit.js';
import {
  ELEVATION_MAX_AGE_MS,
  SYSTEM_ORGANIZATION_ID,
  assertTenantContext,
  crossTenantElevatedContext,
  isSystemContext,
  isTenantContext,
  systemContext,
  tenantContextFromJobLease,
  tenantContextFromSession,
} from '../../src/tenant/context.js';
import type { TenantAccessError } from '../../src/tenant/errors.js';
import { ORG_A, ORG_B, principal } from './helpers.js';

afterEach(() => {
  resetTenantAuditSink();
});

function captureAudit(): TenantAuditEvent[] {
  const events: TenantAuditEvent[] = [];
  setTenantAuditSink((event) => events.push(event));
  return events;
}

describe('tenantContextFromSession (PRD §16.5)', () => {
  it('builds a branded context for a member principal', () => {
    const ctx = tenantContextFromSession(principal(ORG_A), ORG_A, 'req-1');
    expect(ctx.organizationId).toBe(ORG_A);
    expect(ctx.actorType).toBe('USER');
    expect(ctx.requestId).toBe('req-1');
    expect(isTenantContext(ctx)).toBe(true);
    expect(ctx.elevation).toBeUndefined();
    expect('elevation' in ctx).toBe(false);
  });

  it('refuses a principal that belongs to another organisation', () => {
    expect(() => tenantContextFromSession(principal(ORG_B), ORG_A, 'req-1')).toThrow(/not a member/);
  });

  it('refuses a principal that occupies no PRD §38.1 column', () => {
    const rogue = { ...principal(ORG_A), kind: 'SERVICE_ACCOUNT' as const };
    // A service account carrying a role occupies no column — FND-06's `principalColumn` says so, and
    // this layer takes that answer rather than inventing its own.
    expect(() => tenantContextFromSession(rogue, ORG_A, 'req-1')).toThrow(/no role\/permission/);
  });

  it('refuses the reserved system organisation', () => {
    expect(() =>
      tenantContextFromSession(principal(SYSTEM_ORGANIZATION_ID), SYSTEM_ORGANIZATION_ID, 'req-1'),
    ).toThrow(/reserved/);
  });

  it('refuses an empty requestId', () => {
    expect(() => tenantContextFromSession(principal(ORG_A), ORG_A, '')).toThrow(/requestId/);
  });
});

describe('the context cannot be forged or mutated', () => {
  it('is frozen', () => {
    const ctx = tenantContextFromSession(principal(ORG_A), ORG_A, 'req-1');
    expect(Object.isFrozen(ctx)).toBe(true);
    expect(() => {
      (ctx as unknown as Record<string, unknown>)['organizationId'] = ORG_B;
    }).toThrow();
  });

  it('loses its brand when spread — the classic forgery', () => {
    const ctx = tenantContextFromSession(principal(ORG_A), ORG_A, 'req-1');
    const forged = { ...ctx, organizationId: ORG_B };
    expect(isTenantContext(forged)).toBe(false);
    expect(() => assertTenantContext(forged)).toThrow(/spread copy/);
  });

  it('rejects a hand-built object with every field present', () => {
    expect(
      isTenantContext({
        organizationId: ORG_A,
        actorId: 'user-1',
        actorType: 'USER',
        permissions: new Set(),
        requestId: 'req-1',
      }),
    ).toBe(false);
  });

  it('exposes permissions as a genuinely immutable set', () => {
    const ctx = tenantContextFromSession(principal(ORG_A), ORG_A, 'req-1');
    expect(ctx.permissions.has('ANSWER_CREATE')).toBe(true);
    expect(ctx.permissions.size).toBe(2);
    expect([...ctx.permissions]).toContain('ANSWER_CREATE');
    // `Object.freeze(new Set())` would leave `.add` working; the facade has no `add` at all.
    expect((ctx.permissions as unknown as Record<string, unknown>)['add']).toBeUndefined();
    expect((ctx.permissions as unknown as Record<string, unknown>)['delete']).toBeUndefined();
  });
});

describe('tenantContextFromJobLease (PRD §18.5 step 3)', () => {
  const lease = {
    jobId: 'job-1',
    organizationId: ORG_A,
    actorId: 'user-1',
    actorType: 'USER' as const,
    grants: [] as const,
  };

  it('re-authorises a leased job into a tenant context', () => {
    const ctx = tenantContextFromJobLease(lease, 'req-9');
    expect(ctx.organizationId).toBe(ORG_A);
    expect(ctx.requestId).toBe('req-9');
    expect(isTenantContext(ctx)).toBe(true);
  });

  it('refuses a SYSTEM actor — that comes from systemContext()', () => {
    expect(() =>
      tenantContextFromJobLease({ ...lease, actorType: 'SYSTEM' as never }, 'req-9'),
    ).toThrow(/systemContext/);
  });

  it('refuses a lease without a jobId or organisation', () => {
    expect(() => tenantContextFromJobLease({ ...lease, jobId: '' }, 'req-9')).toThrow(/jobId/);
    expect(() => tenantContextFromJobLease({ ...lease, organizationId: '' }, 'req-9')).toThrow(
      /organizationId/,
    );
  });
});

describe('systemContext (PRD §35.6)', () => {
  it('carries the reserved organisation and the SYSTEM actor type', () => {
    const ctx = systemContext('GLOBAL', 'req-1');
    expect(ctx.organizationId).toBe(SYSTEM_ORGANIZATION_ID);
    expect(ctx.actorType).toBe('SYSTEM');
    expect(isSystemContext(ctx)).toBe(true);
  });

  it('refuses a TENANT scope', () => {
    expect(() => systemContext('TENANT' as never, 'req-1')).toThrow(/GLOBAL-scoped tables only/);
  });

  it('is not a system context for an ordinary tenant context', () => {
    expect(isSystemContext(tenantContextFromSession(principal(ORG_A), ORG_A, 'r'))).toBe(false);
  });
});

describe('crossTenantElevatedContext (PRD §21.2 break-glass)', () => {
  const base = {
    organizationId: ORG_B,
    actorId: 'support-1',
    reason: 'incident triage',
    incidentId: 'INC-42',
    recentAuthAt: Date.now(),
    requestId: 'req-1',
  };

  it('grants and audits exactly once', () => {
    const events = captureAudit();
    const ctx = crossTenantElevatedContext(base);
    expect(ctx.organizationId).toBe(ORG_B);
    expect(ctx.elevation).toEqual({
      reason: 'incident triage',
      incidentId: 'INC-42',
      recentAuthAt: base.recentAuthAt,
    });
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      event: 'CROSS_TENANT_ELEVATION_GRANTED',
      actorId: 'support-1',
      organizationId: ORG_B,
      incidentId: 'INC-42',
    });
  });

  it('audits synchronously, before it returns', () => {
    let seenBeforeReturn = false;
    setTenantAuditSink(() => {
      seenBeforeReturn = true;
    });
    crossTenantElevatedContext(base);
    expect(seenBeforeReturn).toBe(true);
  });

  it('throws without a reason', () => {
    expect(() => crossTenantElevatedContext({ ...base, reason: '  ' })).toThrow(/non-empty reason/);
  });

  it('throws without an incidentId', () => {
    expect(() => crossTenantElevatedContext({ ...base, incidentId: '' })).toThrow(/incidentId/);
  });

  it('throws when the authentication is outside the window', () => {
    expect(() =>
      crossTenantElevatedContext({ ...base, recentAuthAt: Date.now() - ELEVATION_MAX_AGE_MS - 1000 }),
    ).toThrow(/ELEVATION_MAX_AGE_MS/);
  });

  it('throws on a future authentication timestamp', () => {
    expect(() =>
      crossTenantElevatedContext({ ...base, recentAuthAt: Date.now() + ELEVATION_MAX_AGE_MS * 4 }),
    ).toThrow(/future/);
  });

  it('audits a refusal as well as a grant', () => {
    const events = captureAudit();
    expect(() => crossTenantElevatedContext({ ...base, reason: '' })).toThrow();
    expect(events).toHaveLength(1);
    expect(events[0]?.event).toBe('CROSS_TENANT_ELEVATION_REFUSED');
  });

  it('does not let a throwing sink swallow the refusal', () => {
    setTenantAuditSink(() => {
      throw new Error('sink is down');
    });
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    try {
      expect(() => crossTenantElevatedContext({ ...base, reason: '' })).toThrow(/non-empty reason/);
    } finally {
      warn.mockRestore();
    }
  });

  /**
   * Review round 1: the refusal path above is right to contain a sink failure, but the *grant* path
   * must not — an elevation granted while its audit record is silently lost is the outcome PRD §21.2's
   * audited path exists to prevent. Sub-PRD D13 hands the contract to `DATA-07`.
   */
  it('grants nothing when the sink fails to record the grant', () => {
    setTenantAuditSink((event) => {
      if (event.event === 'CROSS_TENANT_ELEVATION_GRANTED') throw new Error('audit store is down');
    });
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    try {
      let granted: unknown = 'not-thrown';
      expect(() => {
        granted = crossTenantElevatedContext(base);
      }).toThrow(/audited path/);
      expect(granted).toBe('not-thrown');
      try {
        crossTenantElevatedContext(base);
      } catch (error) {
        expect((error as TenantAccessError).code).toBe('AUDIT_SINK_FAILED');
      }
      // A failure that is loud must not *also* be quietly warned about as if it were contained.
      expect(warn).not.toHaveBeenCalled();
    } finally {
      warn.mockRestore();
    }
  });

  /**
   * Review round 2, finding 2. `TenantAuditSink` is `(event) => void`, and TypeScript's bivariant
   * checking of that shape accepts an `async` sink with no warning: it returns `Promise<void>`, which
   * is assignable to `void`. Before the fix, `sink(event)` returned immediately, `emitTenantAudit`'s
   * `try/catch` had already exited, and `crossTenantElevatedContext` returned a live cross-organisation
   * context to its caller before the async sink's later rejection was even observable — the rejection
   * then surfaced afterwards as a process-killing unhandled rejection, not as a caught error. This
   * reproduces that exploit and asserts the grant is now refused synchronously instead.
   */
  it('does not grant when the sink is async and its returned promise later rejects', () => {
    const unhandled: unknown[] = [];
    const onUnhandledRejection = (reason: unknown): void => {
      unhandled.push(reason);
    };
    process.on('unhandledRejection', onUnhandledRejection);
    setTenantAuditSink(async (event) => {
      if (event.event === 'CROSS_TENANT_ELEVATION_GRANTED') {
        throw new Error('audit store down');
      }
    });
    try {
      let granted: unknown = 'not-thrown';
      expect(() => {
        granted = crossTenantElevatedContext(base);
      }).toThrow(/synchronous sink/);
      expect(granted).toBe('not-thrown');
    } finally {
      process.off('unhandledRejection', onUnhandledRejection);
    }
    // Give the sink's own rejected promise a turn of the microtask queue; emitTenantAudit must have
    // already observed and discarded it so it cannot also surface as an unhandled rejection.
    return new Promise<void>((resolve) => {
      setTimeout(() => {
        expect(unhandled).toHaveLength(0);
        resolve();
      }, 0);
    });
  });
});
