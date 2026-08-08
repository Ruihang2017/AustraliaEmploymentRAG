// GENERATED FROM schemas/openapi/openapi.yaml — DO NOT EDIT (PRD §20.1)
// Regenerate with `pnpm generate`; `pnpm generated:check` fails on a hand edit.

/** One type per `components.schemas` entry, in lexicographic order. */

/**
 * A state-changing action whose only contract is that it succeeded, plus the envelope.
 */
export type AcknowledgementResponse = ResponseEnvelope;

export type AlertResponse = ResponseEnvelope & {
  readonly alert: AlertSummary;
};

/**
 * The PRD minimum for an alert (PRD §8.8, §34.8 `data`). Payload gap — sub-PRD Q-F9, owner `16-monitor-alerts`.
 */
export type AlertSummary = {
  readonly affected_research_record_ids?: readonly OpaqueId[];
  readonly change_type: ChangeType;
  readonly effective_date: LegalDate;
  readonly id: OpaqueId;
  readonly watchlist_id?: OpaqueId;
};

/**
 * PRD §34.3 fact object. Anonymous by contract — PRD §34.9 `EMPLOYEE_PII_DETECTED` rejects identified employee data.
 */
export type AnswerFacts = {
  readonly employer_abn?: string;
  readonly employer_name?: string;
  readonly employment_type?: string;
  readonly engagement_type?: string;
  readonly free_text?: string;
  readonly industry?: string;
  readonly principal_duties?: readonly string[];
  readonly work_jurisdictions?: readonly JurisdictionCode[];
};

/**
 * PRD §34.3 accepted response (`202`).
 */
export type AnswerJobAccepted = ResponseEnvelope & {
  readonly job: JobDescriptor;
};

/**
 * PRD §34.3: "Clarification response still uses `202`; the job status becomes
 * `WAITING_FOR_CLARIFICATION` and supplies questions."
 */
export type AnswerJobClarificationRequired = {
  readonly clarifications: readonly Clarification[];
  readonly status: AsyncState;
};

/**
 * PRD §34.5. "Provider prompts, hidden reasoning and raw provider responses are never part of
 * this customer contract."
 */
export type AnswerSnapshot = {
  readonly answer_version: number;
  readonly assumptions: readonly Assumption[];
  readonly citations: readonly Citation[];
  readonly claims: readonly Claim[];
  readonly corpus_release_id: OpaqueId;
  readonly correction_state: string;
  readonly created_at: Timestamp;
  readonly id: OpaqueId;
  readonly jurisdictions: readonly JurisdictionCode[];
  readonly knowledge_cutoff_at: Timestamp;
  readonly legal_as_at: LegalDate;
  readonly limitations: readonly string[];
  readonly next_checks: readonly string[];
  readonly record_id: OpaqueId;
  readonly schema_version: "1.0";
  readonly short_answer: string;
  readonly status: AnswerStatus;
};

/**
 * PRD §8.4 — a domain answer status. PRD §34.9: these are completed research results and never HTTP errors.
 */
export type AnswerStatus = "SUPPORTED" | "CONDITIONAL" | "INSUFFICIENT_EVIDENCE" | "CONFLICTING_SOURCES" | "OUT_OF_SCOPE" | "SOURCE_NOT_CURRENT";

/**
 * PRD §16.3 service scopes.
 */
export type ApiScope = "search:read" | "answers:create" | "records:read" | "records:write" | "coverage:create" | "monitor:read" | "monitor:write" | "exports:create" | "usage:read";

export type Assumption = {
  readonly id: OpaqueId;
  readonly impact_if_false: string;
  readonly source: string;
  readonly text: string;
};

/**
 * PRD §31.3 — the job lifecycle state. Separate from the HTTP status (PRD §16.1).
 */
export type AsyncState = "IDLE" | "VALIDATING" | "QUEUED" | "RUNNING" | "WAITING_FOR_CLARIFICATION" | "CANCELLING" | "COMPLETED" | "FAILED" | "CANCELLED" | "EXPIRED";

export type AuthorityRef = {
  readonly id: OpaqueId;
  readonly name: string;
};

/**
 * PRD §8.8 — the kind of official change an alert reports.
 */
