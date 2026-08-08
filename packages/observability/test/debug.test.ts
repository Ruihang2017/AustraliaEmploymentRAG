/**
 * RUNT-07 acceptance item 10 — "Full-content debug logging and crash dumps are off by default, and
 * enabling them under `profile: 'production'` throws at startup" (PRD §22; PRD §39.6).
 */
import { describe, expect, it } from 'vitest';

import { DEBUG_DEFAULTS, assertCrashDumpsDisabled, resolveDebugConfig } from '../src/debug.js';
import { DebugNotPermittedError } from '../src/errors.js';

describe('debug and crash-dump policy', () => {
  it('defaults both switches to off', () => {
    expect(DEBUG_DEFAULTS).toEqual({ fullContentDebugLogs: false, crashDumps: false });
    for (const profile of ['development', 'test', 'production'] as const) {
      expect(resolveDebugConfig({ profile })).toEqual({
        fullContentDebugLogs: false,
        crashDumps: false,
      });
    }
  });

  it('throws at startup when either switch is enabled under production', () => {
    expect(() =>
      resolveDebugConfig({ profile: 'production', fullContentDebugLogs: true }),
    ).toThrow(DebugNotPermittedError);
    expect(() => resolveDebugConfig({ profile: 'production', crashDumps: true })).toThrow(
      DebugNotPermittedError,
    );
  });

  it('allows both under development and test', () => {
    for (const profile of ['development', 'test'] as const) {
      expect(
        resolveDebugConfig({ profile, fullContentDebugLogs: true, crashDumps: true }),
      ).toEqual({ fullContentDebugLogs: true, crashDumps: true });
    }
  });

  it('returns a frozen config, so a later caller cannot flip a switch back on', () => {
    const config = resolveDebugConfig({ profile: 'production' });
    expect(Object.isFrozen(config)).toBe(true);
  });

  it('refuses Node diagnostic reports under production', () => {
    for (const flag of [
      'reportOnFatalError',
      'reportOnSignal',
      'reportOnUncaughtException',
    ] as const) {
      expect(() => assertCrashDumpsDisabled('production', { [flag]: true })).toThrow(
        DebugNotPermittedError,
      );
      expect(() => assertCrashDumpsDisabled('development', { [flag]: true })).not.toThrow();
    }
    expect(() => assertCrashDumpsDisabled('production', {})).not.toThrow();
    expect(() =>
      assertCrashDumpsDisabled('production', { reportOnFatalError: false }),
    ).not.toThrow();
  });
});
