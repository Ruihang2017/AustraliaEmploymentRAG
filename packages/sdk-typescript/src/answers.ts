/**
 * Wait and cancel (ticket deliverable 8; PRD §16.2, §33.2, §34.3, §34.5).
 *
 * `createAndWait` is the ergonomic path PRD §8.10 asks for, and every load-bearing behaviour is
 * spelled out here because each one is a way to double-charge a customer if it is wrong:
 *
 * - **The job is created exactly once.** The create call carries the idempotency key resolved by
 *   `client.ts` before the retry loop, and NOTHING in this file re-enters the create step: a timeout,
 *   an abort, a stream failure and a cancellation all leave the created job alone
 *   (`ANS-003`: *"Repeated idempotency key creates one job/charge"*).
 * - **A clarification response is a RESULT, not an error.** PRD §34.3 keeps the clarification variant
 *   on `202`; it is returned to the caller, never thrown.
 * - **A timeout carries the `job_id`.** `AerWaitTimeoutError.jobId` is what lets a caller resume the
 *   stream instead of re-submitting the question.
 * - **A refusal resolves.** A completed job whose Answer Snapshot has `status:
 *   INSUFFICIENT_EVIDENCE` (or any other domain status) is returned successfully — PRD §34.9's
 *   closing sentence, sub-PRD **D4**.
 * - **Cancel carries no idempotency key** (the document marks `cancelAnswerJob`
 *   `x-retryable-write: false`) and is safe to call twice.
 */
import type { Caller, CallOptions } from './call.js';
import { AerJobFailedError, AerWaitTimeoutError } from './errors.js';
import { AerAbortedError } from './errors.js';
import type {
  AnswerJobAccepted,
  AnswerJobClarificationRequired,
  AnswerSnapshot,
  CreateAnswerJobRequest,
  JobAcceptedResponse,
} from './internal/contracts.js';
import type { AerAbortController, AerAbortSignal, Timers } from './internal/runtime.js';
import { createAbortController, systemTimers } from './internal/runtime.js';
import type { AerStreamEvent } from './sse/events.js';
import type { StreamAccumulator } from './sse/accumulator.js';
import { createStreamAccumulator } from './sse/accumulator.js';
import type { StreamOptions } from './sse/stream.js';

/** `202` carries either an accepted job or a clarification request (PRD §34.3). */
export type CreateAnswerJobResult = AnswerJobAccepted | AnswerJobClarificationRequired;

/**
 * Discriminates PRD §34.3's two `202` variants — and, because `createAndWait` returns either a
 * snapshot or the same clarification variant, it accepts that union too.
 */
export function isClarificationRequired(
  result: AnswerSnapshot | CreateAnswerJobResult,
): result is AnswerJobClarificationRequired {
  return 'clarifications' in result;
}

export interface CreateAndWaitOptions extends CallOptions {
  /** Total budget for create + stream + snapshot fetch. Default 300 000 ms. */
  readonly waitTimeoutMs?: number | undefined;
  /** Called for every validated event, in order. Exceptions from it propagate to the caller. */
  readonly onEvent?: ((event: AerStreamEvent) => void) | undefined;
  /** Poll interval used when the event stream cannot be opened. Default 1000 ms. */
  readonly pollIntervalMs?: number | undefined;
}

/** What `createAndWait` resolves with: the snapshot, or PRD §34.3's clarification variant. */
export type CreateAndWaitResult = AnswerSnapshot | AnswerJobClarificationRequired;

export const DEFAULT_WAIT_TIMEOUT_MS = 300_000;
export const DEFAULT_POLL_INTERVAL_MS = 1_000;

export interface AnswersApiDeps {
  readonly caller: Caller;
  readonly stream: (jobId: string, options?: StreamOptions) => AsyncIterable<AerStreamEvent>;
  readonly timers?: Timers | undefined;
  readonly sleep: (ms: number, signal?: AerAbortSignal | undefined) => Promise<void>;
}

export interface AnswersApi {
  /** `POST /v1/answers` — idempotent (deliverable 4). */
  create(request: CreateAnswerJobRequest, options?: CallOptions): Promise<CreateAnswerJobResult>;
  /** `GET /v1/answers/{answer_snapshot_id}`. */
  getSnapshot(answerSnapshotId: string, options?: CallOptions): Promise<AnswerSnapshot>;
  /** Create, stream to completion, and return the Answer Snapshot. */
  createAndWait(request: CreateAnswerJobRequest, options?: CreateAndWaitOptions): Promise<CreateAndWaitResult>;
}

export interface AnswerJobsApi {
  /** `GET /v1/answer-jobs/{job_id}`. */
  get(jobId: string, options?: CallOptions): Promise<JobAcceptedResponse>;
  /** `POST /v1/answer-jobs/{job_id}/cancel` — no idempotency key; safe to call twice. */
  cancel(jobId: string, options?: CallOptions): Promise<JobAcceptedResponse>;
  /** The resumable event stream (deliverable 7). */
  stream(jobId: string, options?: StreamOptions): AsyncIterable<AerStreamEvent>;
}

/** A controller that aborts when the caller aborts OR when the wait budget expires. */
function linkedController(
  signal: AerAbortSignal | undefined,
  timers: Timers,
  timeoutMs: number,
  onTimeout: () => void,
): { readonly controller: AerAbortController; readonly dispose: () => void } {
  const controller = createAbortController();
  const onAbort = (): void => controller.abort();
  signal?.addEventListener('abort', onAbort);
  const handle = timers.setTimeout(() => {
    onTimeout();
    controller.abort();
  }, timeoutMs);
  return {
    controller,
    dispose: (): void => {
      timers.clearTimeout(handle);
      signal?.removeEventListener('abort', onAbort);
    },
  };
}

