/**
 * EVID-01 deliverable 10 — the metrics surface records category/count/result, and nothing else.
 *
 * PRD §37.2: *"Metrics record category/count/result, not content or reversible hash."* The type-level
 * half of this (an extra property fails to compile) is in `types.test-d.ts`; this file asserts the
 * runtime behaviour: what is emitted, in what order, and that no field value or offset reaches the
 * sink.
 */
import { describe, expect, it } from 'vitest';

import { PII_CATEGORY_VALUES } from '../../src/contract/category.js';
import type { PiiMetricsEvent, PiiMetricsSink } from '../../src/contract/metrics.js';
import { emitAdmissionMetrics } from '../../src/contract/metrics.js';
import type { PiiFinding } from '../../src/contract/finding.js';
import type { PiiAdmissionResult } from '../../src/contract/result.js';
import type { Id } from '../../../contracts/src/ids/index.js';
import { PII_PLACEHOLDERS } from '../../src/deterministic/placeholders.js';
import { admitField } from './fixture.js';

const REQUEST_ID = 'req_0198f3c1-0000-7000-8000-000000000001' as Id<'req'>;

function capturingSink(): { sink: PiiMetricsSink; events: PiiMetricsEvent[] } {
  const events: PiiMetricsEvent[] = [];
  return { sink: { record: (event) => events.push(event) }, events };
}

function finding(category: PiiFinding['category'], start: number): PiiFinding {
  return {
    field: 'question',
    start,
    end: start + 5,
    category,
    severity: 'BLOCKING',
    suggestedPlaceholder: PII_PLACEHOLDERS[category],
  };
}

describe('emitAdmissionMetrics', () => {
  it('emits one event per category, with a count', () => {
    const result: PiiAdmissionResult = {
      decision: 'REJECT',
      findings: [
        finding('TAX_FILE_NUMBER', 0),
        finding('TAX_FILE_NUMBER', 10),
        finding('PRIVATE_CONTACT_EMAIL', 20),
      ],
    };
    const { sink, events } = capturingSink();
    emitAdmissionMetrics(result, sink, REQUEST_ID);
    expect(events).toEqual([
      { category: 'PRIVATE_CONTACT_EMAIL', count: 1, result: 'REJECT', requestId: REQUEST_ID },
      { category: 'TAX_FILE_NUMBER', count: 2, result: 'REJECT', requestId: REQUEST_ID },
    ]);
  });

  it('emits in PII_CATEGORY_VALUES order, so two runs produce the same call sequence', () => {
    const result: PiiAdmissionResult = {
      decision: 'REJECT',
      findings: [
        finding('MEDICARE_NUMBER', 0),
        finding('EMPLOYEE_OR_PRIVATE_INDIVIDUAL_NAME', 5),
        finding('TAX_FILE_NUMBER', 10),
      ],
    };
    const { sink, events } = capturingSink();
    emitAdmissionMetrics(result, sink, REQUEST_ID);
    const order = events.map((event) => PII_CATEGORY_VALUES.indexOf(event.category));
    expect(order).toEqual([...order].sort((left, right) => left - right));
  });

  it('emits nothing when there are no findings', () => {
    const { sink, events } = capturingSink();
    emitAdmissionMetrics({ decision: 'REJECT', findings: [] }, sink, REQUEST_ID);
    expect(events).toEqual([]);
  });

  it('carries no offset, no field name and no text — the event keys are fixed', () => {
    const result = admitField('question', 'Their tax file number is 123 456 782 on the form.');
    const { sink, events } = capturingSink();
    emitAdmissionMetrics(result, sink, REQUEST_ID);
    expect(events.length).toBeGreaterThan(0);
    for (const event of events) {
      expect(Object.keys(event).sort()).toEqual(['category', 'count', 'requestId', 'result']);
      expect(JSON.stringify(event)).not.toContain('456');
      expect(JSON.stringify(event)).not.toContain('question');
    }
  });

  it('reports the decision it was given', () => {
    const clean = admitField('question', 'What notice period applies after three years?');
    const { sink, events } = capturingSink();
    emitAdmissionMetrics(clean, sink, REQUEST_ID);
    expect(clean.decision).toBe('ACCEPT');
    expect(events).toEqual([]);
  });
});
