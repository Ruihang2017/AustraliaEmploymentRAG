/**
 * Graceful shutdown (ticket deliverable 9).
 *
 * The drainable logic lives here rather than in `server.ts` so it is unit-testable with injected
 * fakes on any operating system: Windows cannot deliver a real `SIGTERM` to a Node child, and a
 * behaviour that only CI can exercise is a behaviour nobody debugs.
 *
 * Three properties the tests pin down:
 *
 * - **Idempotent.** `SIGTERM` and `SIGINT` may arrive together, and `SIGTERM` may arrive twice. The
 *   second signal must not `close()` twice nor `exit()` twice.
 * - **Bounded.** If draining exceeds `timeoutMs` the process force-exits non-zero rather than
 *   hanging a supervisor's rolling restart.
 * - **Non-blocking.** The force-exit timer is `unref`'d, so a clean drain exits immediately instead
 *   of idling to the full timeout.
 */
import nodeProcess from 'node:process';
import { clearTimeout, setTimeout } from 'node:timers';

/** The part of `FastifyInstance` shutdown needs. Keeps the unit tests free of a real server. */
export interface ClosableApp {
  close(): Promise<void>;
}

/** A timer handle that can be released so it does not keep the event loop alive. */
export interface UnrefableTimer {
  unref?(): unknown;
}

export interface ShutdownLogger {
  info(details: Record<string, unknown>, message: string): void;
  error(details: Record<string, unknown>, message: string): void;
}

const silentShutdownLogger: ShutdownLogger = {
  info() {
    /* intentionally silent */
  },
  error() {
    /* intentionally silent */
  },
};

export interface InstallShutdownOptions {
  /** Drain budget in milliseconds. */
  readonly timeoutMs: number;
  /** Signals to listen for. Default `['SIGTERM', 'SIGINT']`. */
  readonly signals?: readonly string[];
  /** Registers the signal listener. Injected so tests never touch the real process. */
  readonly onSignal?: (signal: string, listener: () => void) => void;
  /** Terminates the process. Injected so tests can assert the code instead of dying. */
  readonly exit?: (code: number) => void;
  readonly setTimer?: (fn: () => void, ms: number) => UnrefableTimer;
  readonly clearTimer?: (timer: UnrefableTimer) => void;
  readonly logger?: ShutdownLogger;
}

export interface ShutdownHandle {
  /** Runs the drain. Safe to call any number of times; only the first call does work. */
  shutdown(reason: string): Promise<void>;
  /** Whether a drain has already begun. */
  readonly started: () => boolean;
}

/**
 * Registers the signal handlers and returns the drain entry point.
 *
 * Exit codes: `0` on a clean drain, `1` when `app.close()` throws, `1` on the drain timeout.
 */
export function installShutdown(app: ClosableApp, options: InstallShutdownOptions): ShutdownHandle {
  const signals = options.signals ?? ['SIGTERM', 'SIGINT'];
  const exit = options.exit ?? ((code: number) => nodeProcess.exit(code));
  const setTimer = options.setTimer ?? ((fn, ms) => setTimeout(fn, ms));
  const clearTimer = options.clearTimer ?? ((timer: UnrefableTimer) => clearTimeout(timer));
  const logger = options.logger ?? silentShutdownLogger;

  let started = false;

  const shutdown = async (reason: string): Promise<void> => {
    // The idempotency guard. A second SIGTERM, or SIGINT arriving alongside SIGTERM, is a no-op.
    if (started) return;
    started = true;

    logger.info({ reason, timeout_ms: options.timeoutMs }, 'draining in-flight requests');

    const timer = setTimer(() => {
      logger.error({ reason, timeout_ms: options.timeoutMs }, 'drain timed out; forcing exit');
      exit(1);
    }, options.timeoutMs);
    // Without this a clean drain still idles until the full timeout before the process can exit.
    timer.unref?.();

    try {
      await app.close();
      clearTimer(timer);
      logger.info({ reason }, 'drained cleanly');
      exit(0);
    } catch (error) {
      clearTimer(timer);
      logger.error(
        { reason, error_message: error instanceof Error ? error.message : String(error) },
        'drain failed',
      );
      exit(1);
    }
  };

  if (options.onSignal) {
    for (const signal of signals) {
      options.onSignal(signal, () => {
        void shutdown(signal);
      });
    }
  }

  return { shutdown, started: () => started };
}
