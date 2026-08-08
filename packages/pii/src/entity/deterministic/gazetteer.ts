/**
 * EVID-02 deliverable 2 (the allow gazetteer half) — the public-entity forms a name rule must never
 * turn into a candidate.
 *
 * WHAT THIS IS, AND WHAT IT IS EMPHATICALLY NOT. It prevents a CANDIDATE from being created in
 * PRD §37.2 stage 4. It can never remove a finding another stage produced — that is stage 5's job
 * and stage 5 reads only the structured channels (sub-PRD D4). If this file could clear findings it
 * would be the *"generic 'ignore warning' button"* PRD §37.2 forbids, reachable by pasting a company
 * suffix. `test/entity/purity.test.ts` asserts `src/context/publicEntity.ts` does not import it, and
 * `test/entity/gazetteer.test.ts` asserts a gazetteer-only free-text field carrying a TFN still
 * rejects.
 *
 * FALSE-POSITIVE POSTURE. Every group below quotes the PRD §37.1 ALLOWED row it comes from. The cost
 * of an entry is a missed name that happens to be spelled exactly like a public form ("Grace" the
 * person vs no such entry — deliberately absent); the cost of an omission is a false positive on the
 * product's main use case (asking about an employer). §37.1 puts employer names, regulators, courts
 * and the placeholder forms in the ALLOWED column, so the omission is the more expensive error.
 *
 * NOT COVERED, and named so the number in `recall-report.json` is honest: every rule that consults
 * this file keys on Latin-script capitalisation, so CJK, Arabic, Hebrew and Thai names are outside
 * the recogniser entirely. See packages/pii/README.md and the ADR consequences.
 */
import { deepFreeze } from '../../contract/freeze.js';
import type { ScanView } from '../../deterministic/normalise.js';
import { scanMatches } from '../../deterministic/detectors/shared.js';

export interface AllowedEntityGroup {
  /** Why these forms are allowed, in one line. */
  readonly reason: string;
  /** The PRD §37.1 ALLOWED row, quoted. */
  readonly prdAllowedRow: string;
  readonly forms: readonly string[];
}

export const ALLOWED_ENTITY_FORMS: readonly AllowedEntityGroup[] = deepFreeze([
  {
    reason: 'Legal and organisation heads: a token sequence ending in one of these is an entity, not a person.',
    prdAllowedRow: 'Public employer name and ABN',
    forms: [
      'Pty Ltd',
      'Pty. Ltd.',
      'Pty',
      'Ltd',
      'Limited',
      'Inc',
      'Incorporated',
      'Co',
      'Group',
      'Holdings',
      'Services',
      'Corporation',
      'Trust',
      'Partners',
      'Association',
      'Union',
      'Council',
      'Commission',
      'Authority',
      'Department',
      'Board',
      'Tribunal',
      'Court',
      'Registry',
      'Institute',
      'Society',
      'Foundation',
      'Academy',
      'College',
      'School',
      'University',
      'Hospital',
      'Bakery',
      'Depot',
      'Workshop',
      'Studio',
      'Winery',
    ],
  },
  {
    reason: 'Named government, regulator and court forms that read exactly like personal names.',
    prdAllowedRow: 'Public case party/citation',
    forms: [
      'Fair Work',
      'Fair Work Commission',
      'Fair Work Ombudsman',
      'Fair Work Infoline',
      'FWC',
      'FWCFB',
      'Australian Taxation Office',
      'ATO',
      'Safe Work Australia',
      'Federal Court',
      'Federal Court of Australia',
      'Administrative Review Tribunal',
      'Australian Workers Union',
      'Re Application',
    ],
  },
  {
    reason: 'The PRD §37.1 placeholder forms themselves — blocking these would block the remedy.',
    prdAllowedRow: '"Employee A", "the worker", synthetic placeholders',
    forms: [
      'Employee',
      'Worker',
      'Person',
      'Individual',
      'Staff',
      'Staff Member',
      'Applicant',
      'Respondent',
      'Employer',
      'Sir',
      'Madam',
      'Team',
      'All',
      'Sir or Madam',
      'the worker',
      'the employee',
      'the applicant',
      'the respondent',
      'the employer',
      'the staff member',
    ],
  },
  {
    reason: 'Capitalised vocabulary that is not a name and that the capitalisation rules would swallow.',
    prdAllowedRow: 'State/territory and non-precise work location',
    forms: [
      'NSW',
      'VIC',
      'QLD',
      'SA',
      'WA',
      'TAS',
      'NT',
      'ACT',
      'New South Wales',
      'Victoria',
      'Queensland',
      'South Australia',
      'Western Australia',
      'Tasmania',
      'Northern Territory',
      'Australian Capital Territory',
      'Australia',
      'Sydney',
      'Melbourne',
      'Brisbane',
      'Perth',
      'Adelaide',
      'Hobart',
      'Darwin',
      'Canberra',
      'Geelong',
      'January',
      'February',
      'March',
      'April',
      'May',
      'June',
      'July',
      'August',
      'September',
      'October',
      'November',
      'December',
      'Monday',
      'Tuesday',
      'Wednesday',
      'Thursday',
      'Friday',
      'Saturday',
      'Sunday',
      'Mondays',
      'Tuesdays',
      'Wednesdays',
      'Thursdays',
      'Fridays',
      'Saturdays',
      'Sundays',
      'Christmas',
      'Easter',
      'Certificate',
      'Certificate III',
      'Award',
      'Head',
      'Overtime',
      'Several',
      'Their',
      'There',
      'These',
      'They',
      'This',
      'Head Office',
      'Auslan',
      'IVF',
    ],
  },
] as const);

