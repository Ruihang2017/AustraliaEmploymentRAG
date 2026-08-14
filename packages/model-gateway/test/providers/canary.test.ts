/**
 * EVID-07 acceptance item "No raw payload persisted or logged" (PRD §35.6, §37.3, §22).
 *
 * Three distinct canaries, in the three places raw content can enter this package: a sanitized task
 * fact, the pack's `exact_text`, and the provider's response body. Each is then searched for in every
 * place it must never reach:
 *
 *  - any argument handed to the `ModelExecutionPort` (a deep walk over keys AND values);
 *  - any thrown error's message or stack;
 *  - the returned `detail`;
 *  - and — for the two INPUT canaries — anywhere in the returned result at all.
 *
 * The response canary is deliberately allowed to appear in a SUCCESSFUL result: the parsed answer is
 * what the caller asked for. What it must never do is reach a `model_execution` row, an error, or a
 * `detail`, which is what PRD §37.3 means by *"Provider raw payload | Not in ordinary product DB/log
 * | … | Never | Never"*.
 */
import { describe, expect, it } from 'vitest';

import './support/network-stub.js';
import { CANARY, evidenceItem, evidencePack, sanitizedFacts } from './support/doubles.js';
import { reachableStrings } from './support/fixture.js';
import { forgeReservation } from './support/reservation-double.js';
import { gatewayCall, harness, immediateTimer, respondWith, throwingTransport } from './support/harness.js';
import { generate } from '../../src/providers/generate.js';
import { createStubProvider } from '../../src/providers/stub/index.js';
import type { ModelExecutionRecord } from '../../src/providers/recording.js';

const reservation = forgeReservation({ expiresAt: 1_000_000 });

const ALL_CANARIES = [CANARY.fact, CANARY.evidence, CANARY.response] as const;

function canaryCall() {
  return gatewayCall({
    facts: sanitizedFacts([{ field: 'question', value: `a question mentioning ${CANARY.fact}` }]),
    pack: evidencePack({
      items: [evidenceItem({ exactText: `A synthetic provision containing ${CANARY.evidence}.` })],
    }),
  });
}

/** A §36.5-valid body that carries the response canary in its prose. */
const bodyWithCanary = JSON.stringify({
  proposed_status: 'SUPPORTED',
  short_answer: `A stub answer containing ${CANARY.response}.`,
  claims: [],
  assumptions: [],
  missing_facts: [],
  next_checks: [],
  limitations: [],
});

const rowStrings = (rows: readonly ModelExecutionRecord[]): string[] =>
  rows.flatMap((row) => reachableStrings(row));

describe('no canary reaches a model_execution row', () => {
  it.each([
    ['a success', respondWith({ body: bodyWithCanary })],
    ['a 500', respondWith({ status: 500, body: `provider error mentioning ${CANARY.response}` })],
    ['a 429', respondWith({ status: 429, body: `slow down, ${CANARY.response}` })],
    [
      'a schema failure',
      respondWith({ body: `{"proposed_status":"SUPPORTED","note":"${CANARY.response}"}` }),
    ],
    ['a transport throw', throwingTransport(new Error(`connection failed after ${CANARY.response}`))],
  ])('on %s', async (_label, transport) => {
    const { deps, port } = harness({ transport });
    await generate(canaryCall(), reservation, deps);

    expect(port.rows.length).toBeGreaterThan(0);
    const strings = rowStrings(port.rows).join('\n');
    for (const canary of ALL_CANARIES) {
      expect(strings, `${canary} reached a model_execution row`).not.toContain(canary);
    }
  });

  it('on a timeout', async () => {
    const { deps, port } = harness({
      transport: createStubProvider({ mode: 'TIMEOUT' }),
      timer: immediateTimer,
    });
    await generate(canaryCall(), reservation, deps);
    const strings = rowStrings(port.rows).join('\n');
    for (const canary of ALL_CANARIES) expect(strings).not.toContain(canary);
  });
});

