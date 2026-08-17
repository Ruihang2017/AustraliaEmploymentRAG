/**
 * PRD §39.1/§39.4 — SQLite has exactly one writer. Two transactions racing for the same row must
 * produce one commit and one **typed** error, and never a lost update (the second writer silently
 * overwriting the first's value with one computed from a stale read).
 *
 * FND-29 — HOW THE OVERLAP IS ORDERED, AND WHY THE PREVIOUS APPROACH WAS NOT DETERMINISTIC.
 *
 * The order is established twice over, and neither half is a delay:
 *
 *   1. **By construction.** This process opens `BEGIN IMMEDIATE` and performs its write *first*, and
 *      only then calls `spawn` — from inside the still-open transaction. `spawn` creates the OS
 *      process at call time, so at the first instant the contender exists the write lock is already
 *      held. There is no window left for the scheduler to invert.
 *   2. **By observation.** The lock is released only after this process has *read* the worker's own
 *      reported outcome — not after an elapsed time it hoped was long enough. The worker's stdout is
 *      redirected to a file in the harness temp directory rather than a pipe, precisely so the
 *      outcome can be observed synchronously while this process's event loop is blocked inside the
 *      transaction (an `await` here would hand control back to the loop with the transaction open,
 *      which `withTenantTransaction` rejects outright).
 *
 * The previous mechanism claimed determinism but did not have it. `tx-worker.mjs` writes its
 * `{"outcome":"ready"}` handshake immediately after its imports — before it sleeps and before it
 * opens the database — so `ready` meant "the process booted", not "it is contending". The only
 * separation between the two writers was the worker's fixed 300 ms head start delay, and under the
 * CPU contention of a full-parallelism `pnpm test` this process could be descheduled for longer than
 * 300 ms between resolving `ready` and reaching `BEGIN IMMEDIATE`. When that happened the worker took
 * the lock first, committed, and reported `committed` — the intermittent
 * `expected 'committed' to be 'conflict'` failure this file used to produce roughly three runs in
 * five. Nothing below waits for a duration chosen to be "long enough"; the only timing constants left
 * are a poll interval and a hang cap, and neither one orders the two processes.
 */
