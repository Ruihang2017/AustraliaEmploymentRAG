// GENERATED FROM schemas/openapi/openapi.yaml — DO NOT EDIT (PRD §20.1)
// Regenerate with `pnpm generate`; `pnpm generated:check` fails on a hand edit.

import type { AcknowledgementResponse, AlertResponse, AnswerJobAccepted, AnswerJobClarificationRequired, AnswerSnapshot, CollectionResponse, ComparisonRequest, CoverageAssessmentJobResponse, CoverageAssessmentRequest, CreateAnswerJobRequest, ExportCreateRequest, InvitationCreateRequest, JobAcceptedResponse, MembershipResponse, MembershipUpdateRequest, OpaqueId, RecordWorkflowState, ResearchRecordCreateRequest, ResearchRecordResponse, ResearchRecordTurnCreateRequest, ResearchRecordUpdateRequest, ResourceResponse, ResponseEnvelope, SearchRequest, SearchResponse, ServiceAccountCreateRequest, ServiceAccountCredentialCreateRequest, ServiceAccountCredentialResponse, SsoConnectionCreateRequest, SsoConnectionResponse, SubmitClarificationsRequest, SystemStatusResponse } from './schemas.js';

/**
 * One interface per operation, named `<PascalCaseOperationId>Operation`.
 *
 * `requestBody` is `never` when the operation takes none, `successResponse` is `never` when it
 * returns no body (a `204`), and `errorCodes` is the union of the PRD §34.9 codes the operation
 * declares — including those carried by a composite response, because an HTTP status is not
 * one-to-one with a code.
 */

export interface AcceptInvitationOperation {
  readonly operationId: "acceptInvitation";
  readonly method: "POST";
  readonly path: "/invitations/{invitation_id}/accept";
  readonly requestBody: never;
  readonly successResponse: MembershipResponse;
  readonly errorCodes: "AUTHENTICATION_REQUIRED" | "INTERNAL_ERROR" | "INVALID_REQUEST" | "RATE_LIMITED" | "RESOURCE_NOT_FOUND";
}

export interface AcknowledgeAlertOperation {
  readonly operationId: "acknowledgeAlert";
  readonly method: "POST";
  readonly path: "/alerts/{alert_id}/acknowledge";
  readonly requestBody: never;
  readonly successResponse: AlertResponse;
  readonly errorCodes: "AUTHENTICATION_REQUIRED" | "INTERNAL_ERROR" | "INVALID_REQUEST" | "RATE_LIMITED" | "RESOURCE_NOT_FOUND";
}

export interface ActivatePasskeyOperation {
  readonly operationId: "activatePasskey";
  readonly method: "POST";
  readonly path: "/mfa/passkeys/activate";
  readonly requestBody: Readonly<Record<string, unknown>>;
  readonly successResponse: AcknowledgementResponse;
  readonly errorCodes: "AUTHENTICATION_REQUIRED" | "INTERNAL_ERROR" | "INVALID_REQUEST" | "MFA_REQUIRED" | "RATE_LIMITED" | "RECENT_AUTH_REQUIRED";
}

export interface ActivateSsoConnectionOperation {
  readonly operationId: "activateSsoConnection";
  readonly method: "POST";
  readonly path: "/sso-connections/{sso_connection_id}/activate";
  readonly requestBody: never;
  readonly successResponse: SsoConnectionResponse;
  readonly errorCodes: "AUTHENTICATION_REQUIRED" | "INTERNAL_ERROR" | "INVALID_REQUEST" | "MFA_REQUIRED" | "RATE_LIMITED" | "RECENT_AUTH_REQUIRED" | "RESOURCE_NOT_FOUND";
}

export interface ActivateTotpOperation {
  readonly operationId: "activateTotp";
  readonly method: "POST";
  readonly path: "/mfa/totp/activate";
  readonly requestBody: {
    readonly otp: string;
  };
  readonly successResponse: AcknowledgementResponse;
  readonly errorCodes: "AUTHENTICATION_REQUIRED" | "INTERNAL_ERROR" | "INVALID_REQUEST" | "MFA_REQUIRED" | "RATE_LIMITED" | "RECENT_AUTH_REQUIRED";
}

export interface BeginPasskeyRegistrationOperation {
  readonly operationId: "beginPasskeyRegistration";
  readonly method: "POST";
  readonly path: "/mfa/passkeys";
  readonly requestBody: never;
  readonly successResponse: ResourceResponse;
  readonly errorCodes: "AUTHENTICATION_REQUIRED" | "INTERNAL_ERROR" | "INVALID_REQUEST" | "MFA_REQUIRED" | "RATE_LIMITED" | "RECENT_AUTH_REQUIRED";
}

export interface CancelAnswerJobOperation {
  readonly operationId: "cancelAnswerJob";
  readonly method: "POST";
  readonly path: "/answer-jobs/{job_id}/cancel";
  readonly requestBody: never;
  readonly successResponse: JobAcceptedResponse;
  readonly errorCodes: "AUTHENTICATION_REQUIRED" | "EPHEMERAL_CONTENT_EXPIRED" | "INTERNAL_ERROR" | "INVALID_REQUEST" | "RATE_LIMITED" | "RESOURCE_NOT_FOUND";
}

export interface CancelExportJobOperation {
  readonly operationId: "cancelExportJob";
  readonly method: "POST";
  readonly path: "/export-jobs/{job_id}/cancel";
  readonly requestBody: never;
  readonly successResponse: JobAcceptedResponse;
  readonly errorCodes: "AUTHENTICATION_REQUIRED" | "EPHEMERAL_CONTENT_EXPIRED" | "INTERNAL_ERROR" | "INVALID_REQUEST" | "RATE_LIMITED" | "RESOURCE_NOT_FOUND";
}

export interface CreateAnswerJobOperation {
  readonly operationId: "createAnswerJob";
  readonly method: "POST";
  readonly path: "/answers";
  readonly requestBody: CreateAnswerJobRequest;
  readonly successResponse: AnswerJobAccepted | AnswerJobClarificationRequired;
  readonly errorCodes: "AUTHENTICATION_REQUIRED" | "CORPUS_INCOMPATIBLE" | "CREDIT_LIMIT_REACHED" | "EMPLOYEE_PII_DETECTED" | "GENERATION_UNAVAILABLE" | "IDEMPOTENCY_CONFLICT" | "INTERNAL_ERROR" | "INVALID_ABN" | "INVALID_LEGAL_DATE" | "INVALID_REQUEST" | "RATE_LIMITED" | "SOURCE_NOT_CURRENT";
}

