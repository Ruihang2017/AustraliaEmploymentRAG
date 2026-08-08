/**
 * The recorded bodies, again — as values ANNOTATED with the generated types.
 *
 * This file is the compile-time half of the fixture-drift guard. `test/fixtures/drift.test.ts` proves
 * each recorded JSON body still derives byte-for-byte from `schemas/openapi/examples/**`, and proves
 * each value here deep-equals its recorded body. What THIS file adds is that a contract change which
 * removes a field, renames one, or narrows an enum becomes a `pnpm typecheck` FAILURE — not a test
 * that quietly keeps passing against a stale shape.
 *
 * Every annotation is an imported generated type. Nothing here declares a request or response shape
 * (sub-PRD **D1**); `test/no-local-contract-types.test.ts` enforces that.
 */
import type {
  AnswerJobAccepted,
  AnswerJobClarificationRequired,
  AnswerSnapshot,
  CollectionResponse,
  CreateAnswerJobRequest,
  ErrorResponse,
  JobAcceptedResponse,
  SearchRequest,
  SearchResponse,
} from '../../src/internal/contracts.js';

export const REQUEST_ID = 'req_0198f3c1-4a30-7b41-8e15-9c2a4d6f0b73';
export const JOB_ID = 'job_0198f3be-2c90-7b31-b0a4-6f8e12cd7359';
export const ANSWER_SNAPSHOT_ID = 'ans_0198f3c1-4a23-7f26-9d84-1a3b7c9e02d5';
export const RECORD_ID = 'rec_0198f3c1-4a22-7e15-8c73-4de29b501fa6';
export const CORPUS_RELEASE_ID = 'cr_0198f3c1-4a32-7d63-a037-1e4c6f8b2d95';

export const searchRequest: SearchRequest = {
  mode: 'ADVANCED',
  query: 'annual leave direction section 94',
  legal_as_at: '2026-08-03',
  jurisdictions: ['CTH', 'VIC'],
  document_types: ['ACT', 'MODERN_AWARD', 'DECISION'],
  legal_statuses: ['IN_FORCE'],
  authority_ids: [],
  exact_identifiers: [],
  employer: null,
  sort: 'RELEVANCE',
  page_size: 25,
  cursor: null,
};

export const searchResponse: SearchResponse = {
  schema_version: '1.0',
  request_id: REQUEST_ID,
  search_execution_id: 'srx_0198f3c1-4a31-7c52-9f26-0d3b5e7a1c84',
  corpus_release_id: CORPUS_RELEASE_ID,
  legal_as_at: '2026-08-03',
  applied_filters: {
    jurisdictions: ['CTH', 'VIC'],
    legal_statuses: ['IN_FORCE'],
  },
  results: [
    {
      document_id: 'doc_0198f3c1-4a33-7e74-b148-2f5d7a9c3e06',
      document_version_id: 'dv_0198f3c1-4a34-7f85-8259-3a6e8b0d4f17',
      node_id: 'node_0198f3c1-4a35-7096-936a-4b7f9c1e5028',
      node_version_id: 'nv_0198f3c1-4a36-71a7-a47b-5c801d2f6139',
      title: 'Official source title',
      document_type: 'ACT',
      authority: {
        id: 'auth_0198f3c1-4a37-72b8-b58c-6d912e3f724a',
        name: 'Official authority',
      },
      jurisdictions: ['CTH'],
      legal_status: 'IN_FORCE',
      effective_from: '2026-07-01',
      effective_to: null,
      pinpoint: 's 94(5)',
      snippet: {
        text: 'Exact source text…',
        start_offset: 120,
        end_offset: 198,
      },
      match_reasons: ['EXACT_PROVISION', 'LEXICAL'],
      freshness: 'CURRENT',
      official_url: 'https://official.example/act/s94',
    },
  ],
  next_cursor: null,
  warnings: [],
};

export const createAnswerJobRequest: CreateAnswerJobRequest = {
  mode: 'QUICK',
  question: 'Which official rules should be checked for this anonymous scenario?',
  facts: {
    free_text: 'A full-time employee performs the following principal duties…',
    employer_name: 'Example Pty Ltd',
    employer_abn: '51824753556',
    work_jurisdictions: ['VIC'],
    engagement_type: 'EMPLOYEE',
    employment_type: 'FULL_TIME',
    industry: 'software services',
    principal_duties: ['anonymous duty description'],
  },
  legal_as_at: '2026-08-03',
  jurisdictions: ['CTH', 'VIC'],
  retention_mode: 'SAVE',
  research_record_id: RECORD_ID,
  new_record: null,
};

export const answerJobAccepted: AnswerJobAccepted = {
  schema_version: '1.0',
  request_id: REQUEST_ID,
  job: {
    id: JOB_ID,
    type: 'QUICK_ANSWER',
    status: 'QUEUED',
    retention_mode: 'SAVE',
    corpus_release_id: CORPUS_RELEASE_ID,
    reserved_credits: 1,
    created_at: '2026-08-03T03:00:00Z',
    status_url: `/v1/answer-jobs/${JOB_ID}`,
    events_url: `/v1/answer-jobs/${JOB_ID}/events`,
  },
};

