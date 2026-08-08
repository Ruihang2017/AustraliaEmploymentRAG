/**
 * FND-06 — deep freeze, the one copy (PRD §45.2: `packages/domain` owns "pure permissions").
 *
 * Every exported table in this leaf (`ROLE_MATRIX`, `ACTION_SPECS`, `CONDITION_PREDICATES`,
 * `PERMISSION_TO_API_SCOPES`) is frozen all the way down, so a consumer cannot mutate the §38.1
 * matrix at runtime and quietly grant itself a cell. `Object.freeze` alone is shallow, which on a
 * table of tables freezes nothing that matters.
 *
 * No `node:` import, no clock, no randomness, no I/O (ticket deliverable 7, PRD §39.1).
 */
export function deepFreeze<T>(value: T): T {
  if (value === null || typeof value !== 'object') return value;
  for (const nested of Object.values(value as Record<string, unknown>)) deepFreeze(nested);
  return Object.freeze(value);
}