export interface CreateCommentOperation {
  readonly operationId: "createComment";
  readonly method: "POST";
  readonly path: "/comments";
  readonly requestBody: {
    readonly body: string;
    readonly research_record_id: OpaqueId;
  };
  readonly successResponse: ResourceResponse;
  readonly errorCodes: "AUTHENTICATION_REQUIRED" | "EMPLOYEE_PII_DETECTED" | "IDEMPOTENCY_CONFLICT" | "INTERNAL_ERROR" | "INVALID_REQUEST" | "RATE_LIMITED";
}

export interface CreateComparisonJobOperation {
  readonly operationId: "createComparisonJob";
  readonly method: "POST";
  readonly path: "/comparisons";
  readonly requestBody: ComparisonRequest;
  readonly successResponse: JobAcceptedResponse;
  readonly errorCodes: "AUTHENTICATION_REQUIRED" | "CORPUS_INCOMPATIBLE" | "CREDIT_LIMIT_REACHED" | "EMPLOYEE_PII_DETECTED" | "GENERATION_UNAVAILABLE" | "IDEMPOTENCY_CONFLICT" | "INTERNAL_ERROR" | "INVALID_LEGAL_DATE" | "INVALID_REQUEST" | "RATE_LIMITED" | "SOURCE_NOT_CURRENT";
}

export interface CreateCoverageAssessmentJobOperation {
  readonly operationId: "createCoverageAssessmentJob";
  readonly method: "POST";
  readonly path: "/coverage-assessments";
  readonly requestBody: CoverageAssessmentRequest;
  readonly successResponse: JobAcceptedResponse;
  readonly errorCodes: "AUTHENTICATION_REQUIRED" | "CORPUS_INCOMPATIBLE" | "CREDIT_LIMIT_REACHED" | "EMPLOYEE_PII_DETECTED" | "GENERATION_UNAVAILABLE" | "IDEMPOTENCY_CONFLICT" | "INTERNAL_ERROR" | "INVALID_ABN" | "INVALID_LEGAL_DATE" | "INVALID_REQUEST" | "RATE_LIMITED" | "SOURCE_NOT_CURRENT";
}

export interface CreateExportJobOperation {
  readonly operationId: "createExportJob";
  readonly method: "POST";
  readonly path: "/exports";
  readonly requestBody: ExportCreateRequest;
  readonly successResponse: JobAcceptedResponse;
  readonly errorCodes: "AUTHENTICATION_REQUIRED" | "IDEMPOTENCY_CONFLICT" | "INTERNAL_ERROR" | "INVALID_REQUEST" | "RATE_LIMITED";
}

export interface CreateInvitationOperation {
  readonly operationId: "createInvitation";
  readonly method: "POST";
  readonly path: "/invitations";
  readonly requestBody: InvitationCreateRequest;
  readonly successResponse: ResourceResponse;
  readonly errorCodes: "AUTHENTICATION_REQUIRED" | "IDEMPOTENCY_CONFLICT" | "INTERNAL_ERROR" | "INVALID_REQUEST" | "MFA_REQUIRED" | "RATE_LIMITED" | "RECENT_AUTH_REQUIRED";
}

export interface CreateIssueOperation {
  readonly operationId: "createIssue";
  readonly method: "POST";
  readonly path: "/issues";
  readonly requestBody: {
    readonly answer_snapshot_id?: OpaqueId;
    readonly body: string;
    readonly title: string;
  };
  readonly successResponse: ResourceResponse;
  readonly errorCodes: "AUTHENTICATION_REQUIRED" | "EMPLOYEE_PII_DETECTED" | "IDEMPOTENCY_CONFLICT" | "INTERNAL_ERROR" | "INVALID_REQUEST" | "RATE_LIMITED";
}

export interface CreateIssueCommentOperation {
  readonly operationId: "createIssueComment";
  readonly method: "POST";
  readonly path: "/issues/{issue_id}/comments";
  readonly requestBody: {
    readonly body: string;
  };
  readonly successResponse: ResourceResponse;
  readonly errorCodes: "AUTHENTICATION_REQUIRED" | "EMPLOYEE_PII_DETECTED" | "IDEMPOTENCY_CONFLICT" | "INTERNAL_ERROR" | "INVALID_REQUEST" | "RATE_LIMITED" | "RESOURCE_NOT_FOUND";
}

export interface CreateRecentAuthenticationCheckOperation {
  readonly operationId: "createRecentAuthenticationCheck";
  readonly method: "POST";
  readonly path: "/recent-authentication-checks";
  readonly requestBody: never;
  readonly successResponse: AcknowledgementResponse;
  readonly errorCodes: "AUTHENTICATION_REQUIRED" | "INTERNAL_ERROR" | "INVALID_REQUEST" | "MFA_REQUIRED" | "RATE_LIMITED" | "RECENT_AUTH_REQUIRED";
}

export interface CreateResearchRecordOperation {
  readonly operationId: "createResearchRecord";
  readonly method: "POST";
  readonly path: "/research-records";
  readonly requestBody: ResearchRecordCreateRequest;
  readonly successResponse: ResearchRecordResponse;
  readonly errorCodes: "AUTHENTICATION_REQUIRED" | "EMPLOYEE_PII_DETECTED" | "IDEMPOTENCY_CONFLICT" | "INTERNAL_ERROR" | "INVALID_LEGAL_DATE" | "INVALID_REQUEST" | "RATE_LIMITED";
}

export interface CreateResearchRecordReviewActionOperation {
  readonly operationId: "createResearchRecordReviewAction";
  readonly method: "POST";
  readonly path: "/research-records/{id}/review-actions";
  readonly requestBody: {
    readonly note?: string;
    readonly target_state: RecordWorkflowState;
  };
  readonly successResponse: ResourceResponse;
  readonly errorCodes: "AUTHENTICATION_REQUIRED" | "IDEMPOTENCY_CONFLICT" | "INTERNAL_ERROR" | "INVALID_REQUEST" | "RATE_LIMITED" | "RESOURCE_NOT_FOUND";
}