export const clarificationRequired: AnswerJobClarificationRequired = {
  status: 'WAITING_FOR_CLARIFICATION',
  clarifications: [
    {
      id: 'clq_0198f3c1-4a3b-76fc-b9c3-a1d5627380be',
      question: 'Is the employer a constitutional corporation?',
      affects: ['WORKPLACE_RELATIONS_SYSTEM'],
      answer_type: 'YES_NO_UNKNOWN',
    },
  ],
};

export const answerSnapshot: AnswerSnapshot = {
  schema_version: '1.0',
  id: ANSWER_SNAPSHOT_ID,
  record_id: RECORD_ID,
  answer_version: 2,
  status: 'CONDITIONAL',
  short_answer: 'It depends on the unresolved facts listed below.',
  legal_as_at: '2026-08-03',
  knowledge_cutoff_at: '2026-08-03T02:51:00Z',
  jurisdictions: ['CTH', 'VIC'],
  corpus_release_id: CORPUS_RELEASE_ID,
  claims: [
    {
      id: 'clm_0198f3c1-4a38-73c9-8690-7ea23f40835b',
      sequence: 1,
      kind: 'APPLICATION',
      text: 'Conditional application stated in customer-readable English.',
      support_status: 'CONDITIONAL',
      citation_ids: ['cit_0198f3c1-4a39-74da-97a1-8fb34051946c'],
      assumption_ids: ['asm_0198f3c1-4a3a-75eb-a8b2-90c451629a7d'],
    },
  ],
  citations: [
    {
      id: 'cit_0198f3c1-4a39-74da-97a1-8fb34051946c',
      role: 'SUPPORTS',
      document_version_id: 'dv_0198f3c1-4a34-7f85-8259-3a6e8b0d4f17',
      node_version_id: 'nv_0198f3c1-4a36-71a7-a47b-5c801d2f6139',
      pinpoint: 'cl 4.1',
      quote: 'Exact permitted source excerpt…',
      start_offset: 44,
      end_offset: 92,
      official_url: 'https://official.example/act/s94',
      legal_status: 'IN_FORCE',
      effective_from: '2026-07-01',
      effective_to: null,
    },
  ],
  assumptions: [
    {
      id: 'asm_0198f3c1-4a3a-75eb-a8b2-90c451629a7d',
      text: 'The employer is a constitutional corporation.',
      source: 'USER_NOT_CONFIRMED',
      impact_if_false: 'The workplace-relations system and applicable instruments may differ.',
    },
  ],
  next_checks: ['Confirm the unresolved employer fact.'],
  limitations: ['No customer contract or employee record was reviewed.'],
  correction_state: 'NONE',
  created_at: '2026-08-03T03:00:12Z',
};

/**
 * Sub-PRD **D4**. A completed job whose DOMAIN answer status is a refusal. PRD §34.9's closing
 * sentence: *"Domain answer statuses such as `INSUFFICIENT_EVIDENCE` are valid completed research
 * results and do not become HTTP errors."* The annotation is the proof that `INSUFFICIENT_EVIDENCE`
 * is a member of the generated `AnswerStatus` union.
 */
export const refusalSnapshot: AnswerSnapshot = {
  ...answerSnapshot,
  status: 'INSUFFICIENT_EVIDENCE',
  short_answer: 'The official sources checked do not settle this question.',
  claims: [],
  citations: [],
};

/** A `202` job response, as `getAnswerJob`/`cancelAnswerJob` return it. */
export const jobAccepted: JobAcceptedResponse = answerJobAccepted;

export const jobCompletedDescriptor: JobAcceptedResponse = {
  ...answerJobAccepted,
  job: { ...answerJobAccepted.job, status: 'COMPLETED' },
};

export const jobCancelledDescriptor: JobAcceptedResponse = {
  ...answerJobAccepted,
  job: { ...answerJobAccepted.job, status: 'CANCELLED' },
};

/** PRD §34.1 cursor pages. Two pages, the second terminal. */
export const watchlistsPage1: CollectionResponse = {
  schema_version: '1.0',
  request_id: REQUEST_ID,
  items: [{ id: 'wat_0198f3c0-1b7e-7d44-a913-5c2f9e60b8a1', name: 'Annual leave' }],
  next_cursor: 'opaque-cursor-page-2',
};

export const watchlistsPage2: CollectionResponse = {
  schema_version: '1.0',
  request_id: REQUEST_ID,
  items: [{ id: 'wat_0198f3c0-1b7f-7e55-b024-6d309f71c9b2', name: 'Superannuation' }],
  next_cursor: null,
};

/** PRD §16.1's uniform error envelope, one per code the suites exercise. */
export function errorBody(code: ErrorResponse['error']['code'], message: string): ErrorResponse {
  return {
    error: {
      code,
      message,
      request_id: REQUEST_ID,
      retryable: false,
      details: {},
    },
  };
}
