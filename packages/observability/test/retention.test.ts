/**
 * RUNT-07 acceptance item 9 — "Application logs honour a 14-day age cap and a configured size cap;
 * audit/security records go to a separate sink with a 12-month marker; each sink rejects the other's
 * record class" (PRD §22 bullets 4-5; PRD §39.3).
 *
 * Everything runs against the in-memory {@link FileSystemPort} and an injected clock, so no test
 * touches a real disk or a real wall clock.
 */
import { describe, expect, it } from 'vitest';

import { RecordClassError, RetentionConfigError } from '../src/errors.js';
import {
  AUDIT_RETENTION_MONTHS,
  auditRetainUntil,
  createApplicationLogSink,
  createAuditSink,
} from '../src/retention.js';
import type { AuditRecord } from '../src/retention.js';
import { createMemoryFileSystem } from './support/memory-fs.js';

const DAY = 24 * 60 * 60 * 1000;
const NOW = Date.parse('2026-08-07T00:00:00.000Z');
const DIRECTORY = '/srv/aer/log';

function sink(overrides: Partial<Parameters<typeof createApplicationLogSink>[0]> = {}) {
  const fs = createMemoryFileSystem(() => NOW);
  const application = createApplicationLogSink({
    directory: DIRECTORY,
    processRole: 'app',
    maxTotalBytes: 10_000,
    maxFileBytes: 10_000,
    clock: () => NOW,
    pid: 4242,
    fs,
    ...overrides,
  });
  return { fs, application };
}

describe('the application log sink', () => {
  it('names files per process so two processes never rotate the same file', () => {
    const { application } = sink();
    expect(application.currentFile()).toBe('app-2026-08-07-4242.jsonl');
  });

  it('refuses a maxAgeDays above the PRD §22 cap of 14 days', () => {
    expect(() => sink({ maxAgeDays: 15 })).toThrow(RetentionConfigError);
    expect(() => sink({ maxAgeDays: 0 })).toThrow(RetentionConfigError);
    expect(() => sink({ maxAgeDays: 14 })).not.toThrow();
  });

  it('refuses a non-positive size cap', () => {
    expect(() => sink({ maxTotalBytes: 0 })).toThrow(RetentionConfigError);
    expect(() => sink({ maxFileBytes: -1 })).toThrow(RetentionConfigError);
  });

  it('prunes files older than the age cap and keeps newer ones', () => {
    const { fs, application } = sink();
    fs.seed(DIRECTORY, 'app-2026-07-01-1.jsonl', 'old', NOW - 20 * DAY);
    fs.seed(DIRECTORY, 'app-2026-07-23-1.jsonl', 'edge', NOW - 15 * DAY);
    fs.seed(DIRECTORY, 'app-2026-08-01-1.jsonl', 'recent', NOW - 6 * DAY);

    const result = application.prune();

    expect([...result.removed].sort()).toEqual(['app-2026-07-01-1.jsonl', 'app-2026-07-23-1.jsonl']);
    expect(fs.list(DIRECTORY)).toEqual(['app-2026-08-01-1.jsonl']);
    expect(result.failed).toBe(0);
  });

  it('prunes oldest-first until the total size cap holds', () => {
    const { fs, application } = sink({ maxTotalBytes: 20 });
    fs.seed(DIRECTORY, 'app-2026-08-01-1.jsonl', 'x'.repeat(10), NOW - 3 * DAY);
    fs.seed(DIRECTORY, 'app-2026-08-02-1.jsonl', 'x'.repeat(10), NOW - 2 * DAY);
    fs.seed(DIRECTORY, 'app-2026-08-03-1.jsonl', 'x'.repeat(10), NOW - 1 * DAY);

    const result = application.prune();

    expect(result.removed).toEqual(['app-2026-08-01-1.jsonl']);
    expect(result.keptBytes).toBe(20);
    expect(fs.list(DIRECTORY)).toEqual(['app-2026-08-02-1.jsonl', 'app-2026-08-03-1.jsonl']);
  });

  it('never unlinks the file currently open for writing', () => {
    const { fs, application } = sink({ maxTotalBytes: 1 });
    application.write('{"ts":"x"}\n', 'application');
    fs.seed(DIRECTORY, 'app-2026-08-01-1.jsonl', 'x'.repeat(50), NOW - 1 * DAY);

    const result = application.prune();

    expect(result.removed).toEqual(['app-2026-08-01-1.jsonl']);
    expect(fs.list(DIRECTORY)).toEqual(['app-2026-08-07-4242.jsonl']);
    expect(result.skipped).toBeGreaterThanOrEqual(1);
  });

  it('skips symlinks, directories and names outside the strict pattern', () => {
    const { fs, application } = sink();
    fs.seed(DIRECTORY, 'app-2026-07-01-1.jsonl', 'link', NOW - 30 * DAY, 'symlink');
    fs.seed(DIRECTORY, 'app-2026-07-02-1.jsonl', 'dir', NOW - 30 * DAY, 'directory');
    fs.seed(DIRECTORY, 'passwd', 'not ours', NOW - 30 * DAY);
    fs.seed(DIRECTORY, 'app-2026-07-03-1.jsonl.bak', 'not ours', NOW - 30 * DAY);

    const result = application.prune();

    expect(result.removed).toEqual([]);
    expect(result.skipped).toBe(4);
    expect(fs.list(DIRECTORY)).toHaveLength(4);
  });

  it('counts an EBUSY unlink instead of failing the prune', () => {
    const { fs, application } = sink();
    fs.seed(DIRECTORY, 'app-2026-07-01-1.jsonl', 'locked', NOW - 30 * DAY);
    fs.seed(DIRECTORY, 'app-2026-07-02-1.jsonl', 'free', NOW - 30 * DAY);
    fs.lockUnlink('app-2026-07-01-1.jsonl');

    const result = application.prune();

    expect(result.removed).toEqual(['app-2026-07-02-1.jsonl']);
    expect(result.failed).toBe(1);
    expect(fs.list(DIRECTORY)).toEqual(['app-2026-07-01-1.jsonl']);
  });

  it('rotates to the next sequence once the per-file cap is reached', () => {
    const { fs, application } = sink({ maxFileBytes: 12 });
    application.write('0123456789\n', 'application');
    application.write('0123456789\n', 'application');
    expect(fs.list(DIRECTORY)).toEqual([
      'app-2026-08-07-4242.jsonl',
      'app-2026-08-07-4242-1.jsonl',
    ].sort());
    expect(application.currentFile()).toBe('app-2026-08-07-4242-1.jsonl');
  });

  it('rolls the file name and prunes when the UTC day changes', () => {
    let now = NOW;
    const fs = createMemoryFileSystem(() => now);
    const application = createApplicationLogSink({
      directory: DIRECTORY,
      processRole: 'worker',
      maxTotalBytes: 10_000,
      maxFileBytes: 10_000,
      clock: () => now,
      pid: 7,
      fs,
    });
    application.write('a\n', 'application');
    now += DAY;
    application.write('b\n', 'application');
    expect(fs.list(DIRECTORY).sort()).toEqual([
      'worker-2026-08-07-7.jsonl',
      'worker-2026-08-08-7.jsonl',
    ]);
  });

  it('rejects an audit record and rejects writes after close', () => {
    const { application } = sink();
    expect(() => application.write('{}\n', 'audit')).toThrow(RecordClassError);
    application.close();
    expect(() => application.write('{}\n', 'application')).toThrow(RetentionConfigError);
  });
});

