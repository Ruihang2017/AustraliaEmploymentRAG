/**
 * EVID-07 deliverable 12 — `model_execution` metadata through `DATA-02`'s TenantContext repository.
 *
 * PRD §35.6 lists the row: *"`id`, `job_id`, `profile`, actual provider/model/version, input/output
 * token counts, latency, cost_micro_aud, schema status, retention mode | **raw prompt/response
 * excluded from ordinary logs/support**"*. PRD §37.3: *"Provider raw payload | Not in ordinary
 * product DB/log | … | Never | Never."*
 *
 * `ModelExecutionRecord` therefore has EXACTLY the members below and no index signature, so there is
 * no way to attach one more field without editing this file — and `test/providers/types.test-d.ts`
 * asserts the absent ones (`prompt`, `response`, `body`, `evidenceText`, `facts`) at compile time
 * while `test/providers/canary.test.ts` asserts at runtime that no canary from the prompt, the
 * evidence or the response reaches the port.
 *
 * `ModelExecutionPort` is declared with METHOD SYNTAX. That is deliberate: `DATA-02`'s
 * `TenantRepository` exposes `insert(tx: Tx, values: Row): T`, and method syntax is bivariant in its
 * parameters, so that repository satisfies this port structurally — with no import edge from this
 * package into `packages/database` and therefore no SQLite driver, no connection factory and no
 * unscoped tenant access anywhere in `src/**` (PRD §21.2, §45.2; `SEC-001`).
 *
 * `ModelExecutionTx` is opaque and only ever passed through. This package never inspects it, never
 * opens it and never creates one.
 */
import type { ModelProfileId } from '../profiles/types.js';

export type SchemaStatus = 'VALID' | 'INVALID' | 'NOT_EVALUATED';

export interface ModelExecutionRecord {
  readonly jobId: string;
  readonly profile: ModelProfileId;
  readonly providerId: string;
  /** `ANS-004`'s *"actual model version"*. `null` when the provider reported none — never omitted. */
  readonly actualModelVersion: string | null;
  readonly inputTokens: number | null;
  readonly outputTokens: number | null;
  readonly latencyMs: number;
  /** Authoritative settlement is `EVID-08`'s; this is the provider-reported figure, or `null`. */
  readonly costMicroAud: bigint | null;
  readonly schemaStatus: SchemaStatus;
  readonly retentionMode: string;
  readonly instructionTemplateVersion: string;
  /** The pack's hash — an identifier. Never the pack, never its text. */
  readonly packHash: string;
}

/** Opaque. Handed in by the caller, handed straight back to the port, never inspected. */
export type ModelExecutionTx = unknown;

export interface ModelExecutionPort {
  insert(tx: ModelExecutionTx, values: ModelExecutionRecord): unknown;
}

export interface ModelExecutionInput {
  readonly jobId: string;
  readonly profile: ModelProfileId;
  readonly providerId: string;
  readonly actualModelVersion: string | null;
  readonly inputTokens: number | null;
  readonly outputTokens: number | null;
  readonly latencyMs: number;
  readonly costMicroAud: bigint | null;
  readonly schemaStatus: SchemaStatus;
  readonly retentionMode: string;
  readonly instructionTemplateVersion: string;
  readonly packHash: string;
}

/**
 * The SINGLE construction site for a `model_execution` row. Pure, total, and it copies field by field
 * rather than spreading its input — a spread would carry any extra member the caller happened to hold,
 * which is precisely how a raw payload ends up in a database row.
 */
export function buildModelExecutionRecord(input: ModelExecutionInput): ModelExecutionRecord {
  return {
    jobId: input.jobId,
    profile: input.profile,
    providerId: input.providerId,
    actualModelVersion: input.actualModelVersion,
    inputTokens: input.inputTokens,
    outputTokens: input.outputTokens,
    latencyMs: input.latencyMs,
    costMicroAud: input.costMicroAud,
    schemaStatus: input.schemaStatus,
    retentionMode: input.retentionMode,
    instructionTemplateVersion: input.instructionTemplateVersion,
    packHash: input.packHash,
  };
}

/** The member names of a row, for the architecture and canary suites to assert against. */
export const MODEL_EXECUTION_FIELDS = Object.freeze([
  'jobId',
  'profile',
  'providerId',
  'actualModelVersion',
  'inputTokens',
  'outputTokens',
  'latencyMs',
  'costMicroAud',
  'schemaStatus',
  'retentionMode',
  'instructionTemplateVersion',
  'packHash',
] as const);
