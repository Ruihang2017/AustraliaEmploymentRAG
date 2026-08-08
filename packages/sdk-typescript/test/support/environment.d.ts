/**
 * The narrow Node surface this package's SUITES use.
 *
 * The repository ships no `@types/node` — `tools/tests/skeleton.test.mjs` keeps every member manifest
 * dependency-pinned and this package declares no dependency at all (plan §2.1) — so the `node:*`
 * modules have no ambient declaration. `packages/contracts` sidesteps the problem by excluding its
 * `test/**` from `tsconfig.json#include`, which also means its fixtures are never typechecked.
 *
 * This package includes `test` and `examples` in its program instead, because the typed fixtures are
 * half of the fixture-drift guard: a fixture annotated with a generated type must fail to COMPILE
 * when the contract changes. The price is this file: exactly the members the suites call, and
 * nothing else. It declares no `/v1` request or response type, so
 * `test/no-local-contract-types.test.ts` has nothing to catch here.
 *
 * `src/**` imports none of these. The SDK itself uses no Node API: `fetch` is injected, and
 * `TextDecoder`/`AbortController`/timers are read structurally off `globalThis`
 * (`src/internal/runtime.ts`).
 */

/** `lib: ["ES2024"]` declares `ImportMeta` but not its host properties. */
interface ImportMeta {
  readonly url: string;
}

/**
 * Host globals the SUITES use directly. `src/**` never names these: it reads them structurally off
 * `globalThis` (`src/internal/runtime.ts`), which is what keeps the SDK free of an ambient dependency.
 */
declare class TextEncoder {
  encode(input?: string): Uint8Array;
}

interface TestAbortSignal {
  readonly aborted: boolean;
  addEventListener(type: 'abort', listener: () => void): void;
  removeEventListener(type: 'abort', listener: () => void): void;
}

declare class AbortController {
  readonly signal: TestAbortSignal;
  abort(reason?: unknown): void;
}

declare module 'node:fs' {
  export interface Dirent {
    readonly name: string;
    isDirectory(): boolean;
    isFile(): boolean;
  }
  export function readFileSync(path: string, encoding: 'utf8'): string;
  export function readdirSync(path: string, options: { withFileTypes: true }): Dirent[];
  export function existsSync(path: string): boolean;
}

declare module 'node:path' {
  export function join(...parts: string[]): string;
  export function resolve(...parts: string[]): string;
  export function dirname(path: string): string;
}

declare module 'node:url' {
  export function fileURLToPath(url: string): string;
}

declare module 'node:util' {
  export function inspect(value: unknown, options?: { depth?: number | null }): string;
}
