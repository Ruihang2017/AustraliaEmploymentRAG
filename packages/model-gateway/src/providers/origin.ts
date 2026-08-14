/**
 * EVID-07 deliverable 5 — allowlisted origins only.
 *
 * PRD §16.4: *"Arbitrary base URLs are prohibited."* This file is the whole enforcement, and it is
 * deliberately tiny and total:
 *
 *  - the check runs at ADAPTER CONSTRUCTION, so a bad origin cannot survive to a call site;
 *  - `https:` only — an `http:` origin throws, however allowlisted it claims to be;
 *  - the match is EXACT against the frozen allowlist, character for character. No prefix match, no
 *    suffix match, no host-suffix match: `https://evil.example.com.attacker.invalid` must not pass
 *    because it ends with something familiar, and a prefix match would accept it;
 *  - there is no configuration key, environment read or parameter anywhere in `src/**` through which
 *    an arbitrary origin can reach this function. The only source of an allowlist is
 *    `registry.ts`'s frozen data. `test/providers/architecture.test.ts` asserts no `process.env` and
 *    no `new URL(` exists in `src/**`.
 *
 * The origin is parsed by hand rather than with `new URL(...)`: `URL` normalises, lower-cases,
 * resolves relative references and strips default ports, and every one of those transformations is a
 * way for two different strings to compare equal to the allowlist. A dumb exact comparison cannot be
 * tricked by a normalisation nobody reviewed.
 */
import type { ProviderDescriptor } from './registry.js';

export class OriginNotAllowedError extends Error {
  public readonly providerId: string;
  public readonly origin: string;

  public constructor(providerId: string, origin: string, why: string) {
    super(`origin ${origin} is not permitted for provider ${providerId}: ${why} (PRD §16.4, §37.5)`);
    this.name = 'OriginNotAllowedError';
    this.providerId = providerId;
    this.origin = origin;
  }
}

/** `https://host` or `https://host:port`, with no path, query, fragment, credential or trailing slash. */
const ORIGIN_SHAPE = /^https:\/\/[A-Za-z0-9.-]+(?::[0-9]{1,5})?$/;

export function isWellFormedHttpsOrigin(origin: string): boolean {
  return ORIGIN_SHAPE.test(origin);
}

/**
 * Throws unless `origin` is a well-formed `https:` origin that appears verbatim in the descriptor's
 * allowlist. Returns the origin, so it can be used inline at a construction site.
 */
export function assertAllowedOrigin(descriptor: ProviderDescriptor, origin: string): string {
  if (!isWellFormedHttpsOrigin(origin)) {
    throw new OriginNotAllowedError(
      descriptor.providerId,
      origin,
      'only a bare https origin (scheme, host and optional port) is accepted',
    );
  }
  if (descriptor.allowedOrigins.length === 0) {
    throw new OriginNotAllowedError(
      descriptor.providerId,
      origin,
      'this provider declares no allowlisted origin',
    );
  }
  if (!descriptor.allowedOrigins.includes(origin)) {
    throw new OriginNotAllowedError(descriptor.providerId, origin, 'it is not in the frozen allowlist');
  }
  return origin;
}
