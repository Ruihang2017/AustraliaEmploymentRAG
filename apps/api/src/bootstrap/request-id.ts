/**
 * `request_id` assignment and propagation (ticket deliverable 4).
 *
 * PRD §16.1: *"Every response includes `request_id`."* That is enforced in two places on the ROOT
 * instance, so it holds for 2xx, 4xx and 5xx alike, and for a route area that installs its own
 * hooks inside its own encapsulation context:
 *
 * - an `onRequest` hook assigns `request.requestId`;
 * - an `onSend` hook sets the `x-request-id` response header on EVERY response and injects
 *   `request_id` into every JSON body.
 *
 * SECURITY. An inbound `x-request-id` is honoured only when it matches
 * `^req_[A-Za-z0-9_-]{8,64}$`. The anchoring is a security control, not a formatting nicety: the
 * accepted value is written into a response header and into logs, and the character class excludes
 * CR, LF and space, which is what closes response-splitting and log-injection by construction. Do
 * not relax it. The residual, accepted risk is that a caller may choose its own id and so collide
 * with another caller's id in logs — `requestId` is therefore never used for authorisation, for
 * idempotency (`Idempotency-Key` is `RUNT-02`'s separate mechanism) or as a cache key.
 */
import { TextEncoder } from 'node:util';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';

import { newId } from '../../../../packages/contracts/src/ids/index.js';

declare module 'fastify' {
  interface FastifyRequest {
    /** The PRD §16.1 request id. Assigned by the root `onRequest` hook; never empty after it runs. */
    requestId: string;
  }
}

/** The one accepted inbound shape. Anchored, so no prefix/suffix smuggling. */
export const INBOUND_REQUEST_ID_PATTERN = /^req_[A-Za-z0-9_-]{8,64}$/;

/** Mints `req_<uuidv7>` through the `FND-03` id helpers (`Request: 'req'` is a registered prefix). */
export function mintRequestId(): string {
  return newId('req');
}

/** Whether an inbound header value may be echoed as this request's id. */
export function isAcceptableInboundRequestId(value: unknown): value is string {
  return typeof value === 'string' && INBOUND_REQUEST_ID_PATTERN.test(value);
}

/**
 * The id for one request: the inbound header when acceptable, otherwise a fresh one.
 *
 * A repeated `x-request-id` header arrives as an array; an array is never acceptable (which of the
 * values would win is not a decision this layer should make), so a fresh id is minted.
 */
export function resolveRequestId(
  headerValue: string | string[] | undefined,
  mint: () => string = mintRequestId,
): string {
  return isAcceptableInboundRequestId(headerValue) ? headerValue : mint();
}

/** A plain object — not null, not an array. Only these get a `request_id` injected. */
function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Whether `body` is the PRD §16.1 error envelope: exactly one own key, `error`, holding an object.
 *
 * It matters because `ErrorResponse` in `schemas/openapi/openapi.yaml` is
 * `additionalProperties: false` — a top-level `request_id` on an error body would violate the
 * generated contract and the ticket's "no additional top-level key". The id goes to
 * `error.request_id` instead, and nothing is added at the top level.
 */
function isErrorEnvelope(body: Record<string, unknown>): boolean {
  const keys = Object.keys(body);
  return keys.length === 1 && keys[0] === 'error' && isPlainObject(body['error']);
}

/**
 * Injects `request_id` into a JSON payload string, or returns `null` when there is nothing to do.
 *
 * Returns `null` (rather than the input) when the payload is not parseable JSON or is not a plain
 * object, so the caller can skip re-serialising and leave the original bytes untouched.
 */
export function injectRequestId(payload: string, requestId: string): string | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(payload);
  } catch {
    return null;
  }
  if (!isPlainObject(parsed)) return null;

  if (isErrorEnvelope(parsed)) {
    const inner = parsed['error'] as Record<string, unknown>;
    if (typeof inner['request_id'] === 'string' && inner['request_id'].length > 0) return null;
    return JSON.stringify({ ...parsed, error: { ...inner, request_id: requestId } });
  }

  if (typeof parsed['request_id'] === 'string' && parsed['request_id'].length > 0) return null;
  return JSON.stringify({ ...parsed, request_id: requestId });
}

/** `true` when the reply is serving JSON, so re-serialising the payload is safe. */
function isJsonReply(reply: FastifyReply): boolean {
  const contentType = reply.getHeader('content-type');
  const value = Array.isArray(contentType) ? contentType.join(' ') : String(contentType ?? '');
  return value.includes('application/json');
}

/**
 * Installs both hooks on the root instance. `buildApp` step (b) — before the error handlers, so a
 * failure classified in step (c) already has an id to serialise.
 */
export function installRequestId(app: FastifyInstance, mint: () => string = mintRequestId): void {
  app.decorateRequest('requestId', '');

  app.addHook('onRequest', async (request: FastifyRequest) => {
    request.requestId = resolveRequestId(request.headers['x-request-id'], mint);
  });

  app.addHook('onSend', async (request: FastifyRequest, reply: FastifyReply, payload: unknown) => {
    const requestId = request.requestId.length > 0 ? request.requestId : mint();
    request.requestId = requestId;

    // (1) The header goes on EVERY response, including a stream (RUNT-03's SSE keeps it).
    reply.header('x-request-id', requestId);

    // (2) Only a string JSON payload is rewritten. Streams and Buffers pass through untouched.
    if (typeof payload !== 'string' || !isJsonReply(reply)) return payload;

    const next = injectRequestId(payload, requestId);
    if (next === null) return payload;

    // `content-length` must match the rewritten bytes exactly. TextEncoder counts UTF-8 bytes
    // without needing `Buffer` (and therefore without needing `@types/node`).
    reply.header('content-length', String(new TextEncoder().encode(next).length));
    return next;
  });
}
