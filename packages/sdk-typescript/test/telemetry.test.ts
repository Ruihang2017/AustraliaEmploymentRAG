/**
 * *"SDK telemetry MUST NOT contain research content"* (PRD §8.10; sub-PRD **D7**).
 *
 * The canary run is the acceptance item: a canary question, canary facts, a canary answer string and
 * a canary citation quote all flow through the sample integration with telemetry ENABLED, and no
 * canary may appear in `JSON.stringify` of any record. The credential is a canary too (PRD §22).
 */
import { describe, expect, it } from 'vitest';

import { AerValidationError, TELEMETRY_ALLOWED_KEYS, assertTelemetrySafe } from '../src/sdk.js';
import { createTelemetryEmitter } from '../src/telemetry.js';
import type { TelemetryRecord } from '../src/telemetry.js';
import { sourceCodeOnly } from './support/repo.js';
import { ALL_CANARIES, CANARY, CANARY_CREDENTIAL, createHarness } from './support/client.js';
import { runQuickstart } from '../examples/quickstart.js';
import { canaryResponder, quickstartWebhook } from './support/quickstart.js';
import { createFakeClock, createFakeTransport } from './support/transport.js';
import { searchResponse } from './fixtures/typed.js';

const validRecord: TelemetryRecord = {
  sdk_name: '@taxrag/sdk-typescript',
  sdk_version: '0.0.0',
  runtime: 'node/v24.18.0',
  platform: 'linux/x64',
  operation_id: 'search',
  http_method: 'POST',
  http_status: 200,
  duration_ms: 12,
  attempt: 1,
};

describe('telemetry allowlist (PRD §8.10, sub-PRD D7)', () => {
  it('is exactly the twelve documented keys', () => {
    expect([...TELEMETRY_ALLOWED_KEYS]).toEqual([
      'sdk_name',
      'sdk_version',
      'runtime',
      'platform',
      'operation_id',
      'http_method',
      'http_status',
      'request_id',
      'job_id',
      'duration_ms',
      'attempt',
      'error_code',
    ]);
  });

  it('accepts a well-formed record', () => {
    expect(() => assertTelemetrySafe(validRecord)).not.toThrow();
    expect(() => assertTelemetrySafe({ ...validRecord, http_status: null })).not.toThrow();
  });

  it('throws on a key outside the allowlist', () => {
    expect(() => assertTelemetrySafe({ ...validRecord, question: CANARY.question })).toThrow(
      AerValidationError,
    );
    expect(() => assertTelemetrySafe({ ...validRecord, question: CANARY.question })).toThrow(/allowlist/);
  });

  it('throws on a wrong-typed value and on a missing required key', () => {
    expect(() => assertTelemetrySafe({ ...validRecord, attempt: 'one' })).toThrow(AerValidationError);
    expect(() => assertTelemetrySafe({ ...validRecord, duration_ms: Number.NaN })).toThrow(AerValidationError);
    const missing: Record<string, unknown> = { ...validRecord };
    delete missing['operation_id'];
    expect(() => assertTelemetrySafe(missing)).toThrow(/operation_id/);
  });

  it('rejects a non-object', () => {
    expect(() => assertTelemetrySafe('a string')).toThrow(AerValidationError);
    expect(() => assertTelemetrySafe(null)).toThrow(AerValidationError);
    expect(() => assertTelemetrySafe([validRecord])).toThrow(AerValidationError);
  });
});

describe('the single emit choke point', () => {
  it('is the only place in src/** that reads a telemetry sink', () => {
    const offenders = sourceCodeOnly()
      .filter(({ text }) => /\bsink\b/.test(text))
      .map(({ path }) => path);
    expect(offenders).toEqual(['telemetry.ts']);
  });

  it('validates before calling the sink', () => {
    const seen: TelemetryRecord[] = [];
    const emit = createTelemetryEmitter({ enabled: true, sink: (r) => seen.push(r) });
    expect(() => emit({ ...validRecord, oops: 1 } as unknown as TelemetryRecord)).toThrow(AerValidationError);
    expect(seen).toEqual([]);
    emit(validRecord);
    expect(seen).toEqual([validRecord]);
  });

  it('emits nothing at all by default, and never touches the sink', async () => {
    let called = 0;
    const harness = createHarness(() => ({ status: 200, json: searchResponse }), {
      overrides: { telemetry: { enabled: false, sink: () => (called += 1) } },
    });
    await harness.client.search({ query: 'q' });
    expect(called).toBe(0);
    expect(harness.telemetry).toEqual([]);
    // And it opened nothing beyond the one operation request.
    expect(harness.transport.requests).toHaveLength(1);
  });

  it('rejects an enabled configuration with no sink function', () => {
    expect(() =>
      createTelemetryEmitter({ enabled: true, sink: undefined as unknown as (r: TelemetryRecord) => void }),
    ).toThrow(AerValidationError);
  });
});

describe('the canary run (the PRD §8.10 acceptance item)', () => {
  it('carries no research content and no credential in any record', async () => {
    const records: TelemetryRecord[] = [];
    const transport = createFakeTransport(canaryResponder());
    const clock = createFakeClock();

    const result = await runQuickstart({
      fetch: transport.fetch,
      apiKey: CANARY_CREDENTIAL,
      baseUrl: 'https://api.example.test/v1',
      log: () => undefined,
      research: {
        query: CANARY.question,
        question: CANARY.question,
        facts: { free_text: CANARY.facts },
      },
      webhook: quickstartWebhook(),
      telemetry: { enabled: true, sink: (record) => records.push(record) },
      retryDeps: clock,
      timers: clock.timers,
      generateIdempotencyKey: () => 'canary-run-idempotency-key',
    });

    expect(result.webhook.ok).toBe(true);
    expect(records.length).toBeGreaterThan(3);

    const serialised = JSON.stringify(records);
    for (const canary of ALL_CANARIES) {
      expect(serialised.includes(canary), `a canary reached telemetry: ${canary}`).toBe(false);
    }
    for (const record of records) expect(() => assertTelemetrySafe(record)).not.toThrow();
    // The canaries really were in flight, so the assertion above is not vacuous.
    const sent = JSON.stringify(transport.requests);
    expect(sent).toContain(CANARY.question);
    expect(sent).toContain(CANARY_CREDENTIAL);
  });
});
