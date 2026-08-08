/**
 * FND-10 acceptance items "deriveStatus computes from evidenced events only" and "dates are
 * legal-date strings throughout" (PRD §15.2).
 */
import { describe, expect, it } from 'vitest';

import {
  LEGAL_EVENT_TYPES,
  deriveStatus,
  statusDisagreesWithCache,
  type LegalEvent,
  type TemporalStamps,
} from '../../src/legal/index.js';

const EVIDENCE = 'nv_01J0000000000000000000';

/**
 * NOTE: no default parameter for `evidence`. A default would be substituted when a test passes
 * `undefined` explicitly, which is exactly the "unevidenced event" case these tests must construct.
 */
function event(type: string, effective_date: string): LegalEvent {
  return { event_type: type, effective_date, evidence_node_version_id: EVIDENCE };
}

function unevidencedEvent(type: string, effective_date: string, evidence?: string): LegalEvent {
  return evidence === undefined
    ? { event_type: type, effective_date }
    : { event_type: type, effective_date, evidence_node_version_id: evidence };
}

describe('the local event vocabulary (plan OQ-4)', () => {
  it('is exactly the eight PRD-cited types and is frozen', () => {
    expect([...LEGAL_EVENT_TYPES]).toEqual([
      'BILL_INTRODUCED',
      'DRAFT_OR_CONSULTATION_PUBLISHED',
      'ENACTMENT',
      'COMMENCEMENT',
      'VARIATION',
      'REPLACEMENT',
      'REPEAL',
      'APPEAL',
    ]);
    expect(Object.isFrozen(LEGAL_EVENT_TYPES)).toBe(true);
  });
});

describe('deriveStatus maps each event type to its PRD status', () => {
  const EXPECTED: Readonly<Record<string, string>> = {
    BILL_INTRODUCED: 'BILL_NOT_ENACTED',
    DRAFT_OR_CONSULTATION_PUBLISHED: 'DRAFT_OR_CONSULTATION',
    ENACTMENT: 'ENACTED_NOT_IN_FORCE',
    COMMENCEMENT: 'IN_FORCE',
    REPLACEMENT: 'SUPERSEDED',
    REPEAL: 'REPEALED',
  };

  for (const [type, status] of Object.entries(EXPECTED)) {
    it(`${type} -> ${status}`, () => {
      expect(deriveStatus([event(type, '2024-01-01')], '2026-01-01')).toBe(status);
    });
  }

  it('VARIATION and APPEAL are status-NEUTRAL and never promote', () => {
    for (const neutral of ['VARIATION', 'APPEAL']) {
      expect(deriveStatus([event(neutral, '2024-01-01')], '2026-01-01'), neutral).toBe(
        'STATUS_UNCONFIRMED',
      );
      expect(
        deriveStatus([event('COMMENCEMENT', '2024-01-01'), event(neutral, '2025-01-01')], '2026-01-01'),
        neutral,
      ).toBe('IN_FORCE');
    }
  });

  it('an UNKNOWN event type is status-neutral and never promotes', () => {
    expect(deriveStatus([event('SOMETHING_ELSE', '2024-01-01')], '2026-01-01')).toBe('STATUS_UNCONFIRMED');
    expect(
      deriveStatus([event('COMMENCEMENT', '2024-01-01'), event('SOMETHING_ELSE', '2025-01-01')], '2026-01-01'),
    ).toBe('IN_FORCE');
  });
});

