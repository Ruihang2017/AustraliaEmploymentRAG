/**
 * EVID-07 acceptance item "Failure matrix" — `ANS-007`'s named evidence, one test per row of
 * deliverable 10 (PRD §17.3, §14.4, §42.5, §34.9).
 *
 * Every row asserts four things, and the last two are the ones the requirement is actually about:
 * the typed `reason`; the customer-facing `GENERATION_UNAVAILABLE` / 503; that the transport was
 * called the expected number of times; and that NO second profile, provider or model was selected.
 */
import { describe, expect, it } from 'vitest';

import './support/network-stub.js';
import { cassetteTransportFor, loadCassettes } from './support/cassettes.js';
import { forgeReservation } from './support/reservation-double.js';
import {
  gatewayCall,
  harness,
  immediateTimer,
  registryWith,
  respondWith,
  spyOnTransport,
} from './support/harness.js';
import { generate } from '../../src/providers/generate.js';
import { UNAVAILABLE_REASONS } from '../../src/providers/failure.js';
import { createStubProvider } from '../../src/providers/stub/index.js';
import { LocalProfileNotCallableError } from '../../src/profiles/resolve.js';
import { STUB_PROVIDER_ID } from '../../src/profiles/provider-ids.js';
import type { UnavailableReason } from '../../src/providers/failure.js';

const cassettes = loadCassettes();
const reservation = forgeReservation({ expiresAt: 1_000_000 });

interface Row {
  readonly label: string;
  readonly scenario: string;
  readonly reason: UnavailableReason;
  readonly detail: string;
  readonly transportCalls: number;
}

/** The rows that replay from a cassette. Kill switch / reservation / promotion have their own files. */
const CASSETTE_ROWS: readonly Row[] = [
  {
    label: 'provider 5xx',
    scenario: 'SERVER_ERROR_500',
    reason: 'PROVIDER_FAILURE',
    detail: 'PROVIDER_STATUS_5XX',
    transportCalls: 1,
  },
  {
    label: 'provider 4xx',
    scenario: 'CLIENT_ERROR_400',
    reason: 'PROVIDER_FAILURE',
    detail: 'PROVIDER_STATUS_4XX',
    transportCalls: 1,
  },
  {
    label: 'provider 429',
    scenario: 'RATE_LIMITED_429',
    reason: 'PROVIDER_RATE_LIMITED',
    detail: 'PROVIDER_STATUS_429',
    transportCalls: 1,
  },
  {
    label: 'schema-invalid response (a reasoning field)',
    scenario: 'SCHEMA_INVALID_REASONING',
    reason: 'SCHEMA_INVALID',
    detail: 'RESPONSE_FAILED_SCHEMA',
    transportCalls: 1,
  },
  {
    label: 'truncated JSON',
    scenario: 'TRUNCATED_JSON',
    reason: 'SCHEMA_INVALID',
    detail: 'RESPONSE_FAILED_SCHEMA',
    transportCalls: 1,
  },
  {
    label: 'empty body',
    scenario: 'EMPTY_BODY',
    reason: 'SCHEMA_INVALID',
    detail: 'RESPONSE_FAILED_SCHEMA',
    transportCalls: 1,
  },
];

describe('the reason vocabulary is exactly the ticket’s seven', () => {
  it('lists them in the deliverable-10 order', () => {
    expect([...UNAVAILABLE_REASONS]).toEqual([
      'PROVIDER_FAILURE',
      'PROVIDER_RATE_LIMITED',
      'SCHEMA_INVALID',
      'PROFILE_TIMEOUT',
      'PROFILE_NOT_APPROVED',
      'KILL_SWITCH',
      'NO_RESERVATION',
    ]);
  });
});

describe.each(CASSETTE_ROWS)('$label', (row) => {
  it(`returns ${row.reason} with GENERATION_UNAVAILABLE / 503 and no substitution`, async () => {
    const spy = spyOnTransport(cassetteTransportFor(row.scenario, cassettes));
    const { deps, port } = harness({ transport: spy.transport });
    const result = await generate(gatewayCall(), reservation, deps);

    expect(result.outcome, JSON.stringify(result)).toBe('UNAVAILABLE');
    if (result.outcome !== 'UNAVAILABLE') throw new Error('unreachable');
    expect(result.reason).toBe(row.reason);
    expect(result.detail).toBe(row.detail);
    expect(result.errorCode).toBe('GENERATION_UNAVAILABLE');
    expect(result.httpStatus).toBe(503);

    expect(spy.calls).toHaveLength(row.transportCalls);
    // No second profile, provider or model was selected.
    expect(new Set(spy.calls.map((call) => call.providerId))).toEqual(new Set([STUB_PROVIDER_ID]));
    const profileIds = spy.calls.map((call) => (call.body as { profileId: string }).profileId);
    expect(new Set(profileIds)).toEqual(new Set(['QUICK_SYNTHESIS']));
    expect(port.rows).toHaveLength(1);
    expect(port.rows[0]?.profile).toBe('QUICK_SYNTHESIS');
  });
});