/**
 * The head words that make a capitalised sequence an organisation. Kept separate from the group
 * above because the test is positional — a sequence ENDING in one of these, or FOLLOWED by one, is
 * an entity, however person-like its first token ("Smith & Co Pty Ltd", "Smith Group").
 */
export const ORGANISATION_HEADS: readonly string[] = deepFreeze([
  'pty',
  'ltd',
  'ltd.',
  'limited',
  'inc',
  'inc.',
  'incorporated',
  'co',
  'co.',
  'group',
  'holdings',
  'services',
  'corporation',
  'trust',
  'partners',
  'association',
  'union',
  'council',
  'commission',
  'ombudsman',
  'infoline',
  'authority',
  'department',
  'board',
  'tribunal',
  'court',
  'registry',
  'institute',
  'society',
  'foundation',
  'academy',
  'college',
  'school',
  'university',
  'hospital',
  'bakery',
  'depot',
  'workshop',
  'studio',
  'winery',
  'office',
  'agency',
  'centre',
  'center',
  'clinic',
  'stable',
  'troupe',
  'crew',
  'estate',
  'airfield',
  'line',
] as const);

/**
 * Case-citation shapes. Sources, never compiled `RegExp` constants: a module-scope global regex
 * carries a mutable `lastIndex` shared across concurrent `apps/api` requests, which
 * `test/contract/purity.test.ts` forbids for exactly that reason.
 */
export const CITATION_SHAPED: readonly string[] = deepFreeze([
  // "[2024] FWC 123"
  '\\[(?:19|20)\\d{2}\\]\\s{1,2}[A-Z]{2,6}\\s{1,2}\\d{1,5}',
  // "(2019) 268 CLR 1"
  '\\((?:19|20)\\d{2}\\)\\s{1,2}\\d{1,4}\\s{1,2}[A-Z]{2,6}',
  // "Smith v Example Widgets" — the party form
  "\\p{Lu}[\\p{L}'\\-]{1,20}\\s{1,2}v\\.?\\s{1,2}\\p{Lu}",
] as const);

