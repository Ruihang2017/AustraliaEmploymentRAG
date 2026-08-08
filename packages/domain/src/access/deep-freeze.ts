/**
 * FND-06 — deep-freeze helper for this leaf's exported constants.
 *
 * WHY THIS IS A COPY of `src/budget/deep-freeze.ts` rather than an import: sub-PRD D10 forbids
 * imports between the `packages/domain` leaves (`access`, `answers`, `workflow`, `legal`, `budget`),
 * and the sibling leaves' own purity suites assert that `access` never appears in their import graph
 * and vice versa. The duplication is the decision, not an oversight; if promoting it is ever worth
 * doing, that is a `packages/domain` refactor with its own ticket.
 *
 * WHY IT EXISTS AT ALL: `ROLE_MATRIX`, `PERMISSION_REQUIRED_SCOPES` and `CONDITION_PREDICATES` are
 * process-lifetime singletons read concurrently by every in-flight request in `apps/api`.
 * `Object.freeze` is SHALLOW, so freezing only the table leaves each row mutable, and one caller
 * mutating a row would silently change an authorisation answer for every other request for the life
 * of the process. That is a privilege-escalation bug, not a hygiene one. Everything exported from
 * this leaf is frozen at every level and asserted frozen at every level.
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