describe('a 429 honours Retry-After', () => {
  it('reports the delta-seconds header in milliseconds', async () => {
    const { deps } = harness({ transport: cassetteTransportFor('RATE_LIMITED_429', cassettes) });
    const result = await generate(gatewayCall(), reservation, deps);
    if (result.outcome !== 'UNAVAILABLE') throw new Error('unreachable');
    expect(result.retryAfterMs).toBe(42_000);
  });

  it('omits retryAfterMs when the header is absent', async () => {
    const { deps } = harness({ transport: cassetteTransportFor('RATE_LIMITED_429_NO_HEADER', cassettes) });
    const result = await generate(gatewayCall(), reservation, deps);
    if (result.outcome !== 'UNAVAILABLE') throw new Error('unreachable');
    expect(result.reason).toBe('PROVIDER_RATE_LIMITED');
    expect(result.retryAfterMs).toBeUndefined();
  });

  it('omits retryAfterMs for the HTTP-date form rather than guessing (there is no clock here)', async () => {
    const { deps } = harness({ transport: cassetteTransportFor('RATE_LIMITED_429_HTTP_DATE', cassettes) });
    const result = await generate(gatewayCall(), reservation, deps);
    if (result.outcome !== 'UNAVAILABLE') throw new Error('unreachable');
    expect(result.retryAfterMs).toBeUndefined();
  });
});

describe('the rows that never reach a provider', () => {
  it('a transport that throws → PROVIDER_FAILURE', async () => {
    const spy = spyOnTransport(() => Promise.reject(new Error('ECONNRESET')));
    const { deps } = harness({ transport: spy.transport });
    const result = await generate(gatewayCall(), reservation, deps);
    if (result.outcome !== 'UNAVAILABLE') throw new Error('unreachable');
    expect(result.reason).toBe('PROVIDER_FAILURE');
    expect(result.detail).toBe('TRANSPORT_THREW');
    expect(spy.calls).toHaveLength(1);
  });

  it('the elapsed ceiling → PROFILE_TIMEOUT, with exactly one call', async () => {
    const spy = spyOnTransport(createStubProvider({ mode: 'TIMEOUT' }));
    const { deps, port } = harness({ transport: spy.transport, timer: immediateTimer });
    const result = await generate(gatewayCall(), reservation, deps);
    if (result.outcome !== 'UNAVAILABLE') throw new Error('unreachable');
    expect(result.reason).toBe('PROFILE_TIMEOUT');
    expect(result.detail).toBe('ELAPSED_CEILING_EXCEEDED');
    expect(spy.calls).toHaveLength(1);
    expect(port.rows).toHaveLength(1);
  });

  it('a CANDIDATE profile in PRODUCTION → PROFILE_NOT_APPROVED, with zero calls', async () => {
    const spy = spyOnTransport(cassetteTransportFor('VALID', cassettes));
    const { deps, port } = harness({ transport: spy.transport, environment: 'PRODUCTION' });
    const result = await generate(gatewayCall(), reservation, deps);
    if (result.outcome !== 'UNAVAILABLE') throw new Error('unreachable');
    expect(result.reason).toBe('PROFILE_NOT_APPROVED');
    expect(result.detail).toBe('PROFILE_NOT_APPROVED_FOR_ENVIRONMENT');
    expect(spy.calls).toHaveLength(0);
    expect(port.rows).toHaveLength(0);
  });

  it('an unknown profile id → PROFILE_NOT_APPROVED, with zero calls', async () => {
    const spy = spyOnTransport(cassetteTransportFor('VALID', cassettes));
    const { deps } = harness({ transport: spy.transport });
    const result = await generate(gatewayCall({ profileId: 'NOT_A_PROFILE' }), reservation, deps);
    if (result.outcome !== 'UNAVAILABLE') throw new Error('unreachable');
    expect(result.reason).toBe('PROFILE_NOT_APPROVED');
    expect(result.detail).toBe('PROFILE_UNKNOWN');
    expect(spy.calls).toHaveLength(0);
  });

  it('a provider whose retention posture fails PRD §10.2 → PROFILE_NOT_APPROVED, with zero calls', async () => {
    const spy = spyOnTransport(cassetteTransportFor('VALID', cassettes));
    const { deps } = harness({
      transport: spy.transport,
      providers: [{ providerId: STUB_PROVIDER_ID, allowedOrigins: [], transportKind: 'IN_PROCESS', retention: { noTraining: false, mode: 'ZERO' } }],
    });
    const result = await generate(gatewayCall(), reservation, deps);
    if (result.outcome !== 'UNAVAILABLE') throw new Error('unreachable');
    expect(result.reason).toBe('PROFILE_NOT_APPROVED');
    expect(result.detail).toBe('PROVIDER_RETENTION_UNACCEPTABLE');
    expect(spy.calls).toHaveLength(0);
  });

  it.each(['QUERY_EMBEDDING', 'LOCAL_RERANK'] as const)(
    'a local profile (%s) throws naming RETR-07 — deliberately NOT a matrix cell',
    async (profileId) => {
      const spy = spyOnTransport(cassetteTransportFor('VALID', cassettes));
      const { deps } = harness({ transport: spy.transport });
      await expect(generate(gatewayCall({ profileId }), reservation, deps)).rejects.toThrow(
        LocalProfileNotCallableError,
      );
      expect(spy.calls).toHaveLength(0);
    },
  );
});

