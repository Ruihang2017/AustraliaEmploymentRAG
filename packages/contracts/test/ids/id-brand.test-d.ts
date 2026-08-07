/**
 * FND-03 acceptance item 7 — the type-level assertions (branded ids, and the two colliding enum
 * families staying separate named types).
 *
 * HOW THIS RUNS: by `tsc`, through `pnpm typecheck`. This file is named in
 * packages/contracts/tsconfig.json's `include`, so a violation is a compile error in the standing
 * gate, not a silently skipped test.
 *
 * WHY NOT `vitest run --typecheck`: with this repository's pinned toolchain (vitest 4.1.10 +
 * typescript 6.0.3) vitest's experimental type-testing mode reports NO diagnostics at all — verified
 * by adding `const blatant: number = 'not a number';` to this file and watching the run print
 * "Type Errors  no errors" and exit 0. A green type test that cannot go red is worse than no type
 * test, so the assertions live where a compiler actually reads them. `expectTypeOf` is still used:
 * its assertions are enforced by the type system, so `tsc` alone makes them meaningful.
 *
 * Both assertion styles are deliberate. `expectTypeOf` states the relationship positively;
 * `@ts-expect-error` fails the build if the assignment ever STARTS compiling — i.e. it catches a
 * brand that was accidentally erased, which is the actual regression to defend against. Each
 * directive carries a description because `@typescript-eslint/ban-ts-comment` requires one.
 */
import { expectTypeOf } from 'vitest';

import type { AnswerStatus, CoverageCandidateStatus } from '../../src/enums/index.js';
import type { Id } from '../../src/ids/index.js';
import { newId } from '../../src/ids/index.js';

// --- branded ids -------------------------------------------------------------------------------

expectTypeOf<Id<'ans'>>().not.toEqualTypeOf<Id<'rec'>>();
expectTypeOf<Id<'ans'>>().toExtend<string>();
expectTypeOf(newId('ans')).toEqualTypeOf<Id<'ans'>>();

// @ts-expect-error an Id<'ans'> must not be assignable to an Id<'rec'> (FND-03 deliverable 4)
export const wrongKind: Id<'rec'> = newId('ans');

// @ts-expect-error a bare string must not be assignable to a branded id either
export const notMinted: Id<'ans'> = 'ans_01997e3a-1c40-7c8f-8b2d-0123456789ab';

// --- colliding enum families (sub-PRD decision D6a) ---------------------------------------------

// The shared LITERAL is necessarily the same literal type in both unions; what must stay distinct is
// the two families as wholes.
expectTypeOf<AnswerStatus>().not.toEqualTypeOf<CoverageCandidateStatus>();

// @ts-expect-error AnswerStatus as a whole is not assignable to CoverageCandidateStatus
export const asCoverage: CoverageCandidateStatus = 'SUPPORTED' as AnswerStatus;

// @ts-expect-error CoverageCandidateStatus as a whole is not assignable to AnswerStatus
export const asAnswer: AnswerStatus = 'LIKELY' as CoverageCandidateStatus;
