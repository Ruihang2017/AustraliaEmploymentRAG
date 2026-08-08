/**
 * FND-09 support — deep immutability for the two versioned data constants.
 *
 * PRD §24.1 and §38.5 are *data*, not code: a caller that could mutate `BUDGET_PROFILE_V1` could move
 * the A$50 ceiling at runtime, which OPS-003 forbids. Freezing is therefore part of the rule, not a
 * style choice.
 *
 * Pure: no clock, no randomness, no I/O (PRD §39.1, §45.2).
 */

/** Freezes `value` and every plain object or array reachable from it, then returns it. */
export function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === 'object') {
    const record = value as unknown as Record<string, unknown>;
    for (const key of Object.keys(record)) {
      deepFreeze(record[key]);
    }
    Object.freeze(value);
  }
  return value;
}