export interface CreateResearchRecordTurnOperation {
  readonly operationId: "createResearchRecordTurn";
  readonly method: "POST";
  readonly path: "/research-records/{id}/turns";
  readonly requestBody: ResearchRecordTurnCreateRequest;
  readonly successResponse: ResourceResponse;
  readonly errorCodes: "AUTHENTICATION_REQUIRED" | "EMPLOYEE_PII_DETECTED" | "IDEMPOTENCY_CONFLICT" | "INTERNAL_ERROR" | "INVALID_REQUEST" | "RATE_LIMITED" | "RESOURCE_NOT_FOUND";
}

export interface CreateServiceAccountOperation {
  readonly operationId: "createServiceAccount";
  readonly method: "POST";
  readonly path: "/service-accounts";
  readonly requestBody: ServiceAccountCreateRequest;
  readonly successResponse: ResourceResponse;
  readonly errorCodes: "AUTHENTICATION_REQUIRED" | "IDEMPOTENCY_CONFLICT" | "INTERNAL_ERROR" | "INVALID_REQUEST" | "MFA_REQUIRED" | "RATE_LIMITED" | "RECENT_AUTH_REQUIRED";
}

export interface CreateServiceAccountCredentialOperation {
  readonly operationId: "createServiceAccountCredential";
  readonly method: "POST";
  readonly path: "/service-accounts/{service_account_id}/credentials";
  readonly requestBody: ServiceAccountCredentialCreateRequest;
  readonly successResponse: ServiceAccountCredentialResponse;
  readonly errorCodes: "AUTHENTICATION_REQUIRED" | "IDEMPOTENCY_CONFLICT" | "INTERNAL_ERROR" | "INVALID_REQUEST" | "MFA_REQUIRED" | "RATE_LIMITED" | "RECENT_AUTH_REQUIRED" | "RESOURCE_NOT_FOUND";
}

export interface CreateSsoConnectionOperation {
  readonly operationId: "createSsoConnection";
  readonly method: "POST";
  readonly path: "/sso-connections";
  readonly requestBody: SsoConnectionCreateRequest;
  readonly successResponse: SsoConnectionResponse;
  readonly errorCodes: "AUTHENTICATION_REQUIRED" | "IDEMPOTENCY_CONFLICT" | "INTERNAL_ERROR" | "INVALID_REQUEST" | "MFA_REQUIRED" | "RATE_LIMITED" | "RECENT_AUTH_REQUIRED";
}

export interface CreateWatchlistOperation {
  readonly operationId: "createWatchlist";
  readonly method: "POST";
  readonly path: "/watchlists";
  readonly requestBody: {
    readonly document_ids?: readonly OpaqueId[];
    readonly name: string;
    readonly research_record_ids?: readonly OpaqueId[];
  };
  readonly successResponse: ResourceResponse;
  readonly errorCodes: "AUTHENTICATION_REQUIRED" | "IDEMPOTENCY_CONFLICT" | "INTERNAL_ERROR" | "INVALID_REQUEST" | "RATE_LIMITED";
}

export interface CreateWebhookSubscriptionOperation {
  readonly operationId: "createWebhookSubscription";
  readonly method: "POST";
  readonly path: "/webhook-subscriptions";
  readonly requestBody: {
    readonly endpoint_url: string;
    readonly event_types: readonly string[];
  };
  readonly successResponse: ResourceResponse;
  readonly errorCodes: "AUTHENTICATION_REQUIRED" | "IDEMPOTENCY_CONFLICT" | "INTERNAL_ERROR" | "INVALID_REQUEST" | "RATE_LIMITED";
}

export interface DeleteCommentOperation {
  readonly operationId: "deleteComment";
  readonly method: "DELETE";
  readonly path: "/comments/{comment_id}";
  readonly requestBody: never;
  readonly successResponse: never;
  readonly errorCodes: "AUTHENTICATION_REQUIRED" | "CONCURRENT_MODIFICATION" | "INTERNAL_ERROR" | "INVALID_REQUEST" | "RATE_LIMITED" | "RESOURCE_NOT_FOUND";
}

export interface DeleteMembershipOperation {
  readonly operationId: "deleteMembership";
  readonly method: "DELETE";
  readonly path: "/memberships/{membership_id}";
  readonly requestBody: never;
  readonly successResponse: never;
  readonly errorCodes: "AUTHENTICATION_REQUIRED" | "CONCURRENT_MODIFICATION" | "INTERNAL_ERROR" | "INVALID_REQUEST" | "MFA_REQUIRED" | "RATE_LIMITED" | "RECENT_AUTH_REQUIRED" | "RESOURCE_NOT_FOUND";
}

export interface DeleteResearchRecordOperation {
  readonly operationId: "deleteResearchRecord";
  readonly method: "DELETE";
  readonly path: "/research-records/{id}";
  readonly requestBody: never;
  readonly successResponse: never;
  readonly errorCodes: "AUTHENTICATION_REQUIRED" | "CONCURRENT_MODIFICATION" | "INTERNAL_ERROR" | "INVALID_REQUEST" | "RATE_LIMITED" | "RESOURCE_NOT_FOUND";
}

export interface DeleteWatchlistOperation {
  readonly operationId: "deleteWatchlist";
  readonly method: "DELETE";
  readonly path: "/watchlists/{watchlist_id}";
  readonly requestBody: never;
  readonly successResponse: never;
  readonly errorCodes: "AUTHENTICATION_REQUIRED" | "CONCURRENT_MODIFICATION" | "INTERNAL_ERROR" | "INVALID_REQUEST" | "RATE_LIMITED" | "RESOURCE_NOT_FOUND";
}

export interface DeleteWebhookSubscriptionOperation {
  readonly operationId: "deleteWebhookSubscription";
  readonly method: "DELETE";
  readonly path: "/webhook-subscriptions/{webhook_subscription_id}";
  readonly requestBody: never;
  readonly successResponse: never;
  readonly errorCodes: "AUTHENTICATION_REQUIRED" | "CONCURRENT_MODIFICATION" | "INTERNAL_ERROR" | "INVALID_REQUEST" | "RATE_LIMITED" | "RESOURCE_NOT_FOUND";
}

