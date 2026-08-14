/**
 * EVID-07 — deep-freeze for this package's exported constants.
 *
 * WHY IT EXISTS AT ALL: `MODEL_PROFILE_REGISTRY_V1`, `PROFILE_CALL_CEILINGS`, `REGISTRY_CEILINGS`,
 * `PROVIDER_REGISTRY_V1` and `INSTRUCTION_TEMPLATE_V1` are process-lifetime singletons read
 * concurrently by every in-flight request in `apps/worker`. `Object.freeze` is SHALLOW, so freezing
 * only the table leaves each row mutable, and one caller mutating a row would silently change the
 * profile — its ceilings, its promotion state, its allowed providers — for every other request for
 * the life of the process. That is a security property here, not tidiness: `promotionState` and
 * `allowedProviderIds` are what stop an unapproved model from serving production.
 *
 * WHY IT IS A COPY rather than an import from `packages/domain` or `packages/pii`: `src/**` in this
 * package imports nothing but relative paths, and escapes the package only through the two boundary
 * files `src/schema/contracts.ts` and `src/schema/sanitized.ts` (asserted by
 * `test/providers/architecture.test.ts`). Reaching into a sibling package for a nine-line helper
 * would weaken the strongest available form of the no-tool architecture test. The duplication is the
 * decision; `packages/pii/src/contract/freeze.ts` records the same reasoning.
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
