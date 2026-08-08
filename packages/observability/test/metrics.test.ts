/**
 * RUNT-07 acceptance items 6, 7 and 8 — every PRD §22 family declared; integer micro-AUD with a
 * float rejected; a label value outside its declared domain rejected so cardinality is bounded.
 */
import { describe, expect, it } from 'vitest';

import { MetricLabelError, MetricSpecError, MetricValueError } from '../src/errors.js';
import {
  CARDINALITY_OVERFLOW_LABEL,
  DEFAULT_METRICS,
  LABEL_OVERFLOW_METRIC,
  PRD_22_FAMILIES,
  createDefaultRegistry,
  createRegistry,
} from '../src/metrics.js';
import type { MetricSpec } from '../src/metrics.js';
import { id } from './support/ids.js';

/** Written out literally, exactly as RUNT-07's acceptance item demands. */
const PRD_22_FAMILY_LIST = [
  'server_resources', // "server/disk/memory"
  'backup_lag', // "backup lag"
  'app_auth_pii', // "app/auth/PII"
  'job_queues', // "job queues"
  'search', // "search latency/zero-results/release"
  'sources', // "source freshness/quarantine/citation/evaluation"
  'cost', // "provider/tenant cost"
];

describe('the PRD §22 metric families', () => {
  it('declares exactly the families PRD §22 lists', () => {
    expect([...PRD_22_FAMILIES]).toEqual(PRD_22_FAMILY_LIST);
  });

  it('covers every family with at least one registered metric', () => {
    const registry = createDefaultRegistry();
    const covered = new Set(
      registry.names().map((name) => registry.spec(name)?.family as string),
    );
    for (const family of PRD_22_FAMILY_LIST) {
      expect(covered.has(family), `no metric declares family ${family}`).toBe(true);
    }
  });

  it('names the specific measurements the families call out', () => {
    const registry = createDefaultRegistry();
    for (const name of [
      'process_resident_memory_bytes',
      'disk_used_ratio',
      'backup_replication_lag_seconds',
      'http_requests_total',
      'auth_attempts_total',
      'pii_admission_results_total',
      'job_queue_depth',
      'job_oldest_age_seconds',
      'jobs_in_flight',
      'search_latency_milliseconds',
      'search_zero_results_total',
      'search_active_release_info',
      'source_freshness_age_seconds',
      'source_quarantine_total',
      'citation_validation_failures_total',
      'evaluation_runs_total',
      'provider_cost_micro_aud_total',
      'tenant_cost_micro_aud_total',
    ]) {
      expect(registry.spec(name), `${name} is not registered`).toBeDefined();
    }
  });

  it('gives every default metric static help text and a bounded label set', () => {
    for (const spec of DEFAULT_METRICS) {
      expect(spec.help.length).toBeGreaterThan(10);
      for (const label of Object.values(spec.labels)) {
        expect(['enum', 'opaque_id', 'metric_name']).toContain(label.kind);
      }
    }
  });
});

describe('cost metrics are integer micro-AUD (PRD §34.1)', () => {
  it('rejects a float, NaN, Infinity and a non-safe integer', () => {
    const registry = createDefaultRegistry();
    for (const bad of [1.5, Number.NaN, Number.POSITIVE_INFINITY, 2 ** 53]) {
      expect(() =>
        registry.increment('provider_cost_micro_aud_total', { provider: 'primary' }, bad),
      ).toThrow(MetricValueError);
    }
    registry.increment('provider_cost_micro_aud_total', { provider: 'primary' }, 1250);
    expect(
      registry.snapshot().find((s) => s.name === 'provider_cost_micro_aud_total')?.value,
    ).toBe(1250);
  });

  it('rejects non-integer buckets on a micro_aud histogram at registration', () => {
    const registry = createRegistry();
    const spec: MetricSpec = {
      name: 'answer_cost_micro_aud',
      family: 'cost',
      type: 'histogram',
      unit: 'micro_aud',
      help: 'Answer cost distribution in integer micro-AUD.',
      labels: {},
      buckets: [1, 10.5, 100],
    };
    expect(() => registry.register(spec)).toThrow(MetricSpecError);
    expect(() => registry.register({ ...spec, buckets: [1, 10, 100] })).not.toThrow();
  });

  it('refuses a counter decrement', () => {
    const registry = createDefaultRegistry();
    expect(() => registry.increment('search_zero_results_total', {}, -1)).toThrow(MetricValueError);
  });
});

