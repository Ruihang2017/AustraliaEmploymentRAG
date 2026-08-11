/**
 * The audit seam's failure contract (deliverable 8, sub-PRD D13).
 *
 * `context.test.ts` covers what the break-glass factory emits. This file covers what happens when the
 * sink itself fails, which review round 1 found unstated: refusals stay contained, grants fail closed,
 * and no security refusal anywhere in the layer can be masked by a broken audit store.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';

import { emitTenantAudit, resetTenantAuditSink, setTenantAuditSink } from '../../src/tenant/audit.js';
import type { TenantAuditEvent, TenantAuditEventName } from '../../src/tenant/audit.js';
import { TenantAccessError } from '../../src/tenant/errors.js';
import { defineTenantRepository } from '../../src/tenant/repository.js';
import { withTenantTransaction } from '../../src/tenant/transaction.js';
import { CHILD_SPEC, ORG_A, ORG_B, contextFor, withTenantDatabase } from './helpers.js';

afterEach(() => {
  resetTenantAuditSink();
});

const child = defineTenantRepository({ table: 't_child', spec: CHILD_SPEC });

function event(name: TenantAuditEventName): TenantAuditEvent {
  return { event: name, actorId: 'actor-1', organizationId: ORG_A, requestId: 'req-1' };
}

const REFUSALS: TenantAuditEventName[] = [
  'CROSS_TENANT_ELEVATION_REFUSED',
  'UNSCOPED_STATEMENT_REFUSED',
  'CROSS_TENANT_ACCESS_REFUSED',
];

describe('emitTenantAudit — a throwing sink', () => {
  it('is contained, and warned about, for every refusal event', () => {
    setTenantAuditSink(() => {
      throw new Error('audit store is down');
    });
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    try {
      for (const name of REFUSALS) {
        expect(() => emitTenantAudit(event(name))).not.toThrow();
      }
      expect(warn).toHaveBeenCalledTimes(REFUSALS.length);
    } finally {
      warn.mockRestore();
    }
  });

  it('propagates for a grant event, as AUDIT_SINK_FAILED', () => {
    setTenantAuditSink(() => {
      throw new Error('audit store is down');
    });
    try {
      emitTenantAudit(event('CROSS_TENANT_ELEVATION_GRANTED'));
      expect.unreachable('a failed grant record must not be swallowed');
    } catch (error) {
      expect(error).toBeInstanceOf(TenantAccessError);
      expect((error as TenantAccessError).code).toBe('AUDIT_SINK_FAILED');
      expect((error as Error).message).toMatch(/audit store is down/);
    }
  });

  it('does not mask a cross-tenant repository refusal', async () => {
    // The refusal is the security outcome. An audit outage must not change which error the caller
    // sees, or the caller could plausibly retry into a different code path.
    await withTenantDatabase(({ db }) => {
      setTenantAuditSink(() => {
        throw new Error('audit store is down');
      });
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
      try {
        const repoB = child.for(db, contextFor(ORG_B));
        withTenantTransaction(db, contextFor(ORG_A), (tx) => {
          try {
            repoB.insert(tx, { id: 'c1', parent_id: 'p1' });
            expect.unreachable('a cross-organisation write must be refused');
          } catch (error) {
            expect((error as TenantAccessError).code).toBe('ELEVATION_REQUIRED');
          }
        });
        expect(warn).toHaveBeenCalled();
      } finally {
        warn.mockRestore();
      }
    });
  });
});
