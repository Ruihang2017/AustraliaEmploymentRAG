/**
 * EVID-01 — the catastrophic-backtracking canary, and the p95 the PR reports.
 *
 * THIS IS NOT A PERFORMANCE GATE. The ceiling is deliberately loose: it exists to catch a regex
 * change that turns a linear detector into an exponential one on hostile input, which is the failure
 * mode a module that runs regexes on attacker-controlled text has to defend against. A tight budget
 * here would flake on a loaded CI runner and teach everyone to ignore it.
 *
 * The pathological inputs are the classic ReDoS shapes for the patterns this module ships. The limits
 * stage caps a field at 8,000 characters before any of them reach a detector, which is the other half
 * of the defence.
 */
import { describe, expect, it } from 'vitest';

import { CONSERVATIVE_STAGE_DEFAULTS, admit } from '../../src/contract/pipeline.js';
import type { PiiAdmissionRequest } from '../../src/contract/request.js';
import { PII_ADMISSION_LIMITS } from '../../src/deterministic/limits.js';

const ITERATIONS = 50;
const P95_CEILING_MS = 1_000;

function percentile(samples: readonly number[], fraction: number): number {
  const sorted = [...samples].sort((left, right) => left - right);
  const index = Math.min(sorted.length - 1, Math.floor(sorted.length * fraction));
  return sorted[index] ?? 0;
}

function maximumSizeRequest(): PiiAdmissionRequest {
  const chunk =
    'The worker asked about the Sunday penalty rate. Their tax file number is 123 456 782, ' +
    'email jane.doe@example.invalid, phone 0412 345 678, card 4111 1111 1111 1111, ' +
    'address 12 Wattle Street, Northbridge NSW 2063, employee no 12345, DOB 12/03/1990. ';
  const value = chunk.repeat(Math.ceil(PII_ADMISSION_LIMITS.maxFieldChars / chunk.length)).slice(
    0,
    PII_ADMISSION_LIMITS.maxFieldChars,
  );
  return {
    freeText: Array.from({ length: PII_ADMISSION_LIMITS.maxFieldCount }, (_entry, index) => ({
      field: `field_${String(index)}`,
      value,
    })),
  };
}

describe('a maximum-size request stays far inside the ceiling', () => {
  it(`has a p95 under ${String(P95_CEILING_MS)} ms over ${String(ITERATIONS)} iterations`, () => {
    const request = maximumSizeRequest();
    const samples: number[] = [];
    for (let index = 0; index < ITERATIONS; index += 1) {
      const started = performance.now();
      admit(request, CONSERVATIVE_STAGE_DEFAULTS);
      samples.push(performance.now() - started);
    }
    const p50 = percentile(samples, 0.5);
    const p95 = percentile(samples, 0.95);
    // Printed so the PR can quote it (PRD §39.2 `app` 320 MiB / latency reporting).
    console.log(
      `admission over ${String(PII_ADMISSION_LIMITS.maxFieldCount)} x ${String(
        PII_ADMISSION_LIMITS.maxFieldChars,
      )} chars: p50 ${p50.toFixed(1)} ms, p95 ${p95.toFixed(1)} ms`,
    );
    expect(p95).toBeLessThan(P95_CEILING_MS);
  });
});

describe('pathological inputs do not backtrack catastrophically', () => {
  const size = PII_ADMISSION_LIMITS.maxFieldChars;
  const cases: readonly (readonly [string, string])[] = [
    ['8,000 letters', 'a'.repeat(size)],
    ['8,000 digits', '1'.repeat(size)],
    ['alternating a@', 'a@'.repeat(size / 2)],
    ['alternating digit-hyphen', '1-'.repeat(size / 2)],
    ['spaced digits', '1 '.repeat(size / 2)],
    ['street-word soup', 'street '.repeat(Math.floor(size / 7))],
    ['at/dot soup', 'a at b dot '.repeat(Math.floor(size / 11))],
  ];

  it.each(cases)('%s completes well under the ceiling', (_label, value) => {
    const started = performance.now();
    admit({ freeText: [{ field: 'question', value }] }, CONSERVATIVE_STAGE_DEFAULTS);
    expect(performance.now() - started).toBeLessThan(P95_CEILING_MS);
  });
});
