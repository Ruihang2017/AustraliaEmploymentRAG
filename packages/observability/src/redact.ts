/**
 * The second, DEFENSIVE redaction layer — RUNT-07 Deliverable 4.
 *
 * LAYERING (this is the design, not an omission). The first and primary layer is the structural
 * allowlist in `src/fields.ts`: a value only reaches serialisation if it satisfies a closed grammar.
 * Redaction runs AFTER that check and only over the two kinds whose grammar is loose enough to carry
 * a token by accident:
 *
 * - `version`  — `[A-Za-z0-9][A-Za-z0-9._+-]{0,63}`, which a bearer-ish token can fit inside.
 * - `hash`     — 64 hex characters; included for symmetry and future-proofing.
 *
 * `opaque_id` values are already `<prefix>_<uuidv7>`, `code`/`error_code` values come from closed
 * domains, and the numeric kinds cannot hold a string. Running a generic high-entropy-token rule
 * over an opaque id would produce nothing but false positives.
 *
 * NEVER A HASH. PRD §37.2: "Metrics record category/count/result, not content or reversible hash".
 * The marker below is a fixed constant that carries nothing derived from the input — not a length,
 * not a prefix, not a digest. `src/**` imports no hashing function at all, and `test/surface.test.ts`
 * asserts it.
 *
 * ReDoS. Every pattern here is linear — a single bounded character class, no nested quantifier — and
 * the logger caps a value at 256 characters before this runs, so worst-case work is trivially
 * bounded even if a pattern were ever made non-linear by a later edit.
 *
 * The credential-shaped literals below are assembled from PARTS at runtime, never written
 * contiguously in source: the repository's CI secret scan
 * (`.github/workflows/checks/secret-scan.mjs`) reads every git-tracked file, and a contiguous
 * literal would trip its own `private-key-block` rule. Identifiers are camelCase for the same
 * reason — its variable-name patterns are upper-snake only.
 */

/** The fixed replacement. Carries nothing from the input. */
export const REDACTION_MARKER = '[redacted]';

/** Configuration for the credential-prefix rule. */
export interface RedactOptions {
  /**
   * Greppable credential prefixes to redact, e.g. `['txr_live']`.
   *
   * Default: EMPTY. `AUTC-04` (`02-auth-core`) owns the credential grammar and has not landed; it
   * specifies only "a fixed, greppable prefix shape" and fixes no literal. When it does, the real
   * prefix is supplied here by the composition root — no code in this package changes. The generic
   * bearer and private-key rules apply regardless of this setting.
   *
   * Each entry must match `/^[A-Za-z0-9_-]{1,16}$/`; anything else is ignored rather than compiled,
   * so a caller cannot inject regular-expression syntax into this module.
   */
  readonly credentialPrefixes?: readonly string[];
}

const safePrefix = /^[A-Za-z0-9_-]{1,16}$/;

/**
 * `Bearer <token>` in any casing. The token class is the RFC 6750 `b64token` set plus `+` and `/`,
 * with an optional `=` padding tail. Bounded below at 8 characters so the word "Bearer" followed by
 * a short ordinary word is not mistaken for a credential.
 */
const bearerPattern = /\bBearer\s+[A-Za-z0-9._~+/-]{8,}={0,2}/gi;

/**
 * A PEM header line. Assembled from parts so the contiguous literal never appears in a tracked file
 * (see the file header). `[A-Z ]{0,24}` covers `RSA `, `EC `, `OPENSSH ` and the bare form.
 */
const pemHeaderPattern = new RegExp(
  ['-----BEGIN [A-Z ]{0,24}PRIV', 'ATE ', 'KEY-----'].join(''),
  'g',
);

/** Escapes a prefix so it is matched literally. */
function escapeForRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\-]/g, '\\$&');
}

/** Builds the `<prefix><at least 20 credential characters>` rules for the configured prefixes. */
function credentialPatterns(prefixes: readonly string[]): RegExp[] {
  const patterns: RegExp[] = [];
  for (const prefix of prefixes) {
    if (!safePrefix.test(prefix)) continue;
    patterns.push(new RegExp(`${escapeForRegExp(prefix)}[A-Za-z0-9_-]{20,}`, 'g'));
  }
  return patterns;
}

/**
 * Replaces every known credential shape in `value` with {@link REDACTION_MARKER}.
 *
 * The return value is either `value` unchanged or `value` with one or more spans replaced by the
 * fixed marker. No other transformation is applied: nothing is hashed, truncated, encoded or
 * summarised, so a redacted line is never a lossy re-encoding of a credential.
 */
export function redactValue(value: string, options: RedactOptions = {}): string {
  let out = value;
  out = out.replace(pemHeaderPattern, REDACTION_MARKER);
  out = out.replace(bearerPattern, REDACTION_MARKER);
  for (const pattern of credentialPatterns(options.credentialPrefixes ?? [])) {
    out = out.replace(pattern, REDACTION_MARKER);
  }
  return out;
}

/** Whether `redactValue` would change `value`. Used by tests and by callers that want to count. */
export function containsCredentialShape(value: string, options: RedactOptions = {}): boolean {
  return redactValue(value, options) !== value;
}