describe('deriveStatus is fail-closed', () => {
  it('returns STATUS_UNCONFIRMED with no events — NEVER IN_FORCE by default', () => {
    expect(deriveStatus([], '2026-01-01')).toBe('STATUS_UNCONFIRMED');
  });

  it('ignores UNEVIDENCED events entirely (PRD §15.2)', () => {
    expect(deriveStatus([unevidencedEvent('COMMENCEMENT', '2024-01-01')], '2026-01-01')).toBe(
      'STATUS_UNCONFIRMED',
    );
    expect(deriveStatus([unevidencedEvent('COMMENCEMENT', '2024-01-01', '')], '2026-01-01')).toBe(
      'STATUS_UNCONFIRMED',
    );
    // ... and an unevidenced repeal cannot demote an evidenced commencement either.
    expect(
      deriveStatus(
        [event('COMMENCEMENT', '2024-01-01'), unevidencedEvent('REPEAL', '2025-01-01')],
        '2026-01-01',
      ),
    ).toBe('IN_FORCE');
  });

  it('an event_type inherited from Object.prototype is not a status', () => {
    for (const type of ['constructor', 'toString', 'hasOwnProperty', '__proto__']) {
      expect(deriveStatus([event(type, '2024-01-01')], '2026-01-01'), type).toBe('STATUS_UNCONFIRMED');
      expect(
        deriveStatus([event('COMMENCEMENT', '2024-01-01'), event(type, '2025-01-01')], '2026-01-01'),
        type,
      ).toBe('IN_FORCE');
    }
  });

  it('ignores events with a malformed effective_date rather than coercing them', () => {
    expect(deriveStatus([event('COMMENCEMENT', '2024-02-30')], '2026-01-01')).toBe('STATUS_UNCONFIRMED');
    expect(deriveStatus([event('COMMENCEMENT', 'yesterday')], '2026-01-01')).toBe('STATUS_UNCONFIRMED');
  });

  it('returns STATUS_UNCONFIRMED when asAt itself is malformed', () => {
    expect(deriveStatus([event('COMMENCEMENT', '2024-01-01')], '2026-02-30')).toBe('STATUS_UNCONFIRMED');
  });

  it('is total for junk input', () => {
    expect(() => deriveStatus(null as unknown as LegalEvent[], '2026-01-01')).not.toThrow();
    expect(deriveStatus(null as unknown as LegalEvent[], '2026-01-01')).toBe('STATUS_UNCONFIRMED');
    expect(deriveStatus([null as unknown as LegalEvent], '2026-01-01')).toBe('STATUS_UNCONFIRMED');
  });
});

describe('deriveStatus is point-in-time (PRD §15.2, §36.2)', () => {
  const events = [event('COMMENCEMENT', '2024-07-01'), event('REPEAL', '2025-07-01')];

  it('is IN_FORCE between commencement and repeal', () => {
    expect(deriveStatus(events, '2025-06-30')).toBe('IN_FORCE');
  });

  it('is REPEALED on and after the repeal date (effective_date is inclusive of asAt)', () => {
    expect(deriveStatus(events, '2025-07-01')).toBe('REPEALED');
    expect(deriveStatus(events, '2026-01-01')).toBe('REPEALED');
  });

  it('is STATUS_UNCONFIRMED before commencement — a FUTURE event never relabels material current', () => {
    expect(deriveStatus(events, '2024-06-30')).toBe('STATUS_UNCONFIRMED');
    expect(deriveStatus([event('COMMENCEMENT', '2030-01-01')], '2026-01-01')).toBe('STATUS_UNCONFIRMED');
  });

  it('does not depend on the input order of the events', () => {
    expect(deriveStatus([...events].reverse(), '2026-01-01')).toBe('REPEALED');
    expect(deriveStatus([...events].reverse(), '2025-06-30')).toBe('IN_FORCE');
  });

  it('breaks a same-date tie by INPUT ORDER — the later entry wins (documented rule)', () => {
    const sameDay = [event('COMMENCEMENT', '2025-01-01'), event('REPEAL', '2025-01-01')];
    expect(deriveStatus(sameDay, '2025-01-01')).toBe('REPEALED');
    expect(deriveStatus([...sameDay].reverse(), '2025-01-01')).toBe('IN_FORCE');
  });

  it('does not mutate or reorder the caller array', () => {
    const caller = [event('REPEAL', '2025-07-01'), event('COMMENCEMENT', '2024-07-01')];
    const snapshot = caller.map((entry) => ({ ...entry }));
    deriveStatus(caller, '2026-01-01');
    expect(caller).toEqual(snapshot);
  });

  it('ignores event_date entirely — only effective_date drives the derivation', () => {
    const withEventDate: LegalEvent = {
      event_type: 'COMMENCEMENT',
      effective_date: '2024-07-01',
      event_date: '2099-01-01',
      evidence_node_version_id: EVIDENCE,
    };
    expect(deriveStatus([withEventDate], '2025-01-01')).toBe('IN_FORCE');
  });
});

