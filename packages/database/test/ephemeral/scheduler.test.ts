import { describe, expect, it, vi } from 'vitest';

import {
  DEFAULT_SWEEP_INTERVAL_MS,
  runStartupCleanup,
  startEphemeralSweeper,
  type EphemeralClock,
} from '../../src/ephemeral/scheduler.js';
import { createEphemeralStore } from '../../src/ephemeral/store.js';
import { at, withTempEphemeralDatabase } from './helpers.js';

const MINUTE = 60_000;
const NOW = at(0);

interface FakeClock extends EphemeralClock {
  readonly registered: Array<{ fn: () => void; ms: number }>;
  readonly cleared: unknown[];
  fire(times?: number): void;
  set(now: Date): void;
}

function fakeClock(initial: Date): FakeClock {
  const registered: Array<{ fn: () => void; ms: number }> = [];
  const cleared: unknown[] = [];
  let current = initial;
  return {
    registered,
    cleared,
    now: () => current,
    setInterval(fn, ms) {
      registered.push({ fn, ms });
      return registered.length - 1;
    },
    clearInterval(handle) {
      cleared.push(handle);
    },
    fire(times = 1) {
      for (let i = 0; i < times; i += 1) {
        for (const entry of registered) entry.fn();
      }
    },
    set(now) {
      current = now;
    },
  };
}

describe('startEphemeralSweeper', () => {
  it('registers exactly one interval at five minutes by default', async () => {
    await withTempEphemeralDatabase(({ handle }) => {
      const clock = fakeClock(NOW);
      expect(clock.registered).toHaveLength(0);
      const sweeper = startEphemeralSweeper({ handle, clock });
      expect(clock.registered).toHaveLength(1);
      expect(clock.registered[0]?.ms).toBe(DEFAULT_SWEEP_INTERVAL_MS);
      expect(DEFAULT_SWEEP_INTERVAL_MS).toBe(5 * 60_000);
      sweeper.stop();
    });
  });

  it('honours an explicit intervalMs and does not sweep on start', async () => {
    await withTempEphemeralDatabase(({ handle, registry }) => {
      const store = createEphemeralStore({ handle, registry });
      store.putEphemeral('RESULT', {
        jobId: 'j',
        organizationRef: 'org',
        payload: 'p',
        createdAt: at(-25 * 60 * MINUTE),
      });

      const clock = fakeClock(NOW);
      const reports: unknown[] = [];
      const sweeper = startEphemeralSweeper({
        handle,
        clock,
        intervalMs: 1234,
        onSweep: (report) => reports.push(report),
      });
      expect(clock.registered[0]?.ms).toBe(1234);
      // No immediate sweep: runStartupCleanup is the startup pass.
      expect(reports).toHaveLength(0);
      const row = handle.get<{ payload_ciphertext: Uint8Array | null }>(
        'SELECT payload_ciphertext FROM ephemeral_result WHERE job_id = :jobId',
        { jobId: 'j' },
      );
      expect(row?.payload_ciphertext).not.toBeNull();

      clock.fire(3);
      expect(reports).toHaveLength(3);
      sweeper.stop();
    });
  });

  it('stops: further ticks perform no sweep and stop() twice is safe', async () => {
    await withTempEphemeralDatabase(({ handle }) => {
      const clock = fakeClock(NOW);
      const reports: unknown[] = [];
      const sweeper = startEphemeralSweeper({ handle, clock, onSweep: (r) => reports.push(r) });
      clock.fire(2);
      expect(reports).toHaveLength(2);
      sweeper.stop();
      sweeper.stop();
      expect(clock.cleared).toHaveLength(1);
      clock.fire(5);
      expect(reports).toHaveLength(2);
    });
  });

  it('routes a throwing sweep to onError instead of out of the timer callback', async () => {
    await withTempEphemeralDatabase(({ handle }) => {
      const clock = fakeClock(NOW);
      const errors: unknown[] = [];
      const sweeper = startEphemeralSweeper({ handle, clock, onError: (e) => errors.push(e) });
      // Closing the handle makes the next sweep throw EPHEMERAL_STORE_CLOSED.
      handle.close();
      expect(() => clock.fire()).not.toThrow();
      expect(errors).toHaveLength(1);
      expect((errors[0] as { code?: string }).code).toBe('EPHEMERAL_STORE_CLOSED');
      sweeper.stop();
    });
  });

  it('rejects a missing handle or a non-positive interval', async () => {
    await withTempEphemeralDatabase(({ handle }) => {
      expect(() =>
        startEphemeralSweeper({ handle: undefined as unknown as typeof handle }),
      ).toThrowError(/EPHEMERAL_INPUT_INVALID/);
      expect(() => startEphemeralSweeper({ handle, intervalMs: 0 })).toThrowError(
        /EPHEMERAL_INPUT_INVALID/,
      );
    });
  });
});

