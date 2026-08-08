/**
 * Opt-in telemetry (ticket deliverable 11, sub-PRD **D7**).
 *
 * PRD §8.10 is unconditional: *"SDK telemetry MUST NOT contain research content."* That is enforced
 * structurally, not by convention:
 *
 * 1. The record type is a CLOSED set of twelve keys, each a primitive.
 * 2. `assertTelemetrySafe` rejects any key outside the allowlist and any value of the wrong type.
 * 3. `createTelemetryEmitter` returns ONE function, and that function is the only code in this
 *    package that calls the sink. `test/telemetry.test.ts` asserts, by source scan, that no other
 *    file names `.sink`. A second call site is exactly the defect the reviewer is asked to hunt for.
 * 4. Telemetry is **disabled by default** and there is **no built-in transport**: the SDK never
 *    constructs a client, opens a socket or resolves a host of its own (PRD §20.2). The sink is the
 *    caller's function; where it sends anything is the caller's decision and the caller's disclosure.
 *
 * The call-site rule, stated so it cannot be missed: **the request body, the response body, headers,
 * URLs with query strings and error messages are never telemetry inputs.** Only the typed
 * `error_code` describes a failure. Widening the allowlist is a product/privacy change (PRD §45.5,
 * §10.2) recorded in `docs/prd/20-developer-platform/README.md` **D7**, never a local edit.
 */
import { AerValidationError } from './errors.js';

/**
 * The closed record. Every member is a primitive; there is no place to put a question, a fact, an
 * answer, a citation quote or a credential.
 */
export interface TelemetryRecord {
  readonly sdk_name: string;
  readonly sdk_version: string;
  readonly runtime: string;
  readonly platform: string;
  readonly operation_id: string;
  readonly http_method: string;
  /** `null` when the attempt never reached a response (a transport failure). */
  readonly http_status: number | null;
  readonly request_id?: string | undefined;
  readonly job_id?: string | undefined;
  readonly duration_ms: number;
  readonly attempt: number;
  readonly error_code?: string | undefined;
}

export interface TelemetryOptions {
  readonly enabled: boolean;
  readonly sink: (record: TelemetryRecord) => void;
}

type FieldKind = 'string' | 'number' | 'number-or-null';

/** The allowlist. A privacy boundary transcribed from the ticket, not a lint rule. */
const FIELDS: Readonly<Record<string, { readonly kind: FieldKind; readonly required: boolean }>> = Object.freeze({
  sdk_name: { kind: 'string', required: true },
  sdk_version: { kind: 'string', required: true },
  runtime: { kind: 'string', required: true },
  platform: { kind: 'string', required: true },
  operation_id: { kind: 'string', required: true },
  http_method: { kind: 'string', required: true },
  http_status: { kind: 'number-or-null', required: true },
  request_id: { kind: 'string', required: false },
  job_id: { kind: 'string', required: false },
  duration_ms: { kind: 'number', required: true },
  attempt: { kind: 'number', required: true },
  error_code: { kind: 'string', required: false },
});

/** Every allowed key, in declaration order. Exported so the manifest and the tests can be exact. */
export const TELEMETRY_ALLOWED_KEYS: readonly string[] = Object.freeze(Object.keys(FIELDS));

function kindMatches(kind: FieldKind, value: unknown): boolean {
  if (kind === 'string') return typeof value === 'string';
  if (kind === 'number') return typeof value === 'number' && Number.isFinite(value);
  return value === null || (typeof value === 'number' && Number.isFinite(value));
}

/**
 * Throws unless `record` is exactly an allowlisted, correctly-typed telemetry record.
 *
 * Runs on EVERY record, before the sink, at the single emit choke point below.
 */
export function assertTelemetrySafe(record: unknown): asserts record is TelemetryRecord {
  if (typeof record !== 'object' || record === null || Array.isArray(record)) {
    throw new AerValidationError('telemetry record must be a plain object');
  }
  const entries = Object.entries(record as Record<string, unknown>);
  for (const [key, value] of entries) {
    const field = FIELDS[key];
    if (!field) {
      throw new AerValidationError(
        `telemetry record carries the key "${key}", which is outside the PRD §8.10 allowlist`,
      );
    }
    if (value === undefined) {
      if (field.required) {
        throw new AerValidationError(`telemetry record is missing the required key "${key}"`);
      }
      continue;
    }
    if (!kindMatches(field.kind, value)) {
      throw new AerValidationError(`telemetry record key "${key}" is not a ${field.kind}`);
    }
  }
  for (const [key, field] of Object.entries(FIELDS)) {
    if (!field.required) continue;
    if (!(key in (record as Record<string, unknown>))) {
      throw new AerValidationError(`telemetry record is missing the required key "${key}"`);
    }
  }
}

/** The emitter type the rest of the package holds. A no-op when telemetry is disabled. */
export type TelemetryEmitter = (record: TelemetryRecord) => void;

/**
 * The ONLY function in this package that calls a telemetry sink.
 *
 * When telemetry is disabled — the default — this returns a function that does nothing at all: no
 * record is built, no validation runs, and the sink is never referenced.
 */
export function createTelemetryEmitter(options: TelemetryOptions | undefined): TelemetryEmitter {
  if (!options || !options.enabled) return () => undefined;
  const sink = options.sink;
  if (typeof sink !== 'function') {
    throw new AerValidationError('telemetry.sink must be a function when telemetry is enabled');
  }
  return (record: TelemetryRecord): void => {
    assertTelemetrySafe(record);
    sink(record);
  };
}
