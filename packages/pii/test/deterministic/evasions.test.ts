/**
 * EVID-01 acceptance item 10 — evasion resistance, and the documented non-coverage.
 *
 * The second half matters as much as the first: deliverable 7 requires each detector to ship an
 * `EVASIONS.md`-style doc comment *"so a Reviewer can see what it does NOT cover"*. A scan asserts
 * the four headings are present in every detector file, so the honest half cannot be dropped in a
 * later edit.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { detectEmail } from '../../src/deterministic/detectors/email.js';
import { detectTfn } from '../../src/deterministic/detectors/tfn.js';
import { DETECTORS } from '../../src/deterministic/detectors/index.js';
import { PACKAGE_ROOT } from '../contract/fixture.js';

const ZWSP = String.fromCodePoint(0x200b);
const ZWJ = String.fromCodePoint(0x200d);
const SOFT_HYPHEN = String.fromCodePoint(0x00ad);
const NBSP = String.fromCodePoint(0x00a0);
const EN_DASH = String.fromCodePoint(0x2013);
const FULLWIDTH_AT = String.fromCodePoint(0xff20);
const fullwidth = (text: string): string =>
  text.replace(/\d/g, (digit) => String.fromCodePoint(0xff10 + Number(digit)));

const TFN = '123456782';

describe('TFN evasions', () => {
  const cases: readonly (readonly [string, string])[] = [
    ['plain', TFN],
    ['spaced', '123 456 782'],
    ['hyphenated', '123-456-782'],
    ['dotted', '123.456.782'],
    ['full-width digits', fullwidth(TFN)],
    ['zero-width space inside', `123${ZWSP}456782`],
    ['zero-width joiner inside', `1234${ZWJ}56782`],
    ['soft hyphen inside', `12345${SOFT_HYPHEN}6782`],
    ['non-breaking spaces', `123${NBSP}456${NBSP}782`],
    ['en dashes', `123${EN_DASH}456${EN_DASH}782`],
    ['mixed full-width and zero-width', `${fullwidth('123')}${ZWSP}456782`],
  ];

  it.each(cases)('detects the %s form with correct NFC offsets', (_label, written) => {
    const value = `Their tax file number is ${written} on the form.`;
    const nfc = value.normalize('NFC');
    const findings = detectTfn('question', value);
    expect(findings).toHaveLength(1);
    const finding = findings[0];
    if (!finding) throw new Error('no finding');
    expect(nfc.slice(finding.start, finding.end)).toBe(written.normalize('NFC'));
  });
});

describe('email evasions', () => {
  const cases: readonly (readonly [string, string])[] = [
    ['plain', 'jane.doe@example.invalid'],
    ['spaced around the at', 'jane.doe @ example.invalid'],
    ['(at)/(dot)', 'jane.doe(at)example(dot)invalid'],
    ['[at]/[dot]', 'jane.doe [at] example [dot] invalid'],
    ['worded at and dot', 'jane.doe at example dot invalid'],
    ['full-width at', `jane.doe${FULLWIDTH_AT}example.invalid`],
    ['zero-width inside', `jane.doe@exam${ZWSP}ple.invalid`],
    ['soft hyphen inside', `jane.doe@exam${SOFT_HYPHEN}ple.invalid`],
  ];

  it.each(cases)('detects the %s form with correct NFC offsets', (_label, written) => {
    const value = `Please write to ${written} about the roster.`;
    const nfc = value.normalize('NFC');
    const findings = detectEmail('question', value);
    expect(findings.length).toBeGreaterThanOrEqual(1);
    const finding = findings[0];
    if (!finding) throw new Error('no finding');
    expect(nfc.slice(finding.start, finding.end)).toBe(written.normalize('NFC'));
  });
});

describe('every detector documents what it does not cover', () => {
  const dir = join(PACKAGE_ROOT, 'src', 'deterministic', 'detectors');
  const detectorFiles = readdirSync(dir).filter(
    (name) =>
      name.endsWith('.ts') &&
      !['index.ts', 'shared.ts', 'checksums.ts'].includes(name),
  );

  it('has one file per registered detector', () => {
    expect(detectorFiles).toHaveLength(DETECTORS.length);
    expect(DETECTORS).toHaveLength(14);
  });

  it.each(detectorFiles)('%s carries the four required headings', (name) => {
    const text = readFileSync(join(dir, name), 'utf8');
    for (const heading of [
      'NORMALISATION APPLIED:',
      'COVERED EVASIONS:',
      'NOT COVERED:',
      'FALSE-POSITIVE POSTURE:',
    ]) {
      expect(text, `${name} is missing the "${heading}" heading`).toContain(heading);
    }
  });

  it.each(detectorFiles)('%s cites a PRD basis', (name) => {
    expect(readFileSync(join(dir, name), 'utf8')).toContain('PRD ');
  });
});