export interface DisableSsoConnectionOperation {
  readonly operationId: "disableSsoConnection";
  readonly method: "POST";
  readonly path: "/sso-connections/{sso_connection_id}/disable";
  readonly requestBody: never;
  readonly successResponse: SsoConnectionResponse;
  readonly errorCodes: "AUTHENTICATION_REQUIRED" | "INTERNAL_ERROR" | "INVALID_REQUEST" | "MFA_REQUIRED" | "RATE_LIMITED" | "RECENT_AUTH_REQUIRED" | "RESOURCE_NOT_FOUND";
}

export interface EnrolTotpOperation {
  readonly operationId: "enrolTotp";
  readonly method: "POST";
  readonly path: "/mfa/totp";
  readonly requestBody: never;
  readonly successResponse: ResourceResponse;
  readonly errorCodes: "AUTHENTICATION_REQUIRED" | "INTERNAL_ERROR" | "INVALID_REQUEST" | "MFA_REQUIRED" | "RATE_LIMITED" | "RECENT_AUTH_REQUIRED";
}

export interface GetAlertOperation {
  readonly operationId: "getAlert";
  readonly method: "GET";
  readonly path: "/alerts/{alert_id}";
  readonly requestBody: never;
  readonly successResponse: AlertResponse;
  readonly errorCodes: "AUTHENTICATION_REQUIRED" | "INTERNAL_ERROR" | "INVALID_REQUEST" | "RATE_LIMITED" | "RESOURCE_NOT_FOUND";
}

export interface GetAnswerJobOperation {
  readonly operationId: "getAnswerJob";
  readonly method: "GET";
  readonly path: "/answer-jobs/{job_id}";
  readonly requestBody: never;
  readonly successResponse: JobAcceptedResponse;
  readonly errorCodes: "AUTHENTICATION_REQUIRED" | "EPHEMERAL_CONTENT_EXPIRED" | "INTERNAL_ERROR" | "INVALID_REQUEST" | "RATE_LIMITED" | "RESOURCE_NOT_FOUND";
}

export interface GetAnswerSnapshotOperation {
  readonly operationId: "getAnswerSnapshot";
  readonly method: "GET";
  readonly path: "/answers/{answer_snapshot_id}";
  readonly requestBody: never;
  readonly successResponse: AnswerSnapshot;
  readonly errorCodes: "AUTHENTICATION_REQUIRED" | "EPHEMERAL_CONTENT_EXPIRED" | "INTERNAL_ERROR" | "INVALID_REQUEST" | "RATE_LIMITED" | "RESOURCE_NOT_FOUND";
}

export interface GetCommentOperation {
  readonly operationId: "getComment";
  readonly method: "GET";
  readonly path: "/comments/{comment_id}";
  readonly requestBody: never;
  readonly successResponse: ResourceResponse;
  readonly errorCodes: "AUTHENTICATION_REQUIRED" | "INTERNAL_ERROR" | "INVALID_REQUEST" | "RATE_LIMITED" | "RESOURCE_NOT_FOUND";
}

export interface GetComparisonJobOperation {
  readonly operationId: "getComparisonJob";
  readonly method: "GET";
  readonly path: "/comparison-jobs/{job_id}";
  readonly requestBody: never;
  readonly successResponse: JobAcceptedResponse;
  readonly errorCodes: "AUTHENTICATION_REQUIRED" | "EPHEMERAL_CONTENT_EXPIRED" | "INTERNAL_ERROR" | "INVALID_REQUEST" | "RATE_LIMITED" | "RESOURCE_NOT_FOUND";
}

export interface GetCoverageAssessmentJobOperation {
  readonly operationId: "getCoverageAssessmentJob";
  readonly method: "GET";
  readonly path: "/coverage-assessment-jobs/{job_id}";
  readonly requestBody: never;
  readonly successResponse: CoverageAssessmentJobResponse;
  readonly errorCodes: "AUTHENTICATION_REQUIRED" | "EPHEMERAL_CONTENT_EXPIRED" | "INTERNAL_ERROR" | "INVALID_REQUEST" | "RATE_LIMITED" | "RESOURCE_NOT_FOUND";
}

export interface GetCurrentUsageOperation {
  readonly operationId: "getCurrentUsage";
  readonly method: "GET";
  readonly path: "/usage/current";
  readonly requestBody: never;
  readonly successResponse: ResourceResponse;
  readonly errorCodes: "AUTHENTICATION_REQUIRED" | "INTERNAL_ERROR" | "INVALID_REQUEST" | "RATE_LIMITED";
}

export interface GetDocumentOperation {
  readonly operationId: "getDocument";
  readonly method: "GET";
  readonly path: "/documents/{document_id}";
  readonly requestBody: never;
  readonly successResponse: ResourceResponse;
  readonly errorCodes: "AUTHENTICATION_REQUIRED" | "CORPUS_INCOMPATIBLE" | "INTERNAL_ERROR" | "INVALID_REQUEST" | "RATE_LIMITED" | "RESOURCE_NOT_FOUND" | "SOURCE_NOT_CURRENT";
}

export interface GetDocumentRelationsOperation {
  readonly operationId: "getDocumentRelations";
  readonly method: "GET";
  readonly path: "/documents/{document_id}/relations";
  readonly requestBody: never;
  readonly successResponse: CollectionResponse;
  readonly errorCodes: "AUTHENTICATION_REQUIRED" | "INTERNAL_ERROR" | "INVALID_REQUEST" | "RATE_LIMITED" | "RESOURCE_NOT_FOUND";
}

export interface GetDocumentTimelineOperation {
  readonly operationId: "getDocumentTimeline";
  readonly method: "GET";
  readonly path: "/documents/{document_id}/timeline";
  readonly requestBody: never;
  readonly successResponse: CollectionResponse;
  readonly errorCodes: "AUTHENTICATION_REQUIRED" | "INTERNAL_ERROR" | "INVALID_REQUEST" | "RATE_LIMITED" | "RESOURCE_NOT_FOUND";
}

export interface GetExportJobOperation {
  readonly operationId: "getExportJob";
  readonly method: "GET";
  readonly path: "/export-jobs/{job_id}";
  readonly requestBody: never;
  readonly successResponse: JobAcceptedResponse;
  readonly errorCodes: "AUTHENTICATION_REQUIRED" | "EPHEMERAL_CONTENT_EXPIRED" | "INTERNAL_ERROR" | "INVALID_REQUEST" | "RATE_LIMITED" | "RESOURCE_NOT_FOUND";
}