export type ChangeType = "AMENDMENT" | "COMMENCEMENT" | "RATE" | "REPLACEMENT" | "APPEAL" | "GUIDANCE" | "SOURCE_REMOVAL" | "FRESHNESS";

export type Citation = {
  readonly document_version_id: OpaqueId;
  readonly effective_from: LegalDate;
  readonly effective_to: null | string;
  readonly end_offset: number;
  readonly id: OpaqueId;
  readonly legal_status: LegalStatus;
  readonly node_version_id: OpaqueId;
  readonly official_url: string;
  readonly pinpoint: string;
  readonly quote: string;
  readonly role: CitationRole;
  readonly start_offset: number;
};

/**
 * PRD §15.5 — how a citation relates to the claim it is attached to.
 */
export type CitationRole = "SUPPORTS" | "QUALIFIES" | "CONTRADICTS" | "DEFINES" | "BACKGROUND_ONLY";

export type Claim = {
  readonly assumption_ids: readonly OpaqueId[];
  readonly citation_ids: readonly OpaqueId[];
  readonly id: OpaqueId;
  readonly kind: string;
  readonly sequence: number;
  readonly support_status: ClaimSupport;
  readonly text: string;
};

/**
 * PRD §15.5 — the evidential support status of a single claim.
 */
export type ClaimSupport = "DIRECTLY_SUPPORTED" | "SUPPORTED_BY_INFERENCE" | "CONDITIONAL" | "CONTRADICTED" | "NOT_SUPPORTED";

/**
 * PRD §34.3 clarification question.
 */
export type Clarification = {
  readonly affects: readonly string[];
  readonly answer_type: string;
  readonly id: OpaqueId;
  readonly question: string;
};

/**
 * PRD §34.1 cursor pagination: an items page plus the opaque `next_cursor`.
 */
export type CollectionResponse = ResponseEnvelope & {
  readonly items: readonly Readonly<Record<string, unknown>>[];
  readonly next_cursor: Cursor;
};

export type ComparisonDimension = {
  readonly jurisdictions?: readonly JurisdictionCode[];
  readonly label: string;
  readonly legal_as_at?: LegalDate;
};

/**
 * PRD §34.6 comparison request. "Coverage/Compare jobs use the same job, SSE, idempotency, cancellation, retention and budget semantics as answers."
 */
export type ComparisonRequest = {
  readonly comparison_type: string;
  readonly dimensions: readonly ComparisonDimension[];
  readonly document_ids?: readonly OpaqueId[];
  readonly question?: string;
  readonly research_record_id?: null | string;
  readonly retention_mode?: string;
};

export type CoverageAssessmentJobResponse = ResponseEnvelope & {
  readonly candidates?: readonly CoverageCandidateSummary[];
  readonly job: JobDescriptor;
};

/**
 * PRD §34.6: "Coverage uses the same fact object as Answer plus:" the properties below.
 */
export type CoverageAssessmentRequest = {
  readonly employer?: {
    readonly abn?: string;
    readonly name: string;
  };
  readonly known_agreement_ids?: readonly OpaqueId[];
  readonly known_award_codes?: readonly string[];
  readonly legal_as_at: LegalDate;
  readonly principal_duties?: readonly string[];
  readonly research_record_id?: null | string;
  readonly retention_mode?: string;
  readonly work_locations?: readonly JurisdictionCode[];
};

/**
 * PRD §8.5 — the confidence status of a coverage candidate.
 */
export type CoverageCandidateStatus = "CONFIRMED_FROM_STATED_FACTS" | "LIKELY" | "POSSIBLE" | "UNLIKELY" | "EXCLUDED" | "INSUFFICIENT_EVIDENCE";

/**
 * The PRD minimum for a coverage candidate (PRD §8.5). Payload gap — sub-PRD Q-F9, owner `15-answer-product`.
 */
export type CoverageCandidateSummary = {
  readonly id: OpaqueId;
  readonly label?: string;
  readonly status: CoverageCandidateStatus;
};

/**
 * PRD §34.3 request. "For `SAVE`, exactly one of `research_record_id` or
 * `new_record: {"title":"…","tags":[]}` is required. Creating a record and admitting the job
 * occur in the same transaction. For `EPHEMERAL`, both fields must be absent."
 */
