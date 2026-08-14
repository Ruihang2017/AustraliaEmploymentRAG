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
 * network.
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
  /** Extra code-supplied header names/values. There is no credential member and none may be added. */
  readonly headersSubset?: Readonly<Record<string, string>>;
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

  const headersSubset = Object.freeze({ ...options.headersSubset });

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