export interface GetIssueOperation {
  readonly operationId: "getIssue";
  readonly method: "GET";
  readonly path: "/issues/{issue_id}";
  readonly requestBody: never;
  readonly successResponse: ResourceResponse;
  readonly errorCodes: "AUTHENTICATION_REQUIRED" | "INTERNAL_ERROR" | "INVALID_REQUEST" | "RATE_LIMITED" | "RESOURCE_NOT_FOUND";
}

export interface GetMembershipOperation {
  readonly operationId: "getMembership";
  readonly method: "GET";
  readonly path: "/memberships/{membership_id}";
  readonly requestBody: never;
  readonly successResponse: MembershipResponse;
  readonly errorCodes: "AUTHENTICATION_REQUIRED" | "INTERNAL_ERROR" | "INVALID_REQUEST" | "RATE_LIMITED" | "RESOURCE_NOT_FOUND";
}

export interface GetNodeRelationsOperation {
  readonly operationId: "getNodeRelations";
  readonly method: "GET";
  readonly path: "/nodes/{node_id}/relations";
  readonly requestBody: never;
  readonly successResponse: CollectionResponse;
  readonly errorCodes: "AUTHENTICATION_REQUIRED" | "INTERNAL_ERROR" | "INVALID_REQUEST" | "RATE_LIMITED" | "RESOURCE_NOT_FOUND";
}

export interface GetNodeTimelineOperation {
  readonly operationId: "getNodeTimeline";
  readonly method: "GET";
  readonly path: "/nodes/{node_id}/timeline";
  readonly requestBody: never;
  readonly successResponse: CollectionResponse;
  readonly errorCodes: "AUTHENTICATION_REQUIRED" | "INTERNAL_ERROR" | "INVALID_REQUEST" | "RATE_LIMITED" | "RESOURCE_NOT_FOUND";
}

export interface GetNodeVersionOperation {
  readonly operationId: "getNodeVersion";
  readonly method: "GET";
  readonly path: "/node-versions/{node_version_id}";
  readonly requestBody: never;
  readonly successResponse: ResourceResponse;
  readonly errorCodes: "AUTHENTICATION_REQUIRED" | "INTERNAL_ERROR" | "INVALID_REQUEST" | "RATE_LIMITED" | "RESOURCE_NOT_FOUND";
}

export interface GetResearchRecordOperation {
  readonly operationId: "getResearchRecord";
  readonly method: "GET";
  readonly path: "/research-records/{id}";
  readonly requestBody: never;
  readonly successResponse: ResearchRecordResponse;
  readonly errorCodes: "AUTHENTICATION_REQUIRED" | "INTERNAL_ERROR" | "INVALID_REQUEST" | "RATE_LIMITED" | "RESOURCE_NOT_FOUND";
}

export interface GetSystemStatusOperation {
  readonly operationId: "getSystemStatus";
  readonly method: "GET";
  readonly path: "/system-status";
  readonly requestBody: never;
  readonly successResponse: SystemStatusResponse;
  readonly errorCodes: "AUTHENTICATION_REQUIRED" | "INTERNAL_ERROR" | "INVALID_REQUEST" | "RATE_LIMITED";
}

export interface GetUsageLimitsOperation {
  readonly operationId: "getUsageLimits";
  readonly method: "GET";
  readonly path: "/usage/limits";
  readonly requestBody: never;
  readonly successResponse: ResourceResponse;
  readonly errorCodes: "AUTHENTICATION_REQUIRED" | "INTERNAL_ERROR" | "INVALID_REQUEST" | "RATE_LIMITED";
}

export interface GetWatchlistOperation {
  readonly operationId: "getWatchlist";
  readonly method: "GET";
  readonly path: "/watchlists/{watchlist_id}";
  readonly requestBody: never;
  readonly successResponse: ResourceResponse;
  readonly errorCodes: "AUTHENTICATION_REQUIRED" | "INTERNAL_ERROR" | "INVALID_REQUEST" | "RATE_LIMITED" | "RESOURCE_NOT_FOUND";
}

export interface GetWebhookSubscriptionOperation {
  readonly operationId: "getWebhookSubscription";
  readonly method: "GET";
  readonly path: "/webhook-subscriptions/{webhook_subscription_id}";
  readonly requestBody: never;
  readonly successResponse: ResourceResponse;
  readonly errorCodes: "AUTHENTICATION_REQUIRED" | "INTERNAL_ERROR" | "INVALID_REQUEST" | "RATE_LIMITED" | "RESOURCE_NOT_FOUND";
}

export interface ListAlertsOperation {
  readonly operationId: "listAlerts";
  readonly method: "GET";
  readonly path: "/alerts";
  readonly requestBody: never;
  readonly successResponse: CollectionResponse;
  readonly errorCodes: "AUTHENTICATION_REQUIRED" | "INTERNAL_ERROR" | "INVALID_REQUEST" | "RATE_LIMITED";
}

export interface ListAuditEventsOperation {
  readonly operationId: "listAuditEvents";
  readonly method: "GET";
  readonly path: "/audit-events";
  readonly requestBody: never;
  readonly successResponse: CollectionResponse;
  readonly errorCodes: "AUTHENTICATION_REQUIRED" | "INTERNAL_ERROR" | "INVALID_REQUEST" | "MFA_REQUIRED" | "RATE_LIMITED" | "RECENT_AUTH_REQUIRED";
}

export interface ListCommentsOperation {
  readonly operationId: "listComments";
  readonly method: "GET";
  readonly path: "/comments";
  readonly requestBody: never;
  readonly successResponse: CollectionResponse;
  readonly errorCodes: "AUTHENTICATION_REQUIRED" | "INTERNAL_ERROR" | "INVALID_REQUEST" | "RATE_LIMITED";
}

export interface ListDocumentVersionNodesOperation {
  readonly operationId: "listDocumentVersionNodes";
  readonly method: "GET";
  readonly path: "/document-versions/{version_id}/nodes";
  readonly requestBody: never;
  readonly successResponse: CollectionResponse;
  readonly errorCodes: "AUTHENTICATION_REQUIRED" | "INTERNAL_ERROR" | "INVALID_REQUEST" | "RATE_LIMITED" | "RESOURCE_NOT_FOUND";
}

