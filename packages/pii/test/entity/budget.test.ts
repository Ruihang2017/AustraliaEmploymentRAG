/**
 * EVID-02 acceptance item 11 — resident memory and p95 admission latency, MEASURED AND REPORTED
 * against the PRD §39.2 `app` 320 MiB limit.
 *
 * MEASURE, DO NOT GATE. A tight threshold on a shared CI runner is a flake generator, and the
 * acceptance item asks for the numbers to be RECORDED — in the ADR and the PR — not for a budget
 * assertion. The only assertions here are that the measurement actually ran and that a maximum-size
 * request does not blow up pathologically, in the spirit of `test/deterministic/timing.test.ts`
 * (which is also the ReDoS canary for this ticket's new patterns).
 *
 * THE RUNTIME-ENABLED ROW IS SKIPPED WITH A NAMED MESSAGE, never silently: no artifact is selected
 * (ADR 0001), so `ENTITY_ARTIFACT_PINS` is empty. The same named reason is written into
 * `test/entity/recall-report.json`'s `runtimeOn.skipped`, so the skip is visible in a committed file
 * rather than only in a console line nobody reads.
 */
import { describe, expect, it } from 'vitest';

import type { PiiAdmissionRequest } from '../../src/contract/request.js';
import { admit } from '../../src/contract/pipeline.js';
import { PII_ADMISSION_LIMITS } from '../../src/deterministic/limits.js';
import { PII_STAGES } from '../../src/context/stages.js';
import { ENTITY_ARTIFACT_PINS } from '../../src/entity/runtime/pin.js';
import { RUNTIME_SKIP_REASON } from './recall-report-input.js';

const ITERATIONS = 200;
const P95_CEILING_MS = 1_000;
const BYTES_PER_MIB = 1_048_576;
/** PRD §39.2 — the `app` process this admission boundary runs inside. */
const APP_LIMIT_MIB = 320;

function percentile(samples: readonly number[], fraction: number): number {
  const sorted = [...samples].sort((left, right) => left - right);
  const index = Math.min(sorted.length - 1, Math.floor(sorted.length * fraction));
  return sorted[index] ?? 0;
}

/** The largest request the limits stage admits: `maxFieldCount` fields of `maxFieldChars`. */
function maximumSizeRequest(): PiiAdmissionRequest {
  const chunk =
    'Hi Marta Kowalski, our sole welder in a four-person workshop had a stroke on 12/03/2024. ' +
    'The worker asked about the Sunday penalty rate. Their tax file number is 123 456 782, ' +
    'email jane.doe@example.invalid, phone 0412 345 678, address 12 Wattle Street, Northbridge NSW 2063. ';
  const value = chunk
    .repeat(Math.ceil(PII_ADMISSION_LIMITS.maxFieldChars / chunk.length))
    .slice(0, PII_ADMISSION_LIMITS.maxFieldChars);
  return {
    freeText: Array.from({ length: PII_ADMISSION_LIMITS.maxFieldCount }, (_entry, index) => ({
      field: `field_${String(index)}`,
      value,
    })),
  };
}

describe('resident memory, runtime OFF (PRD §39.2)', () => {
  it('is measured and printed for the ADR and the PR', () => {
    const request = maximumSizeRequest();
    // Warm the module graph and every regex before sampling, so the delta is the working set of an
    // admission rather than the cost of the first import.
    admit(request, PII_STAGES);
    const before = process.memoryUsage().rss;
    for (let index = 0; index < 20; index += 1) admit(request, PII_STAGES);
    const after = process.memoryUsage().rss;

    const rssMib = after / BYTES_PER_MIB;
    const deltaMib = (after - before) / BYTES_PER_MIB;
    process.stdout.write(
      `packages/pii admission, runtime OFF: rss ${rssMib.toFixed(1)} MiB ` +
        `(delta over 20 maximum-size requests ${deltaMib.toFixed(1)} MiB) ` +
        `against the PRD §39.2 app limit of ${String(APP_LIMIT_MIB)} MiB\n`,
    );
    expect(Number.isFinite(rssMib)).toBe(true);
    expect(rssMib).toBeGreaterThan(0);
  });
});

describe('p95 admission latency, runtime OFF', () => {
  it(`is measured over ${String(ITERATIONS)} maximum-size requests`, () => {
    const request = maximumSizeRequest();
    admit(request, PII_STAGES);
    const samples: number[] = [];
    for (let index = 0; index < ITERATIONS; index += 1) {
      const started = performance.now();
      admit(request, PII_STAGES);
      samples.push(performance.now() - started);
    }
    const p50 = percentile(samples, 0.5);
    const p95 = percentile(samples, 0.95);
    process.stdout.write(
      `admission through PII_STAGES over ${String(PII_ADMISSION_LIMITS.maxFieldCount)} x ` +
        `${String(PII_ADMISSION_LIMITS.maxFieldChars)} chars: p50 ${p50.toFixed(1)} ms, ` +
        `p95 ${p95.toFixed(1)} ms\n`,
    );
    expect(samples.length).toBe(ITERATIONS);
    expect(p95, 'a maximum-size request must not blow up pathologically').toBeLessThan(
      P95_CEILING_MS,
    );
  });
});

describe('the runtime-ENABLED row', () => {
  it('is skipped for a NAMED reason, and the reason is committed to recall-report.json', () => {
    expect(ENTITY_ARTIFACT_PINS).toEqual([]);
    expect(RUNTIME_SKIP_REASON.length).toBeGreaterThan(40);
    process.stdout.write(`resident memory, runtime ON: SKIPPED — ${RUNTIME_SKIP_REASON}\n`);
  });
});
