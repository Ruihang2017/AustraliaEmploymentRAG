/**
 * EVID-01 acceptance items 1, 2 and half of 3 — the type-level assertions.
 *
 * HOW THIS RUNS: by `tsc`, through `pnpm typecheck`. This file is named in
 * `packages/pii/tsconfig.json`'s `include`, so a violation is a compile error in the standing gate,
 * not a silently skipped test.
 *
 * WHY NOT `vitest run --typecheck`: with this repository's pinned toolchain (vitest 4.1.10 +
 * typescript 6.0.3) vitest's experimental type-testing mode reports NO diagnostics at all — the
 * finding `packages/contracts/test/ids/id-brand.test-d.ts` records after verifying it with a blatant
 * error. A green type test that cannot go red is worse than no type test, so the assertions live
 * where a compiler actually reads them. `expectTypeOf` is still used: its assertions are enforced by
 * the type system, so `tsc` alone makes them meaningful.
 *
 * Both styles are deliberate. `expectTypeOf` states the relationship positively; `@ts-expect-error`
 * fails the build if an assignment ever STARTS compiling — which is exactly the regression to defend
 * against here, because every assertion below is about something that must NOT exist. Each directive
 * carries a description because `@typescript-eslint/ban-ts-comment` requires one.
 *
 * THE NEGATIVE CONTROL (ticket test-plan step 4) was run: adding `override?: boolean` to
 * `PiiAdmissionRequest` on a scratch branch turns every `@ts-expect-error` in the bypass block into
 * an "unused '@ts-expect-error' directive" error, so `pnpm typecheck` fails. Discarded afterwards.
 */
import { expectTypeOf } from 'vitest';

import type { PiiAdmissionRequest } from '../../src/contract/request.js';
import type { PiiFinding } from '../../src/contract/finding.js';
import type { PiiAdmissionResult, SanitizedPayload } from '../../src/contract/result.js';
import type { PiiMetricsEvent, PiiMetricsSink } from '../../src/contract/metrics.js';
import type { PiiStages } from '../../src/contract/pipeline.js';
import { admit } from '../../src/contract/pipeline.js';
import { emitAdmissionMetrics } from '../../src/contract/metrics.js';
import type { Id } from '../../../contracts/src/ids/index.js';

// --- acceptance item 1: no bypass exists as a type (PRD §10.1, sub-PRD D2) ----------------------

// @ts-expect-error PiiAdmissionRequest must not be able to express `override`
export const withOverride: PiiAdmissionRequest = { freeText: [], override: true };

// @ts-expect-error PiiAdmissionRequest must not be able to express `force`
export const withForce: PiiAdmissionRequest = { freeText: [], force: true };

// @ts-expect-error PiiAdmissionRequest must not be able to express `acknowledge`
export const withAcknowledge: PiiAdmissionRequest = { freeText: [], acknowledge: true };

// @ts-expect-error PiiAdmissionRequest must not be able to express `ignoreWarnings`
export const withIgnoreWarnings: PiiAdmissionRequest = { freeText: [], ignoreWarnings: true };

// @ts-expect-error PiiAdmissionRequest must not be able to express `bypass`
export const withBypass: PiiAdmissionRequest = { freeText: [], bypass: true };

// @ts-expect-error PiiAdmissionRequest must not be able to express `skipPii`
export const withSkipPii: PiiAdmissionRequest = { freeText: [], skipPii: true };

// @ts-expect-error PiiAdmissionRequest must not be able to express `trustedClient`
export const withTrustedClient: PiiAdmissionRequest = { freeText: [], trustedClient: true };

// @ts-expect-error client hints are PRD §37.2's untrusted input and are not an input to this module
export const withClientHints: PiiAdmissionRequest = { freeText: [], clientHints: [] };

// @ts-expect-error no role/permission parameter may reach the boundary
export const withRole: PiiAdmissionRequest = { freeText: [], role: 'OWNER' };

