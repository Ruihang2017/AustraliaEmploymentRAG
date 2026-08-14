/**
 * EVID-07 — the public surface is deliberate.
 *
 * Each barrel's export list is compared against a LITERAL. The point is not tidiness: an accidental
 * export here is how a reservation mint, a transport factory that could reach a network, or an
 * internal that was never meant to be depended on, escapes into `EVID-08`, `ASK-02` and `GOLD-15`.
 * Failing in this file is much cheaper than discovering it downstream.
 */
import { describe, expect, it } from 'vitest';

import './support/network-stub.js';
import * as profiles from '../../src/profiles/index.js';
import * as providers from '../../src/providers/index.js';
import * as schema from '../../src/schema/index.js';
import * as testing from '../../src/providers/stub/index.js';

const namesOf = (module: Record<string, unknown>): string[] => Object.keys(module).sort();

describe('src/profiles/index.ts', () => {
  it('exports exactly this list', () => {
    expect(namesOf(profiles)).toEqual([
      'LocalProfileNotCallableError',
      'MODEL_PROFILE_IDS',
      'MODEL_PROFILE_REGISTRY_V1',
      'MODEL_PROFILE_REGISTRY_VERSION',
      'PROFILE_CALL_CEILINGS',
      'ProfileCeilingExceededError',
      'ProfileNotApprovedError',
      'ProfileRefusalError',
      'ProviderRetentionUnacceptableError',
      'REGISTRY_CEILINGS',
      'STUB_PROVIDER_ID',
      'UnknownProfileError',
      'assertProfileWithinCeilings',
      'deepFreeze',
      'hasAcceptableRetention',
      'isModelProfileId',
      'resolveProfile',
    ]);
  });
});

describe('src/schema/index.ts', () => {
  it('exports exactly this list', () => {
    expect(namesOf(schema)).toEqual([
      'ANSWER_STATUS_VALUES',
      'CITATION_ROLE_VALUES',
      'CLAIM_KIND_VALUES',
      'CLAIM_SUPPORT_VALUES',
      'ERROR_CODE_VALUES',
      'INSTRUCTION_TEMPLATE_V1',
      'INSTRUCTION_TEMPLATE_VERSION',
      'REASONING_FIELD_NAMES',
      'buildProviderRequest',
      'errorHttpStatusByCode',
      'isAnswerStatus',
      'isCitationRole',
      'isClaimKind',
      'isClaimSupport',
      'isErrorCode',
      'isReasoningFieldName',
      'parseModelResponse',
    ]);
  });
});

describe('src/providers/index.ts', () => {
  it('exports exactly this list', () => {
    expect(namesOf(providers)).toEqual([
      'CassetteMissError',
      'ForbiddenHeaderError',
      'GENERATION_UNAVAILABLE',
      'MODEL_EXECUTION_FIELDS',
      'NO_KILL_SWITCH',
      'OriginNotAllowedError',
      'PROVIDER_DESCRIPTORS',
      'PROVIDER_GENERATE_PATH',
      'PROVIDER_REGISTRY_V1',
      'PROVIDER_REGISTRY_VERSION',
      'SCENARIO_HEADER',
      'UNAVAILABLE_DETAILS',
      'UNAVAILABLE_REASONS',
      'assertAllowedOrigin',
      'assertCarryableHeaders',
      'assertNever',
      'buildModelExecutionRecord',
      'cassetteKeyOf',
      'createCassetteTransport',
      'createProviderAdapter',
      'findProviderDescriptor',
      'fingerprintOf',
      'generate',
      'isSwitchedOff',
      'isUnavailableReason',
      'isWellFormedHttpsOrigin',
      'killSwitchScope',
      'recordingTransport',
      'retryAfterMsFrom',
      'unavailable',
    ]);
  });

  it('exports NO mint of a reservation, under any name', () => {
    for (const name of namesOf(providers)) {
      expect(name.toLowerCase()).not.toContain('reservation');
    }
  });

  it('exports no value that could construct a live client', () => {
    // `isWellFormedHttpsOrigin` is a pure string PREDICATE and is deliberately exempt: it validates an
    // origin, it does not open one. Naming it explicitly is better than loosening the pattern, because
    // the next `…HttpClient` must still fail here.
    const EXEMPT = new Set(['isWellFormedHttpsOrigin']);
    for (const name of namesOf(providers)) {
      if (EXEMPT.has(name)) continue;
      expect(name.toLowerCase()).not.toMatch(/http|fetch|client|socket|connect/);
    }
  });
});

describe('the ./testing subpath (src/providers/stub/index.ts)', () => {
  it('exports exactly this list', () => {
    expect(namesOf(testing)).toEqual([
      'CONTENT_LEVEL_MODES',
      'STUB_MODEL_VERSION',
      'STUB_MODES',
      'STUB_PROVIDER_ID',
      'TRANSPORT_LEVEL_MODES',
      'createStubProvider',
      'exactTextOf',
      'isStubMode',
    ]);
  });
});

describe('package.json exports map', () => {
  it('points ./testing at the stub barrel', async () => {
    const manifest = (await import('../../package.json', { with: { type: 'json' } })) as unknown as {
      default: { exports: Record<string, string> };
    };
    expect(manifest.default.exports).toEqual({
      '.': './src/index.ts',
      './profiles': './src/profiles/index.ts',
      './providers': './src/providers/index.ts',
      './schema': './src/schema/index.ts',
      './testing': './src/providers/stub/index.ts',
    });
  });
});
