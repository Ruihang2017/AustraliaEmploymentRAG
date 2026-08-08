/**
 * EVID-01 acceptance items 5 and 6 — zero raw logging, and no reversible derivative.
 *
 * PRD §37.2: the response *"never echoes the detected value"* and metrics record *"not content or
 * reversible hash"*. PRD §37.3 gives blocked raw PII the strictest row in the product: *"Never"* in
 * all four columns. `PII-001`'s evidence line is *"zero raw logging"*.
 *
 * For each canary token this asserts the token is absent from: the serialised result, every metrics
 * event, every thrown error message and stack, and every finding — AND that no reversible derivative
 * (base64, hex, URL-encoding, reversal, a leading fragment) is present either. A truncated or encoded
 * value is still the value.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { CONSERVATIVE_STAGE_DEFAULTS, admit } from '../../src/contract/pipeline.js';
import { PACKAGE_ROOT } from '../contract/fixture.js';
import type { PiiMetricsEvent, PiiMetricsSink } from '../../src/contract/metrics.js';
import { emitAdmissionMetrics } from '../../src/contract/metrics.js';
import type { Id } from '../../../contracts/src/ids/index.js';
import { loadCanaries } from '../contract/fixture.js';

const REQUEST_ID = 'req_0198f3c1-0000-7000-8000-00000000beef' as Id<'req'>;
const canaries = loadCanaries();

function sourceFiles(dir: string, found: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) sourceFiles(path, found);
    else if (entry.name.endsWith('.ts')) found.push(path);
  }
  return found;
}

/** Every reversible rendering of `token` a leak could plausibly take. */
function derivatives(token: string): { label: string; text: string }[] {
  const hex = [...token].map((char) => char.charCodeAt(0).toString(16)).join('');
  return [
    { label: 'raw', text: token },
    { label: 'base64', text: Buffer.from(token, 'utf8').toString('base64') },
    { label: 'hex', text: hex },
    { label: 'url-encoded', text: encodeURIComponent(token) },
    { label: 'reversed', text: [...token].reverse().join('') },
    { label: 'first 8 characters', text: token.slice(0, 8) },
  ];
}

describe('canary manifest', () => {
  it('lists distinctive, obviously synthetic tokens (reusable by ASSR-03)', () => {
    expect(canaries.length).toBeGreaterThanOrEqual(8);
    for (const canary of canaries) {
      expect(canary.token.length).toBeGreaterThanOrEqual(8);
      expect(canary.value).toContain(canary.token);
    }
    expect(new Set(canaries.map((canary) => canary.token)).size).toBe(canaries.length);
  });

  it('is detected — a canary that is never blocked would prove nothing', () => {
    for (const canary of canaries) {
      const result = admit(
        { freeText: [{ field: canary.field, value: canary.value }] },
        CONSERVATIVE_STAGE_DEFAULTS,
      );
      expect(result.decision, canary.id).toBe('REJECT');
      expect(result.findings.map((finding) => finding.category), canary.id).toContain(
        canary.category,
      );
    }
  });
});

describe('no canary, and no derivative of one, reaches any sink', () => {
  it.each(canaries.map((canary) => [canary.id, canary] as const))(
    '%s leaks nothing',
    (_id, canary) => {
      const events: PiiMetricsEvent[] = [];
      const sink: PiiMetricsSink = { record: (event) => events.push(event) };
      const errors: string[] = [];

      let result;
      try {
        result = admit(
          { freeText: [{ field: canary.field, value: canary.value }] },
          CONSERVATIVE_STAGE_DEFAULTS,
        );
        emitAdmissionMetrics(result, sink, REQUEST_ID);
      } catch (error) {
        errors.push(String(error));
        errors.push(error instanceof Error ? (error.stack ?? '') : '');
      }

      const emitted = [
        JSON.stringify(result),
        JSON.stringify(events),
        JSON.stringify(result?.findings ?? []),
        ...errors,
      ].join('\n');

      for (const { label, text } of derivatives(canary.token)) {
        expect(emitted.includes(text), `${canary.id}: the ${label} form of the canary leaked`).toBe(
          false,
        );
      }
    },
  );

  it('the leak scan is not vacuous — it finds a canary that IS present', () => {
    const canary = canaries[0];
    if (!canary) throw new Error('no canaries');
    const emitted = JSON.stringify({ oops: canary.value });
    const raw = derivatives(canary.token).find((entry) => entry.label === 'raw');
    expect(emitted.includes(raw?.text ?? 'x')).toBe(true);
  });
});

describe('errors carry no value', () => {
  it('an exception thrown through the pipeline carries no canary in message or stack', () => {
    const canary = canaries[0];
    if (!canary) throw new Error('no canaries');
    try {
      admit({ freeText: [{ field: canary.field, value: canary.value }] }, {
        recogniseEntities: () => {
          throw new Error('stage failure');
        },
        applyPublicEntityRules: (_input, findings) => findings,
        applyCombinationRules: (_input, findings) => findings,
      });
      throw new Error('expected the stage failure to propagate');
    } catch (error) {
      const text = `${String(error)}\n${error instanceof Error ? (error.stack ?? '') : ''}`;
      expect(text).toContain('stage failure');
      for (const { label, text: derivative } of derivatives(canary.token)) {
        expect(text.includes(derivative), `the ${label} form leaked through an error`).toBe(false);
      }
    }
  });

  it('no source file interpolates a value-bearing identifier into an Error', () => {
    const offenders: string[] = [];
    for (const file of sourceFiles(join(PACKAGE_ROOT, 'src'))) {
      const text = readFileSync(file, 'utf8');
      for (const match of text.matchAll(/new Error\(([\s\S]{0,300}?)\)\s*;/g)) {
        const argument = match[1] ?? '';
        for (const identifier of [
          'nfc',
          '.scan',
          'value',
          'match',
          'digits',
          'text',
          'placeholder',
        ]) {
          if (argument.includes(`\${${identifier}`) || argument.includes(`\${String(${identifier}`)) {
            offenders.push(`${file}: ${argument.trim()}`);
          }
        }
      }
    }
    expect(offenders, `an Error message interpolates a value:\n${offenders.join('\n')}`).toEqual([]);
  });

  it('that scan is not vacuous', () => {
    const control = 'throw new Error(`bad value ${value}`);';
    const found = [...control.matchAll(/new Error\(([\s\S]{0,300}?)\)\s*;/g)].map(
      (match) => match[1] ?? '',
    );
    expect(found.some((argument) => argument.includes('${value'))).toBe(true);
  });
});
