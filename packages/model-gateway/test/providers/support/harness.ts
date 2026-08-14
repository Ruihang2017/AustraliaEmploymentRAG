/**
 * EVID-07 — the gateway harness: ports, spies and controllable time.
 *
 * `GatewayDeps` has no default implementation in `src/**` by design, so every suite builds its own
 * here. Two things this file makes possible and a wall-clock test could not:
 *
 *  - the elapsed-ceiling assertion is DETERMINISTIC. `immediateTimer` fires the deadline at once and
 *    `deferredTransport` resolves only when the test says so, so `PROFILE_TIMEOUT` is a decision, not
 *    a race the CI machine can lose;
 *  - "exactly one `model_execution` row per attempt" is observable. `recordingPort` keeps every call,
 *    so the late-resolution case (plan §6 risk 2) can be checked rather than assumed.
 *
 * Not a `*.test.*` file.
 */
import { MODEL_PROFILE_REGISTRY_V1 } from '../../../src/profiles/registry.js';
import { PROVIDER_DESCRIPTORS } from '../../../src/providers/registry.js';
import { NO_KILL_SWITCH } from '../../../src/providers/killswitch.js';
import type { GatewayCall, GatewayDeps } from '../../../src/providers/generate.js';
import type { GatewayKillSwitchState } from '../../../src/providers/killswitch.js';
import type { ModelExecutionRecord } from '../../../src/providers/recording.js';
import type { Transport, TransportRequest, TransportResponse } from '../../../src/providers/transport/types.js';
import type { GatewayEnvironment, ModelProfile, ModelProfileId } from '../../../src/profiles/types.js';
import type { ProviderDescriptor } from '../../../src/providers/registry.js';
import { evidencePack, sanitizedFacts } from './doubles.js';

export interface FakeClock {
  now(): number;
  advance(ms: number): void;
}

export function fakeClock(start = 1_000): FakeClock {
  let current = start;
  return {
    now: () => current,
    advance: (ms: number) => {
      current += ms;
    },
  };
}

/** A deadline that never fires — the transport always wins the race. */
export const neverTimer = (): Promise<void> => new Promise<void>(() => undefined);

/** A deadline that fires on the next microtask — the transport always loses the race. */
export const immediateTimer = (): Promise<void> => Promise.resolve();

export interface TransportSpy {
  readonly transport: Transport;
  readonly calls: TransportRequest[];
}

/** Wraps a transport and records every request it was asked to make. */
export function spyOnTransport(inner: Transport): TransportSpy {
  const calls: TransportRequest[] = [];
  return {
    calls,
    transport: (request) => {
      calls.push(request);
      return inner(request);
    },
  };
}

export function respondWith(response: Partial<TransportResponse> = {}): Transport {
  return () =>
    Promise.resolve({
      status: 200,
      headersSubset: {},
      body: '{}',
      modelVersion: null,
      inputTokens: null,
      outputTokens: null,
      costMicroAud: null,
      ...response,
    });
}

export function throwingTransport(error: Error = new Error('connection reset')): Transport {
  return () => Promise.reject(error);
}

export interface DeferredTransport {
  readonly transport: Transport;
  /** Settle the pending call — used to prove a LATE resolution changes nothing. */
  settle(response: Partial<TransportResponse>): void;
}

export function deferredTransport(): DeferredTransport {
  let resolveWith: ((response: TransportResponse) => void) | null = null;
  const pending = new Promise<TransportResponse>((resolve) => {
    resolveWith = resolve;
  });
  return {
    transport: () => pending,
    settle: (response) => {
      resolveWith?.({
        status: 200,
        headersSubset: {},
        body: '{}',
        modelVersion: null,
        inputTokens: null,
        outputTokens: null,
        costMicroAud: null,
        ...response,
      });
    },
  };
}

export interface RecordingPort {
  insert(tx: unknown, values: ModelExecutionRecord): unknown;
  readonly rows: ModelExecutionRecord[];
  readonly transactions: unknown[];
}

export function recordingPort(): RecordingPort {
  const rows: ModelExecutionRecord[] = [];
  const transactions: unknown[] = [];
  return {
    rows,
    transactions,
    insert(tx: unknown, values: ModelExecutionRecord) {
      transactions.push(tx);
      rows.push(values);
      return values;
    },
  };
}

export function throwingPort(error: Error): RecordingPort {
  const port = recordingPort();
  return {
    ...port,
    insert() {
      throw error;
    },
  };
}

export interface HarnessOptions {
  readonly transport: Transport;
  readonly timer?: GatewayDeps['timer'];
  readonly clock?: FakeClock;
  readonly killSwitch?: GatewayKillSwitchState;
  readonly environment?: GatewayEnvironment;
  readonly providers?: readonly ProviderDescriptor[];
  readonly profileRegistry?: Readonly<Record<ModelProfileId, ModelProfile>>;
  readonly port?: RecordingPort;
}

export interface Harness {
  readonly deps: GatewayDeps;
  readonly port: RecordingPort;
  readonly clock: FakeClock;
}

export const TX_SENTINEL = { readonly: 'a transaction handle this package never inspects' } as const;

export function harness(options: HarnessOptions): Harness {
  const clock = options.clock ?? fakeClock();
  const port = options.port ?? recordingPort();
  const deps: GatewayDeps = {
    transport: options.transport,
    clock,
    timer: options.timer ?? neverTimer,
    modelExecutions: port,
    modelExecutionTx: TX_SENTINEL,
    killSwitch: options.killSwitch ?? NO_KILL_SWITCH,
    environment: options.environment ?? 'EVALUATION',
    ...(options.providers === undefined ? {} : { providers: options.providers }),
    ...(options.profileRegistry === undefined ? {} : { profileRegistry: options.profileRegistry }),
  };
  return { deps, port, clock };
}

export function gatewayCall(overrides: Partial<GatewayCall> = {}): GatewayCall {
  return {
    profileId: 'QUICK_SYNTHESIS',
    facts: sanitizedFacts([{ field: 'question', value: 'a synthetic question' }]),
    pack: evidencePack(),
    ids: { requestId: 'rq_0000000000000001', jobId: 'jb_0000000000000001' },
    ...overrides,
  };
}

/** A registry with one entry patched. Never a mutation of the frozen shipped registry. */
export function registryWith(
  id: ModelProfileId,
  patch: Partial<ModelProfile>,
  base: Readonly<Record<ModelProfileId, ModelProfile>> = MODEL_PROFILE_REGISTRY_V1,
): Record<ModelProfileId, ModelProfile> {
  return { ...base, [id]: { ...base[id], ...patch } } as Record<ModelProfileId, ModelProfile>;
}

export const SHIPPED_PROVIDERS = PROVIDER_DESCRIPTORS;
