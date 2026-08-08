/**
 * FND-10 — deep-freeze helper for this module's exported constants.
 *
 * WHY: every constant here is a module-level singleton read concurrently by every in-flight request in
 * `apps/api` / `apps/worker`. `Object.freeze` is SHALLOW, so `Object.freeze(PERMITTED_STATUSES_BY_MODE)`
 * leaves each status array mutable and one caller's `.push` silently changes the permitted-status table
 * for every other request for the life of the process — a legal-safety failure with no audit trail.
 * Everything exported here is frozen at every level and asserted frozen at every level.
 *
 * WHY DUPLICATED: `src/answers/deep-freeze.ts` is identical in intent, but sub-PRD D10 forbids an
 * import between sibling `packages/domain` leaves (and the purity test enforces it). Twenty duplicated
 * lines are the price D10 charges for seven independently deliverable wave-3 lanes.
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
