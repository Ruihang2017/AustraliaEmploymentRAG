/**
 * PRD §39.6 — *"Production startup validates the complete schema and refuses unknown critical keys."*
 *
 * `loadConfig` is pure over its `env` argument, so nothing here mutates `process.env`.
 */
import { describe, expect, it } from 'vitest';

import {
  CONFIG_DEFAULTS,
  ConfigValidationError,
  DECLARED_KEYS,
  loadConfig,
  resolveProfile,
  unknownCriticalKeys,
} from '../src/bootstrap/config.js';

describe('profile derivation', () => {
  it.each([
    ['production', 'production'],
    ['test', 'test'],
    ['development', 'development'],
    ['staging', 'development'],
    [undefined, 'development'],
    ['', 'development'],
  ])('NODE_ENV=%s → %s', (nodeEnv, expected) => {
    expect(resolveProfile(nodeEnv)).toBe(expected);
  });
});

describe('committed safe defaults', () => {
  it('binds to localhost, labels the environment SANDBOX and sets modest limits', () => {
    const config = loadConfig({});
    expect(config).toMatchObject({
      profile: 'development',
      host: CONFIG_DEFAULTS.host,
      port: CONFIG_DEFAULTS.port,
      bodyLimitBytes: CONFIG_DEFAULTS.bodyLimitBytes,
      shutdownTimeoutMs: CONFIG_DEFAULTS.shutdownTimeoutMs,
      environmentLabel: 'SANDBOX',
      ignoredKeys: [],
    });
    expect(CONFIG_DEFAULTS.host).toBe('127.0.0.1');
  });

  it('never infers PRODUCTION from the profile — the label is explicit or SANDBOX', () => {
    expect(loadConfig({ NODE_ENV: 'production' }).environmentLabel).toBe('SANDBOX');
    expect(
      loadConfig({ NODE_ENV: 'production', TAXRAG_ENVIRONMENT_LABEL: 'PRODUCTION' })
        .environmentLabel,
    ).toBe('PRODUCTION');
  });

  it('overrides each declared key from the environment', () => {
    const config = loadConfig({
      TAXRAG_API_HOST: '0.0.0.0',
      TAXRAG_API_PORT: '8080',
      TAXRAG_API_BODY_LIMIT_BYTES: '2048',
      TAXRAG_API_SHUTDOWN_TIMEOUT_MS: '250',
      TAXRAG_ENVIRONMENT_LABEL: 'PRODUCTION',
    });
    expect(config).toMatchObject({
      host: '0.0.0.0',
      port: 8080,
      bodyLimitBytes: 2048,
      shutdownTimeoutMs: 250,
      environmentLabel: 'PRODUCTION',
    });
  });
});

describe('unknown critical keys', () => {
  it('throws under production and names the offending key', () => {
    const env = { NODE_ENV: 'production', TAXRAG_MYSTERY_SETTING: '1' };
    expect(() => loadConfig(env)).toThrow(ConfigValidationError);
    try {
      loadConfig(env);
      expect.unreachable('loadConfig should have thrown');
    } catch (error) {
      expect((error as Error).message).toContain('TAXRAG_MYSTERY_SETTING');
      expect((error as ConfigValidationError).keys).toEqual(['TAXRAG_MYSTERY_SETTING']);
    }
  });

  it('names every offending key, sorted, when several are present', () => {
    expect(
      unknownCriticalKeys({ TAXRAG_ZED: '1', TAXRAG_ALPHA: '1', TAXRAG_API_PORT: '1' }),
    ).toEqual(['TAXRAG_ALPHA', 'TAXRAG_ZED']);
  });

  it('collects rather than throws under development and test', () => {
    for (const nodeEnv of ['development', 'test', undefined]) {
      const config = loadConfig({
        ...(nodeEnv === undefined ? {} : { NODE_ENV: nodeEnv }),
        TAXRAG_MYSTERY_SETTING: '1',
      });
      expect(config.ignoredKeys).toEqual(['TAXRAG_MYSTERY_SETTING']);
    }
  });

  it('ignores every non-TAXRAG_ key, in production too — otherwise nothing could ever boot', () => {
    const config = loadConfig({
      NODE_ENV: 'production',
      PATH: '/usr/bin',
      HOME: '/root',
      CI: 'true',
      GITHUB_ACTIONS: 'true',
      HOSTNAME: 'pod-1',
    });
    expect(config.profile).toBe('production');
    expect(config.ignoredKeys).toEqual([]);
  });

  it('accepts every declared key under production', () => {
    const env: Record<string, string> = { NODE_ENV: 'production' };
    for (const key of DECLARED_KEYS) {
      env[key] = key === 'TAXRAG_ENVIRONMENT_LABEL' ? 'PRODUCTION' : '1';
    }
    env['TAXRAG_API_HOST'] = '127.0.0.1';
    expect(() => loadConfig(env)).not.toThrow();
  });
});

describe('declared keys with unusable values', () => {
  it.each([
    ['TAXRAG_API_PORT', 'not-a-number'],
    ['TAXRAG_API_PORT', '0'],
    ['TAXRAG_API_PORT', '-1'],
    ['TAXRAG_API_PORT', '1.5'],
    ['TAXRAG_API_BODY_LIMIT_BYTES', 'x'],
    ['TAXRAG_API_SHUTDOWN_TIMEOUT_MS', '-5'],
    ['TAXRAG_ENVIRONMENT_LABEL', 'production'],
  ])('rejects %s=%s in every profile', (key, value) => {
    expect(() => loadConfig({ [key]: value })).toThrow(ConfigValidationError);
    expect(() => loadConfig({ NODE_ENV: 'production', [key]: value })).toThrow(
      ConfigValidationError,
    );
  });

  it('treats an empty declared key as absent', () => {
    expect(loadConfig({ TAXRAG_API_PORT: '', TAXRAG_API_HOST: '  ' })).toMatchObject({
      port: CONFIG_DEFAULTS.port,
      host: CONFIG_DEFAULTS.host,
    });
  });
});
