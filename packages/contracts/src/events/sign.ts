/**
 * Webhook signing and verification (PRD §34.8, §8.8, §16.2; FND-05 deliverable 3).
 *
 * The contract, quoted: headers `X-AER-Event-Id`, `X-AER-Timestamp`, `X-AER-Signature: v1=<lowercase
 * hex HMAC-SHA256>`; *"The signature input is `<timestamp>.<raw_request_body>`. Receivers reject a
 * timestamp older than five minutes and deduplicate event IDs."*
 *
 * ## Call-site rule: `rawBody` is the bytes as sent
 *
 * Pass the **raw** request body — the exact bytes read off the socket. Never `JSON.stringify` a parsed
 * object and sign that: key order, unicode escaping and whitespace all differ from the sender's bytes,
 * so the signature will not match, and the failure looks like an attack rather than a bug. In a Node
 * HTTP framework this means capturing the body before the JSON body parser runs.
 *
 * ## What this module deliberately does not do
 *
 * - **No secret sourcing.** The secret is always an argument. This file reads no environment variable,
 *   no file and no network; its only import is `node:crypto` (PRD §20.2). `sign.test.ts` asserts that
 *   statically over this file's source.
 * - **No idempotency store.** PRD §34.8 requires receivers to deduplicate event ids; that needs
 *   storage. `verifyWebhook` returns the parsed `X-AER-Event-Id` so the caller can do it.
 *   `16-monitor-alerts`/`WTCH-05` owns the store, the retry schedule and the dead-letter queue.
 * - **No message text.** A `VerifyResult` carries an enum `reason` and nothing else free-form: no
 *   secret, no signature, no body bytes (PRD §22). `eventId` is echoed because dedupe needs it — an
 *   opaque identifier, not content.
 *
 * ## Two deliberate readings of PRD §34.8, both stricter than its literal wording
 *
 * 1. **The window is symmetric.** §34.8 says "reject a timestamp older than five minutes"; a delivery
 *    whose timestamp is more than `toleranceSeconds` in the **future** is rejected too. It closes a
 *    trivial replay-with-future-timestamp hole and costs nothing legitimate — a receiver whose clock
 *    is that far from the sender's has a bigger problem.
 * 2. **Upper-case hex is `MALFORMED_HEADER`, not `SIGNATURE_MISMATCH`.** §34.8 specifies *lowercase*
 *    hex, so a differently-cased value is a malformed header from a non-conforming sender, not
 *    evidence of tampering. Receiver authors should not page anyone over a case difference.
 */
import { createHmac, timingSafeEqual } from 'node:crypto';

/** A shared signing secret. Always supplied by the caller; never read from the environment. */
export type WebhookSecret = string;

export interface SignWebhookInput {
  readonly secret: WebhookSecret;
  /** Whole seconds since the Unix epoch — the `X-AER-Timestamp` value. */
  readonly timestampSeconds: number;
  /** The raw bytes as sent. See the call-site rule above. */
  readonly rawBody: string | Uint8Array;
}

/** Why a delivery was accepted or rejected. An enum, so nothing sensitive can ride along. */
export type VerifyReason =
  | 'OK'
  | 'MALFORMED_HEADER'
  | 'TIMESTAMP_OUT_OF_WINDOW'
  | 'SIGNATURE_MISMATCH';

export interface VerifyWebhookInput {
  /**
   * One secret, or an ordered rotation list with the current secret first (PRD §8.8 "secret
   * rotation"). FND-05 deliverable 3 spells the parameter `secret` and then requires an ordered list;
   * the union satisfies both readings without a second function. An empty list is a `TypeError` — it
   * would otherwise silently reject every delivery.
   */
  readonly secret: WebhookSecret | readonly WebhookSecret[];
  /**
   * The delivery's headers. Lookup over the three PRD §34.8 names is case-insensitive; a name that
   * appears twice (or once with two values) is `MALFORMED_HEADER`, never "first one wins".
   */
  readonly header: Readonly<Record<string, string | readonly string[] | undefined>>;
  /** The raw bytes as sent. See the call-site rule above. */
  readonly rawBody: string | Uint8Array;
  /** The receiver's current wall clock, in whole seconds. Injected so tests are deterministic. */
  readonly nowSeconds: number;
  /** Replay window, each way. Defaults to PRD §34.8's five minutes. */
  readonly toleranceSeconds?: number;
}

export type VerifyResult =
  | {
      readonly ok: true;
      readonly reason: 'OK';
      /** The parsed `X-AER-Event-Id`, for the caller's dedupe store (PRD §34.8). */
      readonly eventId: string | null;
      readonly timestampSeconds: number;
      /**
       * Which secret matched, as an index into the supplied list (0 for a single secret). PRD §8.8's
       * rotation overlap window is implemented by `WTCH-05` on top of this.
       */
      readonly secretIndex: number;
    }
  | {
      readonly ok: false;
      readonly reason: Exclude<VerifyReason, 'OK'>;
      readonly eventId: string | null;
      readonly timestampSeconds: number | null;
    };

const EVENT_ID_HEADER = 'x-aer-event-id';
const TIMESTAMP_HEADER = 'x-aer-timestamp';
const SIGNATURE_HEADER = 'x-aer-signature';

/** PRD §34.8: `v1=` followed by 64 LOWER-case hex characters. Anchored. */
const SIGNATURE_PATTERN = /^v1=[0-9a-f]{64}$/;
const INTEGER_PATTERN = /^-?[0-9]+$/;
const DEFAULT_TOLERANCE_SECONDS = 300;
const PREFIX_LENGTH = 'v1='.length;

