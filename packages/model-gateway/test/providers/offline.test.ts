/**
 * EVID-07 acceptance item "Everything replays offline" (PRD §20.2, §20.3; sub-PRD D15).
 *
 * `support/network-stub.ts` is imported by every suite in this package for its side effect: it
 * replaces `fetch`, `XMLHttpRequest`, `WebSocket` and `EventSource` with functions that throw, and
 * deletes any `PROVIDER_*`-shaped environment variable. So "the entire suite passes with the network
 * globally stubbed to throw and no provider key present" is not a claim made once here — it is the
 * condition every other file in this directory already ran under.
 */
import { describe, expect, it } from 'vitest';

import { NetworkAccessInTestError, REMOVED_ENVIRONMENT_KEYS } from './support/network-stub.js';
import { cassetteTransportFor, loadCassettes } from './support/cassettes.js';
import { forgeReservation } from './support/reservation-double.js';
import { gatewayCall, harness, spyOnTransport } from './support/harness.js';
import { generate } from '../../src/providers/generate.js';
import { createStubProvider } from '../../src/providers/stub/index.js';
import {
  CassetteMissError,
  createCassetteTransport,
  fingerprintOf,
} from '../../src/providers/transport/cassette.js';
import { recordingTransport } from '../../src/providers/transport/record.js';
import type { Cassette } from '../../src/providers/transport/cassette.js';

const cassettes = loadCassettes();
const reservation = forgeReservation({ expiresAt: 1_000_000 });

describe('the network is stubbed to throw for the whole suite', () => {
  it.each(['fetch', 'XMLHttpRequest', 'WebSocket', 'EventSource'])('%s throws', (name) => {
    const entry = (globalThis as unknown as Record<string, unknown>)[name];
    expect(typeof entry).toBe('function');
    expect(() => (entry as () => unknown)()).toThrow(NetworkAccessInTestError);
  });

  it('no PROVIDER_-shaped environment variable is present', () => {
    for (const key of Object.keys(process.env)) {
      expect(key).not.toMatch(/^(PROVIDER|MODEL_GATEWAY|OPENAI|ANTHROPIC|AZURE|VERTEX|BEDROCK)_/);
    }
    // Non-vacuity: the remover ran (it reports what it removed, usually nothing on a clean machine).
    expect(Array.isArray(REMOVED_ENVIRONMENT_KEYS)).toBe(true);
  });
});

describe('a cassette miss fails loudly rather than reaching anything', () => {
  it('rejects with CassetteMissError naming the fingerprint', async () => {
    const replay = createCassetteTransport([]);
    await expect(
      replay({
        providerId: 'STUB_DETERMINISTIC',
        path: '/v1/generate',
        method: 'POST',
        body: {},
        headersSubset: {},
      }),
    ).rejects.toThrow(CassetteMissError);
  });

  it('has no fallthrough parameter — the API cannot be pointed at a network', () => {
    expect(createCassetteTransport.length).toBe(1);
  });

  it('a miss inside the gateway becomes PROVIDER_FAILURE, never a fabricated success', async () => {
    const { deps } = harness({ transport: cassetteTransportFor('NO_SUCH_SCENARIO', cassettes) });
    const result = await generate(gatewayCall(), reservation, deps);
    expect(result.outcome).toBe('UNAVAILABLE');
    if (result.outcome !== 'UNAVAILABLE') throw new Error('unreachable');
    expect(result.reason).toBe('PROVIDER_FAILURE');
  });
});

describe('the fingerprint carries identifiers only (plan §6 risk 5)', () => {
  const key = {
    providerId: 'STUB_DETERMINISTIC',
    profileId: 'QUICK_SYNTHESIS',
    instructionTemplateVersion: 'instruction-template-v1',
    packId: 'pk_1',
    packHash: 'sha256:abc',
    scenarioKey: 'VALID',
  };

  it('is stable and order-independent of the object literal', () => {
    const reordered = {
      scenarioKey: 'VALID',
      packHash: 'sha256:abc',
      packId: 'pk_1',
      instructionTemplateVersion: 'instruction-template-v1',
      profileId: 'QUICK_SYNTHESIS',
      providerId: 'STUB_DETERMINISTIC',
    };
    expect(fingerprintOf(reordered)).toBe(fingerprintOf(key));
  });

  it('changes when any identifier changes', () => {
    expect(fingerprintOf({ ...key, scenarioKey: 'SERVER_ERROR_500' })).not.toBe(fingerprintOf(key));
    expect(fingerprintOf({ ...key, packHash: 'sha256:def' })).not.toBe(fingerprintOf(key));
  });

  it('contains no evidence text, no customer fact and no body', () => {
    const fingerprint = fingerprintOf(key);
    expect(fingerprint).not.toContain('exact_text');
    expect(fingerprint).not.toContain('EVIDENCE');
    expect(fingerprint.split('|')).toHaveLength(6);
  });
});

describe('record mode cannot record anything on its own', () => {
  it('requires the host to supply BOTH a live transport and a sink', () => {
    expect(recordingTransport.length).toBe(2);
  });

  it('writes the fingerprint key to the sink, never the request body', async () => {
    const written: Cassette[] = [];
    const decorated = recordingTransport(createStubProvider({ mode: 'VALID' }), (cassette) =>
      written.push(cassette),
    );
    const spy = spyOnTransport(decorated);
    const { deps } = harness({ transport: spy.transport });
    await generate(gatewayCall(), reservation, deps);

    expect(written).toHaveLength(1);
    const recorded = written[0];
    expect(recorded).toBeDefined();
    expect(Object.keys(recorded?.key ?? {}).sort()).toEqual([
      'instructionTemplateVersion',
      'packHash',
      'packId',
      'profileId',
      'providerId',
      'scenarioKey',
    ]);
    expect(JSON.stringify(recorded?.key)).not.toContain('exact_text');
  });
});

describe('every provider interaction in this package came from a cassette or the stub', () => {
  it('the gateway never constructs a transport of its own', async () => {
    // A harness with NO transport is not constructible: `transport` is a required member of
    // GatewayDeps and there is no default anywhere in src/**. The nearest observable proof is that
    // every call is seen by the injected spy, and nothing happens that the spy did not see.
    const spy = spyOnTransport(cassetteTransportFor('VALID', cassettes));
    const { deps } = harness({ transport: spy.transport });
    const result = await generate(gatewayCall(), reservation, deps);
    expect(result.outcome, JSON.stringify(result)).toBe('OK');
    expect(spy.calls).toHaveLength(1);
    expect(spy.calls[0]?.origin).toBeUndefined();
  });
});
