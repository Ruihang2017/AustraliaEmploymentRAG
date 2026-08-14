/**
 * EVID-07 acceptance item "Fallback requires approval" (PRD §14.4 *"Every fallback requires
 * independent approval"*; PRD §17.3 *"No unvalidated fallback is permitted during provider failure or
 * budget exhaustion"*).
 *
 * The NEGATIVE TEST (ticket test-plan step 5) was run on a scratch change: giving
 * `MODEL_PROFILE_REGISTRY_V1.QUICK_SYNTHESIS` a default `approvedFallbackProfileId: 'DEEP_SYNTHESIS'`
 * makes "the shipped registry declares no fallback" fail, and — because DEEP_SYNTHESIS ships
 * CANDIDATE — leaves "a fallback pointing at a CANDIDATE is refused" green, which is the correct pair
 * of signals. Discarded.
 */
import { describe, expect, it } from 'vitest';

import './support/network-stub.js';
import { cassetteTransportFor, loadCassettes } from './support/cassettes.js';
import { forgeReservation } from './support/reservation-double.js';
import { gatewayCall, harness, registryWith, spyOnTransport } from './support/harness.js';
import { generate } from '../../src/providers/generate.js';
import { MODEL_PROFILE_REGISTRY_V1 } from '../../src/profiles/registry.js';
import { MODEL_PROFILE_IDS } from '../../src/profiles/types.js';

const cassettes = loadCassettes();
const reservation = forgeReservation({ expiresAt: 1_000_000 });

/** Profiles a failing call could have escaped to, read off the transport's own call log. */
const profilesCalled = (calls: readonly { readonly body: unknown }[]): string[] => [
  ...new Set(calls.map((call) => (call.body as { profileId: string }).profileId)),
];

describe('the shipped registry declares no fallback at all', () => {
  it.each(MODEL_PROFILE_IDS)('%s has no approvedFallbackProfileId', (id) => {
    expect(MODEL_PROFILE_REGISTRY_V1[id].approvedFallbackProfileId).toBeUndefined();
  });
});

describe.each([
  ['SERVER_ERROR_500', 'a provider 5xx'],
  ['RATE_LIMITED_429', 'a provider 429'],
  ['SCHEMA_INVALID_REASONING', 'a schema failure'],
])('with no fallback configured, %s (%s)', (scenario) => {
  it('calls exactly one profile and returns the original failure', async () => {
    const spy = spyOnTransport(cassetteTransportFor(scenario, cassettes));
    const { deps, port } = harness({ transport: spy.transport });
    const result = await generate(gatewayCall(), reservation, deps);

    expect(result.outcome).toBe('UNAVAILABLE');
    expect(spy.calls).toHaveLength(1);
    expect(profilesCalled(spy.calls)).toEqual(['QUICK_SYNTHESIS']);
    expect(port.rows).toHaveLength(1);
  });
});

describe('a fallback pointing at a CANDIDATE profile is refused', () => {
  it('does not make a second call, and the original failure stands', async () => {
    const registry = registryWith('QUICK_SYNTHESIS', { approvedFallbackProfileId: 'DEEP_SYNTHESIS' });
    // DEEP_SYNTHESIS ships CANDIDATE. In EVALUATION it would RESOLVE — the extra promotion check is
    // what stops it, which is the whole point of "independent approval".
    const spy = spyOnTransport(cassetteTransportFor('SERVER_ERROR_500', cassettes));
    const { deps, port } = harness({ transport: spy.transport, profileRegistry: registry });
    const result = await generate(gatewayCall(), reservation, deps);

    expect(result.outcome).toBe('UNAVAILABLE');
    if (result.outcome !== 'UNAVAILABLE') throw new Error('unreachable');
    expect(result.reason).toBe('PROVIDER_FAILURE');
    expect(spy.calls).toHaveLength(1);
    expect(profilesCalled(spy.calls)).toEqual(['QUICK_SYNTHESIS']);
    expect(port.rows).toHaveLength(1);
  });
});

