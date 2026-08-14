/**
 * DATA-08 deliverable 7 — the five-minute cleanup entry point and the startup cleanup.
 *
 * PRD §35.7: "A five-minute cleanup deletes content … ; startup cleanup runs before accepting
 * traffic." Neither function runs on import and nothing at module top level starts a timer: the
 * sweeper *process* is `RUNT-04`'s (`apps/worker/src/handlers/maintenance/**`, PRD §45.2 — lease
 * loops belong to `apps/worker`), and this module only exposes the callables.
 */
import { assertNoAttachedDatabases, internalSqlite, type EphemeralDatabaseHandle } from './connection.js';
import { EphemeralError } from './errors.js';
import { assertValidDate, sweepExpired, type SweepReport } from './sweeper.js';

/** PRD §35.7 — "A five-minute cleanup". */
export const DEFAULT_SWEEP_INTERVAL_MS = 5 * 60_000;

/**
 * The injected clock. Every expiry decision reads `now()` from here, so tests are exact and sleepless.
 */
export interface EphemeralClock {
  now(): Date;
  setInterval(fn: () => void, ms: number): unknown;
  clearInterval(handle: unknown): void;
}

export const systemClock: EphemeralClock = {
  now: () => new Date(),
  setInterval: (fn, ms) => {
    const timer = setInterval(fn, ms);
    // A forgotten sweeper must not hold a CLI or a test process open.
    if (typeof (timer as { unref?: () => void }).unref === 'function') {
      (timer as { unref: () => void }).unref();
    }
    return timer;
  },
  clearInterval: (handle) => {
    clearInterval(handle as ReturnType<typeof setInterval>);
  },
};

export interface SweeperOptions {
  readonly handle: EphemeralDatabaseHandle;
  readonly intervalMs?: number | undefined;
  readonly clock?: EphemeralClock | undefined;
  readonly onSweep?: ((report: SweepReport) => void) | undefined;
  /** Receives the error only — never a payload. */
  readonly onError?: ((error: unknown) => void) | undefined;
}

export interface SweeperStopHandle {
  /** Idempotent. After it returns, no further sweep runs. */
  stop(): void;
}

/**
 * Starts the periodic sweep. The first run is at `intervalMs`, not immediately — `runStartupCleanup`
 * is the startup pass, and sweeping twice at boot only obscures the startup ordering.
 *
 * Every sweep runs inside a try/catch routed to `onError`: an uncaught throw out of a timer callback
 * is an unhandled exception that takes `apps/worker` down, and a cleanup loop must degrade, not crash.
 */
export function startEphemeralSweeper(options: SweeperOptions): SweeperStopHandle {
  const handle = options?.handle;
  if (handle === undefined) {
    throw new EphemeralError('EPHEMERAL_INPUT_INVALID', { detail: 'handle is required' });
  }
  const intervalMs = options.intervalMs ?? DEFAULT_SWEEP_INTERVAL_MS;
  if (!Number.isFinite(intervalMs) || intervalMs <= 0) {
    throw new EphemeralError('EPHEMERAL_INPUT_INVALID', {
      detail: 'intervalMs must be a positive finite number',
    });
  }
  const clock = options.clock ?? systemClock;

  let stopped = false;
  const timer = clock.setInterval(() => {
    if (stopped) return;
    try {
      const report = sweepExpired(handle, clock.now());
      options.onSweep?.(report);
    } catch (error) {
      options.onError?.(error);
    }
  }, intervalMs);

  return {
    stop(): void {
      if (stopped) return;
      stopped = true;
      clock.clearInterval(timer);
    },
  };
}

/**
 * The startup pass. `RUNT-01`/`RUNT-08` **await** this before readiness reports ready
 * (PRD §35.7 "startup cleanup runs before accepting traffic", PRD §42.1).
 *
 * It does not start the interval sweeper — composing the two is the caller's job (`RUNT-04`).
 */
export async function runStartupCleanup(
  handle: EphemeralDatabaseHandle,
  now: Date,
): Promise<SweepReport> {
  assertValidDate(now, 'now');
  assertNoAttachedDatabases(internalSqlite(handle));
  return sweepExpired(handle, now);
}
