/**
 * The sample integration (`E27` exit evidence *"DEV tests and sample integration"*, PRD §44.2;
 * ticket deliverable 14).
 *
 * It exercises every capability PRD §8.10 requires of an SDK, in one pass:
 *
 *   1. a client built from a credential (no cookie, no tenant field);
 *   2. `POST /v1/search`;
 *   3. `createAndWait` on an answer job, printing each stage as it streams;
 *   4. a second job created and cancelled;
 *   5. one paginated list, consumed with `for await`;
 *   6. one webhook delivery verified.
 *
 * ## Why it takes `fetch` and `log` as parameters
 *
 * Because the suite EXECUTES it (`test/example.test.ts`), against recorded responses, so it cannot
 * rot. It opens no socket, reads no environment variable, writes no file, and calls no
 * process-exiting API. `log` is a parameter rather than `console.log` so the suite can assert that
 * the output contains no credential and no research-content canary (PRD §22).
 *
 * A real integration substitutes the host's `fetch` and `console.log`, and sources the credential
 * from its own secret store — never from this repository (PRD §20.2).
 */
import { createAerClient } from '../src/client.js';
import type { AerClientOptions } from '../src/client.js';
import type { AerFetch } from '../src/http.js';
import { isClarificationRequired } from '../src/answers.js';
import type { AnswerFacts, CollectionResponse } from '../src/internal/contracts.js';
import { verifyWebhookSignature } from '../src/webhooks.js';
import type { VerifyResult, WebhookSecret } from '../src/webhooks.js';
import type { RetryDeps } from '../src/retry.js';
import type { Timers } from '../src/internal/runtime.js';
import type { TelemetryOptions } from '../src/telemetry.js';

export interface QuickstartWebhookDelivery {
  readonly secrets: readonly WebhookSecret[];
  readonly header: Readonly<Record<string, string>>;
  readonly rawBody: string;
  readonly nowSeconds: number;
}

export interface QuickstartInput {
  /** Injected transport. In production this is the host's `fetch`. */
  readonly fetch: AerFetch;
  /** The caller's credential. Never printed, never telemetered, never stored. */
  readonly apiKey: string;
  readonly baseUrl: string;
  readonly log: (line: string) => void;
  readonly research: {
    readonly query: string;
    readonly question: string;
    readonly facts: AnswerFacts;
  };
  readonly webhook: QuickstartWebhookDelivery;
  readonly telemetry?: TelemetryOptions | undefined;
  /** Test seams; omitted in production. */
  readonly retryDeps?: RetryDeps | undefined;
  readonly timers?: Timers | undefined;
  readonly generateIdempotencyKey?: (() => string) | undefined;
}

export interface QuickstartResult {
  readonly searchResultCount: number;
  readonly answerStatus: string;
  readonly citationCount: number;
  readonly cancelledJobId: string;
  readonly listedItemCount: number;
  readonly webhook: VerifyResult;
}

export async function runQuickstart(input: QuickstartInput): Promise<QuickstartResult> {
  const options: AerClientOptions = {
    baseUrl: input.baseUrl,
    auth: { apiKey: input.apiKey },
    fetch: input.fetch,
    ...(input.telemetry === undefined ? {} : { telemetry: input.telemetry }),
    ...(input.retryDeps === undefined ? {} : { retryDeps: input.retryDeps }),
    ...(input.timers === undefined ? {} : { timers: input.timers }),
    ...(input.generateIdempotencyKey === undefined
      ? {}
      : { generateIdempotencyKey: input.generateIdempotencyKey }),
    userAgentSuffix: 'quickstart-example',
  };
  const client = createAerClient(options);

  // 1. Search the official corpus (PRD §34.2).
  const search = await client.search({ query: input.research.query, page_size: 25 });
  input.log(`search: ${search.results.length} official source excerpts`);

  // 2. Ask a question and wait for the Answer Snapshot, printing stages as they stream (PRD §34.3-34.5).
  const answer = await client.answers.createAndWait(
    { mode: 'QUICK', question: input.research.question, facts: input.research.facts },
    {
      onEvent: (event) => {
        // Only the event TYPE and the pipeline stage label are printed: both are UI chrome, never
        // research content (PRD §16.2 forbids hidden reasoning or provider payloads in an event).
        const stage = (event.data as { readonly stage?: unknown }).stage;
        input.log(`event: ${event.type}${typeof stage === 'string' ? ` (${stage})` : ''}`);
      },
    },
  );

  if (isClarificationRequired(answer)) {
    // PRD §34.3: a clarification request is a RESULT, not an error. A real integration would ask the
    // user these questions and call submitAnswerJobClarifications.
    input.log(`clarification required: ${answer.clarifications.length} question(s)`);
    throw new Error('the quickstart fixture is expected to complete without clarification');
  }

  input.log(`answer: status ${answer.status}, ${answer.citations.length} citation(s)`);

  // 3. Create a second job and cancel it (PRD §16.2). Cancel carries no idempotency key and is safe
  //    to call twice.
  const second = await client.answers.create({
    mode: 'QUICK',
    question: input.research.question,
    facts: input.research.facts,
  });
  if (isClarificationRequired(second)) throw new Error('unexpected clarification for the second job');
  const cancelled = await client.answerJobs.cancel(second.job.id);
  input.log(`cancelled: job status ${cancelled.job.status}`);

  // 4. One paginated collection, consumed as an async iterable (PRD §34.1).
  let listedItemCount = 0;
  const watchlists = client.list<CollectionResponse['items'][number]>('listWatchlists', { page_size: 25 });
  for await (const item of watchlists.items()) {
    void item;
    listedItemCount += 1;
  }
  input.log(`watchlists: ${listedItemCount} item(s) across all pages`);

  // 5. Verify one webhook delivery (PRD §34.8). `rawBody` is the bytes as sent — never re-serialised.
  const verification = verifyWebhookSignature({
    secrets: input.webhook.secrets,
    header: input.webhook.header,
    rawBody: input.webhook.rawBody,
    nowSeconds: input.webhook.nowSeconds,
  });
  input.log(`webhook: ${verification.reason}`);

  return {
    searchResultCount: search.results.length,
    answerStatus: answer.status,
    citationCount: answer.citations.length,
    cancelledJobId: second.job.id,
    listedItemCount,
    webhook: verification,
  };
}
