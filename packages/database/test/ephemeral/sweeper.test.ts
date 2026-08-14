import { describe, expect, it } from 'vitest';

import { EPHEMERAL_TABLE_NAMES } from '../../src/ephemeral/schema.js';
import { createEphemeralStore } from '../../src/ephemeral/store.js';
import {
  CREATION_CEILING_MS,
  TERMINAL_RETENTION_MS,
  TOMBSTONE_RETENTION_MS,
  computeExpiresAt,
  sweepExpired,
} from '../../src/ephemeral/sweeper.js';
import { at, withTempEphemeralDatabase } from './helpers.js';

const MINUTE = 60_000;
const NOW = at(0);

describe('the PRD §35.7 constants are the customer-facing promise', () => {
  it('is one hour after terminal state and 24 hours from creation', () => {
    expect(TERMINAL_RETENTION_MS).toBe(60 * 60_000);
    expect(CREATION_CEILING_MS).toBe(24 * 60 * 60_000);
  });
});

describe('computeExpiresAt', () => {
  it('is the creation ceiling when the job has no terminal state', () => {
    expect(computeExpiresAt(at(0), null)).toBe(at(CREATION_CEILING_MS).toISOString());
  });

  it('is the earlier of the two rules once terminal', () => {
    expect(computeExpiresAt(at(0), at(10 * MINUTE))).toBe(
      at(10 * MINUTE + TERMINAL_RETENTION_MS).toISOString(),
    );
    // A terminal state right at the ceiling cannot push expiry past 24 h from creation.
    expect(computeExpiresAt(at(0), at(CREATION_CEILING_MS))).toBe(
      at(CREATION_CEILING_MS).toISOString(),
    );
  });
});

describe('expiry rule 1 — one hour after terminal state', () => {
  it.each([
    [61, 'EXPIRED'],
    [59, 'PRESENT'],
  ])('terminal_at = now - %i min -> %s', async (minutes, expected) => {
    await withTempEphemeralDatabase(({ handle, registry }) => {
      const store = createEphemeralStore({ handle, registry });
      store.putEphemeral('RESULT', {
        jobId: 'j',
        organizationRef: 'org',
        payload: 'answer',
        createdAt: at(-2 * 60 * MINUTE),
        terminalAt: at(-minutes * MINUTE),
      });
      const report = sweepExpired(handle, NOW);
      const forTable = report.tables.find((t) => t.table === 'ephemeral_result');
      expect(forTable?.contentExpired).toBe(expected === 'EXPIRED' ? 1 : 0);
      expect(store.getEphemeral('RESULT', 'j', NOW).status).toBe(expected);
    });
  });
});

describe('expiry rule 2 — all content at 24 hours from creation', () => {
  it.each([
    [24 * 60 + 1, 'EXPIRED'],
    [23 * 60 + 59, 'PRESENT'],
  ])('created_at = now - %i min with terminal_at null -> %s', async (minutes, expected) => {
    await withTempEphemeralDatabase(({ handle, registry }) => {
      const store = createEphemeralStore({ handle, registry });
      store.putEphemeral('JOB_CONTENT', {
        jobId: 'j',
        organizationRef: 'org',
        payload: 'question',
        createdAt: at(-minutes * MINUTE),
      });
      const before = handle.get<{ terminal_at: string | null }>(
        'SELECT terminal_at FROM ephemeral_job_content WHERE job_id = :jobId',
        { jobId: 'j' },
      );
      expect(before?.terminal_at).toBeNull();

      sweepExpired(handle, NOW);
      expect(store.getEphemeral('JOB_CONTENT', 'j', NOW).status).toBe(expected);
    });
  });
});

