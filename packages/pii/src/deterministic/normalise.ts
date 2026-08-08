/**
 * EVID-01 — the scan view: the one place normalisation happens, and the one place offsets are
 * defined.
 *
 * OFFSET SPACE. PRD §37.2 says a detection response carries a *"character range"*. This module fixes
 * that as **JS string indices into `value.normalize('NFC')`**, half-open `[start, end)`, so the
 * acceptance test is literally `value.normalize('NFC').slice(start, end)`. The map below is built by
 * walking the NFC string by **code point**, so a span boundary always falls on a code-point boundary
 * and a finding can never split a surrogate pair.
 *
 * WHY A SEPARATE SCAN STRING. The evasions PRD §37.2 / deliverable 7 require resistance to — embedded
 * whitespace, punctuation separators, full-width digits, zero-width characters — live *between* the
 * characters a detector wants to match. Matching on the NFC string directly means either missing them
 * or writing every detector with an "ignore junk" quantifier between every token, which is both
 * unreadable and a ReDoS generator. Instead each field is normalised once into a `scan` string with
 * the noise dropped and the look-alikes folded, alongside two arrays mapping every scan index back to
 * its NFC range. Detectors match `scan` and report NFC offsets.
 *
 * WHAT IS NOT DONE HERE, deliberately:
 * - **No lowercasing.** `toLowerCase()` changes length for some code points (U+0130 becomes two
 *   characters), which would corrupt the index map. Detectors use the `i` regex flag instead.
 * - **No NFKC.** NFKC would fold the full-width forms for us but also rewrites ligatures,
 *   superscripts and much else, moving offsets away from what the customer sees in their own text
 *   box. The folds below are the enumerated, auditable subset this module needs.
 *
 * Every character below is written as a NUMERIC CODE POINT on purpose: a literal zero-width character
 * in source is invisible to a reviewer, which is exactly the property this file exists to defeat.
 * Reading `0x200b` and reading nothing at all are very different review experiences.
 */

/**
 * Characters that contribute nothing to `scan`: zero-width and bidi controls, the soft hyphen, the
 * word joiner and the BOM. These are the classic "invisible separator" evasion.
 */
const DROPPED_CODE_POINTS: readonly number[] = [
  0x200b, // zero-width space
  0x200c, // zero-width non-joiner
  0x200d, // zero-width joiner
  0x2060, // word joiner
  0xfeff, // zero-width no-break space / BOM
  0x00ad, // soft hyphen
  0x200e, // left-to-right mark
  0x200f, // right-to-left mark
  0x202a, // bidi embedding / override controls
  0x202b,
  0x202c,
  0x202d,
  0x202e,
  0x2066, // bidi isolates
  0x2067,
  0x2068,
  0x2069,
];

const DROPPED = new Set<string>(DROPPED_CODE_POINTS.map((code) => String.fromCodePoint(code)));

/** Look-alike characters folded to their ASCII equivalent before matching. */
const FOLDED_PAIRS: readonly (readonly [number, string])[] = [
  [0x00a0, ' '], // no-break space
  [0x2007, ' '], // figure space
  [0x2009, ' '], // thin space
  [0x202f, ' '], // narrow no-break space
  [0x2010, '-'], // hyphen
  [0x2011, '-'], // non-breaking hyphen
  [0x2012, '-'], // figure dash
  [0x2013, '-'], // en dash
  [0x2014, '-'], // em dash
  [0x2015, '-'], // horizontal bar
  [0x2212, '-'], // minus sign
  [0x2018, "'"], // left single quotation mark
  [0x2019, "'"], // right single quotation mark
  [0xff20, '@'], // full-width commercial at
  [0xff0e, '.'], // full-width full stop
  [0xff0d, '-'], // full-width hyphen-minus
  [0xff0f, '/'], // full-width solidus
];

const FOLDED = new Map<string, string>(
  FOLDED_PAIRS.map(([code, ascii]) => [String.fromCodePoint(code), ascii] as const),
);