describe('the happy path still works (the matrix is not simply always-failing)', () => {
  it('returns OK from the QUICK_SYNTHESIS cassette', async () => {
    const spy = spyOnTransport(cassetteTransportFor('VALID', cassettes));
    const { deps, port } = harness({ transport: spy.transport });
    const result = await generate(gatewayCall(), reservation, deps);

    expect(result.outcome, JSON.stringify(result)).toBe('OK');
    if (result.outcome !== 'OK') throw new Error('unreachable');
    expect(result.profileId).toBe('QUICK_SYNTHESIS');
    expect(result.providerId).toBe(STUB_PROVIDER_ID);
    expect(result.actualModelVersion).toBe('stub-deterministic-v1');
    expect(result.response.proposed_status).toBe('CONDITIONAL');
    expect(spy.calls).toHaveLength(1);
    expect(port.rows[0]?.schemaStatus).toBe('VALID');
    expect(port.rows[0]?.inputTokens).toBe(1200);
    expect(port.rows[0]?.costMicroAud).toBe(1500n);
  });

  it.each(['DEEP_SYNTHESIS', 'STRUCTURED_REPAIR', 'EVALUATION_JUDGE'] as const)(
    'returns OK from the %s cassette',
    async (profileId) => {
      const { deps } = harness({ transport: cassetteTransportFor('VALID', cassettes) });
      const result = await generate(
        gatewayCall({ profileId }),
        forgeReservation({ profileId, expiresAt: 1_000_000 }),
        deps,
      );
      expect(result.outcome, JSON.stringify(result)).toBe('OK');
    },
  );

  it('resolves an APPROVED profile in PRODUCTION', async () => {
    const { deps } = harness({
      transport: cassetteTransportFor('VALID', cassettes),
      environment: 'PRODUCTION',
      profileRegistry: registryWith('QUICK_SYNTHESIS', { promotionState: 'APPROVED' }),
    });
    const result = await generate(gatewayCall(), reservation, deps);
    expect(result.outcome, JSON.stringify(result)).toBe('OK');
  });

  it('is not accidentally passing because everything replays: an unrecorded scenario is a loud miss', async () => {
    const { deps } = harness({ transport: cassetteTransportFor('NOT_RECORDED', cassettes) });
    const result = await generate(gatewayCall(), reservation, deps);
    // A miss throws inside the transport, which the matrix maps to PROVIDER_FAILURE — never a silent
    // fallthrough to a network, and never a fabricated success.
    if (result.outcome !== 'UNAVAILABLE') throw new Error('unreachable');
    expect(result.reason).toBe('PROVIDER_FAILURE');
    expect(result.detail).toBe('TRANSPORT_THREW');
  });
});

describe('every non-OK outcome is one of the seven reasons (no generic path)', () => {
  it('holds across every transport behaviour this suite can produce', async () => {
    const behaviours = [
      cassetteTransportFor('SERVER_ERROR_500', cassettes),
      cassetteTransportFor('RATE_LIMITED_429', cassettes),
      cassetteTransportFor('TRUNCATED_JSON', cassettes),
      cassetteTransportFor('NOT_RECORDED', cassettes),
      respondWith({ status: 302, body: '' }),
      respondWith({ status: 204, body: '' }),
      () => Promise.reject(new Error('boom')),
    ];
    for (const transport of behaviours) {
      const { deps } = harness({ transport });
      const result = await generate(gatewayCall(), reservation, deps);
      if (result.outcome === 'OK') continue;
      expect(UNAVAILABLE_REASONS as readonly string[]).toContain(result.reason);
      expect(result.errorCode).toBe('GENERATION_UNAVAILABLE');
      expect(result.httpStatus).toBe(503);
    }
  });
});
