/**
 * Builds a client wired to the offline transport and the fake clock.
 *
 * Every suite goes through here so no test can accidentally construct a client with a real `fetch`,
 * a real timer or a real random source. `CANARY` values are the strings the privacy assertions hunt
 * for: if any of them ever appears in a telemetry record, an error, or the example's output, the
 * corresponding acceptance item has failed.
 */
import { createAerClient } from '../../src/client.js';
import type { AerClient, AerClientOptions } from '../../src/client.js';
import type { TelemetryRecord } from '../../src/telemetry.js';
import type { FakeClock, FakeTransport, Responder } from './transport.js';
import { createFakeClock, createFakeTransport } from './transport.js';

export const BASE_URL = 'https://api.example.test/v1';

/** A fabricated credential. NOT A CREDENTIAL: it authorises nothing and reaches no real service. */
export const CANARY_CREDENTIAL = 'canary-credential-value-not-a-real-key';

/** Research content that must never leave through telemetry, an error, or example output. */
export const CANARY = Object.freeze({
  question: 'CANARY-QUESTION-must-not-be-telemetered',
  facts: 'CANARY-FACTS-must-not-be-telemetered',
  answer: 'CANARY-ANSWER-must-not-be-telemetered',
  quote: 'CANARY-CITATION-QUOTE-must-not-be-telemetered',
});

export const ALL_CANARIES: readonly string[] = Object.freeze([
  CANARY_CREDENTIAL,
  CANARY.question,
  CANARY.facts,
  CANARY.answer,
  CANARY.quote,
]);

export interface Harness {
  readonly client: AerClient;
  readonly transport: FakeTransport;
  readonly clock: FakeClock;
  readonly telemetry: TelemetryRecord[];
  /** Lets pending microtasks settle. Everything in the fake transport resolves on the microtask queue. */
  flush(): Promise<void>;
}

export interface HarnessOptions {
  readonly telemetryEnabled?: boolean;
  readonly overrides?: Partial<AerClientOptions>;
  readonly idempotencyKeys?: readonly string[];
}

export function createHarness(responder: Responder, options: HarnessOptions = {}): Harness {
  const transport = createFakeTransport(responder);
  const clock = createFakeClock();
  const telemetry: TelemetryRecord[] = [];
  const keys = [...(options.idempotencyKeys ?? [])];
  let keyIndex = 0;

  const clientOptions: AerClientOptions = {
    baseUrl: BASE_URL,
    auth: { apiKey: CANARY_CREDENTIAL },
    fetch: transport.fetch,
    retryDeps: clock,
    timers: clock.timers,
    generateIdempotencyKey: () => {
      const next = keys[keyIndex] ?? `generated-idempotency-key-${keyIndex}`;
      keyIndex += 1;
      return next;
    },
    ...(options.telemetryEnabled
      ? { telemetry: { enabled: true, sink: (record: TelemetryRecord) => telemetry.push(record) } }
      : {}),
    ...options.overrides,
  };

  return {
    client: createAerClient(clientOptions),
    transport,
    clock,
    telemetry,
    flush: async (): Promise<void> => {
      for (let i = 0; i < 100; i += 1) await Promise.resolve();
    },
  };
}

/** Collects an async iterable into an array. */
export async function collect<T>(iterable: AsyncIterable<T>): Promise<T[]> {
  const out: T[] = [];
  for await (const value of iterable) out.push(value);
  return out;
}
