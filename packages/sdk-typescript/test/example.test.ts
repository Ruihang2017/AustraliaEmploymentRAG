/**
 * The sample integration is EXECUTED by the suite, so it cannot rot (`E27` exit evidence, PRD §44.2;
 * ticket deliverable 14).
 */
import { describe, expect, it } from 'vitest';

import { runQuickstart } from '../examples/quickstart.js';
import { canaryResponder, quickstartResponder, quickstartWebhook } from './support/quickstart.js';
import { createFakeClock, createFakeTransport } from './support/transport.js';
import { ALL_CANARIES, CANARY, CANARY_CREDENTIAL } from './support/client.js';
import { JOB_ID, createAnswerJobRequest } from './fixtures/typed.js';

const BASE_URL = 'https://api.example.test/v1';

async function run(responder = quickstartResponder(), research = {
  query: createAnswerJobRequest.question,
  question: createAnswerJobRequest.question,
  facts: createAnswerJobRequest.facts ?? {},
}) {
  const transport = createFakeTransport(responder);
  const clock = createFakeClock();
  const lines: string[] = [];
  const result = await runQuickstart({
    fetch: transport.fetch,
    apiKey: CANARY_CREDENTIAL,
    baseUrl: BASE_URL,
    log: (line) => lines.push(line),
    research,
    webhook: quickstartWebhook(),
    retryDeps: clock,
    timers: clock.timers,
    generateIdempotencyKey: () => 'example-run-idempotency-key',
  });
  return { result, lines, transport };
}

describe('examples/quickstart.ts', () => {
  it('runs end to end against recorded responses, with no network', async () => {
    const { result, lines } = await run();
    expect(result.searchResultCount).toBe(1);
    expect(result.answerStatus).toBe('CONDITIONAL');
    expect(result.citationCount).toBe(1);
    expect(result.cancelledJobId).toBe(JOB_ID);
    expect(result.listedItemCount).toBe(2);
    expect(result.webhook.ok).toBe(true);
    expect(result.webhook.ok ? result.webhook.secretIndex : -1).toBe(1);
    expect(lines.some((line) => line.startsWith('event: '))).toBe(true);
    expect(lines).toContain('webhook: OK');
  });

  it('prints no credential and no research canary', async () => {
    const { lines } = await run(canaryResponder(), {
      query: CANARY.question,
      question: CANARY.question,
      facts: { free_text: CANARY.facts },
    });
    const output = lines.join('\n');
    for (const canary of ALL_CANARIES) {
      expect(output.includes(canary), `the example printed a canary: ${canary}`).toBe(false);
    }
  });

  it('sends the credential as a Bearer token and never as a cookie', async () => {
    const { transport } = await run();
    expect(transport.requests.length).toBeGreaterThan(4);
    for (const request of transport.requests) {
      const headers = Object.fromEntries(
        Object.entries(request.headers).map(([k, v]) => [k.toLowerCase(), v]),
      );
      expect(headers['authorization']).toBe(`Bearer ${CANARY_CREDENTIAL}`);
      expect(headers['cookie']).toBeUndefined();
      expect(headers['user-agent']).toContain('quickstart-example');
    }
  });
});