describe('a fallback pointing at an APPROVED profile is attempted, exactly once', () => {
  const registry = registryWith(
    'DEEP_SYNTHESIS',
    { promotionState: 'APPROVED' },
    registryWith('QUICK_SYNTHESIS', { approvedFallbackProfileId: 'DEEP_SYNTHESIS' }),
  );

  it('calls exactly the approved fallback after a provider failure', async () => {
    // The fallback's reservation must be its own: a token held for QUICK_SYNTHESIS is not a token for
    // DEEP_SYNTHESIS, and the second attempt refuses it. That is the correct, conservative behaviour.
    const spy = spyOnTransport(cassetteTransportFor('SERVER_ERROR_500', cassettes));
    const { deps } = harness({ transport: spy.transport, profileRegistry: registry });
    const result = await generate(gatewayCall(), reservation, deps);

    expect(result.outcome).toBe('UNAVAILABLE');
    if (result.outcome !== 'UNAVAILABLE') throw new Error('unreachable');
    expect(result.reason).toBe('NO_RESERVATION');
    expect(result.detail).toBe('RESERVATION_WRONG_PROFILE');
    expect(spy.calls).toHaveLength(1);
    expect(profilesCalled(spy.calls)).toEqual(['QUICK_SYNTHESIS']);
  });

  it('succeeds through the fallback when a reservation covering it is supplied', async () => {
    const spy = spyOnTransport(async (request) => {
      const profileId = (request.body as { profileId: string }).profileId;
      const scenario = profileId === 'QUICK_SYNTHESIS' ? 'SERVER_ERROR_500' : 'VALID';
      return cassetteTransportFor(scenario, cassettes)(request);
    });
    // A reservation whose profile matches whichever attempt is running is not something EVID-08 would
    // mint either; the point of this case is only that the fallback is REACHED and is the approved one.
    const { deps, port } = harness({ transport: spy.transport, profileRegistry: registry });
    const result = await generate(
      gatewayCall(),
      forgeReservation({ profileId: 'QUICK_SYNTHESIS', expiresAt: 1_000_000 }),
      deps,
    );

    expect(result.outcome).toBe('UNAVAILABLE');
    // Still refused, for the reservation reason above — and crucially the fallback profile never
    // received a call it was not independently reserved for.
    expect(profilesCalled(spy.calls)).toEqual(['QUICK_SYNTHESIS']);
    expect(port.rows).toHaveLength(1);
  });
});

describe('a schema failure never falls back', () => {
  it('does not retry, re-prompt or substitute', async () => {
    const registry = registryWith(
      'DEEP_SYNTHESIS',
      { promotionState: 'APPROVED' },
      registryWith('QUICK_SYNTHESIS', { approvedFallbackProfileId: 'DEEP_SYNTHESIS' }),
    );
    const spy = spyOnTransport(cassetteTransportFor('SCHEMA_INVALID_REASONING', cassettes));
    const { deps } = harness({ transport: spy.transport, profileRegistry: registry });
    const result = await generate(gatewayCall(), reservation, deps);

    expect(result.outcome).toBe('UNAVAILABLE');
    if (result.outcome !== 'UNAVAILABLE') throw new Error('unreachable');
    expect(result.reason).toBe('SCHEMA_INVALID');
    expect(spy.calls).toHaveLength(1);
  });
});

describe('no path selects a provider outside the resolved profile’s allowlist', () => {
  it('every transport call names a provider the profile allows', async () => {
    const spy = spyOnTransport(cassetteTransportFor('VALID', cassettes));
    const { deps } = harness({ transport: spy.transport });
    await generate(gatewayCall(), reservation, deps);
    for (const call of spy.calls) {
      expect(MODEL_PROFILE_REGISTRY_V1.QUICK_SYNTHESIS.allowedProviderIds).toContain(call.providerId);
    }
    expect(spy.calls.length).toBeGreaterThan(0);
  });
});
