/**
 * The resource-kind → prefix registry for opaque identifiers (PRD §34.1: *"Opaque resource-prefixed
 * UUIDv7 strings, for example `ans_...`; clients never parse them"*).
 *
 * The token is stored WITHOUT the trailing underscore; the underscore is the separator that
 * `newId()` renders (`` `${kind}_${uuid}` ``), so the rendered form matches the PRD's literals
 * (`ans_...`) exactly. Storing `'ans_'` here would mint `ans__…`.
 *
 * Two groups:
 *
 * 1. **PRD-literal** — the prefix appears verbatim in a PRD payload example; the line is cited.
 *    These are not negotiable.
 * 2. **Coined here** — PRD §15.4/§15.6 name the entity but show no literal, so this ticket chooses
 *    the token once and registers it (ticket deliverable 4: *"short, lower-case and unique"*).
 *    If a later PRD payload example contradicts one, the PRD's spelling wins (ticket Feedback
 *    obligation 5) and, after `FND-04` publishes the OpenAPI root, the change is a `/v2` matter
 *    (PRD §16.1) to escalate rather than rename quietly.
 */
export const RESOURCE_PREFIXES = Object.freeze({
  // --- PRD-literal prefixes -------------------------------------------------------------------
  AnswerSnapshot: 'ans', // PRD §34.5 line 1965 — "id": "ans_..."
  ResearchRecord: 'rec', // PRD §34.5 line 1966 — "record_id": "rec_..."
  AnswerClaim: 'clm', // PRD §34.5 line 1976 — claims[].id "clm_..."
  ClaimCitation: 'cit', // PRD §34.5 line 1987 — citations[].id "cit_..."
  AnswerAssumption: 'asm', // PRD §34.5 line 1982 — "assumption_ids": ["asm_..."]
  LegalDocument: 'doc', // PRD §34.2 line 1840 — "document_id": "doc_..."
  DocumentVersion: 'dv', // PRD §34.2 line 1841 — "document_version_id": "dv_..."
  DocumentNode: 'node', // PRD §34.2 line 1842 — "node_id": "node_..."
  NodeVersion: 'nv', // PRD §34.2 line 1843 — "node_version_id": "nv_..."
  Authority: 'auth', // PRD §34.2 line 1846 — "authority": {"id": "auth_..."}
  CorpusRelease: 'cr', // PRD §34.2 line 1832 — "corpus_release_id": "cr_..."
  SearchExecution: 'srx', // PRD §34.2 line 1831 — "search_execution_id": "srx_..."
  Request: 'req', // PRD §34.2 line 1830 — "request_id": "req_..."
  Job: 'job', // PRD §34.4 line 1947 — "job_id": "job_..."
  Event: 'evt', // PRD §34.8 line 2101 — "id": "evt_..."
  Alert: 'alt', // PRD §34.8 line 2106 — "alert_id": "alt_..."
  Watchlist: 'wat', // PRD §34.8 line 2107 — "watchlist_id": "wat_..."

  // --- Coined here (PRD names the entity, shows no literal) --------------------------------------
  Organization: 'org',
  User: 'usr',
  Membership: 'mem',
  ServiceAccount: 'svc',
  ApiCredential: 'cred',
  Comment: 'cmt',
  IssueReport: 'iss',
  Correction: 'cor',
  Export: 'exp',
  ComparisonSnapshot: 'cmp',
  CoverageAssessment: 'cov',
  EvaluationCase: 'evc',
} as const);

/** Entity name, e.g. `'AnswerSnapshot'`. */
export type ResourceEntity = keyof typeof RESOURCE_PREFIXES;

/** Prefix token, e.g. `'ans'`. This is the "kind" every id API is keyed on. */
export type ResourceKind = (typeof RESOURCE_PREFIXES)[ResourceEntity];

/** Every registered prefix token, in declaration order. */
export const RESOURCE_KINDS: readonly ResourceKind[] = Object.freeze(
  Object.values(RESOURCE_PREFIXES),
);

/** Whether `value` is a registered prefix token. */
export const isResourceKind = (value: unknown): value is ResourceKind =>
  typeof value === 'string' && (RESOURCE_KINDS as readonly string[]).includes(value);
