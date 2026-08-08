/**
 * The two retention sinks PRD §22 separates — RUNT-07 Deliverable 8.
 *
 * PRD §22 bullet 4: "Application logs retain 14 days with age/size disk caps."
 * PRD §22 bullet 5: "Audit/security records retain 12 months separately and are backed up."
 * PRD §39.3 makes the boundary PHYSICAL: `/srv/aer/log` holds "bounded 14-day operational logs" with
 * "No customer-content backup", separately from the app and ephemeral databases.
 *
 * The separation is therefore enforced BOTH WAYS at runtime: the application sink throws on an
 * `'audit'` record and the audit sink throws on an `'application'` record. A sink that silently
 * accepted the other class would put a 14-day-deleted record into a 12-month backed-up store, or the
 * reverse — the exact failure PRD §37.3's retention matrix exists to prevent.
 *
 * NO TIMERS. Pruning happens on rotation and on an explicit `prune()` call, never on an interval. A
 * library that schedules its own work leaks a handle, keeps the process alive past shutdown and
 * makes every consumer's test flaky.
 *
 * NO DATABASE. The audit sink writes through {@link AuditRecordSinkPort}, which `DATA-07`
 * (`01-app-data`) implements over its audit tables. This package owns no schema and never imports
 * `packages/database` (RUNT-07 Non-goals; breakdown-plan A3).
 */
import * as nodeFs from 'node:fs';
import * as nodePath from 'node:path';
import nodeProcess from 'node:process';

import { RecordClassError, RetentionConfigError } from './errors.js';
import type { LogSink, RecordClass } from './sinks.js';
import type { ProcessRole } from './vocabulary.js';

/** PRD §22 bullet 4. A configuration above this is refused, not clamped. */
export const MAX_APPLICATION_LOG_AGE_DAYS = 14;

/** PRD §22 bullet 5. */
export const AUDIT_RETENTION_MONTHS = 12;

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/** `<process>-<YYYY-MM-DD>-<pid>[-<sequence>].jsonl`. Anchored; nothing else is ever a candidate. */
export const LOG_FILE_PATTERN = /^(?:app|worker|search)-\d{4}-\d{2}-\d{2}-\d+(?:-\d+)?\.jsonl$/;

/** The `lstat` result this package needs. `null` means "vanished between readdir and lstat". */
export interface FileFacts {
  readonly isFile: boolean;
  readonly isSymbolicLink: boolean;
  readonly size: number;
  readonly mtimeMs: number;
}

/**
 * The filesystem operations the application sink performs — nothing more.
 *
 * Every test injects an in-memory implementation, so no test in this package writes to a real disk.
 * `createNodeFileSystem()` is the ONLY place `node:fs` is touched.
 */
export interface FileSystemPort {
  mkdir(directory: string): void;
  /** Direct children only. This port has no recursive listing, by design. */
  readdir(directory: string): readonly string[];
  /** MUST NOT follow a symlink (`lstat`, not `stat`). Returns `null` if the path is gone. */
  lstat(path: string): FileFacts | null;
  unlink(path: string): void;
  append(path: string, contents: string): void;
  join(directory: string, name: string): string;
}

/** The default adapter. The only `node:fs` / `node:path` call sites in the package. */
export function createNodeFileSystem(): FileSystemPort {
  return {
    mkdir(directory: string): void {
      nodeFs.mkdirSync(directory, { recursive: true });
    },
    readdir(directory: string): readonly string[] {
      return nodeFs.readdirSync(directory);
    },
    lstat(path: string): FileFacts | null {
      try {
        const stats = nodeFs.lstatSync(path);
        return {
          isFile: stats.isFile(),
          isSymbolicLink: stats.isSymbolicLink(),
          size: stats.size,
          mtimeMs: stats.mtimeMs,
        };
      } catch {
        return null;
      }
    },
    unlink(path: string): void {
      nodeFs.unlinkSync(path);
    },
    append(path: string, contents: string): void {
      nodeFs.appendFileSync(path, contents);
    },
    join: (directory: string, name: string) => nodePath.join(directory, name),
  };
}