export interface ListDocumentVersionsOperation {
  readonly operationId: "listDocumentVersions";
  readonly method: "GET";
  readonly path: "/documents/{document_id}/versions";
  readonly requestBody: never;
  readonly successResponse: CollectionResponse;
  readonly errorCodes: "AUTHENTICATION_REQUIRED" | "INTERNAL_ERROR" | "INVALID_REQUEST" | "RATE_LIMITED" | "RESOURCE_NOT_FOUND";
}

export interface ListInvitationsOperation {
  readonly operationId: "listInvitations";
  readonly method: "GET";
  readonly path: "/invitations";
  readonly requestBody: never;
  readonly successResponse: CollectionResponse;
  readonly errorCodes: "AUTHENTICATION_REQUIRED" | "INTERNAL_ERROR" | "INVALID_REQUEST" | "MFA_REQUIRED" | "RATE_LIMITED" | "RECENT_AUTH_REQUIRED";
}

export interface ListIssuesOperation {
  readonly operationId: "listIssues";
  readonly method: "GET";
  readonly path: "/issues";
  readonly requestBody: never;
  readonly successResponse: CollectionResponse;
  readonly errorCodes: "AUTHENTICATION_REQUIRED" | "INTERNAL_ERROR" | "INVALID_REQUEST" | "RATE_LIMITED";
}

export interface ListMembershipsOperation {
  readonly operationId: "listMemberships";
  readonly method: "GET";
  readonly path: "/memberships";
  readonly requestBody: never;
  readonly successResponse: CollectionResponse;
  readonly errorCodes: "AUTHENTICATION_REQUIRED" | "INTERNAL_ERROR" | "INVALID_REQUEST" | "RATE_LIMITED";
}

export interface ListPasskeysOperation {
  readonly operationId: "listPasskeys";
  readonly method: "GET";
  readonly path: "/mfa/passkeys";
  readonly requestBody: never;
  readonly successResponse: CollectionResponse;
  readonly errorCodes: "AUTHENTICATION_REQUIRED" | "INTERNAL_ERROR" | "INVALID_REQUEST" | "RATE_LIMITED";
}

export interface ListResearchRecordAnswersOperation {
  readonly operationId: "listResearchRecordAnswers";
  readonly method: "GET";
  readonly path: "/research-records/{id}/answers";
  readonly requestBody: never;
  readonly successResponse: CollectionResponse;
  readonly errorCodes: "AUTHENTICATION_REQUIRED" | "INTERNAL_ERROR" | "INVALID_REQUEST" | "RATE_LIMITED" | "RESOURCE_NOT_FOUND";
}

export interface ListResearchRecordReviewActionsOperation {
  readonly operationId: "listResearchRecordReviewActions";
  readonly method: "GET";
  readonly path: "/research-records/{id}/review-actions";
  readonly requestBody: never;
  readonly successResponse: CollectionResponse;
  readonly errorCodes: "AUTHENTICATION_REQUIRED" | "INTERNAL_ERROR" | "INVALID_REQUEST" | "RATE_LIMITED" | "RESOURCE_NOT_FOUND";
}

export interface ListResearchRecordsOperation {
  readonly operationId: "listResearchRecords";
  readonly method: "GET";
  readonly path: "/research-records";
  readonly requestBody: never;
  readonly successResponse: CollectionResponse;
  readonly errorCodes: "AUTHENTICATION_REQUIRED" | "INTERNAL_ERROR" | "INVALID_REQUEST" | "RATE_LIMITED";
}

export interface ListResearchRecordTurnsOperation {
  readonly operationId: "listResearchRecordTurns";
  readonly method: "GET";
  readonly path: "/research-records/{id}/turns";
  readonly requestBody: never;
  readonly successResponse: CollectionResponse;
  readonly errorCodes: "AUTHENTICATION_REQUIRED" | "INTERNAL_ERROR" | "INVALID_REQUEST" | "RATE_LIMITED" | "RESOURCE_NOT_FOUND";
}

export interface ListServiceAccountsOperation {
  readonly operationId: "listServiceAccounts";
  readonly method: "GET";
  readonly path: "/service-accounts";
  readonly requestBody: never;
  readonly successResponse: CollectionResponse;
  readonly errorCodes: "AUTHENTICATION_REQUIRED" | "INTERNAL_ERROR" | "INVALID_REQUEST" | "MFA_REQUIRED" | "RATE_LIMITED" | "RECENT_AUTH_REQUIRED";
}

export interface ListSessionsOperation {
  readonly operationId: "listSessions";
  readonly method: "GET";
  readonly path: "/sessions";
  readonly requestBody: never;
  readonly successResponse: CollectionResponse;
  readonly errorCodes: "AUTHENTICATION_REQUIRED" | "INTERNAL_ERROR" | "INVALID_REQUEST" | "RATE_LIMITED";
}

export interface ListSsoConnectionsOperation {
  readonly operationId: "listSsoConnections";
  readonly method: "GET";
  readonly path: "/sso-connections";
  readonly requestBody: never;
  readonly successResponse: CollectionResponse;
  readonly errorCodes: "AUTHENTICATION_REQUIRED" | "INTERNAL_ERROR" | "INVALID_REQUEST" | "MFA_REQUIRED" | "RATE_LIMITED" | "RECENT_AUTH_REQUIRED";
}

export interface ListUsageEventsOperation {
  readonly operationId: "listUsageEvents";
  readonly method: "GET";
  readonly path: "/usage/events";
  readonly requestBody: never;
  readonly successResponse: CollectionResponse;
  readonly errorCodes: "AUTHENTICATION_REQUIRED" | "INTERNAL_ERROR" | "INVALID_REQUEST" | "RATE_LIMITED";
}

export interface ListWatchlistsOperation {
  readonly operationId: "listWatchlists";
  readonly method: "GET";
  readonly path: "/watchlists";
  readonly requestBody: never;
  readonly successResponse: CollectionResponse;
  readonly errorCodes: "AUTHENTICATION_REQUIRED" | "INTERNAL_ERROR" | "INVALID_REQUEST" | "RATE_LIMITED";
}

export interface ListWebhookSubscriptionsOperation {
  readonly operationId: "listWebhookSubscriptions";
  readonly method: "GET";
  readonly path: "/webhook-subscriptions";
  readonly requestBody: never;
  readonly successResponse: CollectionResponse;
  readonly errorCodes: "AUTHENTICATION_REQUIRED" | "INTERNAL_ERROR" | "INVALID_REQUEST" | "RATE_LIMITED";
}

