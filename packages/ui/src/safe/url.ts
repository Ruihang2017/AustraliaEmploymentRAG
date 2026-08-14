/**
 * The ONE URL gate of this package (PRD §37.5; `SEC-003`, render layer).
 *
 * Every component that renders a URL goes through here — `Link`, the evidence panel's
 * `official_url`, related-instrument links and `SafeMarkdown`'s link syntax. One gate, not four:
 * a second copy is a second place to get the scheme list wrong.
 *
 * POLICY. `https:` and `mailto:` only. Everything else — `javascript:`, `data:`, `vbscript:`,
 * `file:`, `http:`, a protocol-relative `//host`, a relative path, or anything `new URL` cannot
 * parse — is REJECTED. A rejected URL is rendered as inert text carrying the raw string, never as an
 * anchor and never silently dropped: the reader must be able to see what the source claimed
 * (risk R5).
 *
 * `http:` is rejected deliberately. Official sources are served over TLS, and silently upgrading or
 * accepting a cleartext URL from model-adjacent data is not this layer's call to make.
 */

/** The allowlist, exported so a test reads the same literal the implementation uses. */
export const ALLOWED_URL_SCHEMES = Object.freeze(['https:', 'mailto:'] as const);

/** The `rel` every allowed anchor carries, per ticket Deliverable 5. */
export const SAFE_LINK_REL = 'noopener noreferrer';

export type UrlDecision =
  | { readonly allowed: true; readonly href: string }
  | { readonly allowed: false; readonly reason: 'unparseable' | 'scheme'; readonly text: string };

/**
 * Decides whether `value` may be rendered as an anchor `href`.
 *
 * Pure and total: it throws for no input, so a caller can never accidentally skip the check by
 * wrapping it in a `try`.
 */
export function decideUrl(value: string): UrlDecision {
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    // Covers the relative path, the protocol-relative `//host` and the empty string.
    return { allowed: false, reason: 'unparseable', text: value };
  }
  if (!(ALLOWED_URL_SCHEMES as readonly string[]).includes(parsed.protocol)) {
    return { allowed: false, reason: 'scheme', text: value };
  }
  // `parsed.href` is the normalised form; it is what `new URL` guarantees, not the raw input.
  return { allowed: true, href: parsed.href };
}

/** Convenience predicate for tests and for callers that only need the boolean. */
export function isAllowedUrl(value: string): boolean {
  return decideUrl(value).allowed;
}