export type CreateAnswerJobRequest = {
  readonly facts?: AnswerFacts;
  readonly jurisdictions?: readonly JurisdictionCode[];
  readonly legal_as_at?: LegalDate;
  readonly mode: string;
  readonly new_record?: null | {
    readonly tags?: readonly string[];
    readonly title: string;
  };
  readonly question: string;
  readonly research_record_id?: null | string;
  readonly retention_mode?: string;
};

/**
 * PRD §34.1: the opaque `next_cursor`; `null` on the last page.
 */
export type Cursor = null | string;

/**
 * PRD §16.1 uniform error shape.
 */
export type Error = {
  readonly code: ErrorCode;
  readonly details?: Readonly<Record<string, unknown>>;
  readonly message: string;
  readonly request_id: OpaqueId;
  readonly retryable: boolean;
};

/**
 * PRD §34.9 — the complete error catalogue, in table order.
 */
export type ErrorCode = "INVALID_REQUEST" | "INVALID_LEGAL_DATE" | "INVALID_ABN" | "AUTHENTICATION_REQUIRED" | "MFA_REQUIRED" | "RECENT_AUTH_REQUIRED" | "RESOURCE_NOT_FOUND" | "IDEMPOTENCY_CONFLICT" | "CONCURRENT_MODIFICATION" | "EPHEMERAL_CONTENT_EXPIRED" | "EMPLOYEE_PII_DETECTED" | "RATE_LIMITED" | "CREDIT_LIMIT_REACHED" | "GENERATION_UNAVAILABLE" | "SOURCE_NOT_CURRENT" | "CORPUS_INCOMPATIBLE" | "INTERNAL_ERROR";

/**
 * PRD §16.1: the single error envelope every error response in this document shares.
 */
export type ErrorResponse = {
  readonly error: Error;
};

/**
 * PRD §16.2 "`POST /v1/exports`". Payload gap — sub-PRD Q-F9, owner `17-export-delivery`.
 */
export type ExportCreateRequest = {
  readonly format?: string;
  readonly research_record_id: OpaqueId;
};

/**
 * PRD §16.3 "Invitation and membership lifecycle endpoints". No organisation field — the tenant comes from the credential (PRD §34.1).
 */
export type InvitationCreateRequest = {
  readonly email: string;
  readonly role: Role;
};

/**
 * A generic accepted-job response, the same shape PRD §34.3 fixes for answers.
 */
export type JobAcceptedResponse = ResponseEnvelope & {
  readonly job: JobDescriptor;
};

/**
 * PRD §34.3 accepted-response job object.
 */
export type JobDescriptor = {
  readonly corpus_release_id: OpaqueId;
  readonly created_at: Timestamp;
  readonly events_url: string;
  readonly id: OpaqueId;
  readonly reserved_credits: number;
  readonly retention_mode: string;
  readonly status: AsyncState;
  readonly status_url: string;
  readonly type: string;
};

/**
 * An Australian jurisdiction code, for example `CTH` or `VIC`. Not an `ENUM_REGISTRY` family — see sub-PRD Q-F10.
 */
export type JurisdictionCode = string;

/**
 * PRD §34.1: an Australian legal date, `YYYY-MM-DD`.
 */
export type LegalDate = string;

/**
 * PRD §6.7 — the legal status of a source at the requested legal date.
 */
export type LegalStatus = "IN_FORCE" | "ENACTED_NOT_IN_FORCE" | "BILL_NOT_ENACTED" | "DRAFT_OR_CONSULTATION" | "REPEALED" | "SUPERSEDED" | "STATUS_UNCONFIRMED";

export type MembershipResponse = ResponseEnvelope & {
  readonly membership: MembershipSummary;
};

/**
 * The PRD minimum for a membership (PRD §8.1, §16.3). Payload gap — sub-PRD Q-F9, owner `02-identity-access`. Carries no organisation identifier: PRD §34.1 derives the tenant from the credential.
 */
export type MembershipSummary = {
  readonly id: OpaqueId;
  readonly role: Role;
  readonly user_id?: OpaqueId;
};

/**
 * PRD §16.3 membership lifecycle; PRD §38.1 `MEMBERSHIP_ROLE_CHANGE`.
 */
export type MembershipUpdateRequest = {
  readonly role: Role;
};

