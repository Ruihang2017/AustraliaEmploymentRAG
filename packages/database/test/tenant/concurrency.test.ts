/**
 * PRD §39.1/§39.4 — SQLite has exactly one writer. Two transactions racing for the same row must
 * produce one commit and one **typed** error, and never a lost update (the second writer silently
 * overwriting the first's value with one computed from a stale read).
 *
 * The overlap is made deterministic rather than left to timing luck: this process takes the write
 * lock and holds it, synchronously, for longer than `APP_SQLITE_BUSY_TIMEOUT_MS`, while a second OS
 * process — started first, with a short head start delay — runs into it.
 */
import { spawn } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import { APP_SQLITE_BUSY_TIMEOUT_MS } from '../../src/migrate/pragmas.js';
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
 * How long the worker waits after saying "ready" before it tries to write.
 *
 * Just enough for this process to get from the readiness callback into `BEGIN IMMEDIATE`. It is not
 * a guess at Node's start-up cost — that is what the handshake removes.
 */
const WORKER_ATTEMPT_DELAY_MS = 300;
/** Longer than the worker's whole wait, so its busy timeout expires while we still hold the lock. */
const HOLD_MS = WORKER_ATTEMPT_DELAY_MS + APP_SQLITE_BUSY_TIMEOUT_MS + 1500;

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
  /** Resolves when the worker has finished importing and is about to contend for the lock. */
  readonly ready: Promise<void>;
  /** Resolves with the worker's outcome once it exits. */
  readonly result: Promise<WorkerResult>;
}

function runWorker(databasePath: string, rowId: string, label: string): RunningWorker {
  const child = spawn(
    process.execPath,
    [
      WORKER,
      databasePath,
      REPO_MIGRATIONS_DIR,
      ORG_A,
      rowId,
      String(WORKER_ATTEMPT_DELAY_MS),
      label,
    ],
    { stdio: ['ignore', 'pipe', 'pipe'] },
  );

  let out = '';
  let err = '';
  let signalReady: () => void = () => undefined;
  let failReady: (error: Error) => void = () => undefined;
  const ready = new Promise<void>((resolve, reject) => {
    signalReady = resolve;
    failReady = reject;
  });

  child.stdout.on('data', (chunk: Buffer) => {
    out += chunk.toString();
    if (out.includes('"ready"')) signalReady();
  });
  child.stderr.on('data', (chunk: Buffer) => (err += chunk.toString()));
  child.on('error', (error) => failReady(error));

  const result = new Promise<WorkerResult>((resolve, reject) => {
    child.on('error', reject);
    child.on('close', (code) => {
      const lines = out.trim().split('\n').filter((line) => !line.includes('"ready"'));
      const line = lines.pop() ?? '';
      if (line === '') {
        const error = new Error(`worker produced no result (exit ${String(code)}): ${err}`);
        failReady(error);
        reject(error);
        return;
      }
      resolve(JSON.parse(line) as WorkerResult);
    });
  });

  return { ready, result };
}

describe('two processes writing the same row', () => {
  it(
    'produces exactly one commit and one typed conflict, never a lost update',
    { timeout: 60_000 },
    async () => {
      await withTenantDatabase(async ({ db, databasePath }) => {
        const ctx = contextFor(ORG_A);
        const repository = parent.for(db, ctx);
        withTenantTransaction(db, ctx, (tx) => {
          repository.insert(tx, { id: 'p1', label: 'initial' });
        });

        const worker = runWorker(databasePath, 'p1', 'written-by-worker');
        await worker.ready;

        // Hold the write lock past the worker's busy timeout. Synchronous on purpose: an `await`
        // here would hand control back to the event loop with BEGIN IMMEDIATE still open.
        withTenantTransaction(db, ctx, (tx) => {
          repository.update(tx, 'p1', { label: 'written-by-parent' });
          blockFor(HOLD_MS);
        });

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
