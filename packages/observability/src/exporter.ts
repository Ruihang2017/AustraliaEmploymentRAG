/**
 * The pluggable metrics exporter — RUNT-07 Deliverable 7.
 *
 * QR3 (the metrics exposition protocol/endpoint) is DELIBERATELY UNRESOLVED by this ticket. PRD §22
 * names the metric families and PRD §42.1 names no metrics endpoint, so choosing a wire format here
 * would bind a protocol, an endpoint and possibly a runtime dependency that PRD §18.1's
 * forbidden-infrastructure list has not been checked against. This interface is the mechanism that
 * keeps the question open: `RLSE-08` (`18-ops-release`) is the consumer that will answer it, via an
 * ADR plus a resolution in `docs/prd/03-app-runtime/README.md` §6 — not by editing this file.
 *
 * The default is JSON lines over a {@link LogSink}: no protocol commitment, no dependency, and
 * trivially readable by whatever `RLSE-08` chooses.
 *
 * LEAK SURFACE. An exporter serialises SAMPLES only — name, family, type, unit, labels, value.
 * It never sees a log record and never sees a raw field, so the QR3 decision cannot later widen what
 * is exposed: every label has already passed `src/metrics.ts`'s `enum` / `opaque_id` / `metric_name`
 * check, and there is no free-string label kind for a payload to hide in.
 */
import { ExporterConfigError } from './errors.js';
import type { MetricSample } from './metrics.js';
import type { LogSink } from './sinks.js';

export interface MetricExporter {
  export(snapshot: readonly MetricSample[]): void;
}

/** Every exporter this package knows. Unknown names are a startup failure, per PRD §39.6. */
export const EXPORTER_NAMES = Object.freeze(['json_lines', 'null'] as const);

export type ExporterName = (typeof EXPORTER_NAMES)[number];

export interface ExporterConfig {
  readonly exporter: string;
}

export interface ExporterDeps {
  /** Where `json_lines` writes. Required when that exporter is selected. */
  readonly sink?: LogSink;
}

/**
 * One JSON object per sample per line, written as `'application'` class.
 *
 * Samples are re-built from primitives here rather than passed through, so a future exporter cannot
 * accidentally serialise registry internals.
 */
export interface ExportedSample {
  readonly metric: string;
  readonly family: string;
  readonly type: string;
  readonly unit: string;
  readonly labels: Readonly<Record<string, string>>;
  readonly value: number;
  readonly sum?: number;
  readonly buckets?: readonly { readonly le: number; readonly count: number }[];
}

export function createJsonLinesExporter(sink: LogSink): MetricExporter {
  return {
    export(snapshot: readonly MetricSample[]): void {
      for (const sample of snapshot) {
        const line: ExportedSample = {
          metric: sample.name,
          family: sample.family,
          type: sample.type,
          unit: sample.unit,
          labels: { ...sample.labels },
          value: sample.value,
          ...(sample.sum !== undefined ? { sum: sample.sum } : {}),
          ...(sample.buckets !== undefined
            ? { buckets: sample.buckets.map((bucket) => ({ le: bucket.le, count: bucket.count })) }
            : {}),
        };
        sink.write(`${JSON.stringify(line)}\n`, 'application');
      }
    },
  };
}

/** Discards everything. For a process that reports metrics by another route. */
export function createNullExporter(): MetricExporter {
  return { export: () => undefined };
}

/**
 * Resolves configuration to an exporter.
 *
 * @throws ExporterConfigError  the name is not in {@link EXPORTER_NAMES}, or `json_lines` was
 *   selected without a sink. PRD §39.6: "Production startup validates the complete schema and
 *   refuses unknown critical keys" — an unknown exporter is a startup failure, never a silent
 *   fallback to "no metrics", which would make a monitoring gap invisible.
 */
export function selectExporter(config: ExporterConfig, deps: ExporterDeps = {}): MetricExporter {
  switch (config.exporter) {
    case 'json_lines': {
      if (deps.sink === undefined) {
        throw new ExporterConfigError('exporter "json_lines" requires a sink');
      }
      return createJsonLinesExporter(deps.sink);
    }
    case 'null':
      return createNullExporter();
    default:
      // The configured name is echoed on purpose: it is deployment configuration, not request data,
      // and a startup error that hides which key was wrong is not actionable.
      throw new ExporterConfigError(`unknown metrics exporter "${config.exporter}"`);
  }
}
