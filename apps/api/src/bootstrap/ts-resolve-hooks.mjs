/**
 * An ESM resolve hook that lets Node run this repository's TypeScript sources directly.
 *
 * WHY IT IS NEEDED. `tsconfig.base.json` compiles with `moduleResolution: "nodenext"` and
 * `verbatimModuleSyntax`, so every relative import in the repository is written with a `.js`
 * extension (`./app.js`) while the file on disk is `./app.ts`. TypeScript resolves that pair;
 * Node 24's type stripping does NOT — it looks for `app.js`, does not find it, and the process
 * fails to boot with `ERR_MODULE_NOT_FOUND`. Vitest hides the gap because Vite performs the same
 * `.js` → `.ts` mapping itself, so every package in this repository typechecks and tests green
 * while being unrunnable by `node`.
 *
 * The durable fixes both live in `00-foundation`'s write-scope, outside this ticket: enable
 * `allowImportingTsExtensions` + `rewriteRelativeImportExtensions` in `tsconfig.base.json`, or add
 * a build step that emits `.js`. This hook is the in-scope stand-in until one of them lands; it is
 * scoped to `apps/api` and is loaded ONLY by the process entry, never by tests or by a library
 * consumer. See `docs/adr/0002-api-route-directory-autoload.md` § Consequences.
 *
 * The normal resolution is always attempted FIRST, so a real `.js` file (everything under
 * `node_modules`) resolves exactly as it would without this hook, and a package that ships both
 * `foo.js` and `foo.ts` keeps Node's own answer.
 */

/**
 * @param {string} specifier
 * @param {unknown} context
 * @param {(specifier: string, context: unknown) => Promise<unknown>} nextResolve
 */
export async function resolve(specifier, context, nextResolve) {
  try {
    return await nextResolve(specifier, context);
  } catch (error) {
    const isRelative = specifier.startsWith('./') || specifier.startsWith('../');
    if (
      error &&
      typeof error === 'object' &&
      /** @type {{ code?: string }} */ (error).code === 'ERR_MODULE_NOT_FOUND' &&
      isRelative &&
      specifier.endsWith('.js')
    ) {
      return nextResolve(`${specifier.slice(0, -'.js'.length)}.ts`, context);
    }
    throw error;
  }
}
