/**
 * A synthetic `src/schema/*.ts` manifest. DATA-04…DATA-07 each add exactly one real file of this
 * shape; there is deliberately no index/barrel beside it (sub-PRD D4).
 */
export const tableManifest = {
  group: 'fixture-alpha',
  tables: [
    {
      name: 'fixture_alpha',
      scope: 'GLOBAL',
      mutability: 'APPEND_ONLY',
      requiredColumns: ['id', 'created_at'],
    },
  ],
};
