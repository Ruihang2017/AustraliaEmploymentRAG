/**
 * FND-07 — deep-freeze helper for this module's exported constants.
 *
 * WHY: every constant here is a module-level singleton read concurrently by every in-flight request in
 * `apps/api` / `apps/worker`. `Object.freeze` is SHALLOW, so `Object.freeze(REFUSAL_TABLE)` leaves each
 * row mutable and one caller mutating a row silently changes the refusal table for every other request
 * for the process lifetime. Nothing in this module is a singleton that is merely "not supposed to" be
 * mutated; it is frozen at every level and asserted frozen at every level.
 *
 * Cycle-safe (a `seen` set), and it never touches getters — only own enumerable value properties.
 */
export function deepFreeze<T>(value: T, seen: WeakSet<object> = new WeakSet()): T {
  if (value === null || typeof value !== 'object') return value;
  const asObject = value as unknown as object;
  if (seen.has(asObject)) return value;
  seen.add(asObject);
  Object.freeze(asObject);
  for (const key of Object.getOwnPropertyNames(asObject)) {
    const descriptor = Object.getOwnPropertyDescriptor(asObject, key);
    if (descriptor && 'value' in descriptor) deepFreeze(descriptor.value, seen);
  }
  return value;
}
