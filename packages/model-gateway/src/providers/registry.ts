/**
 * EVID-07 deliverable 5 — the provider registry.
 *
 * THE SHIPPED REGISTRY NAMES NO VENDOR AND NO EXTERNAL ORIGIN. Which providers meet PRD §10.2's
 * no-training / zero-or-approved-minimal retention terms is sub-PRD **Q-EVID-4**, an open Founder
 * decision; encoding a guess here would pre-empt it and would put a vendor name into a file that
 * `GOLD-15` has not yet measured. The one entry is the deterministic in-process stub, whose allowlist
 * is empty because it opens nothing.
 *
 * The origin allowlist is enforced by a pure function over ANY descriptor (`origin.ts`), so the
 * allowlist tests use a synthetic descriptor with `https://provider.invalid` origins (RFC 2606) and
 * never a real vendor. `test/providers/origin.test.ts` asserts the SHIPPED registry declares no
 * external origin at all.
 */
import { STUB_PROVIDER_ID } from '../profiles/provider-ids.js';
import { deepFreeze } from '../profiles/freeze.js';
import type { RetentionPosture } from '../profiles/types.js';

/**
 * How a provider is reached.
 *
 * `IN_PROCESS` is the deterministic stub: no socket, no origin, nothing to allowlist. `HTTPS` is the
 * only other kind this package will ever have — there is no `HTTP`, no `WEBSOCKET`, no `SHELL` and no
 * `PROCESS` member, and adding one would be a PRD §37.5 change, not a refactor.
 */
export type TransportKind = 'IN_PROCESS' | 'HTTPS';

export interface ProviderDescriptor {
  readonly providerId: string;
  /**
   * Exact origins (scheme + host + optional port, no path) this provider may be reached at. PRD §16.4:
   * *"Arbitrary base URLs are prohibited."* There is no configuration key anywhere in `src/**` that
   * accepts one — the list is frozen data and the only way to add an entry is to edit this file.
   */
  readonly allowedOrigins: readonly string[];
  readonly transportKind: TransportKind;
  readonly retention: { readonly noTraining: boolean; readonly mode: RetentionPosture };
}

export const PROVIDER_REGISTRY_VERSION = 'provider-registry-v1';

export const PROVIDER_REGISTRY_V1: Readonly<Record<string, ProviderDescriptor>> = deepFreeze({
  [STUB_PROVIDER_ID]: {
    providerId: STUB_PROVIDER_ID,
    allowedOrigins: [],
    transportKind: 'IN_PROCESS',
    retention: { noTraining: true, mode: 'ZERO' },
  },
} as const);

/** The registry as a list, for `resolveProfile`'s retention precondition. */
export const PROVIDER_DESCRIPTORS: readonly ProviderDescriptor[] = deepFreeze(
  Object.values(PROVIDER_REGISTRY_V1),
);

export function findProviderDescriptor(
  providerId: string,
  registry: Readonly<Record<string, ProviderDescriptor>> = PROVIDER_REGISTRY_V1,
): ProviderDescriptor | undefined {
  return Object.prototype.hasOwnProperty.call(registry, providerId) ? registry[providerId] : undefined;
}
