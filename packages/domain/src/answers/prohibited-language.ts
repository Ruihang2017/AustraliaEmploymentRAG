/**
 * FND-07 deliverable 5 — PRD §36.8's closing rule: *"Words such as "definitely compliant",
 * "guaranteed", "zero risk" and numeric model-confidence percentages are prohibited. Uncertainty is
 * represented by status, assumptions, missing facts, conflicts and evidence roles."*
 *
 * Detection only: this function never rewrites the text, never throws, never logs and never returns the
 * whole input. Answer text can contain personal information that survived detection, so the blast
 * radius stays as small as the match itself — every returned span is capped at `MAX_MATCH_TEXT`.
 *
 * OFFSET CONVENTION: `start`/`end` are plain JavaScript string indices, i.e. UTF-16 code units, `start`
 * inclusive and `end` exclusive, so `input.slice(start, end)` is the matched span. EVID-05 validates
 * offsets against the same convention; a mismatch here would be a silent bug there.
 *
 * REDoS: this file is the one place a regular expression meets text influenced by a model. Every
 * pattern is linear — no `.*`/`.+` between alternatives, no nested quantifiers, no backreferences — and
 * the "percentage near a confidence word" rule is TWO linear passes (find percentages, then inspect a
 * fixed-size character window with plain string operations), never one combined pattern. Every regular
 * expression is constructed PER CALL: a module-level `/…/g` object carries mutable `lastIndex` state
 * across calls, which is both a wrong-results bug and a concurrency bug.
 *
 * KNOWN GAP (for EVID-05): zero-width characters inserted inside a prohibited phrase evade the phrase
 * rules. Normalising the input would invalidate the offsets the caller needs, so the input is matched
 * raw and the gap is recorded rather than papered over.
 */

/** Longest span returned in `ProhibitedMatch.text`; longer matches are truncated and flagged. */
export const MAX_MATCH_TEXT = 120;

/** Characters each side of a percentage that are inspected for a confidence word. */
export const CONFIDENCE_WINDOW = 40;

const SENTENCE_BOUNDARIES = '.;!?';

/**
 * PRD §36.8's prohibited phrases. Whitespace-tolerant (including the non-breaking space) and
 * case-insensitive, but WORD-BOUNDED: `guaranteed` must not match `guarantee`, `guarantees` or the
 * compound noun "superannuation guarantee", which is ordinary statutory prose.
 *
 * The prohibition is absolute (PRD §45.5): narrowing a pattern is allowed, removing a word is a PRD
 * change.
 */
const PHRASE_RULES: readonly { readonly pattern: string; readonly source: string }[] = Object.freeze([
  { pattern: 'definitely compliant', source: String.raw`\bdefinitely[\s\u00A0]+compliant\b` },
  { pattern: 'guaranteed', source: String.raw`\bguaranteed\b` },
  { pattern: 'zero risk', source: String.raw`\bzero[\s\u00A0]+risk\b` },
]);

/** A bare percentage. Bounded repetition only. */
const PERCENTAGE_SOURCE = String.raw`\d{1,3}(?:\.\d+)?[\s\u00A0]*%`;

/** The confidence/certainty vocabulary that turns a percentage into a model-confidence expression. */
const CONFIDENCE_WORD_SOURCE = String.raw`\b(?:confidence|confident|certainty|certain|sure)\b`;

export interface ProhibitedMatch {
  readonly kind: 'PROHIBITED_PHRASE' | 'MODEL_CONFIDENCE_PERCENTAGE';
  /** Which rule fired. */
  readonly pattern: string;
  /** The matched span, capped at `MAX_MATCH_TEXT` characters. */
  readonly text: string;
  /** Inclusive UTF-16 code-unit index into the argument. */
  readonly start: number;
  /** Exclusive UTF-16 code-unit index into the argument. */
  readonly end: number;
  /** True when the span was longer than `MAX_MATCH_TEXT` and `text` is only its beginning. */
  readonly truncated: boolean;
}

function bound(span: string): { text: string; truncated: boolean } {
  return span.length > MAX_MATCH_TEXT
    ? { text: span.slice(0, MAX_MATCH_TEXT), truncated: true }
    : { text: span, truncated: false };
}

/** The text before `index`, at most `CONFIDENCE_WINDOW` characters and never crossing a sentence end. */
function leftWindow(text: string, index: number): string {
  const window = text.slice(Math.max(0, index - CONFIDENCE_WINDOW), index);
  let cut = -1;
  for (let i = 0; i < window.length; i += 1) {
    const character = window[i];
    if (character !== undefined && SENTENCE_BOUNDARIES.includes(character)) cut = i;
  }
  return window.slice(cut + 1);
}

/** The text after `index`, at most `CONFIDENCE_WINDOW` characters and never crossing a sentence end. */
function rightWindow(text: string, index: number): string {
  const window = text.slice(index, index + CONFIDENCE_WINDOW);
  for (let i = 0; i < window.length; i += 1) {
    const character = window[i];
    if (character !== undefined && SENTENCE_BOUNDARIES.includes(character)) return window.slice(0, i);
  }
  return window;
}

/** Detect PRD §36.8's prohibited certainty language. Returns a fresh array, ordered by offset. */
export function containsProhibitedCertainty(text: string): readonly ProhibitedMatch[] {
  const matches: ProhibitedMatch[] = [];

  for (const rule of PHRASE_RULES) {
    for (const found of text.matchAll(new RegExp(rule.source, 'giu'))) {
      const start = found.index;
      const span = found[0];
      if (start === undefined) continue;
      const { text: bounded, truncated } = bound(span);
      matches.push({
        kind: 'PROHIBITED_PHRASE',
        pattern: rule.pattern,
        text: bounded,
        start,
        end: start + span.length,
        truncated,
      });
    }
  }

  // Second, independent linear pass: percentages, then a fixed-size window check.
  const confidenceWord = new RegExp(CONFIDENCE_WORD_SOURCE, 'iu');
  for (const found of text.matchAll(new RegExp(PERCENTAGE_SOURCE, 'gu'))) {
    const start = found.index;
    const span = found[0];
    if (start === undefined) continue;
    const end = start + span.length;
    const near = leftWindow(text, start) + ' ' + rightWindow(text, end);
    if (!confidenceWord.test(near)) continue;
    const { text: bounded, truncated } = bound(span);
    matches.push({
      kind: 'MODEL_CONFIDENCE_PERCENTAGE',
      pattern: 'percentage adjacent to a confidence word',
      text: bounded,
      start,
      end,
      truncated,
    });
  }

  matches.sort((a, b) => a.start - b.start || a.end - b.end);
  return matches;
}
