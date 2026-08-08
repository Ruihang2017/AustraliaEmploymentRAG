/**
 * EVID-02 deliverable 6 — the "necessary role/duty/location facts" allowance.
 *
 * PRD §10.1: *"Employer names, ABNs, public business information, public case parties and
 * **necessary role/duty/location facts** MAY be accepted."* PRD §32.2's Ask form is *meant* to carry
 * these facts, so a detector that blocks them does not make the product safer — it makes it useless
 * and teaches customers to paraphrase around the boundary.
 *
 * THIS IS A NEGATIVE RULE SET, NOT A SUPPRESSOR. Nothing here removes a finding. It is consulted in
 * two places only:
 *
 * - `src/entity/deterministic/rules.ts` — a name candidate inside a necessary-fact phrase is not a
 *   candidate (so "Certificate III" is never a person);
 * - `src/context/dimensions.ts` — an approximate wage or a state/territory-level location never
 *   counts as `PRECISE_TIME_OR_PLACE`.
 *
 * `src/context/publicEntity.ts` MUST NOT import it: stage 5 is the only stage that removes a
 * finding, and its only reason may be the structured channel (sub-PRD D4). `test/entity/purity.test.ts`
 * asserts that import edge is absent.
 *
 * Its acceptance is a corpus replay, not a finding: every case in
 * `test/context/corpora/necessary-facts.json` must come out `ACCEPT`.
 */
import { deepFreeze } from '../contract/freeze.js';
import type { ScanView } from '../deterministic/normalise.js';
import { scanMatches } from '../deterministic/detectors/shared.js';

export const NECESSARY_FACT_RULE_NAMES = deepFreeze([
  'ANONYMOUS_ROLE_OR_DUTY',
  'EMPLOYMENT_TYPE',
  'AWARD_OR_CLASSIFICATION',
  'APPROXIMATE_WAGE_OR_RATE',
  'STATE_OR_TERRITORY_LOCATION',
  'AGE_BAND',
] as const);

export type NecessaryFactRuleName = (typeof NECESSARY_FACT_RULE_NAMES)[number];

export interface NecessaryFactRule {
  readonly name: NecessaryFactRuleName;
  /** The PRD §37.1 ALLOWED row (or §10.1 clause) this rule protects, quoted. */
  readonly prdAllowedRow: string;
  /** A regex SOURCE, compiled inside the function that uses it (never a module-scope /g literal). */
  readonly pattern: string;
  readonly flags: string;
}

export const NECESSARY_FACT_RULES: readonly NecessaryFactRule[] = deepFreeze([
  {
    name: 'ANONYMOUS_ROLE_OR_DUTY',
    prdAllowedRow: 'Anonymous role, duties, qualifications and employment type',
    pattern:
      '\\b(?:the|a|an|our|their)\\s{1,2}(?:level\\s{1,2}\\d\\s{1,2}|senior\\s{1,2}|junior\\s{1,2})?' +
      '(?:worker|employee|staff member|applicant|respondent|cleaner|chef|cook|driver|picker|packer|' +
      'nurse|carer|teacher|apprentice|trainee|labourer|supervisor|manager|administrator|receptionist|' +
      'storeperson|tradesperson|electrician|plumber|mechanic|baker|barista|security guard)\\b',
    flags: 'i',
  },
  {
    name: 'EMPLOYMENT_TYPE',
    prdAllowedRow: 'Anonymous role, duties, qualifications and employment type',
    pattern:
      '\\b(?:casual|part[\\s-]time|full[\\s-]time|fixed[\\s-]term|permanent|ongoing|labour hire|' +
      'shift work|ordinary hours)\\b',
    flags: 'i',
  },
  {
    name: 'AWARD_OR_CLASSIFICATION',
    prdAllowedRow: 'Anonymous role, duties, qualifications and employment type',
    pattern:
      '\\b(?:modern award|the award|enterprise agreement|classification|pay point|' +
      'level\\s{1,2}\\d|grade\\s{1,2}\\d|Certificate\\s{1,2}(?:I{1,3}|IV|V)|Diploma)\\b',
    flags: '',
  },
  {
    name: 'APPROXIMATE_WAGE_OR_RATE',
    prdAllowedRow: 'Approximate wage/rate facts without identity',
    pattern:
      '\\b(?:about|around|roughly|approximately)?\\s{0,2}\\$\\d{1,3}(?:[,.]\\d{1,3}){0,3}' +
      '(?:\\s{1,2}(?:an?|per)\\s{1,2}(?:hour|week|fortnight|year))?' +
      '|\\btime and a half\\b|\\bdouble time\\b|\\bpenalty rate[s]?\\b|\\baward rate\\b',
    flags: 'i',
  },
  {
    name: 'STATE_OR_TERRITORY_LOCATION',
    prdAllowedRow: 'State/territory and non-precise work location',
    pattern:
      '\\b(?:NSW|VIC|QLD|SA|WA|TAS|NT|ACT|New South Wales|Victoria|Queensland|South Australia|' +
      'Western Australia|Tasmania|Northern Territory|Australian Capital Territory|' +
      'regional [A-Z]{2,3}|the eastern states|metro(?:politan)?)\\b',
    flags: '',
  },
  {
    name: 'AGE_BAND',
    prdAllowedRow: 'Age band where legally relevant',
    pattern: '\\bage[d]?\\s{1,2}\\d{2}\\s{0,2}[-–]\\s{0,2}\\d{2}\\b|\\bage band\\b',
    flags: 'i',
  },
] as const);

export interface NecessaryFactSpan {
  readonly rule: NecessaryFactRuleName;
  readonly start: number;
  readonly end: number;
}

/** Every necessary-fact phrase in `view`, as SCAN ranges (the space the name rules match in). */
export function necessaryFactSpans(view: ScanView): readonly NecessaryFactSpan[] {
  const spans: NecessaryFactSpan[] = [];
  for (const rule of NECESSARY_FACT_RULES) {
    for (const match of scanMatches(view, rule.pattern, rule.flags)) {
      const at = match.index;
      if (at === undefined) continue;
      spans.push({ rule: rule.name, start: at, end: at + match[0].length });
    }
  }
  return spans;
}

/** Whether the scan range `[start, end)` lies inside a necessary-fact phrase. */
export function isNecessaryFactSpan(view: ScanView, start: number, end: number): boolean {
  return necessaryFactSpans(view).some((span) => start >= span.start && end <= span.end);
}
