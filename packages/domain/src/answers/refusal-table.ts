/**
 * FND-07 deliverable 1 — the PRD §36.8 refusal/status decision table as executable data
 * (docs/PRD.md §36.8, lines 2419-2435).
 *
 * Three constants, deliberately kept apart because they answer different questions:
 *
 * - `REFUSAL_TABLE` — the six STATUS rows in PRD TABLE ORDER. It is a transcription, so it is compared
 *   row-by-row against the fixture; reordering it is drift, not refactoring.
 * - `STATUS_PRECEDENCE` — the sub-PRD D13 evaluation order (most restrictive first). The PRD states the
 *   conditions but not their order when two hold at once; D13 chooses "most restrictive wins" and it is
 *   recorded as open question Q-F3 (owner: Founder). A test asserts this is a permutation of
 *   `REFUSAL_TABLE`'s statuses, so the two cannot drift apart.
 * - `NON_STATUS_OUTCOMES` — rows 7-9, which are NOT answer statuses (PRD §10.1/§37.2 pre-admission PII
 *   rejection, §9.5 refusal, §34.9 `GENERATION_UNAVAILABLE`). Each carries `answerStatus: null` typed
 *   as the literal `null`, so "carries no answer status" is a type guarantee rather than a convention.
 *
 * The `prdCondition` / `consequence` strings are VERBATIM PRD transcriptions — provenance for the
 * fixture replay. They are not user-facing copy and not text for any model: rendering is
 * `15-answer-product`, and PRD §9.4 requires this decision to live in code.
 */
import { deepFreeze } from './deep-freeze.js';
import type { AnswerStatus, RefusalConditionName } from './types.js';

import type { ErrorCode } from '../../../contracts/src/enums/index.js';

/** One status-bearing row of the §36.8 table. */
export interface RefusalTableRow {
  /** The condition's name in this module. */
  readonly condition: RefusalConditionName;
  /** The PRD's own wording of the condition, verbatim (§36.8). */
  readonly prdCondition: string;
  /** The PRD's tabled result. */
  readonly status: AnswerStatus;
}

/** PRD §36.8 status rows 1-6, in PRD table order. */
export const REFUSAL_TABLE: readonly RefusalTableRow[] = deepFreeze([
  {
    condition: 'ALL_MATERIAL_CLAIMS_SUPPORTED',
    prdCondition: 'Evidence supports all material claims',
    status: 'SUPPORTED',
  },
  {
    condition: 'MATERIAL_FACT_UNKNOWN',
    prdCondition: 'Evidence supports branches but material fact is unknown',
    status: 'CONDITIONAL',
  },
  {
    condition: 'NO_SUFFICIENT_APPLICABLE_EVIDENCE',
    prdCondition: 'No sufficient applicable evidence after retrieval',
    status: 'INSUFFICIENT_EVIDENCE',
  },
  {
    condition: 'UNRECONCILED_AUTHORITY_CONFLICT',
    prdCondition: 'Applicable authorities materially conflict and cannot be reconciled',
    status: 'CONFLICTING_SOURCES',
  },
  {
    condition: 'OUT_OF_SCOPE_REQUEST',
    prdCondition: 'Request is outside employment-law/product function',
    status: 'OUT_OF_SCOPE',
  },
  {
    condition: 'SOURCE_STALE_OR_UNAVAILABLE',
    prdCondition: 'Relevant source is stale/unavailable and could change answer',
    status: 'SOURCE_NOT_CURRENT',
  },
] as const satisfies readonly RefusalTableRow[]);

/**
 * Sub-PRD D13 evaluation order: most restrictive first. `decideAnswerStatus` evaluates in exactly this
 * order and never returns a status more permissive than a triggered condition.
 */
export const STATUS_PRECEDENCE: readonly AnswerStatus[] = deepFreeze([
  'OUT_OF_SCOPE',
  'SOURCE_NOT_CURRENT',
  'CONFLICTING_SOURCES',
  'INSUFFICIENT_EVIDENCE',
  'CONDITIONAL',
  'SUPPORTED',
] as const satisfies readonly AnswerStatus[]);

/**
 * Every `AnswerStatus` maps to the §36.8 condition that produces it. `satisfies Record<AnswerStatus, …>`
 * is the exhaustiveness guarantee the `pnpm typecheck` gate enforces: adding a status to
 * `packages/contracts` without a row here fails the build, in `src/`, not only in a test.
 */
export const CONDITION_BY_STATUS = deepFreeze({
  SUPPORTED: 'ALL_MATERIAL_CLAIMS_SUPPORTED',
  CONDITIONAL: 'MATERIAL_FACT_UNKNOWN',
  INSUFFICIENT_EVIDENCE: 'NO_SUFFICIENT_APPLICABLE_EVIDENCE',
  CONFLICTING_SOURCES: 'UNRECONCILED_AUTHORITY_CONFLICT',
  OUT_OF_SCOPE: 'OUT_OF_SCOPE_REQUEST',
  SOURCE_NOT_CURRENT: 'SOURCE_STALE_OR_UNAVAILABLE',
} as const satisfies Record<AnswerStatus, RefusalConditionName>);