describe('expires_at is never the authority', () => {
  it('sweeps correctly when expires_at is NULL or deliberately wrong', async () => {
    await withTempEphemeralDatabase(({ handle, registry }) => {
      const store = createEphemeralStore({ handle, registry });
      for (const jobId of ['null-expiry', 'wrong-expiry', 'fresh']) {
        store.putEphemeral('EVIDENCE', {
          jobId,
          organizationRef: 'org',
          payload: 'excerpts',
          createdAt: jobId === 'fresh' ? at(-MINUTE) : at(-25 * 60 * MINUTE),
        });
      }
      // Tamper with the derived column directly.
      handle.run('UPDATE ephemeral_evidence SET expires_at = NULL WHERE job_id = :jobId', {
        jobId: 'null-expiry',
      });
      handle.run('UPDATE ephemeral_evidence SET expires_at = :far WHERE job_id = :jobId', {
        jobId: 'wrong-expiry',
        far: at(365 * 24 * 60 * MINUTE).toISOString(),
      });
      // ...and give the fresh row an expires_at far in the past, which must NOT expire it.
      handle.run('UPDATE ephemeral_evidence SET expires_at = :past WHERE job_id = :jobId', {
        jobId: 'fresh',
        past: at(-999 * 60 * MINUTE).toISOString(),
      });

      const report = sweepExpired(handle, NOW);
      expect(report.tables.find((t) => t.table === 'ephemeral_evidence')?.contentExpired).toBe(2);
      expect(store.getEphemeral('EVIDENCE', 'null-expiry', NOW).status).toBe('EXPIRED');
      expect(store.getEphemeral('EVIDENCE', 'wrong-expiry', NOW).status).toBe('EXPIRED');
      expect(store.getEphemeral('EVIDENCE', 'fresh', NOW).status).toBe('PRESENT');
    });
  });
});

describe('per-table counts', () => {
  it('reports accurate asymmetric counts in table-name order', async () => {
    await withTempEphemeralDatabase(({ handle, registry }) => {
      const store = createEphemeralStore({ handle, registry });
      const seed = { JOB_CONTENT: 3, EVIDENCE: 1, RESULT: 2 } as const;
      for (const [kind, count] of Object.entries(seed)) {
        for (let i = 0; i < count; i += 1) {
          store.putEphemeral(kind as keyof typeof seed, {
            jobId: `${kind}-${i}`,
            organizationRef: 'org',
            payload: 'p',
            createdAt: at(-25 * 60 * MINUTE),
          });
        }
        // One row per kind that must survive.
        store.putEphemeral(kind as keyof typeof seed, {
          jobId: `${kind}-fresh`,
          organizationRef: 'org',
          payload: 'p',
          createdAt: at(-MINUTE),
        });
      }

      const report = sweepExpired(handle, NOW);
      expect(report.tables.map((t) => t.table)).toEqual([...EPHEMERAL_TABLE_NAMES]);
      expect(report.tables).toEqual([
        { table: 'ephemeral_evidence', contentExpired: 1, tombstonesRemoved: 0 },
        { table: 'ephemeral_job_content', contentExpired: 3, tombstonesRemoved: 0 },
        { table: 'ephemeral_result', contentExpired: 2, tombstonesRemoved: 0 },
      ]);
      expect(report.sweptAt).toBe(NOW.toISOString());
    });
  });

  it('is idempotent: a second sweep at the same instant changes nothing', async () => {
    await withTempEphemeralDatabase(({ handle, registry }) => {
      const store = createEphemeralStore({ handle, registry });
      store.putEphemeral('RESULT', {
        jobId: 'j',
        organizationRef: 'org',
        payload: 'p',
        createdAt: at(-25 * 60 * MINUTE),
      });
      expect(sweepExpired(handle, NOW).tables.some((t) => t.contentExpired === 1)).toBe(true);
      const second = sweepExpired(handle, NOW);
      expect(second.tables.every((t) => t.contentExpired === 0 && t.tombstonesRemoved === 0)).toBe(
        true,
      );
    });
  });
});

