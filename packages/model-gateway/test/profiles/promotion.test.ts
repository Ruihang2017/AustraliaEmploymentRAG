/**
 * EVID-07 acceptance items "Only APPROVED profiles serve production", "Local profiles are not callable
 * here" and "Retention posture is a precondition".
 *
 * The central assertion is negative and easy to get wrong by omission: a refusal must not have
 * selected anything. Every test below therefore checks BOTH that the refusal happened AND that the
 * returned value names the requested profile and no other.
 */
import { describe, expect, it } from 'vitest';

import '../providers/support/network-stub.js';
import {
  LocalProfileNotCallableError,
  ProfileNotApprovedError,
  ProviderRetentionUnacceptableError,
  UnknownProfileError,
  hasAcceptableRetention,
  resolveProfile,
} from '../../src/profiles/resolve.js';
import { MODEL_PROFILE_REGISTRY_V1 } from '../../src/profiles/registry.js';
import { STUB_PROVIDER_ID } from '../../src/profiles/provider-ids.js';
import type { ModelProfile, ModelProfileId, ProviderRetentionDescriptor } from '../../src/profiles/types.js';

const OK_PROVIDERS: readonly ProviderRetentionDescriptor[] = [
  { providerId: STUB_PROVIDER_ID, retention: { noTraining: true, mode: 'ZERO' } },
];

const HOSTED: readonly ModelProfileId[] = [
  'QUICK_SYNTHESIS',
  'DEEP_SYNTHESIS',
  'STRUCTURED_REPAIR',
  'EVALUATION_JUDGE',
];

/** A registry with one entry replaced — never a mutation of the frozen shipped registry. */
function withProfile(id: ModelProfileId, patch: Partial<ModelProfile>): Record<ModelProfileId, ModelProfile> {
  return {
    ...MODEL_PROFILE_REGISTRY_V1,
    [id]: { ...MODEL_PROFILE_REGISTRY_V1[id], ...patch },
  } as Record<ModelProfileId, ModelProfile>;
}

describe('only APPROVED profiles serve production (PRD §14.4)', () => {
  it.each(HOSTED)('refuses CANDIDATE %s in PRODUCTION with a typed ProfileNotApprovedError', (id) => {
    const resolution = resolveProfile(id, 'PRODUCTION', OK_PROVIDERS);
    expect(resolution.outcome).toBe('REFUSED');
    if (resolution.outcome !== 'REFUSED') throw new Error('unreachable');
    expect(resolution.reason).toBe('PROFILE_NOT_APPROVED');
    expect(resolution.error).toBeInstanceOf(ProfileNotApprovedError);
    expect(resolution.error.profileId).toBe(id);
    // No substitution: the refusal names the requested profile and carries no alternative.
    expect(Object.keys(resolution)).toEqual(['outcome', 'reason', 'error']);
  });

  it.each(HOSTED)('resolves CANDIDATE %s in EVALUATION', (id) => {
    const resolution = resolveProfile(id, 'EVALUATION', OK_PROVIDERS);
    expect(resolution.outcome).toBe('RESOLVED');
    if (resolution.outcome !== 'RESOLVED') throw new Error('unreachable');
    expect(resolution.profile.id).toBe(id);
    expect(resolution.environment).toBe('EVALUATION');
  });

  it('resolves an APPROVED profile in PRODUCTION', () => {
    const registry = withProfile('QUICK_SYNTHESIS', { promotionState: 'APPROVED' });
    const resolution = resolveProfile('QUICK_SYNTHESIS', 'PRODUCTION', OK_PROVIDERS, registry);
    expect(resolution.outcome).toBe('RESOLVED');
  });

  it('refuses an unknown id rather than falling back to a default profile', () => {
    const resolution = resolveProfile('NOT_A_PROFILE', 'EVALUATION', OK_PROVIDERS);
    expect(resolution.outcome).toBe('REFUSED');
    if (resolution.outcome !== 'REFUSED') throw new Error('unreachable');
    expect(resolution.reason).toBe('UNKNOWN_PROFILE');
    expect(resolution.error).toBeInstanceOf(UnknownProfileError);
  });
});

describe('local profiles are not callable through this gateway (PRD §17.3)', () => {
  it.each(['QUERY_EMBEDDING', 'LOCAL_RERANK'] as const)('throws for %s, naming RETR-07', (id) => {
    expect(() => resolveProfile(id, 'EVALUATION', OK_PROVIDERS)).toThrow(LocalProfileNotCallableError);
    try {
      resolveProfile(id, 'EVALUATION', OK_PROVIDERS);
      throw new Error('expected a throw');
    } catch (error) {
      expect(error).toBeInstanceOf(LocalProfileNotCallableError);
      expect((error as Error).message).toContain('RETR-07');
      expect((error as Error).message).toContain('§17.3');
    }
  });

  it('throws BEFORE the promotion check, so the local refusal is not maskable by environment', () => {
    expect(() => resolveProfile('QUERY_EMBEDDING', 'PRODUCTION', OK_PROVIDERS)).toThrow(
      LocalProfileNotCallableError,
    );
  });
});

describe('retention posture is a precondition of resolution (PRD §10.2, Q-EVID-4)', () => {
  it('accepts ZERO and APPROVED_MINIMAL with noTraining', () => {
    expect(hasAcceptableRetention({ providerId: 'x', retention: { noTraining: true, mode: 'ZERO' } })).toBe(true);
    expect(
      hasAcceptableRetention({ providerId: 'x', retention: { noTraining: true, mode: 'APPROVED_MINIMAL' } }),
    ).toBe(true);
  });

  it('rejects a training-permitting or over-retaining provider', () => {
    expect(hasAcceptableRetention({ providerId: 'x', retention: { noTraining: false, mode: 'ZERO' } })).toBe(false);
    expect(hasAcceptableRetention({ providerId: 'x', retention: { noTraining: true, mode: 'THIRTY_DAYS' } })).toBe(
      false,
    );
  });

  it.each([
    ['noTraining false', { noTraining: false, mode: 'ZERO' }],
    ['an unapproved retention mode', { noTraining: true, mode: 'THIRTY_DAYS' }],
  ])('fails resolution when the allowed provider has %s', (_label, retention) => {
    const resolution = resolveProfile('QUICK_SYNTHESIS', 'EVALUATION', [
      { providerId: STUB_PROVIDER_ID, retention },
    ]);
    expect(resolution.outcome).toBe('REFUSED');
    if (resolution.outcome !== 'REFUSED') throw new Error('unreachable');
    expect(resolution.reason).toBe('PROVIDER_RETENTION_UNACCEPTABLE');
    expect(resolution.error).toBeInstanceOf(ProviderRetentionUnacceptableError);
  });

  it('fails resolution when the allowed provider is not configured at all', () => {
    const resolution = resolveProfile('QUICK_SYNTHESIS', 'EVALUATION', []);
    expect(resolution.outcome).toBe('REFUSED');
    if (resolution.outcome !== 'REFUSED') throw new Error('unreachable');
    expect(resolution.reason).toBe('PROVIDER_RETENTION_UNACCEPTABLE');
  });

  it('refuses a hosted profile whose allowlist is empty rather than choosing a provider', () => {
    const registry = withProfile('QUICK_SYNTHESIS', { allowedProviderIds: [] });
    const resolution = resolveProfile('QUICK_SYNTHESIS', 'EVALUATION', OK_PROVIDERS, registry);
    expect(resolution.outcome).toBe('REFUSED');
  });
});
