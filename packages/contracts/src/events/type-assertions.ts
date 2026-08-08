/**
 * Compile-time proof that the generated event bindings and FND-03's canonical vocabulary are the same
 * types — not merely the same strings at runtime.
 *
 * No runtime test can assert this: a vitest case can compare two arrays, but only the compiler can
 * refuse a `change_type` union that has drifted from `ChangeType`. This file is hand-written, lives
 * under `src`, and is therefore covered by `pnpm typecheck` (the package tsconfig includes `src`).
 *
 * It deliberately does NOT live in a `*.test-d.ts` file: `packages/contracts/tsconfig.json` includes
 * only `src` plus one FND-03 file, and widening it is outside this ticket's file-scope.
 *
 * Everything exported here is a type alias, so nothing is emitted and `no-unused-vars` has nothing to
 * complain about. A drift makes `Expect<…>` fail to satisfy its `true` constraint and `pnpm typecheck`
 * goes red, naming the alias.
 */
import type { ChangeType } from '../enums/change-type.js';
import type { SseEventType } from '../enums/sse-event-type.js';
import type { AlertCreatedEvent } from './generated/webhook/v1/alert-created.js';
import type { SseEventTypeName, WebhookEventTypeName } from './generated/registry.js';

/** Mutual assignability, the `<G>() => G extends …` trick — strict enough to reject `any`. */
type Equal<A, B> = (<G>() => G extends A ? 1 : 2) extends <G>() => G extends B ? 1 : 2
  ? true
  : false;

type Expect<T extends true> = T;

/** The webhook payload's `change_type` union is exactly FND-03's `ChangeType`. */
export type _ChangeTypeMatchesContracts = Expect<
  Equal<AlertCreatedEvent['data']['change_type'], ChangeType>
>;

/** The generated SSE type union is exactly FND-03's `SseEventType` — PRD §34.4's allowed list. */
export type _SseTypesMatchContracts = Expect<Equal<SseEventTypeName, SseEventType>>;

/** The generated webhook type union is exactly the envelope's `type` union. */
export type _WebhookTypesMatchEnvelope = Expect<
  Equal<WebhookEventTypeName, AlertCreatedEvent['type']>
>;
