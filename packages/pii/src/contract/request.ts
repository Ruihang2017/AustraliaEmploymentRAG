/**
 * EVID-01 deliverable 1 — the admission request type.
 *
 * Closed and readonly: exactly two kinds of member, no index signature, no `unknown` passthrough.
 *
 * THE ABSENCES ARE THE FEATURE. There is no `override`, `force`, `acknowledge`, `ignoreWarnings`,
 * `bypass`, `skipPii`, `trustedClient` or `clientHints` member, and no role/permission parameter,
 * because PRD §10.1 says *"Customers MUST NOT bypass a positive employee-PII finding"* and sub-PRD
 * D2 makes that a type-level property rather than a runtime check that some caller could forget.
 * `test/contract/types.test-d.ts` asserts each of those names fails to compile, enforced by `tsc`
 * through `pnpm typecheck`.
 *
 * CLIENT HINTS ARE NOT AN INPUT AT ALL. PRD §37.2 lists *"browser hints (not trusted)"* as the step
 * BEFORE the server pipeline, and sub-PRD D1 recomputes everything server-side. A hint that entered
 * here would be an attacker-controlled input to a security boundary.
 *
 * THE STRUCTURED CHANNEL IS THE ONLY PUBLIC-ENTITY EXCEPTION. PRD §37.2: *"Public-entity exceptions
 * must come from structured `employer`, `abn` or `public_case_party` fields, not a generic 'ignore
 * warning' button"* (sub-PRD D4). Those three values are still scanned — failing closed — but they
 * are the only channel the public-entity allow rules may consider.
 */

export interface FreeTextField {
  /**
   * Names the field a finding points at (PRD §37.2 *"Detection response includes field…"*).
   *
   * `src/deterministic/limits.ts` rejects, before any scanning: a name matching `structured.`,
   * a duplicate name, an empty name, a name longer than `maxFieldNameChars`, and any name outside
   * `/^[A-Za-z][A-Za-z0-9_]*$/`. The `structured.` rule closes the one structural bypass this design
   * could have had — a free-text field named `structured.abn` would otherwise be cleared by the
   * public-entity allow rule that exists for the reserved channel.
   */
  readonly field: string;
  readonly value: string;
}

export interface StructuredChannels {
  readonly employer?: string;
  readonly abn?: string;
  readonly publicCaseParty?: string;
}

export interface PiiAdmissionRequest {
  readonly freeText: readonly FreeTextField[];
  readonly structured?: StructuredChannels;
}

/** The reserved field names the three structured channels are scanned under. */
export const STRUCTURED_FIELD_NAMES = {
  employer: 'structured.employer',
  abn: 'structured.abn',
  publicCaseParty: 'structured.publicCaseParty',
} as const;

export type StructuredFieldName = (typeof STRUCTURED_FIELD_NAMES)[keyof typeof STRUCTURED_FIELD_NAMES];

/** Whether `field` is one of the three reserved structured channel names. */
export function isStructuredFieldName(field: string): field is StructuredFieldName {
  return (Object.values(STRUCTURED_FIELD_NAMES) as readonly string[]).includes(field);
}

/**
 * Every field that is scanned, in a fixed order: the `freeText` entries in request order, then the
 * present structured channels in `employer`, `abn`, `publicCaseParty` order.
 *
 * One function, used by the limits stage, the detector stage and the sanitiser, so "which fields are
 * scanned" has exactly one answer and a channel cannot be forgotten by one of the three.
 */
export function scannedFields(request: PiiAdmissionRequest): readonly FreeTextField[] {
  const fields: FreeTextField[] = request.freeText.map((entry) => ({
    field: entry.field,
    value: entry.value,
  }));
  const structured = request.structured;
  if (structured) {
    if (structured.employer !== undefined) {
      fields.push({ field: STRUCTURED_FIELD_NAMES.employer, value: structured.employer });
    }
    if (structured.abn !== undefined) {
      fields.push({ field: STRUCTURED_FIELD_NAMES.abn, value: structured.abn });
    }
    if (structured.publicCaseParty !== undefined) {
      fields.push({
        field: STRUCTURED_FIELD_NAMES.publicCaseParty,
        value: structured.publicCaseParty,
      });
    }
  }
  return fields;
}