const ALLOWED_LOOKUP = new Set<string>(
  ALLOWED_ENTITY_FORMS.flatMap((group) => group.forms).map((form) => form.toLowerCase()),
);

const ORGANISATION_LOOKUP = new Set<string>(ORGANISATION_HEADS);

/** Collapsed whitespace, trimmed of the punctuation a sentence puts around a candidate. */
function normaliseForm(text: string): string {
  return text
    .split(/\s+/)
    .filter((part) => part.length > 0)
    .join(' ')
    .replace(/^[^\p{L}]+/u, '')
    .replace(/[^\p{L}.]+$/u, '')
    .toLowerCase();
}

/** Whether `text` is, in whole or by every one of its tokens, an allowed public-entity form. */
export function isAllowedEntityForm(text: string): boolean {
  const form = normaliseForm(text);
  if (form.length === 0) return true;
  if (ALLOWED_LOOKUP.has(form)) return true;
  const tokens = form.split(' ');
  // "Employee A", "Worker B" — the §37.1 placeholder shape.
  if (tokens.length === 2 && ALLOWED_LOOKUP.has(tokens[0] ?? '') && (tokens[1] ?? '').length === 1) {
    return true;
  }
  // Every token is itself an allowed form ("New South Wales", "Fair Work Commission" as fragments).
  if (tokens.length > 1 && tokens.every((token) => ALLOWED_LOOKUP.has(token))) return true;
  return tokens.some((token) => ORGANISATION_LOOKUP.has(token));
}

/**
 * Whether the token immediately after `[scanStart, scanEnd)` is an organisation head, so that
 * "Example Widgets Pty Ltd" is an entity even when a rule captured only "Example Widgets".
 */
export function isFollowedByOrganisationHead(view: ScanView, scanEnd: number): boolean {
  const tail = view.scan.slice(scanEnd, scanEnd + 24);
  const next = /^[\s,.&]{1,3}([\p{L}.]{1,14})/u.exec(tail);
  const token = next?.[1];
  if (token === undefined) return false;
  return ORGANISATION_LOOKUP.has(token.toLowerCase());
}

export interface ScanRange {
  readonly start: number;
  readonly end: number;
}

/**
 * The sentences of `view` that carry a citation-shaped reference. A candidate inside one is public
 * case material (PRD §37.1 *"Public case party/citation"*), not an employee name.
 *
 * DOCUMENTED FALSE-NEGATIVE RISK, the largest in this file: a request that appends "[2024] FWC 123"
 * to a sentence containing a real name suppresses the NAME CANDIDATE in that sentence. It suppresses
 * nothing else — every deterministic detector still runs, so a TFN, phone or address in the same
 * sentence is still blocked, and stage 5 still cannot be reached from free text. The alternative,
 * blocking every capitalised token beside a citation, breaks the two §37.1 allowed citation rows in
 * `EVID-01`'s own shared negatives.
 */
export function citationSentences(view: ScanView): readonly ScanRange[] {
  const ranges: ScanRange[] = [];
  for (const source of CITATION_SHAPED) {
    for (const match of scanMatches(view, source, 'du')) {
      const at = match.index;
      if (at === undefined) continue;
      const before = view.scan.slice(0, at);
      const boundary = Math.max(
        before.lastIndexOf('\n'),
        before.lastIndexOf('. '),
        before.lastIndexOf('! '),
        before.lastIndexOf('? '),
      );
      const start = boundary < 0 ? 0 : boundary + 1;
      const rest = view.scan.slice(at + match[0].length);
      const stop = rest.search(/[\n!?]|\.\s|\.$/u);
      const end = stop < 0 ? view.scan.length : at + match[0].length + stop + 1;
      ranges.push({ start, end });
    }
  }
  return ranges;
}

export function isInsideAnyRange(
  ranges: readonly ScanRange[],
  scanStart: number,
  scanEnd: number,
): boolean {
  return ranges.some((range) => scanStart >= range.start && scanEnd <= range.end);
}
