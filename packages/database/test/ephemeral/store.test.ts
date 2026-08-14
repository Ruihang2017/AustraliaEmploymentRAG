import { describe, expect, it } from 'vitest';

import { EPHEMERAL_KINDS, EPHEMERAL_TABLES, type EphemeralKind } from '../../src/ephemeral/schema.js';
import { createEphemeralStore } from '../../src/ephemeral/store.js';
import { TERMINAL_RETENTION_MS, computeExpiresAt } from '../../src/ephemeral/sweeper.js';
import { at, withTempEphemeralDatabase } from './helpers.js';

const CREATED = at(0);

describe('putEphemeral / getEphemeral round trip', () => {
  for (const kind of EPHEMERAL_KINDS) {
    it(`round-trips a payload for ${kind}`, async () => {
      await withTempEphemeralDatabase(({ handle, registry }) => {
        const store = createEphemeralStore({ handle, registry });
        store.putEphemeral(kind, {
          jobId: 'job-1',
          organizationRef: 'org-ref-1',
          payload: 'the sanitized question',
          createdAt: CREATED,
        });
        expect(store.getEphemeral(kind, 'job-1', at(60_000))).toEqual({
          status: 'PRESENT',
          payload: 'the sanitized question',
        });
      });
    });
  }

  it.each([
    ['an empty string', ''],
    ['multi-byte UTF-8', 'Erbschaftsteuer — 稅務 — «é» 🧾'],
    ['a large payload', 'x'.repeat(256 * 1024)],
  ])('round-trips %s', async (_label, payload) => {
    await withTempEphemeralDatabase(({ handle, registry }) => {
      const store = createEphemeralStore({ handle, registry });
      store.putEphemeral('EVIDENCE', {
        jobId: 'job-2',
        organizationRef: 'org-ref-1',
        payload,
        createdAt: CREATED,
      });
      const result = store.getEphemeral('EVIDENCE', 'job-2', at(60_000));
      expect(result.status).toBe('PRESENT');
      expect(result.status === 'PRESENT' ? result.payload : null).toBe(payload);
    });
  });

  it('upserts: a second put for the same job replaces the payload', async () => {
    await withTempEphemeralDatabase(({ handle, registry }) => {
      const store = createEphemeralStore({ handle, registry });
      store.putEphemeral('RESULT', {
        jobId: 'job-3',
        organizationRef: 'org-ref-1',
        payload: 'first',
        createdAt: CREATED,
      });
      store.putEphemeral('RESULT', {
        jobId: 'job-3',
        organizationRef: 'org-ref-1',
        payload: 'second',
        createdAt: CREATED,
      });
      expect(store.getEphemeral('RESULT', 'job-3', at(60_000))).toEqual({
        status: 'PRESENT',
        payload: 'second',
      });
      const row = handle.get<{ n: number }>('SELECT COUNT(*) AS n FROM ephemeral_result');
      expect(row?.n).toBe(1);
    });
  });

  it('returns ABSENT for an unknown job and keeps kinds separate', async () => {
    await withTempEphemeralDatabase(({ handle, registry }) => {
      const store = createEphemeralStore({ handle, registry });
      store.putEphemeral('JOB_CONTENT', {
        jobId: 'job-4',
        organizationRef: 'org-ref-1',
        payload: 'content',
        createdAt: CREATED,
      });
      expect(store.getEphemeral('JOB_CONTENT', 'nope', at(0))).toEqual({ status: 'ABSENT' });
      expect(store.getEphemeral('RESULT', 'job-4', at(0))).toEqual({ status: 'ABSENT' });
    });
  });
});