describe('label domains are closed', () => {
  it('rejects an undeclared label name', () => {
    const registry = createDefaultRegistry();
    expect(() =>
      registry.increment('search_zero_results_total', { tenant: 'acme' }),
    ).toThrow(MetricLabelError);
  });

  it('rejects an enum value outside the declared domain, without echoing it', () => {
    const registry = createDefaultRegistry();
    const canary = 'secret-canary-label-value';
    try {
      registry.increment('http_requests_total', { operation: canary, status: 'ok' });
      throw new Error('expected a throw');
    } catch (error) {
      expect(error).toBeInstanceOf(MetricLabelError);
      expect((error as Error).message).not.toContain(canary);
    }
  });

  it('rejects a missing declared label', () => {
    const registry = createDefaultRegistry();
    expect(() => registry.increment('http_requests_total', { status: 'ok' })).toThrow(
      MetricLabelError,
    );
  });

  it('rejects a malformed opaque_id label value', () => {
    const registry = createDefaultRegistry();
    expect(() =>
      registry.increment('tenant_cost_micro_aud_total', { organization_id: 'acme' }, 1),
    ).toThrow(MetricLabelError);
  });

  it('collapses to "overflow" past maxCardinality instead of throwing', () => {
    const registry = createRegistry();
    registry.register({
      name: LABEL_OVERFLOW_METRIC,
      family: 'app_auth_pii',
      type: 'counter',
      unit: 'count',
      help: 'Label cardinality overflows.',
      labels: { metric: { kind: 'metric_name' } },
    });
    registry.register({
      name: 'tenant_cost_micro_aud_total',
      family: 'cost',
      type: 'counter',
      unit: 'micro_aud',
      help: 'Tenant spend in integer micro-AUD.',
      labels: { organization_id: { kind: 'opaque_id', maxCardinality: 2 } },
    });

    const tenants = [id('org'), id('org'), id('org'), id('org')];
    for (const organization_id of tenants) {
      registry.increment('tenant_cost_micro_aud_total', { organization_id }, 10);
    }

    const samples = registry.snapshot().filter((s) => s.name === 'tenant_cost_micro_aud_total');
    const labels = samples.map((s) => s.labels['organization_id']);
    expect(labels).toContain(CARDINALITY_OVERFLOW_LABEL);
    expect(new Set(labels).size).toBe(3); // two real tenants plus the overflow bucket
    expect(
      registry.snapshot().find((s) => s.name === LABEL_OVERFLOW_METRIC)?.value,
    ).toBe(2);
  });
});

describe('registration', () => {
  const base: MetricSpec = {
    name: 'example_total',
    family: 'search',
    type: 'counter',
    unit: 'count',
    help: 'An example counter for registration tests.',
    labels: {},
  };

  it('rejects a duplicate name', () => {
    const registry = createRegistry();
    registry.register(base);
    expect(() => registry.register(base)).toThrow(MetricSpecError);
  });

  it('rejects a malformed name, an unknown family and empty help', () => {
    const registry = createRegistry();
    expect(() => registry.register({ ...base, name: 'Bad-Name' })).toThrow(MetricSpecError);
    expect(() =>
      registry.register({ ...base, family: 'made_up' as MetricSpec['family'] }),
    ).toThrow(MetricSpecError);
    expect(() => registry.register({ ...base, help: '  ' })).toThrow(MetricSpecError);
  });

  it('rejects an empty enum domain and a nonsensical cardinality cap', () => {
    const registry = createRegistry();
    expect(() =>
      registry.register({ ...base, labels: { outcome: { kind: 'enum', values: [] } } }),
    ).toThrow(MetricSpecError);
    expect(() =>
      registry.register({
        ...base,
        labels: { organization_id: { kind: 'opaque_id', maxCardinality: 0 } },
      }),
    ).toThrow(MetricSpecError);
  });

  it('rejects buckets on a non-histogram and missing buckets on a histogram', () => {
    const registry = createRegistry();
    expect(() => registry.register({ ...base, buckets: [1, 2] })).toThrow(MetricSpecError);
    expect(() =>
      registry.register({ ...base, name: 'example_hist', type: 'histogram', unit: 'milliseconds' }),
    ).toThrow(MetricSpecError);
    expect(() =>
      registry.register({
        ...base,
        name: 'example_hist2',
        type: 'histogram',
        unit: 'milliseconds',
        buckets: [10, 5],
      }),
    ).toThrow(MetricSpecError);
  });

  it('refuses to record against the wrong metric type or an unregistered name', () => {
    const registry = createDefaultRegistry();
    expect(() => registry.set('search_zero_results_total', {}, 1)).toThrow(MetricValueError);
    expect(() => registry.increment('process_up', {}, 1)).toThrow(MetricValueError);
    expect(() => registry.observe('process_up', {}, 1)).toThrow(MetricValueError);
    expect(() => registry.increment('not_registered_total', {})).toThrow(MetricSpecError);
  });
});

describe('histograms and snapshots', () => {
  it('accumulates cumulative buckets, a sum and a count', () => {
    const registry = createDefaultRegistry();
    for (const value of [3, 7, 30, 30_000]) {
      registry.observe('search_latency_milliseconds', {}, value);
    }
    const sample = registry.snapshot().find((s) => s.name === 'search_latency_milliseconds');
    expect(sample?.value).toBe(4);
    expect(sample?.sum).toBe(30_040);
    expect(sample?.buckets?.[0]).toEqual({ le: 5, count: 1 });
    expect(sample?.buckets?.[1]).toEqual({ le: 10, count: 2 });
    // The 30s observation falls in the implicit +Inf bucket, so the last declared bound stops at 3.
    expect(sample?.buckets?.at(-1)?.count).toBe(3);
  });

  it('returns a copy, so a later mutation cannot be observed through an old snapshot', () => {
    const registry = createDefaultRegistry();
    registry.increment('search_zero_results_total', {});
    const before = registry.snapshot();
    registry.increment('search_zero_results_total', {});
    expect(before.find((s) => s.name === 'search_zero_results_total')?.value).toBe(1);
    expect(
      registry.snapshot().find((s) => s.name === 'search_zero_results_total')?.value,
    ).toBe(2);
  });
});
