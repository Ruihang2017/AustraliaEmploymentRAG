/**
 * ETag and `row_version` rules (FND-08 deliverable 4).
 *
 * PRD §34.1: *"Mutable resources return `ETag`; writes require `If-Match` where documented."*
 * PRD §16.2: *"Editable resources MUST use ETag/version + `If-Match`; conflicts return
 * `409 CONCURRENT_MODIFICATION`."*  PRD §35.1: every mutable metadata table has an integer
 * `row_version`.
 *
 * **The token is an opaque value, not transport syntax.** Weak/strong validators, header quoting and
 * `*` are `03-app-runtime`/RUNT-01's (FND-08 Non-goal 8); this module produces and compares a value.
 *
 * **The token is not a secret and not a capability.** It embeds `row_version` and the resource id,
 * both of which the client already holds, so a plain `===` comparison is correct — deliberately no
 * `timingSafeEqual` and no `node:crypto` import (which would also break this leaf's determinism test).
 * If a future ETag is ever derived from something confidential, this comment is the tripwire: the
 * comparison would then need to be constant-time.
 *
 * **Why concatenation rather than a hash.** FND-08 acceptance item 6 requires a different value for
 * every distinct `row_version` on one resource *and* for the same `row_version` on different
 * resources. `"w1." + digits + "." + id` is injective by construction — the first two dots are
 * unambiguous separators whatever the id contains, because the second segment is digits only — which a
 * test can prove exhaustively; a hash can only be sampled. It also keeps `packages/domain` free of
 * `node:crypto` and therefore bundleable for the browser.
 *
 * `updated_at` is deliberately not an input: two writes in the same clock tick must still differ, so
 * PRD §35.1's `row_version` is the sole authority.
 */

/** Version prefix of the token format. Bump it if the derivation ever changes (see FND-08 Q6). */
export const ETAG_VERSION_TAG = 'w1';

/**
 * A `row_version` must be a non-negative safe integer strictly below `Number.MAX_SAFE_INTEGER` —
 * at `MAX_SAFE_INTEGER` the `+ 1` in `nextRowVersion` would silently lose precision and two distinct
 * versions would compare equal.
 */
function assertRowVersion(rowVersion: number, field: string): void {
  if (typeof rowVersion !== 'number' || !Number.isInteger(rowVersion)) {
    throw new TypeError(`${field} must be an integer`);
  }
  if (rowVersion < 0) {
    throw new RangeError(`${field} must not be negative`);
  }
  if (rowVersion >= Number.MAX_SAFE_INTEGER) {
    throw new RangeError(`${field} must be below Number.MAX_SAFE_INTEGER`);
  }
}

function assertResourceId(resourceId: string, field: string): void {
  if (typeof resourceId !== 'string' || resourceId.length === 0) {
    throw new TypeError(`${field} must be a non-empty string`);
  }
}

/**
 * The ETag token for a resource at a given `row_version`. Deterministic: no clock, no randomness.
 * Throws only on a caller bug (a malformed `row_version` or an empty id).
 */
export function computeETag(rowVersion: number, resourceId: string): string {
  assertRowVersion(rowVersion, 'rowVersion');
  assertResourceId(resourceId, 'resourceId');
  return `${ETAG_VERSION_TAG}.${rowVersion}.${resourceId}`;
}

/**
 * The single place `row_version` is incremented, so PRD §35.1 monotonicity has one source.
 * Throws `RangeError` rather than overflowing into an unsafe integer.
 */
export function nextRowVersion(current: number): number {
  assertRowVersion(current, 'rowVersion');
  const next = current + 1;
  if (next >= Number.MAX_SAFE_INTEGER) {
    throw new RangeError('rowVersion would exceed Number.MAX_SAFE_INTEGER');
  }
  return next;
}

/**
 * `MISSING` when no `If-Match` value was supplied on a write that documents it as required
 * (PRD §34.1); `STALE` on a mismatch (PRD §16.2 → the caller returns `409 CONCURRENT_MODIFICATION`);
 * `OK` on an exact match. The two failures are deliberately distinguishable so RUNT-01/RCRD-04 can
 * choose the correct PRD §34.9 code.
 *
 * Fail-closed details, each covered by a test so a later reader does not "fix" them here:
 * - a value that is present but not a usable string is `STALE`, not `MISSING`;
 * - the comparison is exact and untrimmed — a trailing space is `STALE`;
 * - `'*'` and `W/"…"` are **not** special-cased; unwrapping transport syntax is RUNT-01's job.
 */
export function checkIfMatch(provided: string | undefined, current: string): 'OK' | 'STALE' | 'MISSING' {
  assertResourceId(current, 'current');
  // Widened to `unknown` on purpose: the declared type is the ticket's signature, but the value
  // arrives from an HTTP layer and may be anything at runtime.
  const value: unknown = provided;
  if (value === undefined || value === null) return 'MISSING';
  if (typeof value !== 'string') return 'STALE';
  if (value.trim().length === 0) return 'MISSING';
  return value === current ? 'OK' : 'STALE';
}