describe('no canary reaches the returned failure', () => {
  it.each([
    ['a 500', respondWith({ status: 500, body: `provider error mentioning ${CANARY.response}` })],
    ['a schema failure', respondWith({ body: `{"proposed_status":"SUPPORTED","x":"${CANARY.response}"}` })],
    ['a transport throw', throwingTransport(new Error(`ECONNRESET ${CANARY.response}`))],
  ])('on %s the whole result is canary-free', async (_label, transport) => {
    const { deps } = harness({ transport });
    const result = await generate(canaryCall(), reservation, deps);

    expect(result.outcome).toBe('UNAVAILABLE');
    const strings = reachableStrings(result).join('\n');
    for (const canary of ALL_CANARIES) {
      expect(strings, `${canary} reached the returned failure`).not.toContain(canary);
    }
  });

  it('a schema failure carries a structural path and nothing of the body', async () => {
    const { deps } = harness({
      transport: respondWith({ body: `{"proposed_status":"SUPPORTED","note":"${CANARY.response}"}` }),
    });
    const result = await generate(canaryCall(), reservation, deps);
    if (result.outcome !== 'UNAVAILABLE') throw new Error('unreachable');
    expect(result.failingPath).toBe('$.short_answer');
    expect(result.detail).toBe('RESPONSE_FAILED_SCHEMA');
  });
});

describe('no canary reaches a thrown error', () => {
  it('a cassette miss names the fingerprint, not the payload', async () => {
    const { deps } = harness({
      transport: () => {
        throw new Error('a transport failure');
      },
    });
    const result = await generate(canaryCall(), reservation, deps);
    expect(reachableStrings(result).join('\n')).not.toContain(CANARY.evidence);
  });

  it('a local-profile refusal names only the profile', async () => {
    const { deps } = harness({ transport: respondWith({ body: bodyWithCanary }) });
    try {
      await generate({ ...canaryCall(), profileId: 'QUERY_EMBEDDING' }, reservation, deps);
      throw new Error('expected a throw');
    } catch (error) {
      const text = `${(error as Error).message}\n${(error as Error).stack ?? ''}`;
      for (const canary of ALL_CANARIES) expect(text).not.toContain(canary);
    }
  });

  it('a recording-port failure surfaces without carrying the payload', async () => {
    const { deps } = harness({
      transport: respondWith({ body: bodyWithCanary }),
      port: {
        rows: [],
        transactions: [],
        insert() {
          throw new Error('the model_execution insert failed');
        },
      },
    });
    await expect(generate(canaryCall(), reservation, deps)).rejects.toThrow(
      'the model_execution insert failed',
    );
  });
});

describe('the INPUT canaries never come back out', () => {
  it('a successful result carries neither the fact nor the evidence canary', async () => {
    const { deps } = harness({ transport: respondWith({ body: bodyWithCanary }) });
    const result = await generate(canaryCall(), reservation, deps);

    expect(result.outcome, JSON.stringify(result)).toBe('OK');
    const strings = reachableStrings(result).join('\n');
    expect(strings).not.toContain(CANARY.fact);
    expect(strings).not.toContain(CANARY.evidence);
    // The response canary IS present — the parsed answer is what the caller asked for.
    expect(strings).toContain(CANARY.response);
  });
});

describe('the canary scan is not vacuous', () => {
  it('finds a canary when one really is present', () => {
    expect(reachableStrings({ a: { b: [`x ${CANARY.fact}`] } }).join('\n')).toContain(CANARY.fact);
  });

  it('walks keys as well as values, so a canary used as a property name is caught', () => {
    expect(reachableStrings({ [CANARY.evidence]: 1 }).join('\n')).toContain(CANARY.evidence);
  });

  it('survives a cycle', () => {
    const cyclic: Record<string, unknown> = { note: CANARY.response };
    cyclic.self = cyclic;
    expect(reachableStrings(cyclic).join('\n')).toContain(CANARY.response);
  });

  it('reads an Error’s message and stack', () => {
    expect(reachableStrings(new Error(CANARY.fact)).join('\n')).toContain(CANARY.fact);
  });
});