/**
 * PRD §34.1: an opaque resource-prefixed UUIDv7 string, for example `ans_...`. Clients never parse them.
 */
export type OpaqueId = string;

/**
 * PRD §8.7 — the review workflow state of a Research Record.
 */
export type RecordWorkflowState = "DRAFT" | "IN_REVIEW" | "CUSTOMER_REVIEWED" | "REVIEW_REQUIRED" | "ARCHIVED";

/**
 * PRD §34.7 create. Carries NO organisation field (PRD §34.1 Tenant row).
 */
export type ResearchRecordCreateRequest = {
  readonly legal_context?: {
    readonly jurisdictions?: readonly JurisdictionCode[];
    readonly legal_as_at?: LegalDate;
  };
  readonly owner_user_id?: OpaqueId;
  readonly reviewer_user_id?: null | string;
  readonly tags?: readonly string[];
  readonly title: string;
};

export type ResearchRecordResponse = ResponseEnvelope & {
  readonly research_record: ResearchRecordSummary;
};

/**
 * The PRD minimum for a Research Record read (PRD §8.7, §34.7). Payload gap — sub-PRD Q-F9, owner `13-research-records`.
 */
export type ResearchRecordSummary = {
  readonly created_at: Timestamp;
  readonly id: OpaqueId;
  readonly title: string;
  readonly workflow_state: RecordWorkflowState;
};

/**
 * PRD §34.7: "Formal facts/questions are added as immutable turns … A mistake is corrected by
 * adding a new turn with `supersedes_turn_id`, never by editing the original turn." That is why
 * `/turns` has no PATCH and no DELETE.
 */
export type ResearchRecordTurnCreateRequest = {
  readonly content: Readonly<Record<string, unknown>>;
  readonly supersedes_turn_id?: null | string;
  readonly turn_type: string;
};

/**
 * PRD §34.7: "Mutable metadata updates require `If-Match: \"7\"`." Metadata only — turns are immutable.
 */
export type ResearchRecordUpdateRequest = {
  readonly reviewer_user_id?: null | string;
  readonly tags?: readonly string[];
  readonly title?: string;
  readonly workflow_state?: RecordWorkflowState;
};

/**
 * A single resource whose payload PRD §34 does not specify. Marked `x-prd-payload-gap` at the operation.
 */
export type ResourceResponse = ResponseEnvelope & {
  readonly resource: Readonly<Record<string, unknown>>;
};

/**
 * PRD §16.1: every response carries `request_id`; PRD §34.1: `/v1` plus a response `schema_version`.
 */
export type ResponseEnvelope = {
  readonly request_id: OpaqueId;
  readonly schema_version: "1.0";
};

/**
 * PRD §8.1 — an organisation membership role.
 */
export type Role = "OWNER" | "ADMIN" | "RESEARCHER" | "VIEWER" | "DEVELOPER";

/**
 * PRD §34.2 request. Carries NO organisation field (PRD §34.1 Tenant row).
 */
export type SearchRequest = {
  readonly authority_ids?: readonly OpaqueId[];
  readonly cursor?: Cursor;
  readonly document_types?: readonly string[];
  readonly employer?: null | {
    readonly abn?: string;
    readonly name?: string;
  };
  readonly exact_identifiers?: readonly string[];
  readonly jurisdictions?: readonly JurisdictionCode[];
  readonly legal_as_at?: LegalDate;
  readonly legal_statuses?: readonly LegalStatus[];
  readonly mode?: string;
  readonly page_size?: number;
  readonly query: string;
  readonly sort?: string;
};

/**
 * PRD §34.2 response.
 */
export type SearchResponse = ResponseEnvelope & {
  readonly applied_filters: {
    readonly jurisdictions?: readonly JurisdictionCode[];
    readonly legal_statuses?: readonly LegalStatus[];
  };
  readonly corpus_release_id: OpaqueId;
  readonly legal_as_at: LegalDate;
  readonly next_cursor: Cursor;
  readonly results: readonly SearchResult[];
  readonly search_execution_id: OpaqueId;
  readonly warnings: readonly Warning[];
};

/**
 * PRD §34.2 result. Search returns official source excerpts only — never a generated summary.
 */
