/**
 * The handful of host capabilities this SDK needs, typed structurally against `globalThis`.
 *
 * `tsconfig.base.json` sets `lib: ["ES2024"]` and the repository ships no `@types/node` and no DOM
 * library (`tools/tests/skeleton.test.mjs` keeps member manifests dependency-pinned and this package
 * declares none at all). `TextDecoder`, `AbortController` and the timer functions are therefore not
 * declared by any lib file, so each is narrowed here to exactly the members that are used — the same
 * technique `packages/contracts/src/ids/uuidv7.ts` uses for Web Crypto.
 *
 * Nothing here reads an environment variable, a file, or anything that could carry a credential
 * (PRD §20.2, §22). `runtimeName()`/`platformName()` read only a version string and an architecture
 * label, both of which are telemetry-safe by construction (PRD §8.10, sub-PRD **D7**).
 */

/** An `AbortSignal`, narrowed to what `transport.ts`, `retry.ts` and `sse/stream.ts` use. */
export interface AerAbortSignal {
  readonly aborted: boolean;
  readonly reason?: unknown;
  addEventListener(type: 'abort', listener: () => void): void;
  removeEventListener(type: 'abort', listener: () => void): void;
}

/** An `AbortController`, narrowed the same way. */
export interface AerAbortController {
  readonly signal: AerAbortSignal;
  abort(reason?: unknown): void;
}

interface HostGlobals {
  readonly TextDecoder?: new (label?: string, options?: { readonly stream?: boolean }) => {
    decode(input?: Uint8Array, options?: { readonly stream?: boolean }): string;
  };
  readonly AbortController?: new () => AerAbortController;
  readonly setTimeout?: (handler: () => void, timeout: number) => unknown;
  readonly clearTimeout?: (handle: unknown) => void;
  readonly process?: { readonly version?: unknown; readonly platform?: unknown; readonly arch?: unknown };
  readonly navigator?: { readonly userAgent?: unknown };
}

const host = globalThis as unknown as HostGlobals;

/** A streaming UTF-8 decoder. Throws early and clearly when the host has none. */
export function createTextDecoder(): { decode(input?: Uint8Array, options?: { readonly stream?: boolean }): string } {
  const Ctor = host.TextDecoder;
  if (!Ctor) throw new Error('this runtime provides no TextDecoder; streaming is unavailable');
  return new Ctor('utf-8');
}

/**
 * A fresh `AbortController`. Used to bound a single request by `timeoutMs` and to propagate the
 * caller's own signal into the injected `fetch` — the abort must reach the real transport, so a
 * hand-rolled stand-in would not do.
 */
export function createAbortController(): AerAbortController {
  const Ctor = host.AbortController;
  if (!Ctor) throw new Error('this runtime provides no AbortController; request timeouts are unavailable');
  return new Ctor();
}

/** `setTimeout`, as an injectable pair so tests never wait on a real clock. */
export interface Timers {
  readonly setTimeout: (handler: () => void, timeoutMs: number) => unknown;
  readonly clearTimeout: (handle: unknown) => void;
}

export const systemTimers: Timers = Object.freeze({
  setTimeout: (handler: () => void, timeoutMs: number): unknown => {
    const fn = host.setTimeout;
    if (!fn) throw new Error('this runtime provides no setTimeout');
    return fn(handler, timeoutMs);
  },
  clearTimeout: (handle: unknown): void => {
    host.clearTimeout?.(handle);
  },
});

const stringOr = (value: unknown, fallback: string): string =>
  typeof value === 'string' && value.length > 0 ? value : fallback;

/**
 * A coarse runtime label for telemetry, e.g. `node/v24.18.0`. Never a credential, never a path,
 * never anything user-supplied.
 */
export function runtimeName(): string {
  const version = host.process?.version;
  if (typeof version === 'string' && version.length > 0) return `node/${version}`;
  const agent = host.navigator?.userAgent;
  if (typeof agent === 'string' && agent.length > 0) return 'browser';
  return 'unknown';
}

/** A coarse platform label for telemetry, e.g. `win32/x64`. */
export function platformName(): string {
  const platform = stringOr(host.process?.platform, 'unknown');
  const arch = stringOr(host.process?.arch, 'unknown');
  return `${platform}/${arch}`;
}
