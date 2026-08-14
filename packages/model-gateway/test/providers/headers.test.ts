/**
 * EVID-07 — REGRESSION (Reviewer bounce, medium finding).
 *
 * `src/providers/transport/types.ts` states that a `TransportRequest` "has NO credential member and no
 * header map a caller could stuff one into". That was true of the TYPE and false of the exported
 * low-level constructor: `createProviderAdapter(descriptor, origin, { headersSubset })` took a free
 * `Record<string, string>`, so `{ authorization: 'Bearer …' }` type-checked and reached the transport.
 * `generate` never passes options, so nothing leaked — but a stated guarantee that only the caller's
 * good manners enforce is not a guarantee, and this package's whole claim is that it CANNOT carry a
 * secret rather than that it chooses not to.
 *
 * The check runs at CONSTRUCTION, like the origin check, so an adapter that exists is an adapter whose
 * headers were already refused or accepted. The synthetic descriptor uses `provider.invalid`
 * (RFC 2606); no value below is a real secret — they are shaped like one, which is the point.
 */
import { describe, expect, it } from 'vitest';

import './support/network-stub.js';
import {
  ForbiddenHeaderError,
  assertCarryableHeaders,
  createProviderAdapter,
} from '../../src/providers/adapter.js';
import { PROVIDER_DESCRIPTORS } from '../../src/providers/registry.js';
import type { ProviderDescriptor } from '../../src/providers/registry.js';
import { respondWith, spyOnTransport } from './support/harness.js';
import { forgeReservation } from './support/reservation-double.js';
import { buildProviderRequest } from '../../src/schema/request.js';
import { MODEL_PROFILE_REGISTRY_V1 } from '../../src/profiles/registry.js';
import { evidencePack, sanitizedFacts } from './support/doubles.js';

const SYNTHETIC: ProviderDescriptor = Object.freeze({
  providerId: 'SYNTHETIC_HTTPS',
  allowedOrigins: Object.freeze(['https://provider.invalid']),
  transportKind: 'HTTPS',
  retention: { noTraining: true, mode: 'ZERO' },
});

const IN_PROCESS = (): ProviderDescriptor => {
  const stub = PROVIDER_DESCRIPTORS[0];
  if (stub === undefined) throw new Error('the shipped registry is empty');
  return stub;
};

describe('a credential-shaped header name is refused at construction', () => {
  it.each([
    'authorization',
    'Authorization',
    'proxy-authorization',
    'x-api-key',
    'X-API-Key',
    'apikey',
    'api_key',
    'x-auth-token',
    'authentication',
    'cookie',
    'set-cookie',
    'x-session-id',
    'x-amz-security-token',
    'x-signature',
    'client-secret',
    'x-user-password',
  ])('rejects %s', (name) => {
    expect(() =>
      createProviderAdapter(SYNTHETIC, 'https://provider.invalid', { headersSubset: { [name]: 'v' } }),
    ).toThrow(ForbiddenHeaderError);
  });

  it('rejects it on the in-process provider too — the rule is not about transports', () => {
    expect(() =>
      createProviderAdapter(IN_PROCESS(), undefined, { headersSubset: { authorization: 'x' } }),
    ).toThrow(ForbiddenHeaderError);
  });

  it('names the header and the provider, and echoes no value', () => {
    try {
      assertCarryableHeaders('SYNTHETIC_HTTPS', { authorization: 'Bearer canary-value-9f2b' });
      throw new Error('unreachable — the header should have been refused');
    } catch (error) {
      expect(error).toBeInstanceOf(ForbiddenHeaderError);
      const message = (error as Error).message;
      expect(message).toContain('authorization');
      expect(message).toContain('SYNTHETIC_HTTPS');
      // The refusal must not become the leak: the VALUE never appears in the message.
      expect(message).not.toContain('canary-value-9f2b');
      expect(message).not.toContain('Bearer');
    }
  });
});

describe('an authorization-scheme VALUE is refused whatever the name', () => {
  it.each([
    ['Bearer eyJhbGciOi.canary', 'a bearer scheme'],
    ['basic dXNlcjpwdw==', 'a basic scheme'],
    ['Digest username=x', 'a digest scheme'],
    ['Negotiate abcdef', 'a negotiate scheme'],
    ['Token abc123', 'a token scheme'],
  ])('rejects %s (%s) under a bland header name', (value) => {
    expect(() =>
      createProviderAdapter(SYNTHETIC, 'https://provider.invalid', {
        headersSubset: { 'x-taxrag-note': value },
      }),
    ).toThrow(ForbiddenHeaderError);
  });
});

describe('an ordinary code-supplied header still passes', () => {
  it.each([
    ['accept', 'application/json'],
    ['content-type', 'application/json'],
    ['x-taxrag-cassette-scenario', 'VALID'],
    ['x-taxrag-request-shape', 'v1'],
  ])('carries %s', (name, value) => {
    const adapter = createProviderAdapter(SYNTHETIC, 'https://provider.invalid', {
      headersSubset: { [name]: value },
    });
    expect(adapter.origin).toBe('https://provider.invalid');
  });

  it('reaches the transport exactly as supplied, and frozen', async () => {
    const spy = spyOnTransport(respondWith());
    const adapter = createProviderAdapter(IN_PROCESS(), undefined, {
      headersSubset: { accept: 'application/json' },
    });
    const profile = MODEL_PROFILE_REGISTRY_V1.QUICK_SYNTHESIS;
    const request = buildProviderRequest(
      profile,
      sanitizedFacts([{ field: 'question', value: 'a synthetic question' }]),
      evidencePack(),
      { requestId: 'rq_0000000000000001', jobId: 'jb_0000000000000001' },
    );
    await adapter.generate(profile, request, forgeReservation({ expiresAt: 1_000_000 }), spy.transport);

    expect(spy.calls).toHaveLength(1);
    const sent = spy.calls[0];
    if (sent === undefined) throw new Error('unreachable');
    expect(sent.headersSubset).toEqual({ accept: 'application/json' });
    expect(Object.isFrozen(sent.headersSubset)).toBe(true);
  });
});

describe('the guard is not vacuous', () => {
  it('accepts an empty subset — which is what generate() always supplies', () => {
    expect(assertCarryableHeaders('SYNTHETIC_HTTPS', {})).toEqual({});
    expect(createProviderAdapter(IN_PROCESS()).origin).toBeNull();
  });

  it('positive control: the matcher fires on the obvious name and the obvious value', () => {
    expect(() => assertCarryableHeaders('P', { Authorization: 'x' })).toThrow(ForbiddenHeaderError);
    expect(() => assertCarryableHeaders('P', { 'x-note': 'Bearer x' })).toThrow(ForbiddenHeaderError);
    expect(() => assertCarryableHeaders('P', { 'x-note': 'plain' })).not.toThrow();
  });
});
