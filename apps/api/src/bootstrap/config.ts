/**
 * Layered configuration for the API process (ticket deliverable 2), implementing PRD §39.6:
 *
 * > Configuration layers are: committed safe defaults → environment-specific non-secret config →
 * > encrypted/sealed secret injection → internal feature flag. **Production startup validates the
 * > complete schema and refuses unknown critical keys.**
 *
 * `loadConfig` is PURE over its `env` argument — it never reads `process.env` itself, so tests need
 * no global mutation and two profiles can be loaded in one process.
 *
 * WHAT COUNTS AS A CRITICAL KEY. Only the `TAXRAG_` namespace (the existing
 * `TAXRAG_WORKSPACE_SWEEP` precedent in `tools/check-workspace.mjs`). Every other environment key —
 * `PATH`, `HOME`, the CI variables, the container runtime's own — is ignored entirely; treating the
 * whole environment as the schema would mean production could never boot.
 */

/** The deployment profile, derived from `NODE_ENV` and from nothing else. */
export type ApiProfile = 'development' | 'test' | 'production';

/** PRD §42.1 — the label the UI and the API surface to say which environment answered. */
export type EnvironmentLabel = 'PRODUCTION' | 'SANDBOX';

export interface ApiConfig {
  readonly profile: ApiProfile;
  readonly host: string;
  readonly port: number;
  /** Fastify `bodyLimit`. */
  readonly bodyLimitBytes: number;
  /** How long `SIGTERM` drains in-flight requests before the process force-exits. */
  readonly shutdownTimeoutMs: number;
  readonly environmentLabel: EnvironmentLabel;
  /**
   * Declared `TAXRAG_*` keys present in the environment but not applicable — under `development`
   * and `test` this also carries the unknown keys that would have thrown under `production`, so a
   * caller can log them (PRD §39.6 "under `development` an unknown key is logged and ignored").
   */
  readonly ignoredKeys: readonly string[];
}

/** Thrown when `production` startup sees a `TAXRAG_*` key the schema does not declare. */
export class ConfigValidationError extends Error {
  readonly keys: readonly string[];
  constructor(keys: readonly string[]) {
    super(
      `unknown critical configuration key${keys.length === 1 ? '' : 's'} refused by production ` +
        `startup (PRD §39.6): ${keys.join(', ')}`,
    );
    this.name = 'ConfigValidationError';
    this.keys = Object.freeze([...keys]);
  }
}

/** Layer 1 — committed safe defaults. Safe means: local-only host, sandbox label, modest limits. */
export const CONFIG_DEFAULTS = Object.freeze({
  host: '127.0.0.1',
  port: 3000,
  bodyLimitBytes: 1_048_576,
  shutdownTimeoutMs: 10_000,
  environmentLabel: 'SANDBOX' as EnvironmentLabel,
});

/** The namespace whose keys are part of this app's schema. Everything else is not our business. */
export const CRITICAL_KEY_PREFIX = 'TAXRAG_';

/**
 * Every `TAXRAG_*` key this app declares.
 *
 * Layer 3 (injected secrets) and layer 4 (feature flags) are declared seams: no secret group is
 * read by this ticket, and `TAXRAG_FLAGS` is accepted and ignored so a deployment that sets it does
 * not fail production startup before the flag layer exists.
 */
export const DECLARED_KEYS: readonly string[] = Object.freeze([
  'TAXRAG_API_HOST',
  'TAXRAG_API_PORT',
  'TAXRAG_API_BODY_LIMIT_BYTES',
  'TAXRAG_API_SHUTDOWN_TIMEOUT_MS',
  'TAXRAG_ENVIRONMENT_LABEL',
  // Layer 4 seam. Parsed by nobody yet; declared so setting it is not a boot failure.
  'TAXRAG_FLAGS',
]);

/** `NODE_ENV` → profile. Anything other than `production` / `test` (including absent) is development. */
export function resolveProfile(nodeEnv: string | undefined): ApiProfile {
  if (nodeEnv === 'production') return 'production';
  if (nodeEnv === 'test') return 'test';
  return 'development';
}

function readInteger(raw: string | undefined, fallback: number, key: string): number {
  if (raw === undefined || raw.trim() === '') return fallback;
  const value = Number(raw);
  if (!Number.isInteger(value) || value <= 0) {
    throw new ConfigValidationError([`${key} (expected a positive integer, got ${JSON.stringify(raw)})`]);
  }
  return value;
}

function readEnvironmentLabel(raw: string | undefined): EnvironmentLabel {
  // Never INFERRED from the profile: `PRODUCTION` is shown to users, so it is explicit or nothing.
  if (raw === undefined || raw.trim() === '') return CONFIG_DEFAULTS.environmentLabel;
  if (raw === 'PRODUCTION' || raw === 'SANDBOX') return raw;
  throw new ConfigValidationError([
    `TAXRAG_ENVIRONMENT_LABEL (expected PRODUCTION or SANDBOX, got ${JSON.stringify(raw)})`,
  ]);
}

/** `TAXRAG_*` keys present in `env` that the schema does not declare. Sorted, so messages are stable. */
export function unknownCriticalKeys(env: Readonly<Record<string, string | undefined>>): string[] {
  return Object.keys(env)
    .filter((key) => key.startsWith(CRITICAL_KEY_PREFIX))
    .filter((key) => !DECLARED_KEYS.includes(key))
    .sort();
}

/**
 * Builds the effective configuration.
 *
 * @throws ConfigValidationError under `production` when a `TAXRAG_*` key is not declared, or in any
 *         profile when a declared key holds a value the schema cannot accept.
 */
export function loadConfig(env: Readonly<Record<string, string | undefined>>): ApiConfig {
  const profile = resolveProfile(env['NODE_ENV']);
  const unknown = unknownCriticalKeys(env);

  if (profile === 'production' && unknown.length > 0) {
    throw new ConfigValidationError(unknown);
  }

  return Object.freeze({
    profile,
    host: env['TAXRAG_API_HOST']?.trim() || CONFIG_DEFAULTS.host,
    port: readInteger(env['TAXRAG_API_PORT'], CONFIG_DEFAULTS.port, 'TAXRAG_API_PORT'),
    bodyLimitBytes: readInteger(
      env['TAXRAG_API_BODY_LIMIT_BYTES'],
      CONFIG_DEFAULTS.bodyLimitBytes,
      'TAXRAG_API_BODY_LIMIT_BYTES',
    ),
    shutdownTimeoutMs: readInteger(
      env['TAXRAG_API_SHUTDOWN_TIMEOUT_MS'],
      CONFIG_DEFAULTS.shutdownTimeoutMs,
      'TAXRAG_API_SHUTDOWN_TIMEOUT_MS',
    ),
    environmentLabel: readEnvironmentLabel(env['TAXRAG_ENVIRONMENT_LABEL']),
    ignoredKeys: Object.freeze(unknown),
  });
}