/**
 * The one value for `name`, or `null` when it is absent, empty, or present more than once — under any
 * combination of letter cases. All three of those are `MALFORMED_HEADER`.
 */
function singleHeader(
  header: Readonly<Record<string, string | readonly string[] | undefined>>,
  name: string,
): string | null {
  let found: string | null = null;
  for (const key of Object.keys(header)) {
    if (key.toLowerCase() !== name) continue;
    const raw = header[key];
    if (raw === undefined) continue;
    if (found !== null) return null;
    if (Array.isArray(raw)) {
      if (raw.length !== 1) return null;
      found = raw[0] ?? null;
      continue;
    }
    found = raw as string;
  }
  return found;
}

/** 64 hex characters -> 32 bytes. No `Buffer`: this package has no Node types (see node-crypto.d.ts). */
function hexToBytes(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let index = 0; index < bytes.length; index += 1) {
    bytes[index] = Number.parseInt(hex.slice(index * 2, index * 2 + 2), 16);
  }
  return bytes;
}

/**
 * Constant-time equality.
 *
 * The length guard is not decoration: `timingSafeEqual` THROWS on a length mismatch, and a throw here
 * would turn a forged input into an unhandled exception — a denial of service on the receiver —
 * instead of a rejection. The parameter names are generic on purpose so the static "no `===` on the
 * signature" check in `sign.test.ts` stays exact.
 */
function equalsInConstantTime(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

/**
 * `v1=<64 lowercase hex>` over HMAC-SHA256 of exactly `${timestampSeconds}.${rawBody}` (PRD §34.8).
 *
 * Built as two `update` calls so the raw body never has to be decoded, re-encoded or concatenated.
 *
 * @throws TypeError when `timestampSeconds` is not a non-negative safe integer. Without the guard a
 * fractional value would sign `"1785726012.5.<body>"` and every receiver would disagree.
 */
export function signWebhook(input: SignWebhookInput): string {
  const { secret, timestampSeconds, rawBody } = input;
  if (!Number.isSafeInteger(timestampSeconds) || timestampSeconds < 0) {
    throw new TypeError('signWebhook: timestampSeconds must be a non-negative safe integer');
  }
  const hmac = createHmac('sha256', secret);
  hmac.update(`${timestampSeconds}.`, 'utf8');
  if (typeof rawBody === 'string') hmac.update(rawBody, 'utf8');
  else hmac.update(rawBody);
  return `v1=${hmac.digest('hex')}`;
}

/**
 * Verifies a delivery against one secret or an ordered rotation list.
 *
 * Check order is load-bearing, and is what FND-05's acceptance matrix requires:
 *
 *   1. header shape -> `MALFORMED_HEADER`
 *   2. replay window -> `TIMESTAMP_OUT_OF_WINDOW`
 *   3. HMAC -> `SIGNATURE_MISMATCH` or `OK`
 *
 * So a *tampered* timestamp that still falls inside the window lands on `SIGNATURE_MISMATCH` (it is no
 * longer part of the signed input), while an untouched delivery presented 301 seconds later lands on
 * `TIMESTAMP_OUT_OF_WINDOW`.
 *
 * Rotation short-circuits on the first matching secret, so the *number of secrets tried* is
 * observable by timing. That leaks only which secret matched — which is returned as `secretIndex`
 * anyway. The comparison of any single candidate is constant-time, which is the property that matters.
 *
 * @throws TypeError when the secret list is empty.
 */
export function verifyWebhook(input: VerifyWebhookInput): VerifyResult {
  const { secret, header, rawBody, nowSeconds } = input;
  const tolerance = input.toleranceSeconds ?? DEFAULT_TOLERANCE_SECONDS;
  const secrets: readonly WebhookSecret[] = typeof secret === 'string' ? [secret] : secret;
  if (secrets.length === 0) {
    throw new TypeError('verifyWebhook: the secret list is empty — no delivery could ever verify');
  }

  const eventId = singleHeader(header, EVENT_ID_HEADER);
  const timestampText = singleHeader(header, TIMESTAMP_HEADER);
  const headerValue = singleHeader(header, SIGNATURE_HEADER);
  const malformed = {
    ok: false,
    reason: 'MALFORMED_HEADER',
    eventId,
    timestampSeconds: null,
  } as const;

  if (eventId === null || timestampText === null || headerValue === null) return malformed;
  if (!SIGNATURE_PATTERN.test(headerValue)) return malformed;
  if (!INTEGER_PATTERN.test(timestampText)) return malformed;
  const timestampSeconds = Number(timestampText);
  if (!Number.isSafeInteger(timestampSeconds) || timestampSeconds < 0) return malformed;

  if (Math.abs(nowSeconds - timestampSeconds) > tolerance) {
    return { ok: false, reason: 'TIMESTAMP_OUT_OF_WINDOW', eventId, timestampSeconds };
  }

  const deliveredBytes = hexToBytes(headerValue.slice(PREFIX_LENGTH));
  for (let index = 0; index < secrets.length; index += 1) {
    const candidate = signWebhook({
      secret: secrets[index] as WebhookSecret,
      timestampSeconds,
      rawBody,
    });
    const candidateBytes = hexToBytes(candidate.slice(PREFIX_LENGTH));
    if (equalsInConstantTime(candidateBytes, deliveredBytes)) {
      return { ok: true, reason: 'OK', eventId, timestampSeconds, secretIndex: index };
    }
  }

  return { ok: false, reason: 'SIGNATURE_MISMATCH', eventId, timestampSeconds };
}
