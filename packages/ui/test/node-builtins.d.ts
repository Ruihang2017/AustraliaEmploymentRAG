/**
 * Ambient declarations for the Node built-ins this package's TESTS use.
 *
 * WHY THIS FILE EXISTS. The repository ships no `@types/node` (sub-PRD `03-app-runtime` §6 QR7), and
 * adding one to the root manifest is `00-foundation`'s write-scope, outside this ticket's File-scope.
 * `src/**` imports no Node built-in at all — this package renders and nothing more. The source scans
 * and fixture loaders under `test/**` do need to read files from disk.
 *
 * SCOPE RULE. Declare ONLY the members actually called, each with its call site named. Do not widen
 * this to "the real Node types". When `@types/node` lands repo-wide, delete this file wholesale.
 *
 * The `.d.ts` extension is why every source scan filters it out: it declares, it does not call.
 */

declare module 'node:fs' {
  /** The subset of `fs.Dirent` test/support/paths.ts reads while walking `src/`. */
  export interface DirentLike {
    readonly name: string;
    isDirectory(): boolean;
    isFile(): boolean;
  }
  /** test/support/paths.ts — walk `src/` recursively without following symlinks. */
  export function readdirSync(path: string, options: { readonly withFileTypes: true }): DirentLike[];
  /** test/support/paths.ts, test/support/fixtures.ts — read source and committed fixtures as text. */
  export function readFileSync(path: string, encoding: 'utf8'): string;
}

declare module 'node:path' {
  /** test/support/paths.ts — build a child path under the package directory. */
  export function join(...parts: string[]): string;
}

declare module 'node:url' {
  /** test/support/paths.ts — resolve the package directory independently of the cwd. */
  export function fileURLToPath(url: string): string;
}

/**
 * `lib` here is `["ES2024", "DOM", "DOM.Iterable"]`; `ImportMeta.url` normally arrives with
 * `@types/node`. TEST-ONLY: test/support/paths.ts resolves the package directory from it.
 */
interface ImportMeta {
  readonly url: string;
}
