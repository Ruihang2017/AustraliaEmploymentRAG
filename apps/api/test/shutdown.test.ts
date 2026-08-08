/**
 * Graceful shutdown, unit-tested with injected fakes so it runs on every operating system.
 *
 * The real-signal case is `test/server-process.test.ts`; the properties below (idempotency, the
 * bounded drain, the `unref`'d timer) are the ones that actually break in production and must not
 * depend on a POSIX-only harness to be covered.
 */
import { setTimeout } from 'node:timers';
import { describe, expect, it } from 'vitest';

import type { UnrefableTimer } from '../src/bootstrap/shutdown.js';
import { installShutdown } from '../src/bootstrap/shutdown.js';

interface Harness {
  readonly exits: number[];
  readonly signals: Map<string, () => void>;
  readonly timers: { fn: () => void; ms: number; unreffed: boolean; cleared: boolean }[];
}

function harness(): Harness & { options: Parameters<typeof installShutdown>[1] } {
  const exits: number[] = [];
  const signals = new Map<string, () => void>();
  const timers: Harness['timers'] = [];
  return {
    exits,
    signals,
    timers,
    options: {
      timeoutMs: 1000,
      exit: (code) => {
        exits.push(code);
      },
      onSignal: (signal, listener) => {
        signals.set(signal, listener);
      },
      setTimer: (fn, ms) => {
        const record = { fn, ms, unreffed: false, cleared: false };
        timers.push(record);
        const timer: UnrefableTimer = {
          unref: () => {
            record.unreffed = true;
            return timer;
          },
        };
        return timer;
      },
      clearTimer: () => {
        const last = timers[timers.length - 1];
        if (last) last.cleared = true;
      },
    },
  };
}

describe('installShutdown', () => {
  it('drains and exits 0 on SIGTERM', async () => {
    const h = harness();
    let closed = 0;
    const handle = installShutdown({ close: async () => void closed++ }, h.options);

    expect([...h.signals.keys()]).toEqual(['SIGTERM', 'SIGINT']);
    await handle.shutdown('SIGTERM');

    expect(closed).toBe(1);
    expect(h.exits).toEqual([0]);
    expect(h.timers[0]?.cleared).toBe(true);
  });

  it('unrefs the force-exit timer, so a clean drain does not idle to the full timeout', async () => {
    const h = harness();
    const handle = installShutdown({ close: async () => {} }, h.options);
    await handle.shutdown('SIGTERM');
    expect(h.timers[0]?.unreffed).toBe(true);
    expect(h.timers[0]?.ms).toBe(1000);
  });

  it('is idempotent under a second SIGTERM and under SIGINT arriving alongside it', async () => {
    const h = harness();
    let closed = 0;
    const handle = installShutdown({ close: async () => void closed++ }, h.options);

    await Promise.all([
      handle.shutdown('SIGTERM'),
      handle.shutdown('SIGTERM'),
      handle.shutdown('SIGINT'),
    ]);
    await handle.shutdown('SIGTERM');

    expect(closed).toBe(1);
    expect(h.exits).toEqual([0]);
    expect(handle.started()).toBe(true);
  });

  it('does not double-close when both registered signal listeners fire', async () => {
    const h = harness();
    let closed = 0;
    installShutdown(
      {
        close: async () => {
          closed++;
        },
      },
      h.options,
    );
    h.signals.get('SIGTERM')?.();
    h.signals.get('SIGINT')?.();
    await new Promise<void>((resolve) => {
      setTimeout(() => resolve(), 10);
    });
    expect(closed).toBe(1);
    expect(h.exits).toEqual([0]);
  });

  it('force-exits non-zero when the drain exceeds the timeout', async () => {
    const h = harness();
    let release: (() => void) | undefined;
    const handle = installShutdown(
      { close: () => new Promise<void>((resolve) => (release = resolve)) },
      h.options,
    );
    const pending = handle.shutdown('SIGTERM');

    // The drain has not finished: fire the deadline the way the real timer would.
    h.timers[0]?.fn();
    expect(h.exits).toEqual([1]);

    release?.();
    await pending;
  });

  it('exits non-zero when close() throws', async () => {
    const h = harness();
    const handle = installShutdown(
      {
        close: async () => {
          throw new Error('socket stuck');
        },
      },
      h.options,
    );
    await handle.shutdown('SIGTERM');
    expect(h.exits).toEqual([1]);
    expect(h.timers[0]?.cleared).toBe(true);
  });

  it('reports the drain to the injected logger', async () => {
    const h = harness();
    const lines: string[] = [];
    const handle = installShutdown(
      { close: async () => {} },
      {
        ...h.options,
        logger: {
          info: (_details, message) => void lines.push(`info:${message}`),
          error: (_details, message) => void lines.push(`error:${message}`),
        },
      },
    );
    await handle.shutdown('SIGTERM');
    expect(lines).toEqual(['info:draining in-flight requests', 'info:drained cleanly']);
  });
});
