/**
 * The bounded JSON logger — RUNT-07 Deliverable 3.
 *
 * WHAT THE SURFACE DELIBERATELY LACKS. There is no `message` parameter, no `extra`/`meta`/`data`/
 * `payload`/`context`/`details` parameter, no overload taking `unknown`, `object` or
 * `Record<string, unknown>`, and no `Error` parameter. Error information travels as `error_code`
 * (PRD §34.9) plus `status`. That absence is the deliverable: PRD §22's "Logs MUST exclude
 * research/evidence content, PII text, credentials, assertions and provider payloads" is a MUST, and
 * `OPS-002`'s acceptance is "observable WITHOUT content logs". An escape hatch would falsify both,
 * which is why RUNT-07's Feedback obligation routes "a caller needs another field" through the
 * allowlist and the ticket, never through a generic object.
 *
 * RECORD ASSEMBLY, in order (see `assemble`):
 *
 *  1. A fresh null-prototype envelope: `ts`, `level`, `event`, `process` — all logger-produced.
 *  2. The correlation ids bound to the async context (already validated at bind time).
 *  3. The `child()`-bound fields, then this call's fields, each key:
 *       - not allowlisted            -> DROPPED, `observability_dropped_fields_total{reason=unknown_key}`
 *       - allowlisted, bad value     -> DROPPED, `…{reason=invalid_value}`; the value is never rendered
 *       - allowlisted, over the cap  -> truncated on a code-point boundary + a fixed marker, counted
 *  4. Surviving `version`/`hash` values pass through `src/redact.ts` (see that file for the layering).
 *  5. `JSON.stringify` over the NEW object, which holds only primitives that passed a kind check.
 *     The caller's object is never stringified, never `String()`-ed, never interpolated and never
 *     inspected, so a hostile `toJSON`, getter or prototype entry can never run against the
 *     serialiser. Only own enumerable string keys are read (`Object.keys`), so symbol keys are
 *     structurally excluded.
 *  6. If the encoded line exceeds `maxRecordBytes`, a minimal REPLACEMENT record is emitted rather
 *     than a truncated JSON fragment — a half-written object is not parseable and, worse, could
 *     terminate mid-value.
 *  7. One object per line, `\n` only. JSON escaping guarantees no raw newline inside the line.
 */
import { currentCorrelation } from './correlation.js';
import { FIELD_NAMES, FIELD_SPECS, isFieldName, isValidFieldValue } from './fields.js';
import type { FieldName, FieldValue, LogFields } from './fields.js';
import type { MetricRecorder } from './metrics.js';
import { redactValue } from './redact.js';
import type { RedactOptions } from './redact.js';
import type { LogSink } from './sinks.js';
import { droppedKeyLabel, isEventCode } from './vocabulary.js';
import type { DropReason, EventCode, ProcessRole } from './vocabulary.js';

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export type { LogSink, MemorySink, RecordClass } from './sinks.js';

/** Appended to a value that hit `maxValueLength`. A fixed literal; carries nothing from the input. */
export const TRUNCATION_MARKER = '…[truncated]';

/**
 * The event code substituted when a caller supplies one outside `EVENT_CODES`.
 *
 * The record is still emitted — losing the fact that something happened is worse than losing its
 * label — but the caller's string never reaches the line, and the drop is counted.
 */
export const UNKNOWN_EVENT: EventCode = 'observability.field_dropped';

/** Default cap on a single string value, in code points. */
export const DEFAULT_MAX_VALUE_LENGTH = 256;

/**
 * Default cap on one encoded record, in UTF-8 bytes.
 *
 * 4 KiB is chosen so a single `write()` stays inside the size for which an `O_APPEND` write is
 * atomic on Linux (PIPE_BUF is 4096). `src/retention.ts` gives every process its own file, so
 * interleaving is already impossible there — this keeps the property if a future consumer points two
 * processes at one descriptor anyway.
 */
export const DEFAULT_MAX_RECORD_BYTES = 4096;

export interface LoggerOptions {
  readonly sink: LogSink;
  /** Which of PRD §39.1's processes is emitting. */
  readonly process: ProcessRole;
  /** Injected so `ts` is deterministic in tests. Defaults to `Date.now`. */
  readonly clock?: () => number;
  /** Per-value cap in code points. Default {@link DEFAULT_MAX_VALUE_LENGTH}. */
  readonly maxValueLength?: number;
  /** Per-record cap in UTF-8 bytes. Default {@link DEFAULT_MAX_RECORD_BYTES}. */
  readonly maxRecordBytes?: number;
  /** The registry the self-observability counters go to. Omit to disable them. */
  readonly metrics?: MetricRecorder;
  /** Credential-prefix configuration for the defensive redaction layer. */
  readonly redact?: RedactOptions;
}

export interface Logger {
  debug(event: EventCode, fields?: LogFields): void;
  info(event: EventCode, fields?: LogFields): void;
  warn(event: EventCode, fields?: LogFields): void;
  error(event: EventCode, fields?: LogFields): void;
  /** A logger with `fields` merged into every record it emits. Bound fields are validated per emit. */
  child(fields: LogFields): Logger;
}

/** UTF-8 byte length without touching a global (`TextEncoder` is not in `lib: ["ES2024"]`). */
export function utf8ByteLength(value: string): number {
  let bytes = 0;
  for (const codePoint of value) {
    const code = codePoint.codePointAt(0) as number;
    if (code < 0x80) bytes += 1;
    else if (code < 0x800) bytes += 2;
    else if (code < 0x10000) bytes += 3;
    else bytes += 4;
  }
  return bytes;
}