function foldOf(codePoint: string): string {
  const mapped = FOLDED.get(codePoint);
  if (mapped !== undefined) return mapped;
  const code = codePoint.codePointAt(0);
  if (code === undefined) return codePoint;
  // Full-width digits U+FF10..U+FF19 -> '0'..'9'
  if (code >= 0xff10 && code <= 0xff19) return String.fromCharCode(code - 0xff10 + 0x30);
  // Full-width Latin capitals U+FF21..U+FF3A and smalls U+FF41..U+FF5A -> ASCII
  if (code >= 0xff21 && code <= 0xff3a) return String.fromCharCode(code - 0xff21 + 0x41);
  if (code >= 0xff41 && code <= 0xff5a) return String.fromCharCode(code - 0xff41 + 0x61);
  return codePoint;
}

export interface ScanView {
  /** The field this view belongs to — a finding needs a name (PRD §37.2). */
  readonly field: string;
  /** `value.normalize('NFC')` — the string all offsets index into. */
  readonly nfc: string;
  /** The string detectors match against. */
  readonly scan: string;
  /** `startOf[i]` — inclusive NFC index of the character that produced `scan[i]`. */
  readonly startOf: readonly number[];
  /** `endOf[i]` — exclusive NFC index of the character that produced `scan[i]`. */
  readonly endOf: readonly number[];
}

export function normaliseForScan(field: string, value: string): ScanView {
  const nfc = value.normalize('NFC');
  const scanChars: string[] = [];
  const startOf: number[] = [];
  const endOf: number[] = [];
  let index = 0;
  for (const codePoint of nfc) {
    const start = index;
    index += codePoint.length;
    if (DROPPED.has(codePoint)) continue;
    const folded = foldOf(codePoint);
    // A folded form is always one BMP character; an unfolded astral character contributes its two
    // code units, both mapping to the same NFC range, so a span can never split the pair.
    for (let unit = 0; unit < folded.length; unit += 1) {
      scanChars.push(folded.charAt(unit));
      startOf.push(start);
      endOf.push(index);
    }
  }
  return { field, nfc, scan: scanChars.join(''), startOf, endOf };
}

export interface Span {
  readonly start: number;
  readonly end: number;
}

/**
 * NFC span of the half-open scan range `[scanStart, scanEnd)`. Throws on an empty or out-of-range
 * request rather than returning a silently wrong span: an offset bug here is a wrong span shown to a
 * customer, and every finding in the module goes through this function.
 *
 * The message names the FIELD and the indices only — never a character of the value (PRD §37.2).
 */
export function spanOfScanRange(view: ScanView, scanStart: number, scanEnd: number): Span {
  const start = view.startOf[scanStart];
  const end = view.endOf[scanEnd - 1];
  if (start === undefined || end === undefined || scanEnd <= scanStart) {
    throw new Error(
      `scan range [${String(scanStart)}, ${String(scanEnd)}) is not a span of field "${view.field}"`,
    );
  }
  return { start, end };
}

/**
 * The NFC text with the DROPPED characters removed — the formatting normalisation the ACCEPT path
 * applies (deliverable 9). Folds are NOT applied: folding is a matching aid, and rewriting a
 * customer's full-width text on the way to a provider would change their content.
 */
export function stripFormatting(nfc: string): string {
  let out = '';
  for (const codePoint of nfc) {
    if (DROPPED.has(codePoint)) continue;
    out += codePoint;
  }
  return out;
}

/** Exported so `test/deterministic/normalise.test.ts` asserts against the real sets, not a copy. */
export const DROPPED_CHARACTERS: readonly string[] = Object.freeze([...DROPPED]);
export const FOLDED_CHARACTERS: readonly (readonly [string, string])[] = Object.freeze(
  FOLDED_PAIRS.map(
    ([code, ascii]) => Object.freeze([String.fromCodePoint(code), ascii]) as readonly [string, string],
  ),
);
