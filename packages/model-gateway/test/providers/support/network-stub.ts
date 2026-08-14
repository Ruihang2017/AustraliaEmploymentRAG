/**
 * EVID-07 acceptance item "Everything replays offline" (PRD §20.2, §20.3; sub-PRD D15).
 *
 * Importing this module replaces every global network entry point with a function that throws, and
 * removes any `PROVIDER_*`-shaped environment variable from the test process. It is imported for its
 * side effect at the top of every suite in this package, so a code path that tries to open a socket
 * fails loudly instead of quietly succeeding on a developer machine and failing in CI (or, worse,
 * succeeding in CI against a real provider).
 *
 * Not a `*.test.*` file.
 */
const NETWORK_GLOBALS = ['fetch', 'XMLHttpRequest', 'WebSocket', 'EventSource'] as const;

export class NetworkAccessInTestError extends Error {
  public constructor(what: string) {
    super(`the test suite attempted network access via ${what}; every provider call must replay`);
    this.name = 'NetworkAccessInTestError';
  }
}

/** Names of environment variables removed by `installNetworkStub`, for the offline suite to assert. */
export const REMOVED_ENVIRONMENT_KEYS: string[] = [];

let installed = false;

export function installNetworkStub(): void {
  if (installed) return;
  installed = true;

  const scope = globalThis as unknown as Record<string, unknown>;
  for (const name of NETWORK_GLOBALS) {
    Object.defineProperty(scope, name, {
      configurable: true,
      writable: true,
      value: () => {
        throw new NetworkAccessInTestError(name);
      },
    });
  }

  for (const key of Object.keys(process.env)) {
    if (/^(PROVIDER|MODEL_GATEWAY|OPENAI|ANTHROPIC|AZURE|GOOGLE|VERTEX|BEDROCK)_/.test(key)) {
      REMOVED_ENVIRONMENT_KEYS.push(key);
      delete process.env[key];
    }
  }
}

installNetworkStub();