/**
 * DERIVED conditions — sub-PRD **D13a**, NOT §36.8 rows.
 *
 * The six rows are not total over `AnswerSignals`: exactly one of the 64 combinations
 * (`allMaterialClaimsSupported = false` with every restrictive signal absent) fires no row at all, while
 * `decideAnswerStatus` must still return an `AnswerStatus`. `MATERIAL_CLAIMS_UNSUPPORTED` closes that
 * gap and resolves to `INSUFFICIENT_EVIDENCE` (PRD §9.4 "remaining unsupported claims MUST be removed
 * and the answer downgraded/refused"; ANS-005 "unsupported definitive claim count is zero").
 *
 * It is named, listed in `firedConditions` and transcribed into the fixture's `derived_conditions`
 * section — separate from the nine verbatim `prd_36_8` rows — precisely so the choice is visible.
 */
export interface DerivedCondition {
  readonly condition: RefusalConditionName;
  readonly status: AnswerStatus;
  readonly basis: string;
}

/** The one derived condition's name, so no caller has to index into `DERIVED_CONDITIONS`. */
export const MATERIAL_CLAIMS_UNSUPPORTED = 'MATERIAL_CLAIMS_UNSUPPORTED' satisfies RefusalConditionName;

export const DERIVED_CONDITIONS: readonly DerivedCondition[] = deepFreeze([
  {
    condition: MATERIAL_CLAIMS_UNSUPPORTED,
    status: 'INSUFFICIENT_EVIDENCE',
    basis: 'PRD §9.4; ANS-005 (PRD §30.2); sub-PRD D13a',
  },
] as const satisfies readonly DerivedCondition[]);

/** PRD §36.8 row 7 — PII is rejected BEFORE a job exists (PRD §10.1, §37.2). */
export interface PreAdmissionOutcome {
  readonly kind: 'PRE_ADMISSION_REJECTION';
  readonly condition: 'EMPLOYEE_PII_DETECTED';
  readonly errorCode: Extract<ErrorCode, 'EMPLOYEE_PII_DETECTED'>;
  readonly answerStatus: null;
  readonly consequence: string;
  readonly rejectedBeforeJob: true;
}

/** PRD §36.8 row 8 — a refusal, not a status (PRD §9.5), and it must offer a lawful alternative. */
export interface RefusalOutcome {
  readonly kind: 'REFUSAL';
  readonly condition: 'UNLAWFUL_OPERATIONAL_EVASION';
  readonly answerStatus: null;
  readonly consequence: string;
  readonly requiresLawfulAlternative: true;
}

/** PRD §36.8 row 9 — a job outcome (§34.9 `GENERATION_UNAVAILABLE`); Search survives it (§8.2). */
export interface JobUnavailableOutcome {
  readonly kind: 'JOB_UNAVAILABLE';
  readonly condition: 'PROVIDER_OR_BUDGET_UNAVAILABLE';
  readonly errorCode: Extract<ErrorCode, 'GENERATION_UNAVAILABLE'>;
  readonly answerStatus: null;
  readonly consequence: string;
  readonly searchRemainsAvailable: true;
  readonly savedRecordsRemainAvailable: true;
}

export type NonStatusOutcome = PreAdmissionOutcome | RefusalOutcome | JobUnavailableOutcome;

/** PRD §36.8 rows 7-9, in PRD table order. None of them carries an `AnswerStatus`. */
export const NON_STATUS_OUTCOMES: readonly NonStatusOutcome[] = deepFreeze([
  {
    kind: 'PRE_ADMISSION_REJECTION',
    condition: 'EMPLOYEE_PII_DETECTED',
    errorCode: 'EMPLOYEE_PII_DETECTED',
    answerStatus: null,
    consequence: 'Request rejected before job; no answer status',
    rejectedBeforeJob: true,
  },
  {
    kind: 'REFUSAL',
    condition: 'UNLAWFUL_OPERATIONAL_EVASION',
    answerStatus: null,
    consequence: 'Refusal with lawful compliance/remediation alternative',
    requiresLawfulAlternative: true,
  },
  {
    kind: 'JOB_UNAVAILABLE',
    condition: 'PROVIDER_OR_BUDGET_UNAVAILABLE',
    errorCode: 'GENERATION_UNAVAILABLE',
    answerStatus: null,
    consequence: 'Job unavailable; Search and saved records remain available',
    searchRemainsAvailable: true,
    savedRecordsRemainAvailable: true,
  },
] as const satisfies readonly NonStatusOutcome[]);
