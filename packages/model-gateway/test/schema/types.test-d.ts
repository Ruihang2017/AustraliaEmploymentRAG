/**
 * EVID-07 — the type-level assertions for the schema leaf.
 *
 * HOW THIS RUNS: by `tsc`, through `pnpm typecheck`. This file is named in
 * `packages/model-gateway/tsconfig.json`'s `include`, so a violation is a compile error in the
 * standing gate rather than a silently skipped test.
 *
 * WHY NOT `vitest run --typecheck`: with this repository's pinned toolchain (vitest 4.1.10 +
 * typescript 6.0.3) vitest's experimental type-testing mode reports NO diagnostics at all — the
 * finding `packages/contracts/test/ids/id-brand.test-d.ts` records after verifying it with a blatant
 * error, and `packages/pii/test/contract/types.test-d.ts` follows. A green type test that cannot go
 * red is worse than no type test.
 *
 * `@ts-expect-error` is the right tool here because every assertion is about something that must NOT
 * exist: the directive fails the build if the line ever STARTS compiling. Each carries a description
 * because `@typescript-eslint/ban-ts-comment` requires one.
 *
 * NEGATIVE CONTROL (ticket test-plan step 7 / plan §5): adding `reasoning?: string` to
 * `ProviderRequestPayload` on a scratch branch turns the request block below into a wall of
 * "unused '@ts-expect-error' directive" errors and `pnpm typecheck` fails. Run and discarded.
 */
import { expectTypeOf } from 'vitest';

import type { ProviderRequestPayload } from '../../src/schema/request.js';
import { buildProviderRequest } from '../../src/schema/request.js';
import type { SanitizedPayload, SanitizedTaskFacts } from '../../src/schema/sanitized.js';
import type { EvidencePackInput } from '../../src/schema/pack.js';
import type { ModelResponse, SchemaResult } from '../../src/schema/response.js';
import type { ClaimKind } from '../../src/schema/kinds.js';
import { MODEL_PROFILE_REGISTRY_V1 } from '../../src/profiles/registry.js';

// --- acceptance item: no reasoning field is REQUESTED (PRD §9.4, sub-PRD D14) -------------------

declare const payload: ProviderRequestPayload;

// @ts-expect-error ProviderRequestPayload must not be able to express `reasoning`
export const wantsReasoning: unknown = payload.reasoning;

// @ts-expect-error ProviderRequestPayload must not be able to express `thinking`
export const wantsThinking: unknown = payload.thinking;

// @ts-expect-error ProviderRequestPayload must not be able to express `chainOfThought`
export const wantsChainOfThought: unknown = payload.chainOfThought;

// @ts-expect-error ProviderRequestPayload must not be able to express `chain_of_thought`
export const wantsChainOfThoughtSnake: unknown = payload.chain_of_thought;

// @ts-expect-error ProviderRequestPayload must not be able to express `scratchpad`
export const wantsScratchpad: unknown = payload.scratchpad;

// @ts-expect-error ProviderRequestPayload must not be able to express `analysis`
export const wantsAnalysis: unknown = payload.analysis;

// --- acceptance item: no tool surface in the request type (PRD §37.5) ---------------------------

// @ts-expect-error the request carries no tool definition
export const wantsTools: unknown = payload.tools;

// @ts-expect-error the request carries no function schema
export const wantsFunctions: unknown = payload.functions;

// @ts-expect-error the request carries no URL
export const wantsUrl: unknown = payload.url;

// @ts-expect-error the request carries no base URL configuration
export const wantsBaseUrl: unknown = payload.baseUrl;

// @ts-expect-error the request carries no credential
export const wantsApiKey: unknown = payload.apiKey;

// @ts-expect-error the request carries no headers a caller could stuff a credential into
export const wantsHeaders: unknown = payload.headers;

// @ts-expect-error the request carries no tenant object (PRD §21.2 — persistence is TenantContext's)
export const wantsTenant: unknown = payload.tenant;

// --- acceptance item: sanitized facts only (PRD §37.5, §18.5 step 1) ----------------------------

declare const pack: EvidencePackInput;
const profile = MODEL_PROFILE_REGISTRY_V1.QUICK_SYNTHESIS;
const ids = { requestId: 'rq_1', jobId: 'jb_1' };

// @ts-expect-error a plain string is not a SanitizedTaskFacts
const rawStringFacts: SanitizedTaskFacts = 'the customer typed this';
export const rawString = buildProviderRequest(profile, rawStringFacts, pack, ids);

// @ts-expect-error a structurally identical literal cannot satisfy the EVID-01 brand
const forgedFacts: SanitizedTaskFacts = { payload: { fields: [{ field: 'q', value: 'v' }], transformations: [] } };
export const forgedPayload = buildProviderRequest(profile, forgedFacts, pack, ids);

// @ts-expect-error SanitizedTaskFacts has no raw-text escape hatch
export const withRawText: SanitizedTaskFacts = { payload: {} as SanitizedPayload, rawText: 'x' };

// The positive direction: a genuinely branded payload is accepted.
declare const admitted: SanitizedPayload;
export const accepted: ProviderRequestPayload = buildProviderRequest(profile, { payload: admitted }, pack, ids);

// --- the response type is the §36.5 shape and nothing wider ------------------------------------

expectTypeOf<ModelResponse['claims'][number]['kind']>().toEqualTypeOf<ClaimKind>();
expectTypeOf<SchemaResult['ok']>().toEqualTypeOf<boolean>();

declare const response: ModelResponse;

// @ts-expect-error ModelResponse must not be able to express `reasoning`
export const responseReasoning: unknown = response.reasoning;

// @ts-expect-error a ModelResponse is readonly — nothing repairs one in place
response.proposed_status = 'SUPPORTED';

// --- the evidence pack is a read-only port: nothing here can build or alter one -----------------

// @ts-expect-error the pack is readonly; this package carries it and never edits it
pack.items = [];

// @ts-expect-error the pack port has no member for pre-rendered prompt text (EVID-04 refuses it)
export const prerendered: unknown = pack.promptText;