export interface ApplicationLogSinkOptions {
  /** The log directory (PRD §39.3: `/srv/aer/log`). Created if absent. */
  readonly directory: string;
  readonly processRole: ProcessRole;
  /** Default and maximum {@link MAX_APPLICATION_LOG_AGE_DAYS}. A larger value throws. */
  readonly maxAgeDays?: number;
  /** Total bytes the directory may hold. Oldest files are pruned first once it is exceeded. */
  readonly maxTotalBytes: number;
  /** Bytes one file may hold before the sink rotates to the next sequence. */
  readonly maxFileBytes: number;
  /** Injected so retention tests are deterministic. */
  readonly clock: () => number;
  readonly fs?: FileSystemPort;
  /** The process id used in file names, so two processes never rotate the same file. */
  readonly pid?: number;
}

export interface PruneResult {
  /** File names removed, in removal order. */
  readonly removed: readonly string[];
  /** Candidates skipped because they were symlinks, non-files or the currently open file. */
  readonly skipped: number;
  /**
   * Removals that failed — `EBUSY`/`EPERM` (an open file cannot be unlinked on Windows, and the
   * local dev/CI loop runs on Windows) or `ENOENT` (already gone). Counted, never fatal.
   */
  readonly failed: number;
  /** Bytes remaining in the directory after pruning. */
  readonly keptBytes: number;
}

export interface ApplicationLogSink extends LogSink {
  prune(): PruneResult;
  /** The file the next write lands in. */
  currentFile(): string;
  /** Marks the sink closed; the currently open file becomes prunable. Writes after this throw. */
  close(): void;
}