describe('the audit sink', () => {
  function audit() {
    const appended: AuditRecord[] = [];
    const sinkUnderTest = createAuditSink(
      { append: (record) => appended.push(record) },
      { clock: () => NOW },
    );
    return { appended, sinkUnderTest };
  }

  it('marks every record with a 12-month retention and a UTC calendar retain_until', () => {
    const { appended, sinkUnderTest } = audit();
    sinkUnderTest.write('{"event":"request.rejected"}\n', 'audit');

    expect(appended).toHaveLength(1);
    expect(appended[0]?.retention_months).toBe(AUDIT_RETENTION_MONTHS);
    expect(appended[0]?.recorded_at).toBe('2026-08-07T00:00:00.000Z');
    expect(appended[0]?.retain_until).toBe('2027-08-07T00:00:00.000Z');
  });

  it('uses calendar arithmetic, not 365 days, across a leap year', () => {
    // 2027-02-29 does not exist, so 2028 is the leap year that matters for a 2027-02-29 rollover.
    expect(auditRetainUntil(Date.parse('2027-02-28T12:00:00.000Z'))).toBe(
      '2028-02-28T12:00:00.000Z',
    );
    expect(auditRetainUntil(Date.parse('2028-02-29T12:00:00.000Z'))).toBe(
      '2029-03-01T12:00:00.000Z',
    );
  });

  it('rejects an application record', () => {
    const { sinkUnderTest } = audit();
    expect(() => sinkUnderTest.write('{}\n', 'application')).toThrow(RecordClassError);
  });
});
