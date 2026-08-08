/**
 * Async-context correlation store — RUNT-07 Deliverable 5.
 *
 * PRD §42.2: "A request ID joins app → job → retrieval → model metadata → answer/audit without
 * placing the question or evidence in logs." Threading ids by hand is how one of them goes missing;
 * binding them to the async context is how a call site cannot forget one.
 *
 * `AsyncLocalStorage.run()` ONLY — `enterWith()` is deliberately never called. `enterWith` mutates
 * the store of the surrounding async resource, which leaks the binding to everything that resumes
 * after it: the classic cross-request bleed, where one tenant's `request_id` lands on another
 * tenant's records. `run()` scopes the binding to exactly the callback's async subtree.
 *
 * NESTING MERGES, CONFLICTS THROW. A child sees `parent ∪ own`. Re-binding an already-bound key to a
 * DIFFERENT value throws {@link CorrelationConflictError}; re-binding it to the same value is a
 * no-op. A silent overwrite is the other way one request's id ends up on another request's records.
 *
 * IDS ARE VALIDATED AT BIND TIME AND THROW. An unjoinable correlation id defeats the whole of
 * `OPS-002` ("observable without content logs" is worthless if the records do not join), so a
 * malformed id fails loudly at the boundary rather than being dropped silently later, deep inside a
 * log call. The ids are minted by `RUNT-01` (request) and `RUNT-04` (job), not by request input.
 */
import { AsyncLocalStorage } from 'node:async_hooks';

import { isValidFieldValue } from './fields.js';
import type { FieldName } from './fields.js';
import { CorrelationConflictError, CorrelationIdError } from './errors.js';

/** The correlation keys. Every one of them is an allowlisted `opaque_id` field. */
export const CORRELATION_KEYS = Object.freeze([
  'request_id',
  'job_id',
  'retrieval_id',
  'model_call_id',
  'answer_snapshot_id',
  'organization_id',
] as const);

export type CorrelationKey = (typeof CORRELATION_KEYS)[number];

/**
 * Ids bound to the current async context.
 *
 * `exactOptionalPropertyTypes` is on: OMIT a key you do not have rather than passing `undefined`.
 */
export type CorrelationIds = {
  readonly [K in CorrelationKey]?: string;
};

const storage = new AsyncLocalStorage<Readonly<CorrelationIds>>();

const EMPTY: Readonly<CorrelationIds> = Object.freeze(Object.create(null) as CorrelationIds);

/** The ids bound to the current async context. Always a frozen object; never `undefined`. */
export function currentCorrelation(): Readonly<CorrelationIds> {
  return storage.getStore() ?? EMPTY;
}

/**
 * Merges `ids` into the current context and runs `fn` inside the result.
 *
 * Returns whatever `fn` returns, unchanged — including a Promise. The binding survives `await`,
 * which is what `test/correlation.test.ts`'s interleaved-flows case proves.
 *
 * @throws CorrelationIdError  an id is not a well-formed opaque id of its kind.
 * @throws CorrelationConflictError  a key already bound in an enclosing scope is rebound to a
 *   different value.
 */
export function withCorrelation<R>(ids: CorrelationIds, fn: () => R): R {
  const parent = currentCorrelation();
  const next: Record<string, string> = Object.create(null) as Record<string, string>;

  for (const key of CORRELATION_KEYS) {
    const inherited = parent[key];
    if (inherited !== undefined) next[key] = inherited;
  }

  for (const key of CORRELATION_KEYS) {
    const value = ids[key];
    if (value === undefined) continue;
    // The message names the KEY (an author-declared constant) and never the value — see src/errors.ts.
    if (!isValidFieldValue(key as FieldName, value)) {
      throw new CorrelationIdError(`correlation id "${key}" is not a well-formed opaque id`);
    }
    const inherited = parent[key];
    if (inherited !== undefined && inherited !== value) {
      throw new CorrelationConflictError(
        `correlation id "${key}" is already bound to a different value in an enclosing scope`,
      );
    }
    next[key] = value;
  }

  return storage.run(Object.freeze(next) as Readonly<CorrelationIds>, fn);
}