import { spawn } from 'node:child_process';
import { closeSync, openSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import { defineTenantRepository } from '../../src/tenant/repository.js';
import { withTenantTransaction } from '../../src/tenant/transaction.js';
import {
  ORG_A,
  PARENT_SPEC,
  REPO_MIGRATIONS_DIR,
  contextFor,
  withTenantDatabase,
} from './helpers.js';

const WORKER = join(dirname(fileURLToPath(import.meta.url)), 'tx-worker.mjs');
const parent = defineTenantRepository({ table: 't_parent', spec: PARENT_SPEC });

/**
 * How long the spin loop sleeps between reads of the worker's output file.
 *
 * It orders nothing: the lock is already held before the worker exists, and the loop exits on the
 * worker's reported outcome, not on elapsed time. It only stops the loop from burning a core while
 * the write lock is held. 25 ms matches `BEGIN_RETRY_DELAY_MS` in `src/tenant/transaction.ts`.
 */
const POLL_INTERVAL_MS = 25;
/**
 * Upper bound on the wait for the worker's outcome — a hang cap, not a race.
 *
 * Reaching it means the worker died or never reported, which is a **failure** of this test (with the
 * worker's stderr attached), never a pass. The expected wait is Node's start-up plus the worker's
 * `APP_SQLITE_BUSY_TIMEOUT_MS` (5000 ms) — comfortably under this, which is itself comfortably under
 * the test's own 60 s budget.
 */
const WORKER_OUTCOME_CAP_MS = 30_000;

function blockFor(ms: number): void {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

interface WorkerResult {
  outcome: 'committed' | 'conflict';
  code?: string | null;
  name?: string | null;
  message?: string;
}

interface RunningWorker {
  /**
   * Blocks this process until the worker has written its outcome line, and reports whether the cap
   * was reached first. Synchronous on purpose: it runs with the transaction open.
   */
  readonly awaitOutcomeSync: () => boolean;
  /** Resolves with the worker's outcome once it exits. */
  readonly result: Promise<WorkerResult>;
  /** Whatever the worker wrote to stderr so far — for a failure message. */
  readonly readStderr: () => string;
}

/** Complete (newline-terminated) output lines, minus the readiness handshake. */
function outcomeLines(path: string): string[] {
  const text = readFileSync(path, 'utf8');
  const terminated = text.slice(0, text.lastIndexOf('\n') + 1);
  return terminated
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line !== '' && !line.includes('"ready"'));
}

/**
 * Starts the contending process. Must be called with the write lock already held.
 *
 * stdio goes to files, not pipes: the parent reads the outcome while its event loop is blocked, and
 * a file also cannot deadlock the child on a full pipe buffer. The parent's own descriptors are
 * closed immediately after `spawn` (the child holds its own duplicates) or Windows fails the
 * harness's `rmSync` of the temp directory with EBUSY.
 */
function runWorker(
  databasePath: string,
  rowId: string,
  label: string,
  dir: string,
): RunningWorker {
  const outPath = join(dir, 'worker-out.log');
  const errPath = join(dir, 'worker-err.log');
  const outFd = openSync(outPath, 'a');
  const errFd = openSync(errPath, 'a');

  const child = spawn(
    process.execPath,
    // Delay `0`: the ordering is structural now, so the worker contends as soon as it can.
    [WORKER, databasePath, REPO_MIGRATIONS_DIR, ORG_A, rowId, '0', label],
    { stdio: ['ignore', outFd, errFd] },
  );

  closeSync(outFd);
  closeSync(errFd);

  const readStderr = (): string => readFileSync(errPath, 'utf8');

  const awaitOutcomeSync = (): boolean => {
    const deadline = Date.now() + WORKER_OUTCOME_CAP_MS;
    for (;;) {
      if (outcomeLines(outPath).length > 0) return false;
      if (Date.now() >= deadline) return true;
      blockFor(POLL_INTERVAL_MS);
    }
  };

  const result = new Promise<WorkerResult>((resolve, reject) => {
    child.on('error', reject);
    child.on('close', (code) => {
      const line = outcomeLines(outPath).pop() ?? '';
      if (line === '') {
        reject(
          new Error(`worker produced no result (exit ${String(code)}): ${readStderr()}`),
        );
        return;
      }
      resolve(JSON.parse(line) as WorkerResult);
    });
  });

  return { awaitOutcomeSync, result, readStderr };
}

describe('two processes writing the same row', () => {
  it(
    'produces exactly one commit and one typed conflict, never a lost update',
    { timeout: 60_000 },
    async () => {
      await withTenantDatabase(async ({ db, databasePath, dir }) => {
        const ctx = contextFor(ORG_A);
        const repository = parent.for(db, ctx);
        withTenantTransaction(db, ctx, (tx) => {
          repository.insert(tx, { id: 'p1', label: 'initial' });
        });

        let worker: RunningWorker | undefined;
        let capReached = false;

        // Take the write lock, write, and only then create the contender — so the worker cannot
        // exist before the lock is held. Then hold the lock until the worker has *reported*.
        // Synchronous throughout on purpose: an `await` here would hand control back to the event
        // loop with BEGIN IMMEDIATE still open, which `withTenantTransaction` refuses.
        withTenantTransaction(db, ctx, (tx) => {
          repository.update(tx, 'p1', { label: 'written-by-parent' });
          worker = runWorker(databasePath, 'p1', 'written-by-worker', dir);
          // Leaving the loop on the cap rather than throwing: a throw here would ROLLBACK this
          // process's write and disguise a dead worker as a lost update. It is reported below.
          capReached = worker.awaitOutcomeSync();
        });

        if (worker === undefined) throw new Error('worker was never started');
        if (capReached) {
          throw new Error(
            `the worker reported no outcome within WORKER_OUTCOME_CAP_MS ` +
              `(${String(WORKER_OUTCOME_CAP_MS)}ms) — it died or hung; this is a harness failure, ` +
              `not a lost update. worker stderr: ${worker.readStderr()}`,
          );
        }

        const result = await worker.result;

        expect(result.outcome).toBe('conflict');
        expect(result.name).toBe('TenantAccessError');
        expect(result.code).toBe('TX_CONFLICT');

        // The committed value is one of the two writes, not a merge of them, and specifically the
        // one that held the lock. The worker never got to overwrite it.
        const row = repository.get('p1') as Record<string, unknown>;
        expect(row['label']).toBe('written-by-parent');
      });
    },
  );
});