const optional = <T>(key: string, value: T | undefined): Record<string, T> =>
  value === undefined ? {} : ({ [key]: value } as Record<string, T>);

export function createAnswerJobsApi(deps: AnswersApiDeps): AnswerJobsApi {
  const { caller } = deps;
  return Object.freeze({
    get: (jobId: string, options: CallOptions = {}): Promise<JobAcceptedResponse> =>
      caller.call<JobAcceptedResponse>('getAnswerJob', { ...options, pathParams: { job_id: jobId }, jobId }),
    cancel: (jobId: string, options: CallOptions = {}): Promise<JobAcceptedResponse> =>
      // No Idempotency-Key: the document marks cancelAnswerJob `x-retryable-write: false`.
      caller.call<JobAcceptedResponse>('cancelAnswerJob', { ...options, pathParams: { job_id: jobId }, jobId }),
    stream: (jobId: string, options: StreamOptions = {}): AsyncIterable<AerStreamEvent> =>
      deps.stream(jobId, options),
  });
}

export function createAnswersApi(deps: AnswersApiDeps): AnswersApi {
  const { caller } = deps;
  const timers = deps.timers ?? systemTimers;

  const create = (request: CreateAnswerJobRequest, options: CallOptions = {}): Promise<CreateAnswerJobResult> =>
    caller.call<CreateAnswerJobResult>('createAnswerJob', { ...options, body: request });

  const getSnapshot = (answerSnapshotId: string, options: CallOptions = {}): Promise<AnswerSnapshot> =>
    caller.call<AnswerSnapshot>('getAnswerSnapshot', {
      ...options,
      pathParams: { answer_snapshot_id: answerSnapshotId },
    });

  /** Drives the stream to a terminal event. Returns the accumulator. */
  const consume = async (
    jobId: string,
    signal: AerAbortSignal,
    onEvent: ((event: AerStreamEvent) => void) | undefined,
  ): Promise<StreamAccumulator> => {
    const accumulator = createStreamAccumulator();
    for await (const event of deps.stream(jobId, { signal })) {
      accumulator.accept(event);
      onEvent?.(event);
    }
    return accumulator;
  };

  /**
   * The fallback for a runtime or a proxy where the event stream cannot be opened at all.
   *
   * It polls `getAnswerJob` to a terminal `AsyncState`, then re-attempts the stream ONCE to learn the
   * `answer_snapshot_id` — which PRD §34.4 carries on `job.completed` and which `JobDescriptor`
   * (PRD §34.3) does not expose. That gap is recorded as a writeback against `FND-04`; it is not
   * papered over by guessing an id.
   */
  const pollToCompletion = async (
    jobId: string,
    signal: AerAbortSignal,
    pollIntervalMs: number,
  ): Promise<string> => {
    for (;;) {
      if (signal.aborted) throw new AerAbortedError();
      const response = await caller.call<JobAcceptedResponse>('getAnswerJob', {
        signal,
        pathParams: { job_id: jobId },
        jobId,
      });
      const status = response.job.status;
      if (status === 'FAILED' || status === 'EXPIRED') throw new AerJobFailedError(jobId, 'job.failed');
      if (status === 'CANCELLED') throw new AerJobFailedError(jobId, 'job.cancelled');
      if (status === 'COMPLETED') {
        const accumulator = await consume(jobId, signal, undefined);
        const id = accumulator.answerSnapshotId;
        if (id === null) {
          throw new AerJobFailedError(jobId, 'job.failed');
        }
        return id;
      }
      await deps.sleep(pollIntervalMs, signal);
    }
  };

  const createAndWait = async (
    request: CreateAnswerJobRequest,
    options: CreateAndWaitOptions = {},
  ): Promise<CreateAndWaitResult> => {
    const waitTimeoutMs = options.waitTimeoutMs ?? DEFAULT_WAIT_TIMEOUT_MS;
    const pollIntervalMs = options.pollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS;

    const accepted = await create(request, options);
    // PRD §34.3: the clarification variant is a result, not an error.
    if (isClarificationRequired(accepted)) return accepted;

    const jobId = accepted.job.id;
    let timedOut = false;
    const linked = linkedController(options.signal, timers, waitTimeoutMs, () => {
      timedOut = true;
    });

    try {
      let snapshotId: string;
      try {
        const accumulator = await consume(jobId, linked.controller.signal, options.onEvent);
        if (accumulator.failed) throw new AerJobFailedError(jobId, 'job.failed');
        if (accumulator.cancelled) throw new AerJobFailedError(jobId, 'job.cancelled');
        const id = accumulator.answerSnapshotId;
        if (id === null) throw new AerJobFailedError(jobId, 'job.failed');
        snapshotId = id;
      } catch (error) {
        if (timedOut) throw new AerWaitTimeoutError(jobId, waitTimeoutMs);
        if (error instanceof AerJobFailedError || error instanceof AerAbortedError) throw error;
        // The stream could not be opened or was lost beyond its reconnect budget: fall back to polling.
        snapshotId = await pollToCompletion(jobId, linked.controller.signal, pollIntervalMs);
      }
      return await getSnapshot(snapshotId, { ...optional('signal', linked.controller.signal) });
    } catch (error) {
      if (timedOut) throw new AerWaitTimeoutError(jobId, waitTimeoutMs);
      throw error;
    } finally {
      linked.dispose();
    }
  };

  return Object.freeze({ create, getSnapshot, createAndWait });
}
