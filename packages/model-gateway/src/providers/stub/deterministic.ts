/**
 * EVID-07 deliverable 7 — the deterministic stub provider.
 *
 * ONE stub, exported from the `./testing` subpath, so `EVID-05`, `ASK-02`, `GOLD-15` and `ASSR-04`
 * share it instead of forking four divergent ones (breakdown plan §8 Q1).
 *
 * DETERMINISTIC MEANS DETERMINISTIC: no clock, no randomness, no counter, no environment. Every byte
 * of the response is a function of the request payload and the selected mode, so the same call always
 * produces the same bytes — which is what makes a cassette meaningful and what makes `GOLD-15`'s
 * comparisons reproducible.
 *
 * A `VALID` response cites REAL `evidence_id`s taken from the supplied pack, with quote offsets that
 * fall inside that item's `exact_text`. It reads them out of the rendered evidence block rather than
 * from a structured field, because a block is all the provider ever sees — which is also a quiet check
 * that `request.ts` really did put the text where it says it did.
 */
import type { Transport, TransportRequest, TransportResponse } from '../transport/types.js';
import type { EvidenceSegment, ProviderRequestPayload } from '../../schema/request.js';
import type { StubMode } from './failure-modes.js';

export const STUB_MODEL_VERSION = 'stub-deterministic-v1';

const EXACT_TEXT_MARKER = '\nexact_text:\n';
const END_MARKER = '\n<<<END EVIDENCE ';

/** The `exact_text` an item's rendered block carries, or `''` if the block is not the expected shape. */
export function exactTextOf(segment: EvidenceSegment): string {
  const start = segment.body.indexOf(EXACT_TEXT_MARKER);
  if (start < 0) return '';
  const from = start + EXACT_TEXT_MARKER.length;
  const end = segment.body.lastIndexOf(END_MARKER);
  return end > from ? segment.body.slice(from, end) : segment.body.slice(from);
}

/** A quote span that is always inside the text: the first 40 characters, or the whole thing. */
function spanOf(text: string): { readonly quote_start: number; readonly quote_end: number } {
  return { quote_start: 0, quote_end: Math.min(text.length, 40) };
}

interface StubCitation {
  readonly evidence_id: string;
  readonly role: string;
  readonly quote_start: number;
  readonly quote_end: number;
}

function citationsFor(payload: ProviderRequestPayload, evidenceId?: string): StubCitation[] {
  return payload.evidence.items.map((segment) => ({
    evidence_id: evidenceId ?? segment.evidenceId,
    role: 'SUPPORTS',
    ...spanOf(exactTextOf(segment)),
  }));
}

function baseResponse(payload: ProviderRequestPayload, evidenceId?: string): Record<string, unknown> {
  const evidence = citationsFor(payload, evidenceId);
  const manyItems = payload.evidence.items.length > 1;
  return {
    proposed_status: manyItems ? 'CONDITIONAL' : 'SUPPORTED',
    short_answer: `Stub answer for ${payload.profileId} over pack ${payload.evidence.packId}.`,
    claims: [
      {
        kind: 'SHORT_ANSWER',
        text: `Stub short answer for ${payload.profileId}.`,
        support: manyItems ? 'CONDITIONAL' : 'DIRECTLY_SUPPORTED',
        evidence,
        assumption_refs: [],
      },
      {
        kind: 'RULE',
        text: 'Stub rule statement drawn from the supplied evidence.',
        support: 'DIRECTLY_SUPPORTED',
        evidence,
        assumption_refs: [],
      },
    ],
    assumptions: [],
    missing_facts: [],
    next_checks: [],
    limitations: ['This answer was produced by the deterministic stub provider.'],
  };
}

const ok = (body: string): TransportResponse => ({
  status: 200,
  headersSubset: {},
  body,
  modelVersion: STUB_MODEL_VERSION,
  inputTokens: 0,
  outputTokens: 0,
  costMicroAud: null,
});

function contentVariant(payload: ProviderRequestPayload, mode: StubMode): Record<string, unknown> {
  switch (mode) {
    case 'FABRICATED_EVIDENCE_ID':
      // §36.5-valid, and the id is in no pack. EVID-05's validator is what rejects it.
      return baseResponse(payload, 'ev_fabricated_00');
    case 'INVENTED_URL': {
      const body = baseResponse(payload);
      body.short_answer = 'See the source at https://invented.invalid/not-a-real-page for details.';
      return body;
    }
    case 'EMBEDDED_HTML': {
      const body = baseResponse(payload);
      body.short_answer = '<script>alert(1)</script><b>Stub answer with embedded markup.</b>';
      return body;
    }
    case 'PROHIBITED_CERTAINTY_PHRASE': {
      const body = baseResponse(payload);
      body.short_answer = 'This is guaranteed to be correct and you will definitely not be audited.';
      return body;
    }
    default:
      return baseResponse(payload);
  }
}

export interface StubOptions {
  readonly mode: StubMode;
  /** `Retry-After`, in seconds, for `RATE_LIMITED_429`. Fixed data, never a clock read. */
  readonly retryAfterSeconds?: number;
}

/**
 * Build the stub as a `Transport`, so it drops into `GatewayDeps.transport` exactly where a cassette
 * transport would. It opens nothing and reads nothing.
 */
export function createStubProvider(options: StubOptions): Transport {
  const { mode } = options;

  return (request: TransportRequest): Promise<TransportResponse> => {
    const payload = request.body as ProviderRequestPayload;

    switch (mode) {
      case 'TIMEOUT':
        // Never settles. The caller's injected deadline is what ends the call — deterministically,
        // with no sleep and no wall-clock dependency.
        return new Promise<TransportResponse>(() => undefined);

      case 'RATE_LIMITED_429':
        return Promise.resolve({
          status: 429,
          headersSubset: { 'retry-after': String(options.retryAfterSeconds ?? 30) },
          body: '',
          modelVersion: STUB_MODEL_VERSION,
          inputTokens: null,
          outputTokens: null,
          costMicroAud: null,
        });

      case 'SERVER_ERROR_500':
        return Promise.resolve({
          status: 500,
          headersSubset: {},
          body: '',
          modelVersion: STUB_MODEL_VERSION,
          inputTokens: null,
          outputTokens: null,
          costMicroAud: null,
        });

      case 'EMPTY_BODY':
        return Promise.resolve(ok(''));

      case 'TRUNCATED_JSON':
        return Promise.resolve(ok(JSON.stringify(baseResponse(payload)).slice(0, 60)));

      case 'SCHEMA_INVALID':
        // A reasoning field: §36.5-shaped except for the one member PRD §9.4 forbids.
        return Promise.resolve(ok(JSON.stringify({ ...baseResponse(payload), reasoning: 'step one' })));

      default:
        return Promise.resolve(ok(JSON.stringify(contentVariant(payload, mode))));
    }
  };
}
