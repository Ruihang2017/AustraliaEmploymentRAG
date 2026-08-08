/**
 * RUNT-07 acceptance item 3 — "a `secret-canary-<uuid>` string placed in a message, a field value,
 * an error object, a nested object, an array and an `Error.stack` appears in NO emitted byte"
 * (PRD §22; `OPS-002`).
 *
 * The probes are driven through the exported, framework-agnostic harness in `test/canary.ts`, which
 * `RUNT-01`, `RUNT-02`, `RUNT-04` and `RUNT-08` reuse against their own call sites.
 */
import { describe, expect, it } from 'vitest';

import { withCorrelation } from '../src/correlation.js';
import type { LogFields } from '../src/fields.js';
import { createJsonLinesExporter } from '../src/exporter.js';
import { createLogger } from '../src/logger.js';
import type { EventCode } from '../src/vocabulary.js';
import { createDefaultRegistry } from '../src/metrics.js';
import { createMemorySink } from '../src/sinks.js';
import { CANARY_PROBES, newCanary, runCanaryProbes } from './canary.js';
import type { CanaryProbe } from './canary.js';

describe('the canary harness', () => {
  it('finds no leak in any of the nine probes', () => {
    const sink = createMemorySink();
    const registry = createDefaultRegistry();
    const logger = createLogger({ sink, process: 'app', clock: () => 0, metrics: registry });
    const exporter = createJsonLinesExporter(sink);

    const report = runCanaryProbes({
      emitted: () => {
        // Metric state is exported into the same sink, so a canary that reached a LABEL would show
        // up here too — labels are the other surface that can carry caller-supplied text.
        exporter.export(registry.snapshot());
        return sink.bytes();
      },
      exercise: (canary, probe) => {
        const error = new Error(canary);
        switch (probe) {
          case 'event':
            logger.info(canary as EventCode);
            return;
          case 'field_value':
            logger.info('request.completed', { request_id: canary } as unknown as LogFields);
            return;
          case 'error_object':
            logger.error('request.rejected', error as unknown as LogFields);
            return;
          case 'error_stack':
            logger.error('request.rejected', {
              error_code: error.stack,
              release_id: error.stack,
              status: error.message,
            } as unknown as LogFields);
            return;
          case 'nested_object':
            logger.info('request.completed', {
              request_id: { toString: () => canary },
              nested: { deep: { deeper: canary } },
            } as unknown as LogFields);
            return;
          case 'array_element':
            logger.info('request.completed', {
              count: [canary],
              evidence: [canary, { canary }],
            } as unknown as LogFields);
            return;
          case 'metric_label':
            registry.increment('http_requests_total', { operation: canary, status: 'ok' });
            registry.increment('tenant_cost_micro_aud_total', { organization_id: canary }, 1);
            return;
          case 'child_binding':
            logger
              .child({ organization_id: canary } as unknown as LogFields)
              .info('request.completed');
            return;
          case 'correlation_id':
            withCorrelation({ request_id: canary }, () => {
              logger.info('request.completed');
            });
            return;
        }
      },
    });

    expect(report.ran).toEqual([...CANARY_PROBES]);
    expect(report.leaking).toEqual([]);
    // Rejections are a pass, but they must be visible rather than silently counted as clean.
    expect(report.threw.length).toBeGreaterThan(0);
  });

  it('detects a leak when one exists — the positive control on the harness itself', () => {
    let emitted = '';
    const report = runCanaryProbes({
      probes: ['field_value'] as readonly CanaryProbe[],
      emitted: () => emitted,
      exercise: (canary) => {
        emitted += `a naive logger wrote ${canary}\n`;
      },
    });
    expect(report.leaking).toEqual(['field_value']);
  });

  it('mints a distinct canary per probe', () => {
    const first = newCanary();
    const second = newCanary();
    expect(first).not.toBe(second);
    expect(first.startsWith('secret-canary-')).toBe(true);
  });

  it('records a throwing probe without counting it as a leak', () => {
    const report = runCanaryProbes({
      probes: ['event'],
      emitted: () => '',
      exercise: () => {
        throw new Error('rejected');
      },
    });
    expect(report.threw).toEqual(['event']);
    expect(report.leaking).toEqual([]);
  });
});
