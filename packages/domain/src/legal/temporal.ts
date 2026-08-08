/**
 * FND-10 deliverable 7 — the PRD §15.2 four-time temporal model and status derived from evidenced
 * `LegalEvent`s.
 *
 * PRD §15.2, verbatim: *"The system MUST distinguish: publication time; effective time; retrieval time;
 * system knowledge/recorded time."* and *"Legal status MUST be derived from evidenced LegalEvents.
 * Cached status fields MAY improve performance but are not the authoritative history."*
 *
 * There is no code path in this module where a cached status becomes the answer — `deriveStatus` does
 * not even accept one. `statusDisagreesWithCache` compares and reports; the derived value always wins.
 *
 * `event_type` VOCABULARY (open question OQ-4). PRD §35.2 names the `legal_event` column but not its
 * values. §15.1 names *"commencement, repeal, variation and appeal"*; §6.5 adds bills,
 * drafts/consultations and *"enacted but not commenced amendments"*; §8.8's `CHANGE_TYPE_VALUES` (in
 * `packages/contracts`) names `REPLACEMENT`. The eight types below are LOCAL to this leaf and are NOT
 * added to `packages/contracts` — that is out of this ticket's file-scope, and FND-03's registry test
 * would demand a registry entry. `04-corpus-contract`/`CRPS-01` owns the column and
 * `05-ingestion-framework`/`INGF-05` owns the extraction; route the vocabulary there.
 */
import { compareLegalDate, isLegalDate, type LegalDate } from './dates.js';
import { type LegalStatus, isLegalStatus } from './contracts.js';
import { deepFreeze } from './deep-freeze.js';

/**
 * The four distinguished times of PRD §15.2, in ONE type so they are distinguishable in the type
 * system and cannot be collapsed into a single "date" field downstream. Carries no behaviour.
 *
 * `snake_case` because these are projections of PRD §34.2 wire payloads and §35.2 columns, and the
 * ticket names them that way. (`src/workflow` uses `camelCase`; it projects an app table, not a payload.)
 */
export interface TemporalStamps {
  /** Publication time (§15.2) — when the source published the material. */
  readonly published_at: LegalDate | null;
  /** Effective time (§15.2, §35.2) — the closed inclusive interval; see `interval.ts` (sub-PRD D12). */
  readonly effective_from: LegalDate;
  readonly effective_to: LegalDate | null;
  /** Retrieval time (§15.2) — §35.1 UTC ISO text, not a legal date. */
  readonly retrieved_at: string | null;
  /** System knowledge / recorded time (§15.2) — §35.1 UTC ISO text. */
  readonly recorded_at: string | null;
}

/** Local `legal_event.event_type` vocabulary — see the file header (OQ-4). Order is not significant. */
export const LEGAL_EVENT_TYPES = deepFreeze([
  /** PRD §6.5 — a bill introduced but not enacted. */
  'BILL_INTRODUCED',
  /** PRD §6.5 — a draft or consultation instrument published. */
  'DRAFT_OR_CONSULTATION_PUBLISHED',
  /** PRD §6.5 — *"enacted but not commenced"*. */
  'ENACTMENT',
  /** PRD §15.1 — commencement. */
  'COMMENCEMENT',
  /** PRD §15.1 — variation. Changes content, not legal status. */
  'VARIATION',
  /** PRD §8.8 `CHANGE_TYPE_VALUES` — replacement; the replaced version becomes `SUPERSEDED`. */
  'REPLACEMENT',
  /** PRD §15.1 — repeal. */
  'REPEAL',
  /** PRD §15.1 — appeal. Changes §9.2 case treatment, not legal status. */
  'APPEAL',
] as const);

export type LegalEventType = (typeof LEGAL_EVENT_TYPES)[number];

export interface LegalEvent {
  readonly event_type: LegalEventType | string;
  /** PRD §35.2 `legal_event.effective_date` — when the effect lands. */
  readonly effective_date: LegalDate;
  /** PRD §35.2 `legal_event.event_date` — when the event happened. Not used to derive status. */
  readonly event_date?: LegalDate | undefined;
  /** PRD §35.2 — the evidence. An event WITHOUT this is not an evidenced event; see `deriveStatus`. */
  readonly evidence_node_version_id?: string | undefined;
  readonly id?: string | undefined;
}

/**
 * Event type → the status it establishes, as reviewable data. `null` = STATUS-NEUTRAL: the event
 * changes content or treatment, not legal status, and must never promote or demote.
 */
