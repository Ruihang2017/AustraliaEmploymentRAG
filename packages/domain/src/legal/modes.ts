/**
 * FND-10 deliverable 2 — the per-mode permitted legal-status table (sub-PRD open question **Q-F5**).
 *
 * The exact sets are NOT literally in the PRD. §6.7 and §36.2 give the invariants; the table below is
 * the INITIAL RULE and is registered as **Q-F5, owner Founder** (product ambiguity, PRD §45.5),
 * validated by `21-evaluation-600`. Changing it is a docs change first — `docs/prd/00-foundation/README.md`
 * Q-F5 and this ticket's deliverable 2 — then a code change. The three invariants below are PRD-quoted
 * and may NOT be relaxed without a PRD change; `test/legal/modes.test.ts` asserts them independently of
 * the table so that editing the table cannot quietly break them.
 *
 * NAMING: PRD §34.2's search payload already uses `mode` for `QUICK`/`ADVANCED`. The eligibility request
 * field is therefore `request_mode`, never `mode` — a silent field collision between two unrelated
 * vocabularies would be a genuinely hard bug to see.
 */
import { type LegalStatus } from './contracts.js';
import { deepFreeze } from './deep-freeze.js';

export const REQUEST_MODE_VALUES = deepFreeze([
  'CURRENT_LAW',
  'HISTORICAL',
  'FUTURE_OR_PROPOSED',
] as const);

export type RequestMode = (typeof REQUEST_MODE_VALUES)[number];

export function isRequestMode(value: unknown): value is RequestMode {
  return typeof value === 'string' && (REQUEST_MODE_VALUES as readonly string[]).includes(value);
}

/**
 * Permitted legal statuses per request mode (Q-F5).
 *
 * - `CURRENT_LAW` — PRD §6.7: *"Default answers MUST use only material in force at the requested legal
 *   date unless the user explicitly requests historical, future or proposed material."*
 * - `HISTORICAL` — PRD §6.7's *"unless the user explicitly requests historical"* plus §6.6's
 *   point-in-time retrieval over the three financial years: material that WAS in force needs its
 *   `SUPERSEDED` and `REPEALED` versions.
 * - `FUTURE_OR_PROPOSED` — PRD §6.5's future/proposed families and §36.2: *"Future/proposed research
 *   changes the allowed status set but never relabels future material as current."* `IN_FORCE` is
 *   absent by design: current material reached through this mode would be relabelled future.
 *
 * `STATUS_UNCONFIRMED` appears in NO mode. It is not in force, so §6.7 excludes it from `CURRENT_LAW`;
 * admitting it anywhere else would put unverified material in front of a user with no PRD sentence
 * asking for that. Fail-closed.
 */
export const PERMITTED_STATUSES_BY_MODE: Readonly<Record<RequestMode, readonly LegalStatus[]>> =
  deepFreeze({
    CURRENT_LAW: ['IN_FORCE'],
    HISTORICAL: ['IN_FORCE', 'SUPERSEDED', 'REPEALED'],
    FUTURE_OR_PROPOSED: ['ENACTED_NOT_IN_FORCE', 'BILL_NOT_ENACTED', 'DRAFT_OR_CONSULTATION'],
  } as Record<RequestMode, readonly LegalStatus[]>);

/**
 * PRD §36.2 conjunct 3, *"legal status is permitted by request mode"*.
 *
 * SET MEMBERSHIP ONLY — this does not re-check the requested date. "In force at the requested legal
 * date" is the CONJUNCTION of §36.2's first and third conjuncts, and keeping them orthogonal is what
 * makes the 32-row truth table meaningful. Do not add a date check here.
 *
 * Total and fail-closed: an unknown mode permits NO status, and an unknown status is permitted by no
 * mode.
 */
export function isStatusPermittedByMode(status: string, mode: string): boolean {
  if (!isRequestMode(mode)) return false;
  const permitted = PERMITTED_STATUSES_BY_MODE[mode];
  return typeof status === 'string' && (permitted as readonly string[]).includes(status);
}

/**
 * PRD §36.2: *"`STATUS_UNCONFIRMED` cannot support a definitive current-law conclusion."*
 *
 * Deliberately NOT the same thing as mode permission: a `HISTORICAL` request may legitimately surface a
 * `REPEALED` version, but no such version supports a definitive statement about the law as it stands.
 * Exported for FND-07/EVID-05.
 */
export function canSupportDefinitiveCurrentLaw(status: string): boolean {
  return status === 'IN_FORCE';
}
