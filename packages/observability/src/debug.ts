/**
 * Debug and crash-dump policy — RUNT-07 Deliverable 9.
 *
 * PRD §22, last bullet: "Full-content debug logs and crash dumps are disabled by default."
 * PRD §39.6: production startup validates configuration and refuses what it must not run with.
 *
 * Both flags therefore default to `false`, and enabling either under `profile: 'production'` throws
 * at STARTUP — before anything can be logged. A runtime check at each log call would be too late:
 * the point of failure is the process that started with the wrong configuration, not the first
 * record it wrote.
 *
 * WHAT "FULL-CONTENT DEBUG LOGS" MEANS HERE. This package has no code path that emits content: the
 * allowlist in `src/fields.ts` has no free-text kind, so the flag cannot switch one on. It exists so
 * that a CONSUMER (a provider adapter that wants to dump a prompt, a retrieval debugger) has one
 * named, production-refused switch to gate itself on, instead of inventing a private environment
 * variable that nothing audits.
 *
 * This package registers NO `process.on('uncaughtException' | 'unhandledRejection')` handler. A
 * library that installs a global handler steals the application's crash semantics.
 */
import { DebugNotPermittedError } from './errors.js';
import type { RuntimeProfile } from './vocabulary.js';

export interface DebugConfig {
  /** Permits a consumer to emit full-content diagnostics. Never true under `production`. */
  readonly fullContentDebugLogs: boolean;
  /** Permits Node diagnostic reports / core dumps. Never true under `production`. */
  readonly crashDumps: boolean;
}

/** Both off. PRD §22: "disabled by default". */
export const DEBUG_DEFAULTS: DebugConfig = Object.freeze({
  fullContentDebugLogs: false,
  crashDumps: false,
});

export interface DebugConfigInput extends Partial<DebugConfig> {
  readonly profile: RuntimeProfile;
}

/**
 * Resolves the effective debug configuration.
 *
 * @throws DebugNotPermittedError  either flag is enabled while `profile` is `'production'`.
 */
export function resolveDebugConfig(input: DebugConfigInput): DebugConfig {
  const resolved: DebugConfig = {
    fullContentDebugLogs: input.fullContentDebugLogs ?? DEBUG_DEFAULTS.fullContentDebugLogs,
    crashDumps: input.crashDumps ?? DEBUG_DEFAULTS.crashDumps,
  };
  if (input.profile === 'production') {
    if (resolved.fullContentDebugLogs) {
      throw new DebugNotPermittedError(
        'fullContentDebugLogs cannot be enabled under profile "production" (PRD §22, §39.6)',
      );
    }
    if (resolved.crashDumps) {
      throw new DebugNotPermittedError(
        'crashDumps cannot be enabled under profile "production" (PRD §22, §39.6)',
      );
    }
  }
  return Object.freeze(resolved);
}

/**
 * Node's diagnostic-report flags, as the composition root reads them from `process.report`.
 *
 * Typed structurally rather than imported so this module stays dependency-free and testable without
 * mutating real process state.
 */
export interface NodeDiagnosticReportFlags {
  readonly reportOnFatalError?: boolean;
  readonly reportOnSignal?: boolean;
  readonly reportOnUncaughtException?: boolean;
}

/**
 * A concrete, dependency-free mechanism behind "crash dumps disabled by default": a Node diagnostic
 * report written on a fatal error or an uncaught exception contains the heap-adjacent state that
 * PRD §22 forbids in logs.
 *
 * @throws DebugNotPermittedError  any report flag is on while `profile` is `'production'`.
 */
export function assertCrashDumpsDisabled(
  profile: RuntimeProfile,
  report: NodeDiagnosticReportFlags,
): void {
  if (profile !== 'production') return;
  const enabled: string[] = [];
  if (report.reportOnFatalError === true) enabled.push('reportOnFatalError');
  if (report.reportOnSignal === true) enabled.push('reportOnSignal');
  if (report.reportOnUncaughtException === true) enabled.push('reportOnUncaughtException');
  if (enabled.length > 0) {
    throw new DebugNotPermittedError(
      `Node diagnostic reports are enabled under profile "production": ${enabled.join(', ')} (PRD §22)`,
    );
  }
}
