/**
 * The recorded script the sample integration runs against.
 *
 * Two variants of the same route table: one with the committed fixture bodies, and one whose research
 * fields carry CANARY strings. The canary variant is what makes the PRD §8.10 telemetry assertion
 * non-vacuous — the canaries genuinely travel through search, the answer job, the snapshot and the
 * citation quote, so "no canary reached a telemetry record" is a statement about a real flow.
 */
import type { AnswerSnapshot } from '../../src/internal/contracts.js';
import { answerJobAccepted, answerSnapshot, jobAccepted, searchResponse, watchlistsPage1, watchlistsPage2 } from '../fixtures/typed.js';
import { fixtureText } from './repo.js';
import { routed } from './transport.js';
import type { QuickstartWebhookDelivery } from '../../examples/quickstart.js';
import type { Responder } from './transport.js';
import { CANARY } from './client.js';
import { loadHeaders, loadRawBody, loadSigning } from './webhook.js';

const CANCEL = /\/cancel$/;
const EVENTS = /\/answer-jobs\/[^/]+\/events$/;
const SNAPSHOT = /\/v1\/answers\/ans_/;
const CREATE = /\/v1\/answers$/;
const SEARCH = /\/v1\/search$/;
const WATCHLISTS = /\/v1\/watchlists(\?|$)/;

function routes(snapshot: AnswerSnapshot): Responder {
  let watchlistCall = 0;
  return routed([
    [SEARCH, () => ({ status: 200, json: searchResponse })],
    [CANCEL, () => ({ status: 202, json: jobAccepted })],
    [EVENTS, () => ({ status: 200, sse: fixtureText('sse/full.txt'), chunkSize: 31 })],
    [SNAPSHOT, () => ({ status: 200, json: snapshot })],
    [CREATE, () => ({ status: 202, json: answerJobAccepted })],
    [
      WATCHLISTS,
      () => {
        watchlistCall += 1;
        return { status: 200, json: watchlistCall === 1 ? watchlistsPage1 : watchlistsPage2 };
      },
    ],
  ]);
}

/** The committed-fixture script. */
export const quickstartResponder = (): Responder => routes(answerSnapshot);

/** The same script with research content replaced by canaries. */
export function canaryResponder(): Responder {
  const first = answerSnapshot.citations[0];
  const canarySnapshot: AnswerSnapshot = {
    ...answerSnapshot,
    short_answer: CANARY.answer,
    citations: first === undefined ? [] : [{ ...first, quote: CANARY.quote }],
  };
  return routes(canarySnapshot);
}

/** `FND-05`'s committed delivery, in the shape the example accepts. */
export function quickstartWebhook(): QuickstartWebhookDelivery {
  const signing = loadSigning();
  return {
    secrets: [signing.rotatedSecret, signing.secret],
    header: loadHeaders(),
    rawBody: loadRawBody(),
    nowSeconds: signing.timestampSeconds,
  };
}
