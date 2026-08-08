/**
 * Named error types for this package.
 *
 * SECURITY RULE, enforced by every construction site: an error message here NEVER carries a value
 * that a caller supplied. A "helpful" message that echoes the offending value is exactly the leak
 * PRD §22 forbids ("Logs MUST exclude research/evidence content, PII text, credentials, assertions
 * and provider payloads") — an unhandled throw is itself frequently logged. Messages therefore name
 * the FIELD, the METRIC or the LABEL (all author-declared, closed vocabularies) and never the value.
 */

/** Base type, so a consumer can catch everything this package throws with one `instanceof`. */
export class ObservabilityError extends Error {
  constructor(message: string) {
    super(message);
    this.name = new.target.name;
  }
}

/** A metric spec is malformed or duplicated (src/metrics.ts, `register`). */
export class MetricSpecError extends ObservabilityError {}

/** A recorded metric value violates its declared unit or type (src/metrics.ts). */
export class MetricValueError extends ObservabilityError {}

/** A metric label is undeclared, or its value is outside the declared domain (src/metrics.ts). */
export class MetricLabelError extends ObservabilityError {}

/** A correlation id is not a well-formed opaque id (src/correlation.ts). */
export class CorrelationIdError extends ObservabilityError {}

/** A nested `withCorrelation` rebinds an already-bound key to a different value (src/correlation.ts). */
export class CorrelationConflictError extends ObservabilityError {}

/** A sink was handed a record of the other retention class (src/retention.ts, PRD §22 bullets 4-5). */
export class RecordClassError extends ObservabilityError {}

/** A retention configuration exceeds a PRD-fixed cap (src/retention.ts, PRD §22 bullet 4). */
export class RetentionConfigError extends ObservabilityError {}

/** Debug logging or crash dumps were enabled under `production` (src/debug.ts, PRD §22, §39.6). */
export class DebugNotPermittedError extends ObservabilityError {}

/** An exporter name is not one this package knows (src/exporter.ts, PRD §39.6 startup validation). */
export class ExporterConfigError extends ObservabilityError {}