export type SearchResult = {
  readonly authority: AuthorityRef;
  readonly document_id: OpaqueId;
  readonly document_type: string;
  readonly document_version_id: OpaqueId;
  readonly effective_from: LegalDate;
  readonly effective_to: null | string;
  readonly freshness: string;
  readonly jurisdictions: readonly JurisdictionCode[];
  readonly legal_status: LegalStatus;
  readonly match_reasons: readonly string[];
  readonly node_id: OpaqueId;
  readonly node_version_id: OpaqueId;
  readonly official_url: string;
  readonly pinpoint: string;
  readonly snippet: SearchResultSnippet;
  readonly title: string;
};

/**
 * PRD §34.2: "`snippet.text` MUST equal the referenced NodeVersion substring at the returned offsets after the documented canonical newline normalisation."
 */
export type SearchResultSnippet = {
  readonly end_offset: number;
  readonly start_offset: number;
  readonly text: string;
};

/**
 * PRD §16.3 "Service-account and credential create/rotate/revoke".
 */
export type ServiceAccountCreateRequest = {
  readonly name: string;
};

/**
 * PRD §16.3: the credential's scopes are `ApiScope` members.
 */
export type ServiceAccountCredentialCreateRequest = {
  readonly label?: string;
  readonly scopes: readonly ApiScope[];
};

/**
 * PRD §16.4: "Keys are displayed only on entry, decrypted only inside the Model Gateway and
 * excluded from logs/exports/support." This response therefore returns the credential's
 * IDENTIFIER, its scopes and its lifecycle timestamps — never the credential material itself.
 * test/openapi/conventions.test.ts asserts that no response schema in this document declares a
 * secret-shaped property.
 */
export type ServiceAccountCredentialResponse = ResponseEnvelope & {
  readonly credential: {
    readonly created_at: Timestamp;
    readonly id: OpaqueId;
    readonly label?: string;
    readonly last_rotated_at?: Timestamp;
    readonly scopes: readonly ApiScope[];
  };
};

/**
 * PRD §16.3 "SAML/OIDC SSO connection create/test/activate/disable". PRD §16.4 bans arbitrary base URLs, so the metadata URL is constrained to https.
 */
export type SsoConnectionCreateRequest = {
  readonly metadata_url: string;
  readonly protocol: string;
};

export type SsoConnectionResponse = ResponseEnvelope & {
  readonly sso_connection: SsoConnectionSummary;
};

/**
 * PRD §16.3 — SSO connection states. PRD §16.3: "SSO cannot be enforced before a successful test."
 */
export type SsoConnectionState = "DRAFT" | "TESTING" | "ACTIVE" | "ERROR" | "DISABLED";

/**
 * PRD §16.3: "SSO cannot be enforced before a successful test." The state machine is `SsoConnectionState`. No secret material is ever returned (PRD §16.4).
 */
export type SsoConnectionSummary = {
  readonly id: OpaqueId;
  readonly protocol?: string;
  readonly state: SsoConnectionState;
};

/**
 * PRD §34.3: "Clarifications are submitted to `POST /v1/answer-jobs/{job_id}/clarifications`."
 * PRD §34.3 also states a stale round returns `409 CLARIFICATION_ROUND_CLOSED`, a code the
 * §34.9 catalogue does not list and FND-03's `ERROR_CODE_VALUES` therefore does not contain, so
 * this operation declares no stale-round `409` — see sub-PRD **Q-F8** (escalated, not invented).
 */
export type SubmitClarificationsRequest = {
  readonly answers: readonly {
    readonly answer: string;
    readonly clarification_id: OpaqueId;
  }[];
};

/**
 * PRD §16.2 "`GET /v1/system-status`". PRD §34.9 `GENERATION_UNAVAILABLE`: "Search remains available; retry when status recovers." Payload gap — sub-PRD Q-F9, owner `18-ops-release`.
 */
export type SystemStatusResponse = ResponseEnvelope & {
  readonly corpus_release_id?: OpaqueId;
  readonly generation_available: boolean;
  readonly search_available: boolean;
};

/**
 * PRD §34.1: an ISO 8601 UTC timestamp.
 */
export type Timestamp = string;

/**
 * A non-fatal advisory attached to a response. PRD §34.2 shows the array; it specifies no member shape (sub-PRD Q-F9).
 */
export type Warning = {
  readonly code: string;
  readonly message: string;
};