describe('tombstones', () => {
  it('read EXPIRED, survive a second sweep, and are removed once the retention window passes', async () => {
    await withTempEphemeralDatabase(({ handle, registry }) => {
      const store = createEphemeralStore({ handle, registry });
      const createdAt = at(-25 * 60 * MINUTE);
      store.putEphemeral('RESULT', {
        jobId: 'j',
        organizationRef: 'org',
        payload: 'p',
        createdAt,
      });

      sweepExpired(handle, NOW);
      expect(store.getEphemeral('RESULT', 'j', NOW)).toEqual({ status: 'EXPIRED' });

      // The tombstone carries no content.
      const row = handle.get<{ payload_ciphertext: Uint8Array | null }>(
        'SELECT payload_ciphertext FROM ephemeral_result WHERE job_id = :jobId',
        { jobId: 'j' },
      );
      expect(row?.payload_ciphertext).toBeNull();

      sweepExpired(handle, NOW);
      expect(store.getEphemeral('RESULT', 'j', NOW)).toEqual({ status: 'EXPIRED' });

      const later = new Date(createdAt.getTime() + TOMBSTONE_RETENTION_MS + MINUTE);
      const report = sweepExpired(handle, later);
      expect(report.tables.find((t) => t.table === 'ephemeral_result')?.tombstonesRemoved).toBe(1);
      expect(store.getEphemeral('RESULT', 'j', later)).toEqual({ status: 'ABSENT' });
    });
  });

  it('honours a per-call tombstoneRetentionMs', async () => {
    await withTempEphemeralDatabase(({ handle, registry }) => {
      const store = createEphemeralStore({ handle, registry });
      store.putEphemeral('RESULT', {
        jobId: 'j',
        organizationRef: 'org',
        payload: 'p',
        createdAt: at(-25 * 60 * MINUTE),
      });
      sweepExpired(handle, NOW);
      const report = store.sweepExpired(NOW, { tombstoneRetentionMs: 0 });
      expect(report.tables.find((t) => t.table === 'ephemeral_result')?.tombstonesRemoved).toBe(1);
      expect(store.getEphemeral('RESULT', 'j', NOW)).toEqual({ status: 'ABSENT' });
    });
  });

  it('never deletes a freshly written row', async () => {
    await withTempEphemeralDatabase(({ handle, registry }) => {
      const store = createEphemeralStore({ handle, registry });
      store.putEphemeral('RESULT', {
        jobId: 'j',
        organizationRef: 'org',
        payload: 'p',
        createdAt: at(-MINUTE),
      });
      const report = sweepExpired(handle, NOW, { tombstoneRetentionMs: 0 });
      expect(report.tables.every((t) => t.tombstonesRemoved === 0)).toBe(true);
      expect(store.getEphemeral('RESULT', 'j', NOW).status).toBe('PRESENT');
    });
  });
});

describe('read-time expiry does not depend on the sweeper', () => {
  it('returns EXPIRED without decrypting when the rule has fired but no sweep has run', async () => {
    await withTempEphemeralDatabase(({ handle, registry }) => {
      let decryptCalls = 0;
      const spyRegistry = {
        ...registry,
        keyById: (keyId: string) => {
          decryptCalls += 1;
          return registry.keyById(keyId);
        },
      };
      const writer = createEphemeralStore({ handle, registry });
      writer.putEphemeral('JOB_CONTENT', {
        jobId: 'j',
        organizationRef: 'org',
        payload: 'secret question',
        createdAt: at(-25 * 60 * MINUTE),
      });

      const reader = createEphemeralStore({ handle, registry: spyRegistry });
      const result = reader.getEphemeral('JOB_CONTENT', 'j', NOW);
      expect(result).toEqual({ status: 'EXPIRED' });
      expect(Object.keys(result)).toEqual(['status']);
      expect('payload' in result).toBe(false);
      expect(decryptCalls).toBe(0);

      // The ciphertext is still on disk — only the sweeper removes it, and it has not run.
      const row = handle.get<{ payload_ciphertext: Uint8Array | null }>(
        'SELECT payload_ciphertext FROM ephemeral_job_content WHERE job_id = :jobId',
        { jobId: 'j' },
      );
      expect(row?.payload_ciphertext).not.toBeNull();
    });
  });
});

describe('sweep input validation', () => {
  it('rejects an invalid now and a negative tombstone retention', async () => {
    await withTempEphemeralDatabase(({ handle }) => {
      expect(() => sweepExpired(handle, new Date('nope'))).toThrowError(/EPHEMERAL_INPUT_INVALID/);
      expect(() => sweepExpired(handle, NOW, { tombstoneRetentionMs: -1 })).toThrowError(
        /EPHEMERAL_INPUT_INVALID/,
      );
    });
  });
});
