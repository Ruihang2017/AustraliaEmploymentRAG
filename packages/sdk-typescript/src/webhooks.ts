/**
 * Webhook verification — a RE-EXPORT, never a re-implementation (ticket deliverable 9; PRD §34.8).
 *
 * This package computes no HMAC of its own. `FND-05` owns signing and verification
 * (`packages/contracts/src/events/sign.ts`), including the constant-time comparator that PRD §34.8
 * requires and the rotation list. `test/webhooks.test.ts` scans the whole of `src/**` for
 * `createHmac`, `digest`, `subtle` and a `===` comparison of a signature, and asserts none exists;
 * the ticket's Non-goals and `FND-05` friction 4 both forbid working around a runtime limitation by
 * re-implementing verification here.
 *
 * ## `rawBody` is the bytes as sent — the warning, verbatim from `FND-05`
 *
 * > Pass the **raw** request body — the exact bytes read off the socket. Never `JSON.stringify` a
 * > parsed object and sign that: key order, unicode escaping and whitespace all differ from the
 * > sender's bytes, so the signature will not match, and the failure looks like an attack rather than
 * > a bug. In a Node HTTP framework this means capturing the body before the JSON body parser runs.
 * > This is the classic webhook integration defect.
 *
 * ### Getting the raw body out of a framework
 *
 * - **Fastify** — register a content-type parser with `parseAs: 'buffer'`, or set
 *   `addContentTypeParser('application/json', { parseAs: 'string' }, …)` and keep the string.
 * - **Express** — mount `express.raw({ type: 'application/json' })` on the webhook route *only*, and
 *   read `req.body` as the `Buffer`; a global `express.json()` destroys the bytes.
 * - **Next.js route handlers / Web `Request`** — `await request.text()`, then verify, then
 *   `JSON.parse` the same string. Never re-serialise.
 * - **AWS Lambda / API Gateway** — use `event.body` with `isBase64Encoded` honoured; do not use a
 *   parsed event body.
 *
 * ## Dedupe is the caller's
 *
 * PRD §34.8 requires receivers to deduplicate event ids. That needs storage, which is out of scope
 * for a client library, so the parsed `X-AER-Event-Id` is returned for the caller's store.
 */
import type { VerifyReason, VerifyResult, WebhookSecret } from './internal/contracts.js';
import { verifyWebhook } from './internal/contracts.js';

export interface VerifyWebhookSignatureInput {
  /**
   * The signing secrets, current first. An ordered list supports PRD §8.8 rotation; a single string
   * is accepted for the common case. `secretIndex` in the result says which one matched.
   */
  readonly secrets: WebhookSecret | readonly WebhookSecret[];
  /** The delivery's header bag. Lookup is case-insensitive; Node's `IncomingHttpHeaders` fits. */
  readonly header: Readonly<Record<string, string | readonly string[] | undefined>>;
  /** The raw bytes as sent — never a re-serialised object. See the call-site rule above. */
  readonly rawBody: Uint8Array | string;
  /** The receiver's clock, in whole seconds. Injected so verification is testable. */
  readonly nowSeconds: number;
  /** Replay window each way. Defaults to PRD §34.8's five minutes. */
  readonly toleranceSeconds?: number | undefined;
}

/**
 * Verifies one delivery.
 *
 * Returns `FND-05`'s discriminated result unchanged: `{ ok: true, reason: 'OK', eventId,
 * timestampSeconds, secretIndex }` or `{ ok: false, reason, eventId, timestampSeconds }` with
 * `reason` one of `MALFORMED_HEADER`, `TIMESTAMP_OUT_OF_WINDOW`, `SIGNATURE_MISMATCH`.
 *
 * This function contains no cryptography. It normalises the parameter name (`secrets`, plural, which
 * is what a rotation-aware caller expects) onto `FND-05`'s `secret` union and delegates.
 */
export function verifyWebhookSignature(input: VerifyWebhookSignatureInput): VerifyResult {
  return verifyWebhook({
    secret: input.secrets,
    header: input.header,
    rawBody: input.rawBody,
    nowSeconds: input.nowSeconds,
    ...(input.toleranceSeconds === undefined ? {} : { toleranceSeconds: input.toleranceSeconds }),
  });
}

export type { VerifyReason, VerifyResult, WebhookSecret };