/** `admit` takes exactly (request, stages) — a third, stage-skipping parameter would break this. */
expectTypeOf<Parameters<typeof admit>>().toEqualTypeOf<[PiiAdmissionRequest, PiiStages]>();
expectTypeOf<ReturnType<typeof admit>>().toEqualTypeOf<PiiAdmissionResult>();

/** The request's members are exactly these two. */
expectTypeOf<keyof PiiAdmissionRequest>().toEqualTypeOf<'freeText' | 'structured'>();

/** …and the structured channel carries exactly the three PRD §37.2 names. */
expectTypeOf<keyof NonNullable<PiiAdmissionRequest['structured']>>().toEqualTypeOf<
  'employer' | 'abn' | 'publicCaseParty'
>();

// --- acceptance item 2: a finding cannot carry a value (PRD §37.2, sub-PRD D3) ------------------

/**
 * The exhaustive form. It catches a value-carrying member nobody thought to forbid, which the
 * individual assertions below cannot.
 */
expectTypeOf<keyof PiiFinding>().toEqualTypeOf<
  'field' | 'start' | 'end' | 'category' | 'severity' | 'suggestedPlaceholder'
>();

const FINDING_BASE = {
  field: 'question',
  start: 0,
  end: 1,
  category: 'TAX_FILE_NUMBER',
  severity: 'BLOCKING',
  suggestedPlaceholder: '[TFN REMOVED]',
} as const;

export const findingWithValue: PiiFinding = {
  ...FINDING_BASE,
  // @ts-expect-error a finding must not carry the detected value
  value: 'secret',
};

export const findingWithText: PiiFinding = {
  ...FINDING_BASE,
  // @ts-expect-error a finding must not carry the detected text
  text: 'secret',
};

export const findingWithMatch: PiiFinding = {
  ...FINDING_BASE,
  // @ts-expect-error a finding must not carry the matched text
  match: 'secret',
};

export const findingWithSample: PiiFinding = {
  ...FINDING_BASE,
  // @ts-expect-error a finding must not carry a sample of the value
  sample: 'sec',
};

export const findingWithHash: PiiFinding = {
  ...FINDING_BASE,
  // @ts-expect-error a finding must not carry a hash (PRD §37.2 "not ... reversible hash")
  hash: 'abc',
};

export const findingWithFingerprint: PiiFinding = {
  ...FINDING_BASE,
  // @ts-expect-error a finding must not carry a fingerprint of the value
  fingerprint: 'abc',
};

export const findingWithRedacted: PiiFinding = {
  ...FINDING_BASE,
  // @ts-expect-error a finding must not carry a redacted rendering of the value
  redactedValue: '***',
};

export const findingWithContext: PiiFinding = {
  ...FINDING_BASE,
  // @ts-expect-error a finding must not carry surrounding context text
  context: 'my tfn is ...',
};

// --- acceptance item 3: SanitizedPayload is constructible only inside this module ---------------

// @ts-expect-error a structurally identical literal must not satisfy the branded type
export const forgedPayload: SanitizedPayload = { fields: [], transformations: [] };

/** A REJECT variant carries no payload at all — `sanitizedPayload` is not a member of it. */
expectTypeOf<Extract<PiiAdmissionResult, { decision: 'REJECT' }>>().toEqualTypeOf<{
  readonly decision: 'REJECT';
  readonly findings: readonly PiiFinding[];
}>();

// --- deliverable 10: the metrics event is closed -----------------------------------------------

expectTypeOf<keyof PiiMetricsEvent>().toEqualTypeOf<
  'category' | 'count' | 'result' | 'requestId'
>();

const capturing: PiiMetricsSink = {
  record: (event: PiiMetricsEvent): void => {
    expectTypeOf(event.count).toEqualTypeOf<number>();
  },
};

capturing.record({
  category: 'TAX_FILE_NUMBER',
  count: 1,
  result: 'REJECT',
  requestId: 'req_x' as Id<'req'>,
  // @ts-expect-error the metrics event must not carry a free-form message
  message: 'my tfn is ...',
});

expectTypeOf<Parameters<typeof emitAdmissionMetrics>>().toEqualTypeOf<
  [PiiAdmissionResult, PiiMetricsSink, Id<'req'>]
>();