describe('markTerminal', () => {
  it('sets terminal_at and recomputes expires_at without touching the payload', async () => {
    await withTempEphemeralDatabase(({ handle, registry }) => {
      const store = createEphemeralStore({ handle, registry });
      store.putEphemeral('RESULT', {
        jobId: 'job-5',
        organizationRef: 'org-ref-1',
        payload: 'answer',
        createdAt: CREATED,
      });
      const terminal = at(10 * 60_000);
      store.markTerminal('RESULT', 'job-5', terminal);

      const row = handle.get<{ terminal_at: string; expires_at: string }>(
        'SELECT terminal_at, expires_at FROM ephemeral_result WHERE job_id = :jobId',
        { jobId: 'job-5' },
      );
      expect(row?.terminal_at).toBe(terminal.toISOString());
      expect(row?.expires_at).toBe(computeExpiresAt(CREATED, terminal));
      expect(row?.expires_at).toBe(new Date(terminal.getTime() + TERMINAL_RETENTION_MS).toISOString());
      expect(store.getEphemeral('RESULT', 'job-5', at(11 * 60_000))).toEqual({
        status: 'PRESENT',
        payload: 'answer',
      });
    });
  });

  it('is a no-op for a job that does not exist', async () => {
    await withTempEphemeralDatabase(({ handle, registry }) => {
      const store = createEphemeralStore({ handle, registry });
      expect(() => store.markTerminal('RESULT', 'missing', at(0))).not.toThrow();
      const row = handle.get<{ n: number }>('SELECT COUNT(*) AS n FROM ephemeral_result');
      expect(row?.n).toBe(0);
    });
  });
});

describe('validation', () => {
  const valid = {
    jobId: 'job-6',
    organizationRef: 'org-ref-1',
    payload: 'p',
    createdAt: CREATED,
  };

  it.each([
    ['empty jobId', { ...valid, jobId: '' }],
    ['empty organizationRef', { ...valid, organizationRef: '' }],
    ['non-string payload', { ...valid, payload: 42 as unknown as string }],
    ['invalid createdAt', { ...valid, createdAt: new Date('nope') }],
    ['non-Date createdAt', { ...valid, createdAt: '2026-03-01' as unknown as Date }],
    ['invalid terminalAt', { ...valid, terminalAt: new Date('nope') }],
  ])('rejects %s and writes no row', async (_label, input) => {
    await withTempEphemeralDatabase(({ handle, registry }) => {
      const store = createEphemeralStore({ handle, registry });
      expect(() => store.putEphemeral('JOB_CONTENT', input)).toThrowError(/EPHEMERAL_INPUT_INVALID/);
      const row = handle.get<{ n: number }>('SELECT COUNT(*) AS n FROM ephemeral_job_content');
      expect(row?.n).toBe(0);
    });
  });

  it('rejects an unknown kind on both write and read', async () => {
    await withTempEphemeralDatabase(({ handle, registry }) => {
      const store = createEphemeralStore({ handle, registry });
      const bogus = 'AUDIT' as EphemeralKind;
      expect(() => store.putEphemeral(bogus, valid)).toThrowError(/EPHEMERAL_INPUT_INVALID/);
      expect(() => store.getEphemeral(bogus, 'job-6', at(0))).toThrowError(/EPHEMERAL_INPUT_INVALID/);
    });
  });

  it('rejects an invalid now on read', async () => {
    await withTempEphemeralDatabase(({ handle, registry }) => {
      const store = createEphemeralStore({ handle, registry });
      expect(() => store.getEphemeral('RESULT', 'job-6', new Date('nope'))).toThrowError(
        /EPHEMERAL_INPUT_INVALID/,
      );
    });
  });

  it('throws EPHEMERAL_STORE_CLOSED after the handle is closed', async () => {
    await withTempEphemeralDatabase(({ handle, registry }) => {
      const store = createEphemeralStore({ handle, registry });
      handle.close();
      expect(() => store.getEphemeral('RESULT', 'job-6', at(0))).toThrowError(
        /EPHEMERAL_STORE_CLOSED/,
      );
      expect(() => store.putEphemeral('RESULT', valid)).toThrowError(/EPHEMERAL_STORE_CLOSED/);
    });
  });
});

describe('table names', () => {
  it('maps each kind to its PRD §35.7 table', () => {
    expect(EPHEMERAL_TABLES).toEqual({
      JOB_CONTENT: 'ephemeral_job_content',
      EVIDENCE: 'ephemeral_evidence',
      RESULT: 'ephemeral_result',
    });
  });
});
