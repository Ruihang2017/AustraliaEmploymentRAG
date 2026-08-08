/**
 * Idempotency keys (ticket deliverable 4; PRD §34.1, §8.10; `ANS-003`).
 *
 * PRD §34.1: *"idempotency key 16–128 characters … same actor/route/key/body returns original result;
 * changed body returns 409"*. `ANS-003`: *"Repeated idempotency key creates one job/charge"*.
 *
 * THE LOAD-BEARING PROPERTY: the key is resolved **once per logical call**, before the attempt loop,
 * and every automatic retry of that call re-sends the identical value. A fresh key per attempt would
 * create two jobs and two charges. `resolveIdempotencyKey` is therefore called from exactly one place
 * — `client.ts`'s call setup — and never from inside `retry.ts` or `transport.ts`;
 * `test/idempotency.test.ts` asserts the three captured header values are byte-identical, and
 * `test/no-local-contract-types.test.ts`'s sibling scan asserts no other module calls it.
 */
import { AerValidationError } from './errors.js';
import type { OperationId } from './internal/contracts.js';
import { uuidv7 } from './internal/contracts.js';
import { RETRYABLE_WRITE_OPERATION_IDS } from './internal/retryable-writes.js';

/** PRD §34.1's bound, inclusive at both ends. */
export const IDEMPOTENCY_KEY_MIN_LENGTH = 16;
export const IDEMPOTENCY_KEY_MAX_LENGTH = 128;

/** Injectable so a test run is deterministic; defaults to `FND-04`'s UUIDv7 generator. */
export type KeyGenerator = () => string;

/** Throws `AerValidationError` — before any request — when the key is outside PRD §34.1's bound. */
export function assertIdempotencyKey(key: string): void {
  if (typeof key !== 'string' || key.length < IDEMPOTENCY_KEY_MIN_LENGTH || key.length > IDEMPOTENCY_KEY_MAX_LENGTH) {
    throw new AerValidationError(
      `an Idempotency-Key must be ${IDEMPOTENCY_KEY_MIN_LENGTH}–${IDEMPOTENCY_KEY_MAX_LENGTH} characters (PRD §34.1)`,
    );
  }
}

/**
 * The key for one logical call, or `undefined` when the operation is not a retryable write.
 *
 * A caller-supplied key passes through unchanged (after the length check). Otherwise a UUIDv7 is
 * minted — 36 characters, comfortably inside the bound.
 */
export function resolveIdempotencyKey(
  operationId: OperationId,
  callerKey: string | undefined,
  generate: KeyGenerator = uuidv7,
): string | undefined {
  if (callerKey !== undefined) {
    assertIdempotencyKey(callerKey);
    if (!RETRYABLE_WRITE_OPERATION_IDS.has(operationId)) {
      throw new AerValidationError(
        `operation "${operationId}" is not a retryable write, so it accepts no Idempotency-Key (PRD §34.1)`,
      );
    }
    return callerKey;
  }
  if (!RETRYABLE_WRITE_OPERATION_IDS.has(operationId)) return undefined;
  const generated = generate();
  assertIdempotencyKey(generated);
  return generated;
}