export interface RegenerateRecoveryCodesOperation {
  readonly operationId: "regenerateRecoveryCodes";
  readonly method: "POST";
  readonly path: "/mfa/recovery-codes";
  readonly requestBody: never;
  readonly successResponse: ResponseEnvelope & {
    readonly codes: readonly string[];
  };
  readonly errorCodes: "AUTHENTICATION_REQUIRED" | "IDEMPOTENCY_CONFLICT" | "INTERNAL_ERROR" | "INVALID_REQUEST" | "MFA_REQUIRED" | "RATE_LIMITED" | "RECENT_AUTH_REQUIRED";
}

export interface RemovePasskeyOperation {
  readonly operationId: "removePasskey";
  readonly method: "DELETE";
  readonly path: "/mfa/passkeys/{passkey_id}";
  readonly requestBody: never;
  readonly successResponse: never;
  readonly errorCodes: "AUTHENTICATION_REQUIRED" | "INTERNAL_ERROR" | "INVALID_REQUEST" | "MFA_REQUIRED" | "RATE_LIMITED" | "RECENT_AUTH_REQUIRED" | "RESOURCE_NOT_FOUND";
}

export interface RemoveTotpOperation {
  readonly operationId: "removeTotp";
  readonly method: "DELETE";
  readonly path: "/mfa/totp";
  readonly requestBody: never;
  readonly successResponse: never;
  readonly errorCodes: "AUTHENTICATION_REQUIRED" | "INTERNAL_ERROR" | "INVALID_REQUEST" | "MFA_REQUIRED" | "RATE_LIMITED" | "RECENT_AUTH_REQUIRED";
}

export interface RerunAnswerOperation {
  readonly operationId: "rerunAnswer";
  readonly method: "POST";
  readonly path: "/answers/{answer_snapshot_id}/rerun";
  readonly requestBody: never;
  readonly successResponse: JobAcceptedResponse;
  readonly errorCodes: "AUTHENTICATION_REQUIRED" | "CORPUS_INCOMPATIBLE" | "CREDIT_LIMIT_REACHED" | "EPHEMERAL_CONTENT_EXPIRED" | "GENERATION_UNAVAILABLE" | "IDEMPOTENCY_CONFLICT" | "INTERNAL_ERROR" | "INVALID_LEGAL_DATE" | "INVALID_REQUEST" | "RATE_LIMITED" | "RESOURCE_NOT_FOUND" | "SOURCE_NOT_CURRENT";
}

export interface ResolveAlertOperation {
  readonly operationId: "resolveAlert";
  readonly method: "POST";
  readonly path: "/alerts/{alert_id}/resolve";
  readonly requestBody: never;
  readonly successResponse: AlertResponse;
  readonly errorCodes: "AUTHENTICATION_REQUIRED" | "INTERNAL_ERROR" | "INVALID_REQUEST" | "RATE_LIMITED" | "RESOURCE_NOT_FOUND";
}

export interface ResolveCommentOperation {
  readonly operationId: "resolveComment";
  readonly method: "POST";
  readonly path: "/comments/{comment_id}/resolve";
  readonly requestBody: never;
  readonly successResponse: AcknowledgementResponse;
  readonly errorCodes: "AUTHENTICATION_REQUIRED" | "INTERNAL_ERROR" | "INVALID_REQUEST" | "RATE_LIMITED" | "RESOURCE_NOT_FOUND";
}

export interface RevokeInvitationOperation {
  readonly operationId: "revokeInvitation";
  readonly method: "POST";
  readonly path: "/invitations/{invitation_id}/revoke";
  readonly requestBody: never;
  readonly successResponse: AcknowledgementResponse;
  readonly errorCodes: "AUTHENTICATION_REQUIRED" | "INTERNAL_ERROR" | "INVALID_REQUEST" | "MFA_REQUIRED" | "RATE_LIMITED" | "RECENT_AUTH_REQUIRED" | "RESOURCE_NOT_FOUND";
}

export interface RevokeServiceAccountCredentialOperation {
  readonly operationId: "revokeServiceAccountCredential";
  readonly method: "POST";
  readonly path: "/service-accounts/{service_account_id}/credentials/{credential_id}/revoke";
  readonly requestBody: never;
  readonly successResponse: AcknowledgementResponse;
  readonly errorCodes: "AUTHENTICATION_REQUIRED" | "INTERNAL_ERROR" | "INVALID_REQUEST" | "MFA_REQUIRED" | "RATE_LIMITED" | "RECENT_AUTH_REQUIRED" | "RESOURCE_NOT_FOUND";
}

export interface RevokeSessionOperation {
  readonly operationId: "revokeSession";
  readonly method: "DELETE";
  readonly path: "/sessions/{session_id}";
  readonly requestBody: never;
  readonly successResponse: never;
  readonly errorCodes: "AUTHENTICATION_REQUIRED" | "INTERNAL_ERROR" | "INVALID_REQUEST" | "MFA_REQUIRED" | "RATE_LIMITED" | "RECENT_AUTH_REQUIRED" | "RESOURCE_NOT_FOUND";
}

export interface RotateServiceAccountCredentialOperation {
  readonly operationId: "rotateServiceAccountCredential";
  readonly method: "POST";
  readonly path: "/service-accounts/{service_account_id}/credentials/{credential_id}/rotate";
  readonly requestBody: never;
  readonly successResponse: ServiceAccountCredentialResponse;
  readonly errorCodes: "AUTHENTICATION_REQUIRED" | "IDEMPOTENCY_CONFLICT" | "INTERNAL_ERROR" | "INVALID_REQUEST" | "MFA_REQUIRED" | "RATE_LIMITED" | "RECENT_AUTH_REQUIRED" | "RESOURCE_NOT_FOUND";
}

export interface RotateWebhookSubscriptionSigningMaterialOperation {
  readonly operationId: "rotateWebhookSubscriptionSigningMaterial";
  readonly method: "POST";
  readonly path: "/webhook-subscriptions/{webhook_subscription_id}/rotate";
  readonly requestBody: never;
  readonly successResponse: AcknowledgementResponse;
  readonly errorCodes: "AUTHENTICATION_REQUIRED" | "IDEMPOTENCY_CONFLICT" | "INTERNAL_ERROR" | "INVALID_REQUEST" | "MFA_REQUIRED" | "RATE_LIMITED" | "RECENT_AUTH_REQUIRED" | "RESOURCE_NOT_FOUND";
}

