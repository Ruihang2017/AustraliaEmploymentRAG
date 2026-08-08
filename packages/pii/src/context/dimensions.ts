/**
 * EVID-02 deliverable 7 (the detector half) — one named rule per identifying dimension.
 *
 * PRD §37.1's last blocked row is *"Identifying combination of rare role + tiny workplace + personal
 * event"*, and the ticket names five dimensions. Each is detected by its own rule here and reported
 * BY NAME only (sub-PRD D3): a dimension result carries a field and offsets, never a character of
 * text.
 *
 * All spans below are NFC offsets — the `PiiFinding` offset space — converted from scan ranges with
 * `spanOfScanRange`, so nothing is ever hand-counted.
 */
import type { PiiFinding } from '../contract/finding.js';
import { deepFreeze } from '../contract/freeze.js';
import type { ScanView } from '../deterministic/normalise.js';
import { spanOfScanRange } from '../deterministic/normalise.js';
import { scanMatches } from '../deterministic/detectors/shared.js';
import { isNecessaryFactSpan } from './necessaryFacts.js';

export const COMBINATION_DIMENSION_NAMES = deepFreeze([
  'ROLE_SPECIFICITY',
  'SMALL_WORKPLACE',
  'PERSONAL_EVENT',
  'PRECISE_TIME_OR_PLACE',
  'RESIDUAL_IDENTIFIER',
] as const);

export type CombinationDimensionName = (typeof COMBINATION_DIMENSION_NAMES)[number];

export interface DimensionHit {
  readonly dimension: CombinationDimensionName;
  readonly field: string;
  readonly start: number;
  readonly end: number;
}

interface PatternDimension {
  readonly dimension: CombinationDimensionName;
  /** What the rule is looking for, in one line — this is the rule's documentation. */
  readonly describes: string;
  readonly patterns: readonly string[];
  readonly flags: string;
}

/**
 * A role qualified beyond an ordinary title: a unique position, a team of one, "the only X".
 * The span is the cue plus one to four following words, so the union span points at the role phrase
 * rather than at a bare "the only".
 */
const ROLE_SPECIFICITY: PatternDimension = {
  dimension: 'ROLE_SPECIFICITY',
  describes: 'a uniqueness cue ("the only", "our sole", "the single", "the lone") plus the role phrase',
  patterns: [
    "\\b(?:the|our|my)\\s{1,2}(?:only|sole|single|lone|one)(?:\\s{1,2}[\\p{L}'\\-]{1,20}){1,4}",
    '\\bthe only other (?:employee|worker|staff member)\\b',
  ],
  flags: 'iu',
};

/** An explicit small headcount, or a named micro-workplace. */
const SMALL_WORKPLACE: PatternDimension = {
  dimension: 'SMALL_WORKPLACE',
  describes: 'an explicit small headcount ("three-person"), "the only other employee", or a small-workplace phrase',
  patterns: [
    '\\b(?:one|two|three|four|five|six|seven|eight|nine|ten|[1-9])[\\s-](?:person|staff|employee|man|woman)\\b',
    '\\bsmall (?:business|team|workplace|employer|office|site)\\b',
    '\\bthe only other (?:employee|worker|staff member)\\b',
  ],
  flags: 'i',
};

/**
 * A dismissal, injury, illness, pregnancy, complaint, investigation or bereavement tied to an
 * individual (the ticket's own list, extended with the forms the corpus uses).
 */