const STATUS_BY_EVENT_TYPE: Readonly<Record<LegalEventType, LegalStatus | null>> = deepFreeze({
  BILL_INTRODUCED: 'BILL_NOT_ENACTED',
  DRAFT_OR_CONSULTATION_PUBLISHED: 'DRAFT_OR_CONSULTATION',
  ENACTMENT: 'ENACTED_NOT_IN_FORCE',
  COMMENCEMENT: 'IN_FORCE',
  /** §15.1 variation changes the text; the version stays in whatever status it was in. */
  VARIATION: null,
  REPLACEMENT: 'SUPERSEDED',
  REPEAL: 'REPEALED',
  /** §9.2 case treatment is `12-evidence-safety`'s, not a legal status here. */
  APPEAL: null,
} as Record<LegalEventType, LegalStatus | null>);

/** An event counts only if it is EVIDENCED (PRD §15.2) and carries a well-formed effective date. */
function isEvidenced(event: LegalEvent): boolean {
  if (event === null || typeof event !== 'object') return false;
  const evidence = event.evidence_node_version_id;
  return typeof evidence === 'string' && evidence.length > 0;
}

/**
 * PRD §15.2 — legal status derived from EVIDENCED events only, as at an explicit `asAt` legal date.
 * There is no clock in this module: `asAt` is always an input.
 *
 * Algorithm, deterministic and total:
 *   1. keep events that are evidenced (`evidence_node_version_id` is a non-empty string) and whose
 *      `effective_date` is well-formed and `<= asAt`. An unevidenced event cannot promote a status —
 *      that is the difference between "derived from events" and "derived from whatever the caller
 *      passed". A malformed date is ignored, never coerced.
 *   2. sort a DECORATED COPY (never the caller's array) by `effective_date` ascending, breaking ties by
 *      input index, so the LATER entry in input order wins a same-date tie. That tie rule is a
 *      documented choice, not a dependency on `Array#sort` stability.
 *   3. fold left through `STATUS_BY_EVENT_TYPE`; neutral types and unknown types never change the
 *      accumulator.
 *   4. with no applicable event at all, return `STATUS_UNCONFIRMED` — the fail-closed answer, and the
 *      one that makes PRD §36.2's *"`STATUS_UNCONFIRMED` cannot support a definitive current-law
 *      conclusion"* do real work. NEVER default to `IN_FORCE`.
 *
 * Future events (`effective_date > asAt`) are ignored, which is how PRD §36.2's *"never relabels future
 * material as current"* holds: a future commencement does not make anything `IN_FORCE` today.
 */
export function deriveStatus(events: readonly LegalEvent[], asAt: LegalDate): LegalStatus {
  if (!Array.isArray(events) || !isLegalDate(asAt)) return 'STATUS_UNCONFIRMED';

  const applicable: { readonly event: LegalEvent; readonly index: number }[] = [];
  for (let index = 0; index < events.length; index += 1) {
    const event = events[index];
    if (event === undefined || !isEvidenced(event)) continue;
    if (!isLegalDate(event.effective_date)) continue;
    if (compareLegalDate(event.effective_date, asAt) > 0) continue;
    applicable.push({ event, index });
  }

  applicable.sort((a, b) => {
    const byDate = compareLegalDate(a.event.effective_date, b.event.effective_date);
    return byDate === 0 ? a.index - b.index : byDate;
  });

  let status: LegalStatus = 'STATUS_UNCONFIRMED';
  for (const { event } of applicable) {
    const type = event.event_type;
    // `Object.hasOwn`, not a bare index: the table inherits `Object.prototype`, so an `event_type` of
    // `'constructor'` or `'toString'` would otherwise resolve to a FUNCTION and be assigned as a status.
    if (typeof type !== 'string' || !Object.hasOwn(STATUS_BY_EVENT_TYPE, type)) continue;
    const next = (STATUS_BY_EVENT_TYPE as Record<string, LegalStatus | null | undefined>)[type];
    if (next === null || next === undefined) continue;
    status = next;
  }
  return status;
}

export interface StatusDivergence {
  readonly derived: LegalStatus;
  /** Whatever the caller had cached — reported, never adopted. */
  readonly cached: string;
  readonly as_at: LegalDate;
}

/**
 * Reports a disagreement between the status derived from evidenced events and a cached status field.
 *
 * `null` when they agree. The DERIVED value always wins (PRD §15.2: *"Cached status fields MAY improve
 * performance but are not the authoritative history"*); this function exists to surface the divergence,
 * not to reconcile it. A cached value that is not even a `LegalStatus` is a divergence too.
 */
export function statusDisagreesWithCache(
  events: readonly LegalEvent[],
  asAt: LegalDate,
  cachedStatus: string,
): StatusDivergence | null {
  const derived = deriveStatus(events, asAt);
  if (isLegalStatus(cachedStatus) && cachedStatus === derived) return null;
  return Object.freeze({ derived, cached: String(cachedStatus), as_at: asAt });
}
