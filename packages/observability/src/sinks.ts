/**
 * Log sinks — the byte-writing end of the pipeline.
 *
 * A sink receives an ALREADY-SERIALISED line plus its retention class. It performs no formatting,
 * no interpolation and no inspection of caller data: by the time bytes reach here every value has
 * passed the `src/fields.ts` kind check and been serialised by `JSON.stringify` over a fresh object
 * of primitives.
 *
 * `createMemorySink` lives in `src/` rather than `test/` on purpose: `RUNT-08` reuses it, and a
 * consumer's test must not have to deep-import another package's `test/` tree.
 */
import nodeProcess from 'node:process';

/**
 * The two retention classes PRD §22 separates: application logs (14 days, bullet 4) and
 * audit/security records (12 months, separately backed up, bullet 5). Every sink is bound to one of
 * them and rejects the other — see `src/retention.ts`.
 */
export type RecordClass = 'application' | 'audit';

/** Where a serialised record goes. The line already ends with `\n`. */
export interface LogSink {
  write(line: string, recordClass: RecordClass): void;
}

/** An in-memory sink that keeps every byte written to it, for tests and harnesses. */
export interface MemorySink extends LogSink {
  /** Every line written, in order, exactly as handed to `write`. */
  lines(): readonly string[];
  /** Every byte written since the last `clear()`, concatenated. */
  bytes(): string;
  /** The record classes seen, in order — so a test can assert class routing. */
  classes(): readonly RecordClass[];
  /** Discards everything written so far. */
  clear(): void;
}

/** An in-memory sink. Accepts both record classes; class separation is `src/retention.ts`'s job. */
export function createMemorySink(): MemorySink {
  let written: string[] = [];
  let seen: RecordClass[] = [];
  return {
    write(line: string, recordClass: RecordClass): void {
      written.push(line);
      seen.push(recordClass);
    },
    lines: () => written.slice(),
    bytes: () => written.join(''),
    classes: () => seen.slice(),
    clear(): void {
      written = [];
      seen = [];
    },
  };
}

/**
 * Writes to the process's stdout.
 *
 * Accepts both classes because a container/systemd deployment may collect both from stdout; the
 * 14-day / 12-month separation is then the collector's. A deployment that needs the separation
 * enforced in-process uses `src/retention.ts`'s two sinks instead.
 */
export function createStdoutSink(): LogSink {
  return {
    write(line: string): void {
      nodeProcess.stdout.write(line);
    },
  };
}
