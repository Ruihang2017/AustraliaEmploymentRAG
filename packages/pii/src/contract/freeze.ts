/**
 * EVID-01 — deep-freeze helper for this module's exported constants.
 *
 * WHY A LOCAL COPY: `packages/domain` has an identical helper, but importing it would make
 * `packages/pii` depend on another module's internals for a 12-line primitive, and the import-graph
 * test in `test/contract/purity.test.ts` requires this package's `src/**` to import nothing outside
 * itself. Twelve duplicated lines is the cheaper of the two costs.
 *
 * WHY DEEP: every constant in this package (`PII_CATEGORY_VALUES`, `PII_PLACEHOLDERS`,
 * `PII_ADMISSION_LIMITS`, `CONSERVATIVE_STAGE_DEFAULTS`) is a process-wide singleton read
 * concurrently by every in-flight request in `apps/api`. `Object.freeze` is SHALLOW, so a shallow
 * freeze leaves nested rows mutable and one request mutating a row silently changes the detector for
 * every other request for the process lifetime. That is the one concurrency hazard a pure module can
 * still have.
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
