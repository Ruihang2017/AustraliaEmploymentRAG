/**
 * EVID-07 deliverable 4 — the provider adapter interface.
 *
 * Three things are structural rather than documented, which is the point of the deliverable:
 *
 *  1. `reservation: HeldReservation` is a REQUIRED POSITIONAL parameter, so omitting it is a compile
 *     error and there is no default, no `?` and no overload that lets a call proceed without one
 *     (sub-PRD D17, PRD §42.6);
 *  2. `transport` is INJECTED, so no adapter constructs its own client — and this package could not
 *     construct one anyway;
 *  3. the request type carries only the pack, the sanitized facts, the profile id and the ids — no
 *     tenant object, no credential, no tool list, no URL, no shell command (PRD §37.5).
 *
 * `createProviderAdapter` validates the origin AT CONSTRUCTION (`origin.ts`), so an adapter that
 * exists is an adapter whose origin was allowlisted. An `IN_PROCESS` provider takes no origin at all;
 * passing one to it throws, because a stub with an origin is a stub somebody is about to point at a
 * network. It validates the `headersSubset` at construction for the same reason — see
 * `assertCarryableHeaders` below.
 */
import { assertAllowedOrigin } from './origin.js';
import { OriginNotAllowedError } from './origin.js';
import type { ProviderDescriptor } from './registry.js';
import type { Transport, TransportRequest, TransportResponse } from './transport/types.js';
import type { HeldReservation } from './reservation.js';
import type { ModelProfile } from '../profiles/types.js';
import type { ProviderRequestPayload } from '../schema/request.js';

/** The path a request is posted to. Fixed, code-supplied, never configurable. */
export const PROVIDER_GENERATE_PATH = '/v1/generate';

export interface ProviderAdapter {
  readonly descriptor: ProviderDescriptor;
  readonly origin: string | null;
  /**
   * `reservation` is positional and required — the compile-time half of the "no call without a
   * reservation" acceptance item. The runtime half (expired, forged, wrong profile) is `generate.ts`.
   */
  generate(
    profile: ModelProfile,
    request: ProviderRequestPayload,
    reservation: HeldReservation,
    transport: Transport,
  ): Promise<TransportResponse>;
}

export interface AdapterOptions {
  /**
   * Extra code-supplied header names/values — a small, fixed, non-secret subset (a scenario key, a
   * content type). There is no member for a secret and none may be smuggled in under a header name:
   * `createProviderAdapter` REJECTS an authorization-shaped header at construction (below).
   */
  readonly headersSubset?: Readonly<Record<string, string>>;
}

/**
 * Header names this package refuses to carry, enforced at ADAPTER CONSTRUCTION.
 *
 * `TransportRequest` documents that it has no member a caller could stuff a secret into. That was
 * true of the type and false of this options bag: `headersSubset` is a free `Record<string, string>`
 * on an EXPORTED constructor, so `{ authorization: 'Bearer …' }` type-checked and travelled to the
 * transport. A documented guarantee that only the type enforces is not a guarantee — so the names are
 * matched here, by substring on the lower-cased name, which is deliberately blunt: this subset is
 * code-supplied and tiny, so over-refusing costs a rename and under-refusing costs a leaked secret.
 *
 * The VALUE is checked too, because a bland name with an `Authorization`-scheme value is the obvious
 * way round a name check.
 */
const FORBIDDEN_HEADER_FRAGMENTS: readonly string[] = [
  'auth',
  'key',
  'token',
  'secret',
  'password',
  'passwd',
  'credential',
  'cookie',
  'session',
  'signature',
  'bearer',
  'sig-',
  'x-amz-security',
];

/** `Bearer …`, `Basic …`, `Digest …`, `Negotiate …`, `Token …` — an HTTP auth scheme, whatever the name. */
const AUTH_SCHEME_VALUE = /^(?:bearer|basic|digest|negotiate|token|sso)\s+\S/i;

/**
 * Named for what it is — a header this package will not carry. Deliberately NOT named after the thing
 * it is protecting: `test/providers/architecture.test.ts` refuses any exported name containing that
 * word, and it is right to, because such a name usually belongs to something that HANDLES one.
 */
export class ForbiddenHeaderError extends Error {
  public readonly providerId: string;
  public readonly headerName: string;

  public constructor(providerId: string, headerName: string, why: string) {
    super(
      `header ${headerName} may not be supplied to provider ${providerId}: ${why} ` +
        '(PRD §37.5, §20.2 — this package carries no secret)',
    );
    this.name = 'ForbiddenHeaderError';
    this.providerId = providerId;
    this.headerName = headerName;
  }
}

export function assertCarryableHeaders(
  providerId: string,
  headers: Readonly<Record<string, string>>,
): Readonly<Record<string, string>> {
  for (const [name, value] of Object.entries(headers)) {
    const lowered = name.toLowerCase();
    const collapsed = lowered.replace(/[-_.\s]/g, '');
    for (const fragment of FORBIDDEN_HEADER_FRAGMENTS) {
      const bare = fragment.replace(/[-_.\s]/g, '');
      if (lowered.includes(fragment) || collapsed.includes(bare)) {
        throw new ForbiddenHeaderError(providerId, name, 'the name reads as an authorization header');
      }
    }
    if (AUTH_SCHEME_VALUE.test(value)) {
      throw new ForbiddenHeaderError(providerId, name, 'the value carries an HTTP authorization scheme');
    }
  }
  return headers;
}

export function createProviderAdapter(
  descriptor: ProviderDescriptor,
  origin?: string,
  options: AdapterOptions = {},
): ProviderAdapter {
  let resolvedOrigin: string | null = null;

  if (descriptor.transportKind === 'IN_PROCESS') {
    if (origin !== undefined) {
      throw new OriginNotAllowedError(
        descriptor.providerId,
        origin,
        'an IN_PROCESS provider opens no connection and accepts no origin',
      );
    }
  } else {
    if (origin === undefined) {
      throw new OriginNotAllowedError(
        descriptor.providerId,
        '(none)',
        'an HTTPS provider requires an allowlisted origin at construction',
      );
    }
    resolvedOrigin = assertAllowedOrigin(descriptor, origin);
  }

  const headersSubset = Object.freeze(
    assertCarryableHeaders(descriptor.providerId, { ...options.headersSubset }),
  );

  return {
    descriptor,
    origin: resolvedOrigin,
    generate(
      _profile: ModelProfile,
      request: ProviderRequestPayload,
      _reservation: HeldReservation,
      transport: Transport,
    ): Promise<TransportResponse> {
      const transportRequest: TransportRequest =
        resolvedOrigin === null
          ? {
              providerId: descriptor.providerId,
              path: PROVIDER_GENERATE_PATH,
              method: 'POST',
              body: request,
              headersSubset,
            }
          : {
              providerId: descriptor.providerId,
              origin: resolvedOrigin,
              path: PROVIDER_GENERATE_PATH,
              method: 'POST',
              body: request,
              headersSubset,
            };
      return transport(transportRequest);
    },
  };
}
