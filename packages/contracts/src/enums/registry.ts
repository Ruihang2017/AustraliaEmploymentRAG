/**
 * The machine-readable registry of every canonical enum family (FND-03 deliverable 2).
 *
 * This is the artifact `DATA-01` reads to generate SQLite `CHECK (col IN (…))` constraints
 * (PRD §35.1: *"Enumerations use checked text values generated from `packages/contracts`"*) and
 * `FND-04` reads to emit OpenAPI enum schemas. A family added under src/enums/ but not registered
 * here fails test/enums/registry.test.ts.
 *
 * The entry shape is fixed at `{ prdSection, values }`. Per-member provenance (coined identifiers,
 * the one normalised spelling, the one member whose section differs from its family's) lives in
 * test/enums/prd-enums.fixture.json, not here — a consumer generating a CHECK constraint needs the
 * values and the traceability reference, nothing more.
 */
import { ANSWER_STATUS_VALUES } from './answer-status.js';
import { API_SCOPE_VALUES } from './api-scope.js';
import { ASYNC_STATE_VALUES } from './async-state.js';
import { AUTHORITY_LEVEL_VALUES } from './authority-level.js';
import { CHANGE_TYPE_VALUES } from './change-type.js';
import { CITATION_ROLE_VALUES } from './citation-role.js';
import { CLAIM_SUPPORT_VALUES } from './claim-support.js';
import { COVERAGE_CANDIDATE_STATUS_VALUES } from './coverage-candidate-status.js';
import { ERROR_CODE_VALUES } from './error-code.js';
import { EVIDENCE_QUALIFIER_VALUES } from './evidence-qualifier.js';
import { FUNDING_LEDGER_VALUES } from './funding-ledger.js';
import { INDEX_TIER_VALUES } from './index-tier.js';
import { LEGAL_STATUS_VALUES } from './legal-status.js';
import { LICENCE_ASSESSMENT_STATE_VALUES } from './licence-assessment-state.js';
import { PERMISSION_VALUES } from './permission.js';
import { RECORD_WORKFLOW_STATE_VALUES } from './record-workflow-state.js';
import { ROLE_VALUES } from './role.js';
import { SOURCE_COVERAGE_STATUS_VALUES } from './source-coverage-status.js';
import { SSE_EVENT_TYPE_VALUES } from './sse-event-type.js';
import { SSO_CONNECTION_STATE_VALUES } from './sso-connection-state.js';

export interface EnumRegistryEntry {
  /** The single PRD section this family is transcribed from, e.g. `'§8.4'`. */
  readonly prdSection: string;
  /** The family's members, in PRD order. */
  readonly values: readonly string[];
}

export const ENUM_REGISTRY: Readonly<Record<string, EnumRegistryEntry>> = Object.freeze({
  AnswerStatus: Object.freeze({ prdSection: '§8.4', values: ANSWER_STATUS_VALUES }),
  ApiScope: Object.freeze({ prdSection: '§16.3', values: API_SCOPE_VALUES }),
  AsyncState: Object.freeze({ prdSection: '§31.3', values: ASYNC_STATE_VALUES }),
  AuthorityLevel: Object.freeze({ prdSection: '§9.1', values: AUTHORITY_LEVEL_VALUES }),
  ChangeType: Object.freeze({ prdSection: '§8.8', values: CHANGE_TYPE_VALUES }),
  CitationRole: Object.freeze({ prdSection: '§15.5', values: CITATION_ROLE_VALUES }),
  ClaimSupport: Object.freeze({ prdSection: '§15.5', values: CLAIM_SUPPORT_VALUES }),
  CoverageCandidateStatus: Object.freeze({ prdSection: '§8.5', values: COVERAGE_CANDIDATE_STATUS_VALUES }),
  ErrorCode: Object.freeze({ prdSection: '§34.9', values: ERROR_CODE_VALUES }),
  EvidenceQualifier: Object.freeze({ prdSection: '§9.2', values: EVIDENCE_QUALIFIER_VALUES }),
  FundingLedger: Object.freeze({ prdSection: '§24.4', values: FUNDING_LEDGER_VALUES }),
  IndexTier: Object.freeze({ prdSection: '§17.2', values: INDEX_TIER_VALUES }),
  LegalStatus: Object.freeze({ prdSection: '§6.7', values: LEGAL_STATUS_VALUES }),
  LicenceAssessmentState: Object.freeze({ prdSection: '§11.1', values: LICENCE_ASSESSMENT_STATE_VALUES }),
  Permission: Object.freeze({ prdSection: '§38.1', values: PERMISSION_VALUES }),
  RecordWorkflowState: Object.freeze({ prdSection: '§8.7', values: RECORD_WORKFLOW_STATE_VALUES }),
  Role: Object.freeze({ prdSection: '§8.1', values: ROLE_VALUES }),
  SourceCoverageStatus: Object.freeze({ prdSection: '§7', values: SOURCE_COVERAGE_STATUS_VALUES }),
  SseEventType: Object.freeze({ prdSection: '§34.4', values: SSE_EVENT_TYPE_VALUES }),
  SsoConnectionState: Object.freeze({ prdSection: '§16.3', values: SSO_CONNECTION_STATE_VALUES }),
});

/**
 * The registered members of `name`.
 *
 * Throws on an unknown family rather than returning `undefined`: the caller generating a
 * `CHECK (col IN (…))` constraint from a typo would otherwise ship a table with no constraint at all
 * (PRD §35.1). Loud beats convenient.
 */
export function getEnumValues(name: string): readonly string[] {
  const entry = ENUM_REGISTRY[name];
  if (!entry) {
    throw new Error(
      `unknown enum family: ${JSON.stringify(name)} — registered families are ` +
        Object.keys(ENUM_REGISTRY).join(', '),
    );
  }
  return entry.values;
}
