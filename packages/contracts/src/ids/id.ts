/**
 * Opaque resource-prefixed identifiers (PRD §34.1, ticket deliverable 4).
 *
 * An id is `<prefix>_<uuidv7>` — for example `ans_0198f3c1-...`. Two properties are load-bearing:
 *
 * - **Opacity.** PRD §34.1: *"clients never parse them"*. `parseId` therefore returns the prefix and
 *   the raw uuid and NOTHING else. There is deliberately no `timestampOf`, no `createdAt` accessor
 *   and no age helper: a creation time inferred from an id leaks record-creation timing, including
 *   across tenants, and turns an opaque handle into semantic content. If a caller needs a created-at
 *   value it reads the record's column.
 * - **Type distinction.** `Id<'ans'>` is not assignable to `Id<'rec'>` (branded types), so a claim id
 *   cannot be passed where a record id is expected. The brand is a phantom `unique symbol` property:
 *   it exists only in the type system, so an `Id` is a plain string at runtime, JSON-serialisable and
 *   storable as SQLite `TEXT` (PRD §35.1).
 *
 * Validation here is shape validation only — it says nothing about existence or authorisation.
 * PRD §16.5 requires an id from another tenant and an absent id to produce the same
 * `RESOURCE_NOT_FOUND` response; that check belongs to the API layer, not to this module.
 */
import type { ResourceKind } from './resource-prefixes.js';
import { isResourceKind } from './resource-prefixes.js';
import type { UuidV7Deps } from './uuidv7.js';
import { createUuidV7, isUuidV7 } from './uuidv7.js';

declare const idBrand: unique symbol;

/** An opaque id of kind `K`, e.g. `Id<'ans'>`. A branded string; never construct one by hand. */
export type Id<K extends ResourceKind> = string & { readonly [idBrand]: K };

/** Splits on the FIRST underscore. No registered prefix contains one (asserted in the tests). */
function split(value: string): { kind: string; uuid: string } | null {
  const at = value.indexOf('_');
  if (at <= 0 || at === value.length - 1) return null;
  return { kind: value.slice(0, at), uuid: value.slice(at + 1) };
}

/**
 * An id factory over an injected clock and randomness (ticket deliverable 4: *"The clock is
 * injectable so tests are deterministic"*). Each factory owns its own monotonic counter.
 */
export function createIdFactory(deps: UuidV7Deps = {}): {
  newId: <K extends ResourceKind>(kind: K) => Id<K>;
} {
  const uuid = createUuidV7(deps);
  return {
    newId<K extends ResourceKind>(kind: K): Id<K> {
      return `${kind}_${uuid()}` as Id<K>;
    },
  };
}

const defaultFactory = createIdFactory();

/** Mints a new id of `kind` from the process-wide generator. */
export function newId<K extends ResourceKind>(kind: K): Id<K> {
  return defaultFactory.newId(kind);
}

/** Whether `value` is a well-formed id of exactly `kind`. Another kind's id is `false`. */
export function isId<K extends ResourceKind>(kind: K, value: unknown): value is Id<K> {
  if (typeof value !== 'string') return false;
  const parts = split(value);
  if (!parts) return false;
  return parts.kind === kind && isUuidV7(parts.uuid);
}

/**
 * The prefix and uuid of a well-formed id of ANY registered kind, or `null`.
 *
 * The returned object has exactly the keys `kind` and `uuid` — see the opacity note at the top of
 * this file before adding a third.
 */
export function parseId(value: unknown): { kind: ResourceKind; uuid: string } | null {
  if (typeof value !== 'string') return null;
  const parts = split(value);
  if (!parts) return null;
  if (!isResourceKind(parts.kind)) return null;
  if (!isUuidV7(parts.uuid)) return null;
  return { kind: parts.kind, uuid: parts.uuid };
}