const PERSONAL_EVENT: PatternDimension = {
  dimension: 'PERSONAL_EVENT',
  describes: 'a personal event tied to an individual — dismissal, injury, illness, pregnancy, complaint, investigation or bereavement',
  patterns: [
    '\\b(?:was |been |being )?(?:dismissed|sacked|terminated|stood down|made redundant)\\b',
    '\\b(?:the |a |an |their |his|her)\\s{0,2}(?:dismissal|termination|redundancy|stand-down)\\b',
    '\\b(?:broke|fractured|injured)\\s{1,2}(?:his|her|their|a|an|the)\\b',
    '\\b(?:workplace injury|injured at work|had an accident)\\b',
    '\\b(?:miscarried|miscarriage|pregnan(?:t|cy)|IVF|maternity|parental leave)\\b',
    '\\b(?:had|suffered)\\s{1,2}a\\s{1,2}(?:stroke|heart attack|breakdown|seizure)\\b',
    '\\b(?:cancer|epilepsy|diabetes)\\b|\\bdiagnos(?:ed|is)\\b',
    '\\b(?:mental health admission|hospitalised|hospitalized|in hospital)\\b',
    "\\b(?:stress leave|carer'?s leave|family violence leave|compassionate leave|personal leave)\\b",
    '\\b(?:divorce|separated from|bereave(?:d|ment)|lost (?:his|her|their) (?:father|mother|partner|child|son|daughter))\\b',
    '\\b(?:declared bankruptcy|bankruptcy|gambling problem|addiction)\\b',
    '\\b(?:charged with|convicted of|investigated for|under investigation|misconduct allegation)\\b',
    '\\b(?:came out|disclosed a|disclosed her|disclosed his|disclosed their)\\b',
    '\\b(?:allergic reaction|assault(?:ed)?|complaint (?:against|about) (?:him|her|them))\\b',
  ],
  flags: 'i',
};

/**
 * An exact date or a location more precise than a state/territory. A span that the necessary-facts
 * rule set already explains (a state name, an approximate rate) is excluded, so PRD §10.1's
 * *"necessary role/duty/location facts"* never become an identifying dimension.
 */
const PRECISE_TIME_OR_PLACE: PatternDimension = {
  dimension: 'PRECISE_TIME_OR_PLACE',
  describes: 'an exact date, or a street-level location beyond state/territory',
  patterns: [
    '\\b\\d{1,2}[/.-]\\d{1,2}[/.-](?:19|20)?\\d{2}\\b',
    '\\b\\d{1,2}\\s{1,2}(?:January|February|March|April|May|June|July|August|September|October|November|December)\\s{1,2}(?:19|20)\\d{2}\\b',
    '\\b\\d{1,4}\\s{1,2}\\p{Lu}[\\p{L}]{2,20}\\s{1,2}(?:Street|St|Road|Rd|Avenue|Ave|Lane|Drive|Court|Place|Parade|Highway|Crescent)\\b',
  ],
  flags: 'u',
};

const PATTERN_DIMENSIONS: readonly PatternDimension[] = deepFreeze([
  ROLE_SPECIFICITY,
  SMALL_WORKPLACE,
  PERSONAL_EVENT,
  PRECISE_TIME_OR_PLACE,
] as const);

/** Exported so `test/context/combination.test.ts` can assert every dimension has a documented rule. */
export const DIMENSION_RULES: readonly { readonly dimension: CombinationDimensionName; readonly describes: string }[] =
  deepFreeze([
    ...PATTERN_DIMENSIONS.map((entry) => ({ dimension: entry.dimension, describes: entry.describes })),
    {
      dimension: 'RESIDUAL_IDENTIFIER' as const,
      describes: 'any ADVISORY-severity finding produced by an earlier stage',
    },
  ] as const);

function hitsForPatterns(view: ScanView, entry: PatternDimension): DimensionHit[] {
  const hits: DimensionHit[] = [];
  for (const pattern of entry.patterns) {
    for (const match of scanMatches(view, pattern, entry.flags)) {
      const at = match.index;
      if (at === undefined || match[0].length === 0) continue;
      const end = at + match[0].length;
      if (entry.dimension === 'PRECISE_TIME_OR_PLACE' && isNecessaryFactSpan(view, at, end)) continue;
      const span = spanOfScanRange(view, at, end);
      hits.push({ dimension: entry.dimension, field: view.field, start: span.start, end: span.end });
    }
  }
  return hits;
}

/**
 * Every dimension hit across the request, in view order. `RESIDUAL_IDENTIFIER` reads the incoming
 * findings — it is the one dimension not derived from text.
 */
export function detectDimensions(
  views: ReadonlyMap<string, ScanView>,
  findings: readonly PiiFinding[],
): readonly DimensionHit[] {
  const hits: DimensionHit[] = [];
  for (const view of views.values()) {
    for (const entry of PATTERN_DIMENSIONS) hits.push(...hitsForPatterns(view, entry));
  }
  for (const finding of findings) {
    if (finding.severity !== 'ADVISORY') continue;
    hits.push({
      dimension: 'RESIDUAL_IDENTIFIER',
      field: finding.field,
      start: finding.start,
      end: finding.end,
    });
  }
  return hits;
}
