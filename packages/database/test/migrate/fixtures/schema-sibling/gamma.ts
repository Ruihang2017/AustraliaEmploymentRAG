/**
 * A schema manifest that imports a sibling module with a `.js` specifier while only the `.ts` file
 * exists — exactly the shape DATA-04…DATA-07 will write, because `tsc` and vitest both require the
 * `.js` extension. `discoverTableManifests` loads this through Node's own resolver (`createRequire`),
 * not vitest's, so this file fails with ERR_MODULE_NOT_FOUND unless `ts-resolve.ts` is installed.
 */
import { GAMMA_REQUIRED_COLUMNS } from './shared/columns.js';

export const tableManifest = {
  group: 'fixture-gamma',
  tables: [
    {
      name: 'fixture_gamma',
      scope: 'TENANT',
      mutability: 'APPEND_ONLY',
      requiredColumns: [...GAMMA_REQUIRED_COLUMNS],
    },
  ],
};
