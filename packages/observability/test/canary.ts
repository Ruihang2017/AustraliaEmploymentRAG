/**
 * The reusable canary harness — RUNT-07 Deliverable 11.
 *
 * FRAMEWORK-AGNOSTIC ON PURPOSE. This module imports no test framework, so `RUNT-01`, `RUNT-02`,
 * `RUNT-04`, `RUNT-08` and every product module can run the IDENTICAL assertion against their own
 * call sites under whatever runner they use. The ticket's Deliverable 11 asks for exactly that.
 *
 * WHAT IT PROVES. A `secret-canary-<uuid>` string is placed into every position a caller could
 * plausibly put research text — the event code, a field value, an `Error` object, `Error.stack`, a
 * nested object, an array element, a metric label, a `child()` binding and a correlation id — and
 * the harness asserts the string appears in NO emitted byte.
 *
 * A THROWN CALL IS A PASS, NOT AN ERROR. If the logger or registry rejects the hostile input, the
 * canary never reached output, which is the property under test. The harness therefore swallows the
 * exception but RECORDS the probe in `threw`, so "the logger threw" can never be silently mistaken
 * for "the canary leaked" — or for "the probe ran".
 */

/** Every position a caller could try to smuggle content through. */
export type CanaryProbe =
  | 'event'
  | 'field_value'
  | 'error_object'
  | 'error_stack'
  | 'nested_object'
  | 'array_element'
  | 'metric_label'
  | 'child_binding'
  | 'correlation_id';

export const CANARY_PROBES: readonly CanaryProbe[] = Object.freeze([
  'event',
  'field_value',
  'error_object',
  'error_stack',
  'nested_object',
  'array_element',
  'metric_label',
  'child_binding',
  'correlation_id',
]);

export interface CanaryHarnessOptions {
  /** Drives the caller's own call sites with `canary` placed in the position `probe` names. */
  readonly exercise: (canary: string, probe: CanaryProbe) => void;
  /** Every byte the system under test has emitted since the previous probe. */
  readonly emitted: () => string;
  /** Optional subset of {@link CANARY_PROBES}. */
  readonly probes?: readonly CanaryProbe[];
}

export interface CanaryReport {
  /** Probes whose canary appeared in emitted output. EMPTY is the passing result. */
  readonly leaking: readonly CanaryProbe[];
  /** Probes whose `exercise` threw. Informational: a rejected call is a pass. */
  readonly threw: readonly CanaryProbe[];
  /** Probes that ran. */
  readonly ran: readonly CanaryProbe[];
}

/** A fresh canary. `globalThis.crypto` is a stable global in Node 19+ and needs no dependency. */
export function newCanary(): string {
  const webCrypto = (globalThis as unknown as { crypto: { randomUUID: () => string } }).crypto;
  return `secret-canary-${webCrypto.randomUUID()}`;
}

/** Runs every probe and reports which of them leaked. `leaking: []` is the assertion consumers make. */
export function runCanaryProbes(options: CanaryHarnessOptions): CanaryReport {
  const probes = options.probes ?? CANARY_PROBES;
  const leaking: CanaryProbe[] = [];
  const threw: CanaryProbe[] = [];
  const ran: CanaryProbe[] = [];

  for (const probe of probes) {
    const canary = newCanary();
    ran.push(probe);
    try {
      options.exercise(canary, probe);
    } catch {
      threw.push(probe);
    }
    if (options.emitted().includes(canary)) leaking.push(probe);
  }

  return { leaking, threw, ran };
}
