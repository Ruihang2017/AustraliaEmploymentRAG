/**
 * Vitest configuration for `@taxrag/ui`.
 *
 * Deliberately NOT under `include` in tsconfig.json: it is runner configuration, not package source,
 * and typechecking it would pull `vite`'s types into a package that declares neither `vite` nor
 * `vitest` as a dependency (both resolve from the root workspace `.bin`, as
 * `packages/observability` and `packages/database` already do).
 *
 * `globals: false` — every test imports `describe`/`it`/`expect` from `vitest` explicitly, matching
 * the rest of the repository.
 */
export default {
  oxc: {
    jsx: { runtime: 'automatic', importSource: 'react' },
  },
  test: {
    environment: 'jsdom',
    globals: false,
    include: ['test/**/*.test.ts', 'test/**/*.test.tsx'],
    setupFiles: ['./test/setup.ts'],
  },
};