describe('statusDisagreesWithCache — the DERIVED value always wins (PRD §15.2)', () => {
  const repealed = [event('COMMENCEMENT', '2024-07-01'), event('REPEAL', '2025-07-01')];

  it('reports a divergence naming both when the cache says IN_FORCE and the events say REPEALED', () => {
    expect(deriveStatus(repealed, '2026-01-01')).toBe('REPEALED');
    const divergence = statusDisagreesWithCache(repealed, '2026-01-01', 'IN_FORCE');
    expect(divergence).not.toBeNull();
    expect(divergence?.derived).toBe('REPEALED');
    expect(divergence?.cached).toBe('IN_FORCE');
    expect(divergence?.as_at).toBe('2026-01-01');
  });

  it('returns null when they agree', () => {
    expect(statusDisagreesWithCache(repealed, '2026-01-01', 'REPEALED')).toBeNull();
    expect(statusDisagreesWithCache([], '2026-01-01', 'STATUS_UNCONFIRMED')).toBeNull();
  });

  it('treats a cached value outside the vocabulary as a divergence', () => {
    const divergence = statusDisagreesWithCache([], '2026-01-01', 'PROBABLY_FINE');
    expect(divergence?.derived).toBe('STATUS_UNCONFIRMED');
    expect(divergence?.cached).toBe('PROBABLY_FINE');
  });

  it('the cached status can never become the derived answer — deriveStatus does not accept one', () => {
    for (const cached of ['IN_FORCE', 'SUPERSEDED', 'STATUS_UNCONFIRMED', 'REPEALED']) {
      expect(statusDisagreesWithCache(repealed, '2026-01-01', cached)?.derived ?? 'REPEALED').toBe(
        'REPEALED',
      );
    }
    expect(deriveStatus.length, 'deriveStatus takes exactly (events, asAt)').toBe(2);
  });

  it('returns a frozen divergence', () => {
    const divergence = statusDisagreesWithCache(repealed, '2026-01-01', 'IN_FORCE');
    expect(Object.isFrozen(divergence)).toBe(true);
  });
});

describe('the four §15.2 times stay distinguishable, and no Date crosses the boundary', () => {
  it('carries four independently settable fields', () => {
    const stamps: TemporalStamps = {
      published_at: '2024-06-01',
      effective_from: '2024-07-01',
      effective_to: null,
      retrieved_at: '2026-08-03T01:02:03Z',
      recorded_at: '2026-08-04T05:06:07Z',
    };
    expect(Object.keys(stamps).sort()).toEqual([
      'effective_from',
      'effective_to',
      'published_at',
      'recorded_at',
      'retrieved_at',
    ]);
    expect(stamps.published_at).not.toBe(stamps.effective_from);
    expect(stamps.retrieved_at).not.toBe(stamps.recorded_at);
  });

  it('every value this module returns or accepts is a string, never a Date instance', () => {
    const divergence = statusDisagreesWithCache([event('REPEAL', '2025-07-01')], '2026-01-01', 'IN_FORCE');
    expect(divergence?.as_at).toBeTypeOf('string');
    expect(divergence?.as_at).not.toBeInstanceOf(Date);
    expect(deriveStatus([event('COMMENCEMENT', '2024-07-01')], '2025-01-01')).toBeTypeOf('string');
  });
});
