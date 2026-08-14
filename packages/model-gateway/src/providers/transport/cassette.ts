/**
 * EVID-07 deliverable 6 — the recorded-cassette transport (sub-PRD **D15**).
 *
 * A cassette is `{ fingerprint, status, headersSubset, body, modelVersion, tokens }`. The transport
 * looks a request's fingerprint up and replays the recorded response; **a miss throws
 * `CassetteMissError` and there is no fallthrough**. Falling through to a network on a miss is the
 * single failure that would make the whole offline claim worthless, and it is the reason this
 * transport has no `inner`, no `fallback` and no `onMiss` parameter to pass one in.
 *
 * THE FINGERPRINT DELIBERATELY DOES NOT COVER THE BODY (plan §6 risk 5). Fingerprinting the assembled
 * payload would put evidence text and sanitized customer facts into a committed test artefact.
 * Instead it covers only identifiers and versions: provider, profile, instruction-template version,
 * pack id, pack hash and an explicit `scenarioKey`. The `scenarioKey` is what lets one profile have a
 * valid cassette and a 500 cassette without the two differing by a single byte of evidence.
 *
 * Loading cassettes from disk is test-tree work (`node:fs` there is fine). This file reads nothing.
 */
import type { Transport, TransportRequest, TransportResponse } from './types.js';

export interface CassetteKey {
  readonly providerId: string;
  readonly profileId: string;
  readonly instructionTemplateVersion: string;
  readonly packId: string;
  readonly packHash: string;
  /** Which recorded scenario this is — `VALID`, `RATE_LIMITED_429`, and so on. Never response text. */
  readonly scenarioKey: string;
}

export interface Cassette {
  readonly key: CassetteKey;
  readonly response: TransportResponse;
}

export class CassetteMissError extends Error {
  public readonly fingerprint: string;

  public constructor(fingerprint: string, known: readonly string[]) {
    super(
      `no cassette recorded for ${fingerprint}; the cassette transport never falls through to a ` +
        `network. Known fingerprints: ${known.length === 0 ? '(none)' : known.join(', ')}`,
    );
    this.name = 'CassetteMissError';
    this.fingerprint = fingerprint;
  }
}

/**
 * Stable and order-independent: the fields are listed in a fixed order here rather than taken from
 * `Object.keys`, so a fingerprint recorded today still matches after an unrelated refactor. Strings
 * only — never the assembled payload, never evidence text, never a customer fact.
 */
export function fingerprintOf(key: CassetteKey): string {
  return [
    `provider=${key.providerId}`,
    `profile=${key.profileId}`,
    `template=${key.instructionTemplateVersion}`,
    `pack=${key.packId}`,
    `packHash=${key.packHash}`,
    `scenario=${key.scenarioKey}`,
  ].join('|');
}

/**
 * The scenario a request is replayed under. It travels in `headersSubset` under a code-supplied name
 * because it is a property of the TEST SETUP, not of the request — a live transport ignores it.
 */
export const SCENARIO_HEADER = 'x-taxrag-cassette-scenario';

export function cassetteKeyOf(request: TransportRequest): CassetteKey {
  const body = request.body as {
    readonly profileId?: unknown;
    readonly instructionTemplateVersion?: unknown;
    readonly evidence?: { readonly packId?: unknown; readonly packHash?: unknown };
  };
  return {
    providerId: request.providerId,
    profileId: typeof body.profileId === 'string' ? body.profileId : '',
    instructionTemplateVersion:
      typeof body.instructionTemplateVersion === 'string' ? body.instructionTemplateVersion : '',
    packId: typeof body.evidence?.packId === 'string' ? body.evidence.packId : '',
    packHash: typeof body.evidence?.packHash === 'string' ? body.evidence.packHash : '',
    scenarioKey: request.headersSubset[SCENARIO_HEADER] ?? 'VALID',
  };
}

/** Replay-only. Throws `CassetteMissError` on a miss; there is no other outcome. */
export function createCassetteTransport(cassettes: readonly Cassette[]): Transport {
  const byFingerprint = new Map<string, TransportResponse>();
  for (const cassette of cassettes) byFingerprint.set(fingerprintOf(cassette.key), cassette.response);

  return (request: TransportRequest): Promise<TransportResponse> => {
    const fingerprint = fingerprintOf(cassetteKeyOf(request));
    const recorded = byFingerprint.get(fingerprint);
    if (recorded === undefined) {
      return Promise.reject(new CassetteMissError(fingerprint, [...byFingerprint.keys()]));
    }
    return Promise.resolve(recorded);
  };
}
