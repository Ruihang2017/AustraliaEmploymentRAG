/**
 * SSE event typing and runtime validation (ticket deliverable 7; PRD §34.4).
 *
 * The nine allowed types and the payload interfaces are `FND-05`'s, imported through
 * `src/internal/contracts.ts`. **Nothing is re-declared here**: `SsePayload` is a union OVER the
 * imported interfaces, and the guards below consume those interfaces rather than restating them.
 *
 * Two layers, deliberately:
 *
 * - **runtime** (this file) — the allowlist plus narrow structural checks for exactly the fields the
 *   generated interfaces declare. It runs on every frame in production.
 * - **schema conformance** (`test/**`) — each fixture frame is validated against its
 *   `schemas/events/sse/v1/*.json` file. That belongs in the suite, not in the hot path.
 *
 * A frame whose `event:` is not on the allowlist is rejected outright (PRD §34.4 lists the allowed
 * public types; a tenth type is either a server defect or something that must not be surfaced).
 */
import { AerStreamError } from '../errors.js';
import type {
  AnswerSectionSseEvent,
  CitationAddedSseEvent,
  ClarificationRequiredSseEvent,
  HeartbeatSseEvent,
  JobCancelledSseEvent,
  JobCompletedSseEvent,
  JobFailedSseEvent,
  JobStartedSseEvent,
  SseEventTypeName,
  StageChangedSseEvent,
} from '../internal/contracts.js';
import { SCHEMA_VERSION, SSE_EVENT_TYPES } from '../internal/contracts.js';

/** The nine PRD §34.4 payloads, as a union over the generated interfaces. */
export type SsePayload =
  | JobStartedSseEvent
  | StageChangedSseEvent
  | ClarificationRequiredSseEvent
  | AnswerSectionSseEvent
  | CitationAddedSseEvent
  | JobCompletedSseEvent
  | JobFailedSseEvent
  | JobCancelledSseEvent
  | HeartbeatSseEvent;

/**
 * One validated event as the SDK yields it.
 *
 * `provisional` is sub-PRD **D6** made structural: every `answer.section` carries `provisional: true`
 * until `job.completed` has been seen, so a caller cannot render one as a validated answer by
 * accident (PRD §34.4: *"clients MUST remove it on failure and MUST not represent it as a validated
 * answer"*).
 */
export interface AerStreamEvent {
  readonly id: string | null;
  readonly type: SseEventTypeName;
  readonly data: SsePayload;
  readonly provisional: boolean;
}

/** The three types after which no further frame belongs to the job. */
export const TERMINAL_SSE_EVENT_TYPES: readonly SseEventTypeName[] = Object.freeze([
  'job.completed',
  'job.failed',
  'job.cancelled',
]);

export const isTerminalSseEvent = (type: SseEventTypeName): boolean =>
  (TERMINAL_SSE_EVENT_TYPES as readonly string[]).includes(type);

export const isSseEventType = (value: string | null): value is SseEventTypeName =>
  value !== null && (SSE_EVENT_TYPES as readonly string[]).includes(value);

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const isNonEmptyString = (value: unknown): value is string => typeof value === 'string' && value.length > 0;

/** Extra required fields, beyond the three every PRD §34.4 frame carries. */
const EXTRA_STRING_FIELDS: Readonly<Record<string, readonly string[]>> = Object.freeze({
  'stage.changed': ['stage', 'message'],
  'job.completed': ['answer_snapshot_id'],
});

/**
 * Validates one parsed frame and returns the typed event.
 *
 * @throws AerStreamError on an unknown type, a non-object payload, a wrong `schema_version`, or a
 * missing/ill-typed field the generated interface declares.
 */
export function toStreamEvent(frame: {
  readonly id: string | null;
  readonly event: string | null;
  readonly data: string;
}): AerStreamEvent {
  if (!isSseEventType(frame.event)) {
    throw new AerStreamError(
      `"${String(frame.event)}" is not one of the nine PRD §34.4 public SSE event types`,
      frame.event,
    );
  }
  const type = frame.event;

  let payload: unknown;
  try {
    payload = JSON.parse(frame.data);
  } catch {
    throw new AerStreamError(`the "${type}" frame carried a data field that is not JSON`, type);
  }

  if (!isRecord(payload)) throw new AerStreamError(`the "${type}" frame payload is not an object`, type);
  if (payload['schema_version'] !== SCHEMA_VERSION) {
    throw new AerStreamError(`the "${type}" frame declares an unsupported schema_version`, type);
  }
  if (!isNonEmptyString(payload['job_id'])) {
    throw new AerStreamError(`the "${type}" frame carries no job_id`, type);
  }
  if (!isNonEmptyString(payload['occurred_at'])) {
    throw new AerStreamError(`the "${type}" frame carries no occurred_at`, type);
  }
  for (const field of EXTRA_STRING_FIELDS[type] ?? []) {
    if (!isNonEmptyString(payload[field])) {
      throw new AerStreamError(`the "${type}" frame carries no ${field}`, type);
    }
  }

  return {
    id: frame.id,
    type,
    data: payload as unknown as SsePayload,
    provisional: type === 'answer.section',
  };
}
