/**
 * EVID-01 deliverable 4 — a result with no third state.
 *
 * `PiiAdmissionResult` is a two-variant union: `ACCEPT` carries the sanitized payload, `REJECT`
 * carries none. There is no `ACCEPT_WITH_BLOCKING_FINDINGS`, no `warnings` variant and no optional
 * payload on the reject branch — PRD §10.1 (*"Customers MUST NOT bypass a positive employee-PII
 * finding"*) is expressed as the shape of the type, not as a rule some call site must remember.
 * `test/contract/result-invariant.property.test.ts` asserts the invariant over generated finding
 * sets.
 *
 * `SanitizedPayload` carries a phantom brand (the same device as `packages/contracts`' `Id`). The
 * brand symbol is `declare const` — it exists only in the type system and has no runtime value — and
 * it is not exported, so no module outside this file can write an object literal that satisfies the
 * type. A caller therefore cannot forward an unadmitted payload to a provider by structural typing;
 * `test/contract/types.test-d.ts` asserts that a structurally identical literal is rejected.
 */
import { deepFreeze } from './freeze.js';
import type { PiiFinding } from './finding.js';

declare const sanitizedBrand: unique symbol;

export interface SanitizedField {
  readonly field: string;
  readonly value: string;
}

/**
 * One replacement applied on the ACCEPT path, in **pre-sanitisation NFC offsets**, so a caller can
 * map a position back without holding the original text (deliverable 9, *"offset-stable"*).
 */
export interface SanitizationTransformation {
  readonly field: string;
  readonly start: number;
  readonly end: number;
  readonly replacementLength: number;
}

export type SanitizedPayload = {
  readonly fields: readonly SanitizedField[];
  readonly transformations: readonly SanitizationTransformation[];
  readonly [sanitizedBrand]: 'pii-admitted';
};

export type PiiAdmissionResult =
  | {
      readonly decision: 'ACCEPT';
      readonly sanitizedPayload: SanitizedPayload;
      readonly findings: readonly PiiFinding[];
    }
  | {
      readonly decision: 'REJECT';
      readonly findings: readonly PiiFinding[];
    };

/**
 * The ONE mint of a `SanitizedPayload`, package-internal by convention and unreachable in practice:
 * it is not re-exported from `src/contract/index.ts`, and it is called from exactly one place —
 * `src/deterministic/sanitize.ts`, on the ACCEPT path only.
 *
 * The cast is unavoidable (the brand has no runtime representation) and is the reason this function
 * exists at all: it is the single auditable place where "this text has been through admission"
 * becomes a type, instead of a cast scattered across the module.
 */
export function mintSanitizedPayload(
  fields: readonly SanitizedField[],
  transformations: readonly SanitizationTransformation[],
): SanitizedPayload {
  return deepFreeze({ fields, transformations }) as unknown as SanitizedPayload;
}

/** Whether any finding forces a `REJECT` (PRD §10.1). The only definition of "blocking" in the module. */
export function hasBlockingFinding(findings: readonly PiiFinding[]): boolean {
  return findings.some((finding) => finding.severity === 'BLOCKING');
}
