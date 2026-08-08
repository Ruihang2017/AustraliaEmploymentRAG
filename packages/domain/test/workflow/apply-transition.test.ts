/**
 * FND-08 deliverable 3 and acceptance item 6 — `applyTransition`: order of checks, `row_version + 1`,
 * the reject-vs-throw split, and the `retainWatches` flag.
 */
import { describe, expect, it } from 'vitest';

import {
  applyTransition,
  type RecordWorkflowSnapshot,
  type TransitionRequest,
} from '../../src/workflow/apply-transition.js';
import { computeETag } from '../../src/workflow/etag.js';
import { TRANSITIONS } from '../../src/workflow/transitions.js';

const RECORD_ID = 'rec_0193f2c1';

function snapshot(overrides: Partial<RecordWorkflowSnapshot> = {}): RecordWorkflowSnapshot {
  return {
    id: RECORD_ID,
    state: 'DRAFT',
    rowVersion: 7,
    reviewerAssigned: true,
    savedAnswerCount: 2,
    ...overrides,
  };
}

/** A request that satisfies every derivable condition, so only the pair and the actor decide. */
function fullRequest(overrides: Partial<TransitionRequest> = {}): TransitionRequest {
  return {
    to: 'IN_REVIEW',
    actor: 'owner',
    ifMatch: computeETag(7, RECORD_ID),
    reason: '  supersedes turn 4  ',
    trigger: 'SOURCE_CHANGE',
    replacementRef: 'ans_01',
    disclaimerAcknowledged: true,
    confirmed: true,
    ...overrides,
  };
}

describe('applyTransition happy path, for each of the twelve transitions', () => {
  for (const transition of TRANSITIONS) {
    const label = `${transition.from}->${transition.to}`;
    it(`applies ${label}`, () => {
      const record = snapshot({ state: transition.from });
      const actor = transition.allowedActors[0] ?? 'owner';
      const outcome = applyTransition(
        record,
        fullRequest({ to: transition.to, actor, ifMatch: computeETag(record.rowVersion, record.id) }),
      );

      expect(outcome.ok, `${label} was rejected`).toBe(true);
      if (!outcome.ok) return;
      expect(outcome.next.state).toBe(transition.to);
      expect(outcome.next.rowVersion, `${label}: row_version must increment by one`).toBe(
        record.rowVersion + 1,
      );
      expect(outcome.next.etag).toBe(computeETag(record.rowVersion + 1, record.id));
      expect(outcome.next.etag).not.toBe(computeETag(record.rowVersion, record.id));
      expect(outcome.next.reason, 'the reason is returned trimmed').toBe('supersedes turn 4');
      expect(outcome.next.trigger).toBe('SOURCE_CHANGE');
      expect(outcome.next.retainWatches).toBe(true);
      expect(outcome.next.transition).toBe(transition);
      expect(Object.isFrozen(outcome.next)).toBe(true);
    });
  }
});

describe('the returned payload', () => {
  it('reports reason and trigger as null when the request carries neither', () => {
    const record = snapshot({ state: 'IN_REVIEW' });
    const outcome = applyTransition(record, {
      to: 'CUSTOMER_REVIEWED',
      actor: 'reviewer',
      ifMatch: computeETag(record.rowVersion, record.id),
      disclaimerAcknowledged: true,
    });
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.next.reason).toBeNull();
    expect(outcome.next.trigger).toBeNull();
  });

  it('drops an unknown trigger rather than echoing it back', () => {
    const record = snapshot({ state: 'IN_REVIEW' });
    const outcome = applyTransition(record, {
      to: 'CUSTOMER_REVIEWED',
      actor: 'reviewer',
      ifMatch: computeETag(record.rowVersion, record.id),
      disclaimerAcknowledged: true,
      trigger: 'WHATEVER',
    });
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.next.trigger).toBeNull();
  });

  it('honours retainWatches: omitted is true, explicit false is false', () => {
    const record = snapshot({ state: 'DRAFT' });
    const base: TransitionRequest = {
      to: 'ARCHIVED',
      actor: 'owner',
      ifMatch: computeETag(record.rowVersion, record.id),
      confirmed: true,
    };
    const kept = applyTransition(record, base);
    const dropped = applyTransition(record, { ...base, retainWatches: false });
    const explicit = applyTransition(record, { ...base, retainWatches: true });
    expect(kept.ok && kept.next.retainWatches).toBe(true);
    expect(dropped.ok && dropped.next.retainWatches).toBe(false);
    expect(explicit.ok && explicit.next.retainWatches).toBe(true);
  });

  it('mutates nothing the caller supplied and returns no caller reference', () => {
    const record = snapshot({ state: 'DRAFT' });
    const before = JSON.stringify(record);
    const request = fullRequest({ to: 'IN_REVIEW', actor: 'owner' });
    const requestBefore = JSON.stringify(request);
    const outcome = applyTransition(record, request);
    expect(outcome.ok).toBe(true);
    expect(JSON.stringify(record)).toBe(before);
    expect(JSON.stringify(request)).toBe(requestBefore);
    if (!outcome.ok) return;
    expect(outcome.next.transition).not.toBe(request);
  });

  it('is deterministic — the same inputs give an identical result', () => {
    const record = snapshot({ state: 'DRAFT' });
    const request = fullRequest({ to: 'IN_REVIEW', actor: 'owner' });
    expect(applyTransition(record, request)).toEqual(applyTransition(record, request));
  });
});

