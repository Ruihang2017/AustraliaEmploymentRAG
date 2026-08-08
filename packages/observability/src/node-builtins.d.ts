/**
 * Ambient declarations for the Node built-ins this package uses.
 *
 * WHY THIS FILE EXISTS. The repository ships no `@types/node`: every member manifest is asserted to
 * declare no dependency at all (tools/tests/skeleton.test.mjs, "declares no dependency beyond the
 * toolchain in any member manifest"), and adding one to the root manifest is `00-foundation`'s
 * write-scope, outside this ticket's File-scope. Every other package typechecks only because no
 * `src/**` file imports a Node built-in. This package cannot be pure: an async-context correlation
 * store needs `node:async_hooks`, and the retention sink's default adapter needs `node:fs` /
 * `node:path` / `node:process`.
 *
 * SCOPE RULE. Declare ONLY the members this package actually calls, each with its call site named.
 * Do not widen this file to "the real Node types" — a narrow declaration is what keeps the surface
 * reviewable and stops an unnoticed dependency on a built-in creeping in. When `@types/node` lands
 * repo-wide (`docs/prd/03-app-runtime/README.md` §6 QR7), delete this file wholesale.
 */

declare module 'node:async_hooks' {
  /** src/correlation.ts — the single module-level correlation store. `enterWith` is deliberately absent. */
  export class AsyncLocalStorage<T> {
    constructor();
    run<R>(store: T, callback: () => R): R;
    getStore(): T | undefined;
  }
}

declare module 'node:fs' {
  /** The subset of `fs.Stats` src/retention.ts reads. */
  export interface StatsLike {
    isFile(): boolean;
    isSymbolicLink(): boolean;
    readonly size: number;
    readonly mtimeMs: number;
  }
  /** src/retention.ts — createNodeFileSystem(): ensure the log directory exists. */
  export function mkdirSync(path: string, options?: { readonly recursive?: boolean }): string | undefined;
  /** src/retention.ts — createNodeFileSystem(): list prune candidates (non-recursive). */
  export function readdirSync(path: string): string[];
  /** src/retention.ts — createNodeFileSystem(): lstat, never stat, so a symlink is never followed. */
  export function lstatSync(path: string): StatsLike;
  /** src/retention.ts — createNodeFileSystem(): remove a pruned file. */
  export function unlinkSync(path: string): void;
  /** src/retention.ts — createNodeFileSystem(): append one record line. */
  export function appendFileSync(path: string, contents: string): void;
  /** TEST-ONLY — test/surface.test.ts and test/schema.test.ts read source and the committed schema. */
  export function readFileSync(path: string, encoding: 'utf8'): string;
}

/**
 * `lib: ["ES2024"]` declares `ImportMeta` with no members — `url` normally arrives with `@types/node`
 * or `lib.dom`. TEST-ONLY: test/support/paths.ts resolves the package directory from it.
 */
interface ImportMeta {
  readonly url: string;
}

declare module 'node:url' {
  /** TEST-ONLY — test/support/paths.ts resolves the package directory independently of the cwd. */
  export function fileURLToPath(url: string): string;
}

declare module 'node:path' {
  /** src/retention.ts — build a child path under the configured directory. */
  export function join(...parts: string[]): string;
  /** src/retention.ts — canonicalise the configured directory once, for the direct-child check. */
  export function resolve(...parts: string[]): string;
}

declare module 'node:process' {
  interface ProcessLike {
    /** src/retention.ts — per-process log file names, so two processes never rotate the same file. */
    readonly pid: number;
    /** src/sinks.ts — createStdoutSink(). */
    readonly stdout: { write(chunk: string): boolean };
  }
  const nodeProcess: ProcessLike;
  export default nodeProcess;
}

declare module 'node:crypto' {
  /**
   * TEST-ONLY. `src/**` never imports this module: test/redact.test.ts computes the sha256 of a
   * redacted input as a NEGATIVE assertion (the marker must not be a reversible hash, PRD §37.2),
   * and test/surface.test.ts asserts no `createHash` appears anywhere under `src/`.
   */
  export function createHash(algorithm: string): {
    update(data: string): { digest(encoding: string): string };
  };
}
