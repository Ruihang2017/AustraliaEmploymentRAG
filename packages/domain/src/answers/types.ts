/**
 * FND-07 — the input/output shapes of the answer-status family (PRD §8.4, §15.5, §36.8).
 *
 * Nothing executable lives here. The contracts import is TYPE-ONLY and is erased by
 * `verbatimModuleSyntax`, so `src/answers/**` has no runtime dependency on any other package: at
 * runtime this module graph is self-contained (ticket deliverable 8).
 *
 * The specifier is relative because `packages/contracts/src/index.ts` is still `export {};` — the
 * canonical enum barrel that FND-03 shipped is `src/enums/index.ts`, and wiring the package root is
 * `packages/contracts/**`, outside this ticket's file-scope. Always import the BARREL, never a
 * family file (the barrel's own doc comment says so).
 */
import type {
  AnswerStatus,
  AuthorityLevel,
  CitationRole,
  ClaimSupport,
} from '../../../contracts/src/enums/index.js';

export type { AnswerStatus, AuthorityLevel, CitationRole, ClaimSupport };

/**
 * The short-answer vocabulary, PRD §8.4 item 1, in the PRD's own spellings.
 *
 * `'insufficient evidence'` is lower-case prose here on purpose: it is NOT the `AnswerStatus` member
 * `INSUFFICIENT_EVIDENCE`, which belongs to a different family (PRD §8.4's status list).
 */
export type ShortAnswerValue = 'Yes' | 'No' | 'Likely' | 'Depends' | 'insufficient evidence';

/**
 * The named conditions of the PRD §36.8 decision table.
 *
 * Six of them are the table's status rows. `MATERIAL_CLAIMS_UNSUPPORTED` is DERIVED, not transcribed
 * (sub-PRD D13a): the six rows are not total over `AnswerSignals` (exactly one of the 64 signal
 * records fires no row), and the gap is closed by a NAMED
 * condition that appears in `AnswerDecision.firedConditions` like any other — never by an unnamed
 * default branch.
 */
export type RefusalConditionName =
  | 'ALL_MATERIAL_CLAIMS_SUPPORTED'
  | 'MATERIAL_FACT_UNKNOWN'
  | 'NO_SUFFICIENT_APPLICABLE_EVIDENCE'
  | 'UNRECONCILED_AUTHORITY_CONFLICT'
  | 'OUT_OF_SCOPE_REQUEST'
  | 'SOURCE_STALE_OR_UNAVAILABLE'
  | 'MATERIAL_CLAIMS_UNSUPPORTED';

/**
 * The explicit signal record `decideAnswerStatus` decides from (ticket deliverable 2).
 *
 * Every field is a signal SUPPLIED to this module, never computed by it: freshness, jurisdiction and
 * conflict detection are FND-10 / EVID-05. Note the polarity of `sufficientApplicableEvidence` — it is
 * the only field whose FALSE value fires a table row.
 */
export interface AnswerSignals {
  readonly outOfScope: boolean;
  readonly sourceStaleOrUnavailableAndMaterial: boolean;
  readonly unreconciledAuthorityConflict: boolean;
  readonly sufficientApplicableEvidence: boolean;
  readonly allMaterialClaimsSupported: boolean;
  readonly materialFactUnknown: boolean;
}

/**
 * The decision: the status, plus EVERY condition that fired, in D13 precedence order (most
 * restrictive first). PRD §36.8 requires uncertainty to be represented by status, assumptions,
 * missing facts and conflicts — not by a single silent choice — so the caller gets all of them.
 */
export interface AnswerDecision {
  readonly status: AnswerStatus;
  readonly firedConditions: readonly RefusalConditionName[];
}

/** A structured material conclusion (PRD §15.5 `AnswerClaim`), reduced to what this module decides on. */
export interface Claim {
  readonly id: string;
  /** PRD §36.8 / ANS-005 speak of *material* claims; non-material claims are never definitive. */
  readonly material: boolean;
  readonly shortAnswer: ShortAnswerValue;
  /** Asserted subject to a condition or assumption (PRD §8.4 item 3). */
  readonly conditional: boolean;
}

/** An evidence mapping for one claim (PRD §15.5 `ClaimCitation`), already validated by EVID-05. */
export interface Citation {
  readonly id: string;
  readonly claimId: string;
  readonly role: CitationRole;
  readonly authorityLevel: AuthorityLevel;
}
