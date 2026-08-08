/**
 * Resumable SSE consumption (ticket deliverable 7; PRD §34.4, `ANS-003`, `UAT-ANS-06`).
 *
 * The four properties the reviewer is asked to check, and where each lives:
 *
 * 1. **No duplicate after a resume.** The high-water mark is advanced at **yield** time, not at parse
 *    time. Advancing it at parse time would let an event that was parsed but never handed to the
 *    consumer be treated as delivered, and the reconnect would then skip it — or, symmetrically, a
 *    frame the consumer already saw could be re-delivered. On reconnect `Last-Event-ID` carries the
 *    highest id actually yielded, and any frame at or below it is dropped.
 * 2. **The reader is always closed.** The `finally` in `readConnection` calls `reader.cancel()` on
 *    every exit path — normal end, a thrown error, an aborted signal, and a consumer `break`/`return`
 *    (which reaches the generator as a `return()` and runs the same `finally`). An un-cancelled reader
 *    holds the socket open.
 * 3. **Bounded reconnect.** Reconnects are capped and backed off with the same jittered policy
 *    `retry.ts` uses, and the sleep races the abort signal.
 * 4. **Terminal is terminal.** `job.completed`, `job.failed` and `job.cancelled` end the iterator; no
 *    reconnect is attempted after one.
 *
 * `heartbeat` is surfaced to the caller (a caller needs it for liveness) as well as consumed here.
 */
import { AerAbortedError, AerStreamError, AerTransportError } from '../errors.js';
import type { AerResponse } from '../http.js';
import type { AerAbortSignal } from '../internal/runtime.js';
import type { ResolvedRetryOptions, RetryDeps } from '../retry.js';
import { backoffDelayMs } from '../retry.js';
import type { AerStreamEvent } from './events.js';
import { isTerminalSseEvent, toStreamEvent } from './events.js';
import { SseParser } from './parser.js';

export interface StreamOptions {
  /** Resume point. The server replays from the frame AFTER this id (PRD §34.4). */
  readonly lastEventId?: string | undefined;
  readonly signal?: AerAbortSignal | undefined;
  /** Reconnect attempts after a dropped connection. Default 3. */
  readonly maxReconnects?: number | undefined;
  /** Cap on a single SSE frame, in bytes. */
  readonly maxFrameBytes?: number | undefined;
}

/** Opens one connection. Supplied by `client.ts`, which owns auth, URLs and headers. */
export type StreamOpener = (params: {
  readonly jobId: string;
  readonly lastEventId: string | undefined;
  readonly signal: AerAbortSignal | undefined;
}) => Promise<AerResponse>;

export interface StreamDeps {
  readonly open: StreamOpener;
  readonly retry: ResolvedRetryOptions;
  readonly retryDeps: RetryDeps;
}

export const DEFAULT_MAX_RECONNECTS = 3;

/** The resume state one `stream()` call carries across its reconnects. */
class ResumeState {
  private readonly seen = new Set<string>();
  private highestNumeric: number | null = null;
  lastEventId: string | undefined;

  constructor(initialLastEventId: string | undefined) {
    this.lastEventId = initialLastEventId;
    if (initialLastEventId !== undefined) this.note(initialLastEventId);
  }

  /** Whether a frame with this id was already delivered (or precedes the resume point). */
  isDelivered(id: string | null): boolean {
    if (id === null) return false;
    if (this.seen.has(id)) return true;
    const numeric = Number(id);
    return (
      this.highestNumeric !== null &&
      Number.isInteger(numeric) &&
      numeric <= this.highestNumeric
    );
  }

  /** Records an id as delivered. Called only after the event has been yielded. */
  note(id: string | null): void {
    if (id === null) return;
    this.seen.add(id);
    const numeric = Number(id);
    if (Number.isInteger(numeric) && (this.highestNumeric === null || numeric > this.highestNumeric)) {
      this.highestNumeric = numeric;
    }
    this.lastEventId = id;
  }
}

/**
 * Reads one connection to exhaustion, yielding validated events.
 *
 * Returns `true` when a terminal event was seen (so the caller must not reconnect).
 */
async function* readConnection(
  response: AerResponse,
  state: ResumeState,
  options: StreamOptions,
): AsyncGenerator<AerStreamEvent, boolean, undefined> {
  const body = response.body;
  if (!body) throw new AerTransportError('the event stream response carried no body');
  const reader = body.getReader();
  const parser = new SseParser(
    options.maxFrameBytes === undefined ? {} : { maxFrameBytes: options.maxFrameBytes },
  );
  try {
    for (;;) {
      if (options.signal?.aborted) throw new AerAbortedError();
      const chunk = await reader.read();
      const frames = chunk.done
        ? parser.end()
        : parser.push(chunk.value ?? new Uint8Array(0));
      for (const frame of frames) {
        if (frame.event === null && frame.data.length === 0) continue;
        if (state.isDelivered(frame.id)) continue;
        const event = toStreamEvent(frame);
        yield event;
        // Advance ONLY after the consumer has received the event. See the header, property 1.
        state.note(frame.id);
        if (isTerminalSseEvent(event.type)) return true;
      }
      if (chunk.done) return false;
    }
  } finally {
    // Every exit path: normal end, throw, abort, and a consumer `break` (which arrives here as a
    // generator return). An un-cancelled reader keeps the connection open.
    await reader.cancel().catch(() => undefined);
  }
}

/**
 * The resumable event stream for one job.
 *
 * Returns a fresh `AsyncIterable` per call; iterating it twice concurrently is safe because all
 * resume state is created inside the generator.
 */
export function createEventStream(
  jobId: string,
  options: StreamOptions,
  deps: StreamDeps,
): AsyncIterable<AerStreamEvent> {
  const maxReconnects = options.maxReconnects ?? DEFAULT_MAX_RECONNECTS;

  async function* iterate(): AsyncGenerator<AerStreamEvent, void, undefined> {
    const state = new ResumeState(options.lastEventId);
    let reconnects = 0;

    for (;;) {
      if (options.signal?.aborted) throw new AerAbortedError();
      let response: AerResponse;
      try {
        response = await deps.open({ jobId, lastEventId: state.lastEventId, signal: options.signal });
      } catch (error) {
        if (error instanceof AerAbortedError) throw error;
        if (reconnects >= maxReconnects) throw error;
        reconnects += 1;
        await deps.retryDeps.sleep(backoffDelayMs(reconnects, deps.retry, deps.retryDeps.random), options.signal);
        continue;
      }

      let terminal: boolean;
      try {
        terminal = yield* readConnection(response, state, options);
      } catch (error) {
        // A contract violation is not a connectivity problem — surfacing it as one would hide it.
        if (error instanceof AerStreamError || error instanceof AerAbortedError) throw error;
        if (reconnects >= maxReconnects) throw error;
        reconnects += 1;
        await deps.retryDeps.sleep(backoffDelayMs(reconnects, deps.retry, deps.retryDeps.random), options.signal);
        continue;
      }

      if (terminal) return;
      if (reconnects >= maxReconnects) return;
      reconnects += 1;
      await deps.retryDeps.sleep(backoffDelayMs(reconnects, deps.retry, deps.retryDeps.random), options.signal);
    }
  }

  return { [Symbol.asyncIterator]: iterate };
}
