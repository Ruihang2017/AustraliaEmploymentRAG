/**
 * EVID-02 — the one place the runtime-skip reason is written, so `budget.test.ts`,
 * `recall-report.test.ts` and the committed `recall-report.json` all say the same thing.
 *
 * Not a `*.test.*` file, so Vitest does not collect it.
 */

/** Named, never silent: the "runtime ON" measurement is absent for THIS stated reason. */
export const RUNTIME_SKIP_REASON =
  'no model artifact is selected or shipped — docs/adr/0001-local-pii-entity-runtime.md decides ' +
  'the rule/gazetteer recogniser for v1, so ENTITY_ARTIFACT_PINS is empty and there is nothing to load';
