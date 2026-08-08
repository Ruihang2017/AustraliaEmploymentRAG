/**
 * FND-10 deliverable 3 — effective-interval semantics (sub-PRD D12, open question Q-F4, PRD §35.2).
 *
 * SUB-PRD D12, carried forward verbatim: effective intervals are **closed and inclusive** —
 * `[effective_from, effective_to]` — with `effective_to: null` meaning open-ended, and adjacent
 * consolidated versions must satisfy `next.effective_from > prev.effective_to`. A SHARED boundary date
 * is therefore an OVERLAP, not an adjacency.
 *
 * This is a CROSS-MODULE SEMANTIC shared with `04-corpus-contract`/`CRPS-01`, which owns the
 * `document_version` columns. It is recorded as sub-PRD open question **Q-F4**: if `CRPS-01` models
 * `effective_to` as exclusive, the two conventions produce silently wrong point-in-time results (the
 * failure `UAT-SRCH-03` is designed to catch, and it would pass on both sides in isolation). Write back
 * to `docs/prd/00-foundation/README.md` D12/Q-F4 and raise it on `docs/prd/breakdown-plan.md` §4.2
 * BEFORE either side changes code.
 */
import { compareLegalDate, isLegalDate, type LegalDate } from './dates.js';

export interface EffectiveInterval {
  readonly effective_from: LegalDate;
  /** `null` = open-ended: the version is still effective at every date on or after `effective_from`. */
  readonly effective_to: LegalDate | null;
}

/** Why a pair (or a single row) is offending. */
export type OverlapReason =
  /** Two versions are both effective on at least one date. */
  | 'OVERLAP'
  /** A single row's `effective_to` precedes its `effective_from`; `left === right`. */
  | 'INVERTED_INTERVAL'
  /** A single row carries a date that is not a `YYYY-MM-DD` calendar day; `left === right`. */
  | 'MALFORMED_DATE';

export interface Overlap {
  /** Index into the input array. */
  readonly left: number;
  /** Index into the input array; equal to `left` for a single-row defect. */
  readonly right: number;
  readonly reason: OverlapReason;
  /** Human-readable, ids-and-dates only — never source text. */
  readonly detail: string;
}

function render(interval: EffectiveInterval): string {
  return `[${String(interval.effective_from)},${interval.effective_to === null ? 'null' : String(interval.effective_to)}]`;
}

/**
 * `true` when `date` falls inside the CLOSED INCLUSIVE interval `[effective_from, effective_to]`
 * (sub-PRD D12). `effective_to: null` is open-ended.
 *
 * TOTAL and fail-closed: a malformed date on either side, or an inverted interval, yields `false`
 * rather than an exception. This predicate is a conjunct of the PRD §36.2 hard filter and sits behind
 * the API boundary, so it is called with values whose declared types are not runtime guarantees.
 */
export function effectiveIntervalContains(interval: EffectiveInterval, date: LegalDate): boolean {
  if (interval === null || typeof interval !== 'object') return false;
  if (!isLegalDate(date)) return false;
  const from = interval.effective_from;
  const to = interval.effective_to;
  if (!isLegalDate(from)) return false;
  if (to !== null && !isLegalDate(to)) return false;
  if (to !== null && compareLegalDate(to, from) < 0) return false;
  if (compareLegalDate(date, from) < 0) return false;
  if (to !== null && compareLegalDate(date, to) > 0) return false;
  return true;
}

/**
 * PRD §35.2's *"non-overlap validation where versions represent consolidated effect"*.
 *
 * RETURNS the offending pairs rather than throwing, so `04-corpus-contract` can QUARANTINE a document
 * rather than crash a whole release build (ticket deliverable 3).
 *
 * ALL ORDERED PAIRS `i < j` are checked, not only sorted-adjacent ones. Sorted-adjacent checking misses
 * `[A,null] · [B,C] · [D,null]`, where rows 0 and 2 overlap through an open-ended interval while each
 * adjacent check passes. All-pairs is O(n²) over the versions of ONE document — trivially small — and
 * is strictly stronger than the ticket's "adjacent" wording, never weaker.
 *
 * Malformed dates and inverted intervals are reported with their own `reason` and `left === right`,
 * again so the caller quarantines instead of crashing. The function never throws and never sorts,
 * copies or otherwise touches the caller's array. Results are emitted in `(i, j)` ascending order, so
 * two runs over the same input are byte-identical.
 */
export function assertNonOverlapping(versions: readonly EffectiveInterval[]): Overlap[] {
  const overlaps: Overlap[] = [];
  if (!Array.isArray(versions)) return overlaps;

  const wellFormed: boolean[] = [];
  for (let i = 0; i < versions.length; i += 1) {
    const version = versions[i];
    if (version === undefined || version === null || typeof version !== 'object') {
      wellFormed.push(false);
      overlaps.push({ left: i, right: i, reason: 'MALFORMED_DATE', detail: `version ${i} is not an interval` });
      continue;
    }
    const from = version.effective_from;
    const to = version.effective_to;
    if (!isLegalDate(from) || (to !== null && !isLegalDate(to))) {
      wellFormed.push(false);
      overlaps.push({ left: i, right: i, reason: 'MALFORMED_DATE', detail: `${render(version)} is not a YYYY-MM-DD interval` });
      continue;
    }
    if (to !== null && compareLegalDate(to, from) < 0) {
      wellFormed.push(false);
      overlaps.push({ left: i, right: i, reason: 'INVERTED_INTERVAL', detail: `${render(version)} ends before it starts` });
      continue;
    }
    wellFormed.push(true);
  }

  for (let i = 0; i < versions.length; i += 1) {
    if (wellFormed[i] !== true) continue;
    for (let j = i + 1; j < versions.length; j += 1) {
      if (wellFormed[j] !== true) continue;
      const a = versions[i];
      const b = versions[j];
      if (a === undefined || b === undefined) continue;
      // Closed inclusive intervals intersect iff each starts on or before the other ends (D12).
      const aEndsBeforeB = a.effective_to !== null && compareLegalDate(a.effective_to, b.effective_from) < 0;
      const bEndsBeforeA = b.effective_to !== null && compareLegalDate(b.effective_to, a.effective_from) < 0;
      if (aEndsBeforeB || bEndsBeforeA) continue;
      overlaps.push({
        left: i,
        right: j,
        reason: 'OVERLAP',
        detail: `${render(a)} ∩ ${render(b)}`,
      });
    }
  }

  // Single deterministic order for the whole result: `(left, right)` ascending, so single-row defects
  // sort immediately before the pair findings that start at the same index.
  overlaps.sort((x, y) => (x.left === y.left ? x.right - y.right : x.left - y.left));
  return overlaps;
}
