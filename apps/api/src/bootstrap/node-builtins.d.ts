/**
 * Ambient declarations for the Node built-ins `apps/api` uses.
 *
 * WHY THIS FILE EXISTS. The repository ships no `@types/node` — that is open question **QR7** in
 * `docs/prd/03-app-runtime/README.md` §6, and adding a root devDependency is `00-foundation`'s
 * write-scope, outside this ticket's File-scope. `packages/observability/src/node-builtins.d.ts`
 * (RUNT-07) established the pattern; this file is the same idea for this app.
 *
 * Fastify itself needs nothing here: `skipLibCheck: true` (tsconfig.base.json) suppresses the
 * unresolved `node:http` / `node:stream` imports inside Fastify's own `.d.ts`.
 *
 * SCOPE RULE. Declare ONLY the members this app actually calls, each with its call site named. Do
 * not widen this file to "the real Node types" — the narrow surface is what keeps an unnoticed
 * dependency on a built-in from creeping in. When `@types/node` lands repo-wide (QR7), delete this
 * file wholesale.
 */

declare module 'node:fs' {
  /** TEST-ONLY — test/dependency-direction.test.ts walks `src/**` synchronously. */
  export function readdirSync(
    path: string,
    options: { readonly withFileTypes: true },
  ): { readonly name: string; isDirectory(): boolean }[];
  /** TEST-ONLY — test/dependency-direction.test.ts reads each source file as text. */
  export function readFileSync(path: string, encoding: 'utf8'): string;
}

declare module 'node:fs/promises' {
  /** A `Dirent`, reduced to what src/bootstrap/route-areas.ts reads. */
  export interface DirentLike {
    readonly name: string;
    isDirectory(): boolean;
    isFile(): boolean;
  }
  /** src/bootstrap/route-areas.ts — enumerate the children of a route-areas directory. */
  export function readdir(
    path: string,
    options: { readonly withFileTypes: true },
  ): Promise<DirentLike[]>;
  /** src/bootstrap/route-areas.ts — does this directory hold an `index.ts` entry file? */
  export function stat(path: string): Promise<{ isFile(): boolean; isDirectory(): boolean }>;

  /** TEST-ONLY — test/route-area-conformance.ts builds throw-away fixture areas. */
  export function mkdtemp(prefix: string): Promise<string>;
  /** TEST-ONLY — test/route-area-conformance.ts. */
  export function mkdir(
    path: string,
    options?: { readonly recursive?: boolean },
  ): Promise<string | undefined>;
  /** TEST-ONLY — test/route-area-conformance.ts writes fixture `index.ts` files. */
  export function writeFile(path: string, contents: string, encoding: 'utf8'): Promise<void>;
  /** TEST-ONLY — test/route-area-conformance.ts removes the fixture root in a `finally`. */
  export function rm(
    path: string,
    options?: { readonly recursive?: boolean; readonly force?: boolean },
  ): Promise<void>;
}

declare module 'node:path' {
  /** src/bootstrap/route-areas.ts — build a child path under the scanned root. */
  export function join(...parts: string[]): string;
  /** src/bootstrap/route-areas.ts — canonicalise the configured root once. */
  export function resolve(...parts: string[]): string;
  /** TEST-ONLY — test/dependency-direction.test.ts walks `src/**`. */
  export function relative(from: string, to: string): string;
}

declare module 'node:url' {
  /** src/bootstrap/route-areas.ts — resolve `../routes/` relative to `import.meta.url`. */
  export class URL {
    constructor(input: string, base?: string);
    readonly href: string;
  }
  /** src/bootstrap/route-areas.ts — `import()` target for a discovered entry file. */
  export function pathToFileURL(path: string): { readonly href: string };
  /** src/bootstrap/route-areas.ts, test/support — resolve a directory independently of the cwd. */
  export function fileURLToPath(url: string | { readonly href: string }): string;
}

declare module 'node:os' {
  /** TEST-ONLY — test/route-area-conformance.ts writes fixtures outside the repository. */
  export function tmpdir(): string;
}

declare module 'node:process' {
  /** The subset of `process` src/server.ts and src/bootstrap/shutdown.ts touch. */
  interface ProcessLike {
    /** src/bootstrap/config.ts (via src/server.ts) — the raw environment to validate. */
    readonly env: Readonly<Record<string, string | undefined>>;
    /** src/server.ts — a single-line boot-failure reason, never a stack. */
    readonly stderr: { write(chunk: string): boolean };
    /** src/bootstrap/shutdown.ts — SIGTERM / SIGINT registration. */
    on(signal: string, listener: () => void): unknown;
    /** src/bootstrap/shutdown.ts — the drain outcome exit code. */
    exit(code?: number): never;
    /** TEST-ONLY — test/server-process.test.ts spawns `src/server.ts` with this interpreter. */
    readonly execPath: string;
    /** TEST-ONLY — test/server-process.test.ts skips the real-signal case on Windows. */
    readonly platform: string;
  }
  const nodeProcess: ProcessLike;
  export default nodeProcess;
}

declare module 'node:crypto' {
  /**
   * TEST-ONLY. `src/**` never imports this module: test/errors.test.ts mints a canary the thrown
   * error carries, then asserts the canary is absent from every response byte.
   */
  export function randomUUID(): string;
}

declare module 'node:timers' {
  /** src/bootstrap/shutdown.ts — the force-exit deadline. The handle must be `unref`-able. */
  export function setTimeout(callback: () => void, ms: number): { unref?(): unknown };
  /** src/bootstrap/shutdown.ts — cancel the deadline once the drain completes. */
  export function clearTimeout(timer: { unref?(): unknown }): void;
}

declare module 'node:util' {
  /**
   * src/bootstrap/request-id.ts — counts the UTF-8 bytes of a rewritten JSON payload so
   * `content-length` matches exactly, without needing `Buffer`.
   */
  export class TextEncoder {
    encode(input: string): { readonly length: number };
  }
}

declare module 'node:child_process' {
  /** TEST-ONLY — test/server-process.test.ts boots `src/server.ts` as a real child process. */
  export function spawn(
    command: string,
    args: readonly string[],
    options: { readonly cwd?: string; readonly env?: Record<string, string | undefined> },
  ): {
    readonly pid?: number | undefined;
    readonly stdout: { on(event: 'data', listener: (chunk: unknown) => void): unknown };
    readonly stderr: { on(event: 'data', listener: (chunk: unknown) => void): unknown };
    on(event: 'exit', listener: (code: number | null, signal: string | null) => void): unknown;
    on(event: 'error', listener: (error: Error) => void): unknown;
    kill(signal?: string): boolean;
  };
}

/**
 * `lib: ["ES2024"]` declares `ImportMeta` with no members — `url` normally arrives with
 * `@types/node` or `lib.dom`. src/bootstrap/route-areas.ts derives the default routes root from it.
 */
interface ImportMeta {
  readonly url: string;
}