/** Truncates on a CODE-POINT boundary, so a surrogate pair is never split into invalid halves. */
function truncate(value: string, maxLength: number): string {
  const points = [...value];
  if (points.length <= maxLength) return value;
  return points.slice(0, maxLength).join('') + TRUNCATION_MARKER;
}

/** A metric increment that can never take the process down because of the logger's own bookkeeping. */
function safeIncrement(
  metrics: MetricRecorder | undefined,
  name: string,
  labels: Readonly<Record<string, string>>,
): void {
  if (metrics === undefined) return;
  try {
    metrics.increment(name, labels, 1);
  } catch {
    // A logger must not throw because a self-observability metric is unregistered or capped.
  }
}

export function createLogger(options: LoggerOptions): Logger {
  const clock = options.clock ?? Date.now;
  const maxValueLength = options.maxValueLength ?? DEFAULT_MAX_VALUE_LENGTH;
  const maxRecordBytes = options.maxRecordBytes ?? DEFAULT_MAX_RECORD_BYTES;
  const metrics = options.metrics;
  const redactOptions = options.redact ?? {};

  function countDrop(key: string, reason: DropReason): void {
    // `droppedKeyLabel` maps the CALLER-CONTROLLED key onto a closed domain: the raw key name can
    // itself be content, and a raw key as a label would be exactly the leak this package prevents.
    safeIncrement(metrics, 'observability_dropped_fields_total', {
      key: droppedKeyLabel(key),
      reason,
    });
  }

  /** Merges one caller-supplied field bag into `into`, dropping and counting whatever fails. */
  function mergeFields(into: Record<string, FieldValue>, fields: LogFields | undefined): void {
    if (fields === undefined) return;
    // Own enumerable STRING keys only: symbol keys and prototype entries are structurally excluded.
    const bag = fields as unknown as Record<string, FieldValue>;
    for (const key of Object.keys(bag)) {
      const value = bag[key];
      if (value === undefined) continue;
      if (!isFieldName(key)) {
        countDrop(key, 'unknown_key');
        continue;
      }
      if (!isValidFieldValue(key, value)) {
        countDrop(key, 'invalid_value');
        continue;
      }
      into[key] = value;
    }
  }

  function assemble(level: LogLevel, event: EventCode, bound: readonly LogFields[], fields: LogFields | undefined): string {
    const record: Record<string, FieldValue> = Object.create(null) as Record<string, FieldValue>;
    record['ts'] = new Date(clock()).toISOString();
    record['level'] = level;
    // The event code is the ONLY string a caller names directly, so it is validated like any other
    // field: TypeScript types it as `EventCode`, but a JavaScript caller (or an `as` cast) could
    // pass anything, and an unvalidated event is a free-text channel straight into the record.
    if (isEventCode(event)) {
      record['event'] = event;
    } else {
      record['event'] = UNKNOWN_EVENT;
      countDrop('event', 'invalid_value');
    }
    record['process'] = options.process;

    const correlation = currentCorrelation();
    const collected: Record<string, FieldValue> = Object.create(null) as Record<string, FieldValue>;
    for (const [key, value] of Object.entries(correlation)) {
      if (typeof value === 'string') collected[key] = value;
    }
    for (const bag of bound) mergeFields(collected, bag);
    mergeFields(collected, fields);

    // Emit in the allowlist's declaration order, so record shape is deterministic across processes.
    for (const name of FIELD_NAMES) {
      const value = collected[name];
      if (value === undefined) continue;
      record[name] = finalise(name, value);
    }
    return JSON.stringify(record);
  }

  /** Truncation and the defensive redaction layer, applied after the kind check has passed. */
  function finalise(name: FieldName, value: FieldValue): FieldValue {
    if (typeof value !== 'string') return value;
    let out = value;
    if ([...out].length > maxValueLength) {
      out = truncate(out, maxValueLength);
      safeIncrement(metrics, 'observability_truncated_fields_total', { key: name });
    }
    const kind = FIELD_SPECS[name].kind;
    if (kind === 'version' || kind === 'hash') out = redactValue(out, redactOptions);
    return out;
  }

  /** The replacement emitted instead of an oversized record. Correlation is kept; fields are not. */
  function oversized(level: LogLevel): string {
    const record: Record<string, FieldValue> = Object.create(null) as Record<string, FieldValue>;
    record['ts'] = new Date(clock()).toISOString();
    record['level'] = level;
    record['event'] = 'observability.record_oversized';
    record['process'] = options.process;
    for (const [key, value] of Object.entries(currentCorrelation())) {
      if (typeof value === 'string') record[key] = value;
    }
    return JSON.stringify(record);
  }

  function build(bound: readonly LogFields[]): Logger {
    function emit(level: LogLevel, event: EventCode, fields?: LogFields): void {
      let line = assemble(level, event, bound, fields);
      if (utf8ByteLength(line) > maxRecordBytes) {
        safeIncrement(metrics, 'observability_record_oversized_total', {});
        line = oversized(level);
      }
      options.sink.write(`${line}\n`, 'application');
    }

    return {
      debug: (event, fields) => emit('debug', event, fields),
      info: (event, fields) => emit('info', event, fields),
      warn: (event, fields) => emit('warn', event, fields),
      error: (event, fields) => emit('error', event, fields),
      child: (fields) => build([...bound, fields]),
    };
  }

  return build([]);
}
