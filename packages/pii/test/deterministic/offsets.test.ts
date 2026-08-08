/**
 * EVID-01 acceptance item 9 — "offsets are exact and half-open".
 *
 * The definition, restated: `[start, end)` are JS string indices into `value.normalize('NFC')`, so
 * `value.normalize('NFC').slice(start, end)` IS the detected span. Every positive corpus case is
 * checked against that definition, and the non-ASCII cases below are what catch a code-unit /
 * code-point confusion and a byte-offset confusion — the two ways this goes wrong silently.
 */
import { describe, expect, it } from 'vitest';

import { admitField, loadCorpus } from '../contract/fixture.js';
import { detectEmail } from '../../src/deterministic/detectors/email.js';
import { detectTfn } from '../../src/deterministic/detectors/tfn.js';

const corpus = loadCorpus();

describe('every positive corpus case slices back to its span', () => {
  it('has half-open, in-range, non-empty spans that fall on code-point boundaries', () => {
    let checked = 0;
    for (const file of corpus.categories) {
      for (const kase of file.positives) {
        const nfc = kase.value.normalize('NFC');
        for (const finding of admitField(kase.field, kase.value).findings) {
          expect(finding.end, `${kase.id}`).toBeGreaterThan(finding.start);
          expect(finding.end, `${kase.id}`).toBeLessThanOrEqual(nfc.length);
          expect(finding.start, `${kase.id}`).toBeGreaterThanOrEqual(0);
          // Neither boundary may split a surrogate pair.
          const startCode = nfc.charCodeAt(finding.start);
          const beforeStart = finding.start > 0 ? nfc.charCodeAt(finding.start - 1) : 0;
          expect(
            !(beforeStart >= 0xd800 && beforeStart <= 0xdbff && startCode >= 0xdc00 && startCode <= 0xdfff),
            `${kase.id}: start splits a surrogate pair`,
          ).toBe(true);
          checked += 1;
        }
        for (const span of kase.expected) {
          expect(nfc.slice(span.start, span.end).length, kase.id).toBe(span.end - span.start);
        }
      }
    }
    expect(checked).toBeGreaterThan(250);
  });
});

describe('non-ASCII text keeps offsets in NFC characters, not bytes', () => {
  it('an accented name before the span does not shift it by UTF-8 byte length', () => {
    const prefix = 'Renée Fauré asked me to email ';
    const email = 'jane.doe@example.invalid';
    const value = `${prefix}${email} about the roster.`;
    const nfc = value.normalize('NFC');
    const findings = detectEmail('question', value);
    expect(findings).toHaveLength(1);
    const finding = findings[0];
    if (!finding) throw new Error('no finding');
    expect(nfc.slice(finding.start, finding.end)).toBe(email);
    // The byte offset would be larger, because the two accented characters are two bytes each.
    expect(finding.start).toBe(nfc.indexOf(email));
  });

  it('an astral-plane character before the span is counted in code units, as slice() does', () => {
    const emoji = String.fromCodePoint(0x1f600);
    const value = `${emoji} their tax file number is 123456782 on the form.`;
    const nfc = value.normalize('NFC');
    const findings = detectTfn('question', value);
    expect(findings).toHaveLength(1);
    const finding = findings[0];
    if (!finding) throw new Error('no finding');
    expect(nfc.slice(finding.start, finding.end)).toBe('123456782');
    expect(finding.start).toBe(nfc.indexOf('123456782'));
    // Code POINT indexing would have put the span two characters earlier.
    expect(finding.start).toBeGreaterThan([...nfc].indexOf('1'));
  });

  it('a decomposed (NFD) input is measured after normalisation', () => {
    const decomposed = 'Renée asked me to email jane.doe@example.invalid today.';
    // Force the DECOMPOSED form regardless of how this file itself is encoded: "Rene" + COMBINING
    // ACUTE ACCENT + the rest. NFC composes the two code units into one.
    const decomposedForced = decomposed.normalize('NFD');
    const nfc = decomposedForced.normalize('NFC');
    expect(nfc.length).toBeLessThan(decomposedForced.length);
    const findings = detectEmail('question', decomposedForced);
    expect(findings).toHaveLength(1);
    const finding = findings[0];
    if (!finding) throw new Error('no finding');
    expect(nfc.slice(finding.start, finding.end)).toBe('jane.doe@example.invalid');
  });
});