describe('runStartupCleanup', () => {
  it('resolves before the readiness signal and clears pre-existing expired rows', async () => {
    await withTempEphemeralDatabase(async ({ handle, registry }) => {
      const store = createEphemeralStore({ handle, registry });
      store.putEphemeral('JOB_CONTENT', {
        jobId: 'stale',
        organizationRef: 'org',
        payload: 'old question',
        createdAt: at(-25 * 60 * MINUTE),
      });
      store.putEphemeral('JOB_CONTENT', {
        jobId: 'fresh',
        organizationRef: 'org',
        payload: 'new question',
        createdAt: at(-MINUTE),
      });

      const order: string[] = [];
      const report = await runStartupCleanup(handle, NOW).then((value) => {
        order.push('cleanup');
        return value;
      });
      order.push('ready');

      expect(order).toEqual(['cleanup', 'ready']);
      expect(report.tables.find((t) => t.table === 'ephemeral_job_content')?.contentExpired).toBe(1);
      expect(store.getEphemeral('JOB_CONTENT', 'stale', NOW)).toEqual({ status: 'EXPIRED' });
      expect(store.getEphemeral('JOB_CONTENT', 'fresh', NOW).status).toBe('PRESENT');
    });
  });

  it('rejects an invalid now', async () => {
    await withTempEphemeralDatabase(async ({ handle }) => {
      await expect(runStartupCleanup(handle, new Date('nope'))).rejects.toThrowError(
        /EPHEMERAL_INPUT_INVALID/,
      );
    });
  });
});

describe('the public module surface', () => {
  it('exports no raw handle accessor and no export/support read path', async () => {
    const surface = await import('../../src/ephemeral/index.js');
    const names = Object.keys(surface).sort();

    expect(names).not.toContain('internalSqlite');
    expect(names).toEqual([
      'DEFAULT_EPHEMERAL_FILE_NAME',
      'DEFAULT_SWEEP_INTERVAL_MS',
      'CREATION_CEILING_MS',
      'EPHEMERAL_COLUMNS',
      'EPHEMERAL_FILE_GLOBS',
      'EPHEMERAL_KINDS',
      'EPHEMERAL_TABLES',
      'EPHEMERAL_TABLE_NAMES',
      'EphemeralError',
      'TERMINAL_RETENTION_MS',
      'TOMBSTONE_RETENTION_MS',
      'assertNoAttach',
      'assertNoAttachedDatabases',
      'assertNotBackedUp',
      'assertValidDate',
      'computeExpiresAt',
      'createEphemeralStore',
      'defaultEphemeralPath',
      'ensureEphemeralSchema',
      'expiryCutoffs',
      'hasExpired',
      'isEphemeralKind',
      'matchesEphemeralFile',
      'openEphemeralDatabase',
      'runStartupCleanup',
      'startEphemeralSweeper',
      'sweepExpired',
      'systemClock',
      'tableForKind',
    ].sort());

    // PRD §10.4: no export path and no support-tool read path.
    for (const name of names) {
      expect(name).not.toMatch(/list|all|export|dump|scan|bulk/i);
    }
  });

  it('starts no timer on import', async () => {
    vi.resetModules();
    const spy = vi.spyOn(globalThis, 'setInterval');
    try {
      await import('../../src/ephemeral/index.js');
      expect(spy).not.toHaveBeenCalled();
    } finally {
      spy.mockRestore();
      vi.resetModules();
    }
  });
});