describe('order of checks: staleness before validity', () => {
  const record = snapshot({ state: 'DRAFT' });
  const fresh = computeETag(record.rowVersion, record.id);

  it('returns STALE, not INVALID_TRANSITION, when the ETag is stale AND the pair is invalid', () => {
    expect(
      applyTransition(record, {
        to: 'CUSTOMER_REVIEWED',
        actor: 'nobody',
        ifMatch: computeETag(record.rowVersion - 1, record.id),
      }),
    ).toEqual({ ok: false, reason: 'STALE' });
  });

  it('returns MISSING when no If-Match was supplied, whatever else is wrong', () => {
    expect(applyTransition(record, { to: 'CUSTOMER_REVIEWED', actor: 'nobody' })).toEqual({
      ok: false,
      reason: 'MISSING',
    });
    expect(applyTransition(record, { to: 'IN_REVIEW', actor: 'owner', ifMatch: '  ' })).toEqual({
      ok: false,
      reason: 'MISSING',
    });
  });

  it('returns STALE for an ETag computed against another resource', () => {
    expect(
      applyTransition(record, {
        to: 'IN_REVIEW',
        actor: 'owner',
        ifMatch: computeETag(record.rowVersion, 'rec_other'),
      }),
    ).toEqual({ ok: false, reason: 'STALE' });
  });

  it('surfaces INVALID_TRANSITION, ACTOR_NOT_PERMITTED and CONDITION_NOT_MET once fresh', () => {
    expect(applyTransition(record, { to: 'CUSTOMER_REVIEWED', actor: 'owner', ifMatch: fresh })).toEqual(
      { ok: false, reason: 'INVALID_TRANSITION' },
    );
    expect(applyTransition(record, { to: 'IN_REVIEW', actor: 'admin', ifMatch: fresh })).toEqual({
      ok: false,
      reason: 'ACTOR_NOT_PERMITTED',
    });
    expect(
      applyTransition(snapshot({ state: 'DRAFT', reviewerAssigned: false, savedAnswerCount: 0 }), {
        to: 'IN_REVIEW',
        actor: 'owner',
        ifMatch: fresh,
      }),
    ).toEqual({
      ok: false,
      reason: 'CONDITION_NOT_MET',
      missingConditions: ['REVIEWER_ASSIGNED', 'AT_LEAST_ONE_SAVED_ANSWER'],
    });
  });

  it('takes `from` from the record, so a request cannot smuggle one', () => {
    const smuggled = {
      to: 'DRAFT',
      actor: 'owner',
      ifMatch: fresh,
      reason: 'let me in',
      from: 'ARCHIVED',
    } as unknown as TransitionRequest;
    // record.state is DRAFT, so DRAFT->DRAFT is a self-transition even though the request claims
    // to be starting from ARCHIVED (ARCHIVED->DRAFT is a valid §32.6 pair).
    expect(applyTransition(record, smuggled)).toEqual({
      ok: false,
      reason: 'INVALID_TRANSITION',
    });
  });
});

describe('reject vs throw', () => {
  it('throws only for a caller bug, naming the field', () => {
    const request = fullRequest({ to: 'IN_REVIEW', actor: 'owner' });
    expect(() => applyTransition(snapshot({ id: '' }), request)).toThrow(TypeError);
    expect(() => applyTransition(snapshot({ id: '' }), request)).toThrow(/record\.id/);
    expect(() => applyTransition(snapshot({ rowVersion: 1.5 }), request)).toThrow(TypeError);
    expect(() => applyTransition(snapshot({ rowVersion: -1 }), request)).toThrow(RangeError);
    expect(() =>
      applyTransition(snapshot({ rowVersion: Number.MAX_SAFE_INTEGER }), request),
    ).toThrow(RangeError);
    expect(() =>
      applyTransition(snapshot({ rowVersion: Number.MAX_SAFE_INTEGER - 1 }), request),
    ).toThrow(RangeError);
  });

  it('never echoes the user-supplied reason in a thrown message (it may carry PII)', () => {
    const secret = 'ACME Pty Ltd owes 12345 in GST — contact jane@example.com';
    for (const record of [
      snapshot({ id: '' }),
      snapshot({ rowVersion: -1 }),
      snapshot({ rowVersion: 1.5 }),
    ]) {
      let message = '';
      try {
        applyTransition(record, fullRequest({ reason: secret }));
      } catch (error) {
        message = error instanceof Error ? error.message : String(error);
      }
      expect(message, 'a thrown message leaked the reason text').not.toContain('ACME');
      expect(message).not.toContain('example.com');
      expect(message.length).toBeGreaterThan(0);
    }
  });

  it('rejects rather than throws for anything a user or peer service can cause', () => {
    const record = snapshot({ state: 'DRAFT' });
    for (const request of [
      { to: 'ARCHIVED', actor: 'owner' } as TransitionRequest,
      { to: 'nonsense', actor: 'nonsense', ifMatch: 'nonsense' } as TransitionRequest,
      { to: 'IN_REVIEW', actor: 'system', ifMatch: computeETag(7, RECORD_ID) } as TransitionRequest,
    ]) {
      expect(() => applyTransition(record, request)).not.toThrow();
      expect(applyTransition(record, request).ok).toBe(false);
    }
  });
});
