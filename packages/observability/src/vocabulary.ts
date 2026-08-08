/**
 * Bounded code vocabularies for operational logs and metric labels.
 *
 * TEMPORARY — WRITEBACK TARGET `docs/prd/03-app-runtime/README.md` §6 QR6.
 * RUNT-07 Deliverable 3 says the log `event` code is "drawn from `packages/contracts`", but FND-03
 * shipped 20 enum families and none of them is an operation/event/status vocabulary. The ticket's
 * Feedback obligation names this exact friction and its route: declare it locally, record the open
 * question, and do NOT write `packages/contracts/**` (serial-owned by `00-foundation`). When the
 * canonical vocabulary lands, this file becomes a re-export from `src/contracts.ts` and nothing else
 * in the package changes.
 *
 * HOW A VALUE IS ADDED: by editing one of the frozen arrays below, in a reviewed diff. There is no
 * runtime registration API and no caller-supplied string ever becomes a member. That is what makes
 * PRD §42.2 ("Operational logs use bounded codes/IDs, not research bodies") structural rather than
 * advisory — a research body cannot be spelled as a member of a closed list.
 */

/** Membership test over a frozen vocabulary, in the FND-03 house style. */
const memberOf =
  <T extends string>(values: readonly T[]) =>
  (value: unknown): value is T =>
    typeof value === 'string' && (values as readonly string[]).includes(value);

// ---------------------------------------------------------------------------------------------
// Event codes — the whole of a log record's "what happened". There is no message string anywhere.
// ---------------------------------------------------------------------------------------------

/**
 * Dotted lower-case `<subject>.<past-tense-verb>` codes. Deliberately small: a consumer module that
 * needs a new one extends this array through the ticket route (RUNT-07 Feedback obligation), which
 * is the same discipline the field allowlist uses.
 */
export const EVENT_CODES = Object.freeze([
  // request lifecycle (apps/api — RUNT-01/RUNT-02)
  'request.received',
  'request.completed',
  'request.rejected',
  // job lifecycle (apps/worker — RUNT-04)
  'job.leased',
  'job.checkpointed',
  'job.completed',
  'job.failed',
  // retrieval and generation metadata (11-retrieval-engine, 12-evidence-safety)
  'retrieval.executed',
  'model.called',
  'answer.committed',
  // release and corpus state (PRD §22 "active release")
  'release.activated',
  'corpus.release_activated',
  // backup and source health (PRD §22 bullets 6-7)
  'backup.completed',
  'source.quarantined',
  // this package's own self-observability, so a drop is never silent
  'observability.field_dropped',
  'observability.record_oversized',
] as const);

export type EventCode = (typeof EVENT_CODES)[number];
export const isEventCode = memberOf(EVENT_CODES);

// ---------------------------------------------------------------------------------------------
// Operation, status, actor, process, profile
// ---------------------------------------------------------------------------------------------

/** PRD §22 bullet 2 "operation". Coarse verbs, never a route path or a SQL statement. */
export const OPERATION_CODES = Object.freeze([
  'search',
  'answer',
  'export',
  'ingest',
  'index',
  'authenticate',
  'authorize',
  'notify',
  'backup',
  'evaluate',
  'maintenance',
] as const);

export type OperationCode = (typeof OPERATION_CODES)[number];
export const isOperationCode = memberOf(OPERATION_CODES);

/** PRD §22 bullet 2 "status". */
export const STATUS_CODES = Object.freeze([
  'ok',
  'failed',
  'rejected',
  'timeout',
  'degraded',
  'cancelled',
] as const);

export type StatusCode = (typeof STATUS_CODES)[number];
export const isStatusCode = memberOf(STATUS_CODES);

/** Who the request acted as. A *kind*, never an identity — the identity is `organization_id`. */
export const ACTOR_KINDS = Object.freeze([
  'user',
  'service_account',
  'widget',
  'system',
  'worker',
] as const);

export type ActorKind = (typeof ACTOR_KINDS)[number];
export const isActorKind = memberOf(ACTOR_KINDS);

/** The three separately supervised runtime processes (PRD §39.1). */
export const PROCESS_ROLES = Object.freeze(['app', 'worker', 'search'] as const);

export type ProcessRole = (typeof PROCESS_ROLES)[number];
export const isProcessRole = memberOf(PROCESS_ROLES);

/** Configuration profiles (PRD §39.6). `production` is the one that refuses debug surfaces. */
export const RUNTIME_PROFILES = Object.freeze(['development', 'test', 'production'] as const);

export type RuntimeProfile = (typeof RUNTIME_PROFILES)[number];
export const isRuntimeProfile = memberOf(RUNTIME_PROFILES);

/**
 * Job queue classes, transcribed verbatim from PRD §39.5. These are PRD-fixed, not coined here;
 * RUNT-04 owns the routing behaviour, this package only labels the measurements.
 */
export const QUEUE_CLASSES = Object.freeze([
  'interactive_quick',
  'interactive_research',
  'exports',
  'notifications',
  'maintenance',
] as const);

export type QueueClass = (typeof QUEUE_CLASSES)[number];
export const isQueueClass = memberOf(QUEUE_CLASSES);

// ---------------------------------------------------------------------------------------------
// The drop counter's `key` label domain
// ---------------------------------------------------------------------------------------------

/**
 * The closed domain for `observability_dropped_fields_total{key}`.
 *
 * SECURITY. The dropped key NAME is caller-controlled: `fields[someResearchBody] = 1` would put
 * content straight into a metric label if the counter were labelled by the raw key. So the label is
 * this frozen list of plausible-mistake names plus `__other__` for everything else. The drop stays
 * visible and diagnosable (RUNT-07 acceptance item 1: "increments … labelled by key name with no
 * value") without the label becoming a free-text channel. Recorded in `docs/prd/03-app-runtime/README.md` §6 QR10.
 */
export const DROPPED_FIELD_LABELS = Object.freeze([
  'message',
  'msg',
  'extra',
  'meta',
  'data',
  'payload',
  'body',
  'context',
  'details',
  'text',
  'content',
  'prompt',
  'response',
  'question',
  'evidence',
  'error',
  'err',
  'stack',
  'email',
  'name',
  'user',
  '__other__',
] as const);

export type DroppedKeyLabel = (typeof DROPPED_FIELD_LABELS)[number];
export const isDroppedKeyLabel = memberOf(DROPPED_FIELD_LABELS);

/** Maps an arbitrary caller-supplied key to its bounded label. Never returns the input verbatim. */
export function droppedKeyLabel(key: string): DroppedKeyLabel {
  return isDroppedKeyLabel(key) ? key : '__other__';
}

/** Why a field did not reach the record. Both are author-declared constants. */
export const DROP_REASONS = Object.freeze(['unknown_key', 'invalid_value'] as const);

export type DropReason = (typeof DROP_REASONS)[number];