/** `YYYY-MM-DD` in UTC. Local time would make a file name jump backwards across a DST change. */
function utcDay(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

/**
 * The application-log sink: 14-day age cap, directory size cap, per-file size cap, per-process file.
 *
 * @throws RetentionConfigError  `maxAgeDays` above {@link MAX_APPLICATION_LOG_AGE_DAYS} or below 1,
 *   or a non-positive size cap.
 */
export function createApplicationLogSink(options: ApplicationLogSinkOptions): ApplicationLogSink {
  const maxAgeDays = options.maxAgeDays ?? MAX_APPLICATION_LOG_AGE_DAYS;
  if (!Number.isSafeInteger(maxAgeDays) || maxAgeDays < 1) {
    throw new RetentionConfigError('maxAgeDays must be a positive integer');
  }
  if (maxAgeDays > MAX_APPLICATION_LOG_AGE_DAYS) {
    throw new RetentionConfigError(
      `maxAgeDays must not exceed ${MAX_APPLICATION_LOG_AGE_DAYS} (PRD §22: application logs retain 14 days)`,
    );
  }
  if (!Number.isSafeInteger(options.maxTotalBytes) || options.maxTotalBytes < 1) {
    throw new RetentionConfigError('maxTotalBytes must be a positive integer');
  }
  if (!Number.isSafeInteger(options.maxFileBytes) || options.maxFileBytes < 1) {
    throw new RetentionConfigError('maxFileBytes must be a positive integer');
  }

  const fs = options.fs ?? createNodeFileSystem();
  const pid = options.pid ?? nodeProcess.pid;
  const role = options.processRole;

  fs.mkdir(options.directory);

  let day = utcDay(options.clock());
  let sequence = 0;
  let bytesInFile = 0;
  let closed = false;

  const nameFor = (): string =>
    sequence === 0 ? `${role}-${day}-${pid}.jsonl` : `${role}-${day}-${pid}-${sequence}.jsonl`;

  function prune(): PruneResult {
    const now = options.clock();
    const cutoff = now - maxAgeDays * MS_PER_DAY;
    const open = closed ? null : nameFor();

    interface Candidate {
      readonly name: string;
      readonly size: number;
      readonly mtimeMs: number;
    }
    const candidates: Candidate[] = [];
    const removed: string[] = [];
    let skipped = 0;
    let failed = 0;

    let names: readonly string[];
    try {
      names = fs.readdir(options.directory);
    } catch {
      return { removed: [], skipped: 0, failed: 1, keptBytes: 0 };
    }

    for (const name of names) {
      // Strict, anchored, and never a path: a name carrying a separator or `..` cannot match, so a
      // hostile or stray directory entry can never escape `options.directory`.
      if (!LOG_FILE_PATTERN.test(name)) {
        skipped += 1;
        continue;
      }
      const facts = fs.lstat(fs.join(options.directory, name));
      // lstat, so a symlink is reported as a symlink and skipped rather than followed to its target.
      if (facts === null || !facts.isFile || facts.isSymbolicLink) {
        skipped += 1;
        continue;
      }
      if (name === open) {
        // Never unlink the file currently being written: on Windows it fails with EBUSY, on Linux it
        // silently orphans the bytes already written.
        skipped += 1;
        continue;
      }
      candidates.push({ name, size: facts.size, mtimeMs: facts.mtimeMs });
    }

    candidates.sort((a, b) => a.mtimeMs - b.mtimeMs);

    const survivors: Candidate[] = [];
    for (const candidate of candidates) {
      if (candidate.mtimeMs < cutoff) {
        try {
          fs.unlink(fs.join(options.directory, candidate.name));
          removed.push(candidate.name);
        } catch {
          failed += 1;
        }
        continue;
      }
      survivors.push(candidate);
    }

    let total = survivors.reduce((sum, candidate) => sum + candidate.size, 0) + bytesInFile;
    for (const candidate of survivors) {
      if (total <= options.maxTotalBytes) break;
      try {
        fs.unlink(fs.join(options.directory, candidate.name));
        removed.push(candidate.name);
        total -= candidate.size;
      } catch {
        failed += 1;
      }
    }

    return { removed, skipped, failed, keptBytes: total };
  }

  return {
    write(line: string, recordClass: RecordClass): void {
      if (recordClass !== 'application') {
        throw new RecordClassError(
          'the application log sink accepts only "application" records; audit/security records go to the 12-month audit sink (PRD §22 bullets 4-5)',
        );
      }
      if (closed) throw new RetentionConfigError('the application log sink is closed');

      const today = utcDay(options.clock());
      if (today !== day) {
        day = today;
        sequence = 0;
        bytesInFile = 0;
        prune();
      }
      const size = line.length;
      if (bytesInFile > 0 && bytesInFile + size > options.maxFileBytes) {
        sequence += 1;
        bytesInFile = 0;
        prune();
      }
      fs.append(fs.join(options.directory, nameFor()), line);
      bytesInFile += size;
    },
    prune,
    currentFile: () => nameFor(),
    close(): void {
      closed = true;
    },
  };
}

// ---------------------------------------------------------------------------------------------
// Audit / security records — PRD §22 bullet 5
// ---------------------------------------------------------------------------------------------

/**
 * One audit/security record handed to `DATA-07`'s repository.
 *
 * `retain_until` is computed by UTC CALENDAR-month arithmetic, not `365 * 86400e3`: a fixed-day
 * approximation drifts across leap years and would silently retire a record early.
 */
export interface AuditRecord {
  /** The serialised record, already bounded by the same allowlist as an application record. */
  readonly line: string;
  readonly recorded_at: string;
  readonly retention_months: typeof AUDIT_RETENTION_MONTHS;
  readonly retain_until: string;
}

/** Implemented by `DATA-07` over its audit tables. */
export interface AuditRecordSinkPort {
  append(record: AuditRecord): void;
}

/** `recorded_at` plus twelve UTC calendar months. */
export function auditRetainUntil(ms: number): string {
  const at = new Date(ms);
  return new Date(
    Date.UTC(
      at.getUTCFullYear(),
      at.getUTCMonth() + AUDIT_RETENTION_MONTHS,
      at.getUTCDate(),
      at.getUTCHours(),
      at.getUTCMinutes(),
      at.getUTCSeconds(),
      at.getUTCMilliseconds(),
    ),
  ).toISOString();
}

export interface AuditSinkOptions {
  readonly clock: () => number;
}

/**
 * The audit/security sink. Refuses `'application'` records — see the file header for why the
 * separation is enforced in both directions.
 *
 * NOTE ON NAMING: this port is `AuditRecordSinkPort`, not `AuditSink`. `AuditSink` is already the
 * port name `AUTC-01`…`AUTC-04` (`02-auth-core`, not yet delivered) inject; squatting it with a
 * different shape would collide when those land. Recorded in `docs/prd/03-app-runtime/README.md` §6 QR8.
 */
export function createAuditSink(port: AuditRecordSinkPort, options: AuditSinkOptions): LogSink {
  return {
    write(line: string, recordClass: RecordClass): void {
      if (recordClass !== 'audit') {
        throw new RecordClassError(
          'the audit sink accepts only "audit" records; application logs go to the 14-day application sink (PRD §22 bullets 4-5)',
        );
      }
      const now = options.clock();
      port.append({
        line,
        recorded_at: new Date(now).toISOString(),
        retention_months: AUDIT_RETENTION_MONTHS,
        retain_until: auditRetainUntil(now),
      });
    },
  };
}