export interface SearchOperation {
  readonly operationId: "search";
  readonly method: "POST";
  readonly path: "/search";
  readonly requestBody: SearchRequest;
  readonly successResponse: SearchResponse;
  readonly errorCodes: "AUTHENTICATION_REQUIRED" | "CORPUS_INCOMPATIBLE" | "INTERNAL_ERROR" | "INVALID_LEGAL_DATE" | "INVALID_REQUEST" | "RATE_LIMITED" | "SOURCE_NOT_CURRENT";
}

export interface StreamAnswerJobEventsOperation {
  readonly operationId: "streamAnswerJobEvents";
  readonly method: "GET";
  readonly path: "/answer-jobs/{job_id}/events";
  readonly requestBody: never;
  readonly successResponse: string;
  readonly errorCodes: "AUTHENTICATION_REQUIRED" | "EPHEMERAL_CONTENT_EXPIRED" | "INTERNAL_ERROR" | "INVALID_REQUEST" | "RATE_LIMITED" | "RESOURCE_NOT_FOUND";
}

export interface SubmitAnswerJobClarificationsOperation {
  readonly operationId: "submitAnswerJobClarifications";
  readonly method: "POST";
  readonly path: "/answer-jobs/{job_id}/clarifications";
  readonly requestBody: SubmitClarificationsRequest;
  readonly successResponse: JobAcceptedResponse;
  readonly errorCodes: "AUTHENTICATION_REQUIRED" | "CORPUS_INCOMPATIBLE" | "CREDIT_LIMIT_REACHED" | "EMPLOYEE_PII_DETECTED" | "EPHEMERAL_CONTENT_EXPIRED" | "GENERATION_UNAVAILABLE" | "IDEMPOTENCY_CONFLICT" | "INTERNAL_ERROR" | "INVALID_REQUEST" | "RATE_LIMITED" | "RESOURCE_NOT_FOUND" | "SOURCE_NOT_CURRENT";
}

export interface TestSsoConnectionOperation {
  readonly operationId: "testSsoConnection";
  readonly method: "POST";
  readonly path: "/sso-connections/{sso_connection_id}/test";
  readonly requestBody: never;
  readonly successResponse: SsoConnectionResponse;
  readonly errorCodes: "AUTHENTICATION_REQUIRED" | "INTERNAL_ERROR" | "INVALID_REQUEST" | "MFA_REQUIRED" | "RATE_LIMITED" | "RECENT_AUTH_REQUIRED" | "RESOURCE_NOT_FOUND";
}

export interface TestWebhookSubscriptionOperation {
  readonly operationId: "testWebhookSubscription";
  readonly method: "POST";
  readonly path: "/webhook-subscriptions/{webhook_subscription_id}/test";
  readonly requestBody: never;
  readonly successResponse: AcknowledgementResponse;
  readonly errorCodes: "AUTHENTICATION_REQUIRED" | "IDEMPOTENCY_CONFLICT" | "INTERNAL_ERROR" | "INVALID_REQUEST" | "RATE_LIMITED" | "RESOURCE_NOT_FOUND";
}

export interface UpdateCommentOperation {
  readonly operationId: "updateComment";
  readonly method: "PATCH";
  readonly path: "/comments/{comment_id}";
  readonly requestBody: {
    readonly body: string;
  };
  readonly successResponse: ResourceResponse;
  readonly errorCodes: "AUTHENTICATION_REQUIRED" | "CONCURRENT_MODIFICATION" | "EMPLOYEE_PII_DETECTED" | "INTERNAL_ERROR" | "INVALID_REQUEST" | "RATE_LIMITED" | "RESOURCE_NOT_FOUND";
}

export interface UpdateMembershipOperation {
  readonly operationId: "updateMembership";
  readonly method: "PATCH";
  readonly path: "/memberships/{membership_id}";
  readonly requestBody: MembershipUpdateRequest;
  readonly successResponse: MembershipResponse;
  readonly errorCodes: "AUTHENTICATION_REQUIRED" | "CONCURRENT_MODIFICATION" | "INTERNAL_ERROR" | "INVALID_REQUEST" | "MFA_REQUIRED" | "RATE_LIMITED" | "RECENT_AUTH_REQUIRED" | "RESOURCE_NOT_FOUND";
}

export interface UpdateResearchRecordOperation {
  readonly operationId: "updateResearchRecord";
  readonly method: "PATCH";
  readonly path: "/research-records/{id}";
  readonly requestBody: ResearchRecordUpdateRequest;
  readonly successResponse: ResearchRecordResponse;
  readonly errorCodes: "AUTHENTICATION_REQUIRED" | "CONCURRENT_MODIFICATION" | "EMPLOYEE_PII_DETECTED" | "INTERNAL_ERROR" | "INVALID_REQUEST" | "RATE_LIMITED" | "RESOURCE_NOT_FOUND";
}

export interface UpdateWatchlistOperation {
  readonly operationId: "updateWatchlist";
  readonly method: "PATCH";
  readonly path: "/watchlists/{watchlist_id}";
  readonly requestBody: {
    readonly document_ids?: readonly OpaqueId[];
    readonly name?: string;
    readonly research_record_ids?: readonly OpaqueId[];
  };
  readonly successResponse: ResourceResponse;
  readonly errorCodes: "AUTHENTICATION_REQUIRED" | "CONCURRENT_MODIFICATION" | "INTERNAL_ERROR" | "INVALID_REQUEST" | "RATE_LIMITED" | "RESOURCE_NOT_FOUND";
}

export interface UpdateWebhookSubscriptionOperation {
  readonly operationId: "updateWebhookSubscription";
  readonly method: "PATCH";
  readonly path: "/webhook-subscriptions/{webhook_subscription_id}";
  readonly requestBody: {
    readonly active?: boolean;
    readonly endpoint_url?: string;
    readonly event_types?: readonly string[];
  };
  readonly successResponse: ResourceResponse;
  readonly errorCodes: "AUTHENTICATION_REQUIRED" | "CONCURRENT_MODIFICATION" | "INTERNAL_ERROR" | "INVALID_REQUEST" | "RATE_LIMITED" | "RESOURCE_NOT_FOUND";
}
