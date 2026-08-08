/**
 * Lets Node resolve a `./x.js` specifier onto `x.ts` when only the TypeScript file exists.
 *
 * WHY. The workspace has no build step. `tsc` and vitest both require intra-package specifiers to
 * carry the `.js` extension (`moduleResolution: "nodenext"`), and `tsc` rejects a `./x.ts` specifier
 * outright (TS5097) unless `allowImportingTsExtensions` is set — which the FND-01 skeleton forbids,
 * since a member `tsconfig.json` may declare no `compilerOptions`. Node 24 runs `.ts` directly by
 * stripping types, but its resolver does *not* map `./x.js` onto `x.ts`. This hook is the bridge, and
 * it needs no dependency and no build step (`tsx`/`esbuild` would add a package with a real install
 * script, which is the expensive thing here).
 *
 * WHO NEEDS IT. `src/migrate/cli.mjs`, which is a plain Node entry point, and
 * `discoverTableManifests`, which `require()`s `src/schema/*.ts` through **Node's** resolver rather
 * than vitest's — a schema file that imports a sibling with a `.js` specifier (exactly what
 * DATA-04…DATA-07 will write) fails with `ERR_MODULE_NOT_FOUND` without this.
 *
 * HARD RULE. This module must never import a relative `.js` specifier — only `node:` builtins — or it
 * cannot bootstrap itself.
 *
 * The rewrite fires only when the `.js` file is absent *and* the `.ts` file is present, so it can
 * never shadow a real `.js` module. Installation is an explicit call and never an import side effect,
 * so importing the migration surface from a library does not silently rewire a host application's
 * module resolution.
 */
import { existsSync } from 'node:fs';
import { registerHooks } from 'node:module';
import { fileURLToPath } from 'node:url';

let installed = false;

/** Installs the resolve hook once. Safe to call from anywhere, any number of times. */
export function enableTypeScriptResolution(): void {
  if (installed) return;
  installed = true;
  registerHooks({
    resolve(specifier, context, nextResolve) {
      let resolved;
      try {
        resolved = nextResolve(specifier, context);
      } catch (error) {
        if (specifier.endsWith('.js')) {
          return nextResolve(`${specifier.slice(0, -3)}.ts`, context);
        }
        throw error;
      }
      if (resolved.url.startsWith('file:') && resolved.url.endsWith('.js')) {
        const candidate = `${resolved.url.slice(0, -3)}.ts`;
        if (!existsSync(fileURLToPath(resolved.url)) && existsSync(fileURLToPath(candidate))) {
          return { ...resolved, url: candidate, shortCircuit: true };
        }
      }
      return resolved;
    },
  });
}
