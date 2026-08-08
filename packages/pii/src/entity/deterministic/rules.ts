/**
 * EVID-02 deliverable 2 (the rule half) — person-name recognition by STRUCTURE AND CONTEXT, never by
 * a list of names.
 *
 * PRD §10.1 requires *"local entity recognition"* as one of three combined techniques. A name list
 * would be both a privacy hazard (a list of real names shipped in a PII detector) and useless on the
 * non-Anglo names this product must handle. Every rule below therefore needs a CUE — an honorific, an
 * employment relation, a greeting/signature, an adjacent private contact detail, or a personal
 * possessive. A sentence-initial capital is never a candidate on its own.
 *
 * OFFSETS ARE NEVER COMPUTED BY HAND. Rules return SCAN ranges; the recogniser converts them with
 * `spanOfScanRange` and builds findings with `findingAt`, which is what keeps every span code-point
 * aligned and surrogate-safe.
 *
 * ReDoS POSTURE. Every repetition is bounded (`{1,20}`, `{0,2}`, `{1,2}`) and no unbounded group is
 * nested inside another. `test/deterministic/timing.test.ts` (EVID-01) replays a maximum-size request
 * through the whole pipeline and is the canary for these patterns.
 *
 * NOT COVERED — say it out loud, because an unnamed blind spot is a false recall number:
 * - scripts without case (CJK, Arabic, Hebrew, Thai): every rule keys on `\p{Lu}`;
 * - an all-lower-case name;
 * - a bare mononym with no possessive or honorific cue;
 * - a name inside a sentence that also carries a citation-shaped reference (see `gazetteer.ts`).
 */
import type { PiiFinding } from '../../contract/finding.js';
import { deepFreeze } from '../../contract/freeze.js';
import type { ScanView } from '../../deterministic/normalise.js';
import { hasContextBefore, scanMatches } from '../../deterministic/detectors/shared.js';
import { isNecessaryFactSpan } from '../../context/necessaryFacts.js';
import type { EntityRule, EntityRuleName } from '../port.js';
import type { ScanRange } from './gazetteer.js';
import {
  citationSentences,
  isAllowedEntityForm,
  isFollowedByOrganisationHead,
  isInsideAnyRange,
} from './gazetteer.js';

/** One capitalised token, bounded. `\p{Lu}` so "Nguyễn", "Ngô" and "Popović" are in scope. */
const TOKEN = "\\p{Lu}[\\p{L}'\\-]{1,20}";
/** One to three tokens. */
const NAME_1_3 = `${TOKEN}(?:\\s{1,2}${TOKEN}){0,2}`;
/** Two to three tokens — the shape an unlabelled name in prose has to have to be a candidate. */
const NAME_2_3 = `${TOKEN}(?:\\s{1,2}${TOKEN}){1,2}`;

/** Cues that put a capitalised sequence in an employment relation, in either direction. */
const EMPLOYMENT_CUES: readonly string[] = deepFreeze([
  'my employee',
  'our employee',
  'the employee',
  'my worker',
  'our worker',
  'the worker',
  'works for',
  'worked for',
  'reports to',
  'line manager',
  'supervises',
  'supervised by',
  'dismissed',
  'terminated',
  'resigned',
  'on leave',
  'rostered',
  'employed as',
  'my manager',
  'our manager',
] as const);

/** How far after a candidate a trailing cue may sit ("Marta Kowalski was dismissed in March"). */
const AFTER_WINDOW = 40;

export interface RuleCandidate {
  readonly rule: EntityRuleName;
  readonly start: number;
  readonly end: number;
}

/** `hasContextBefore`'s mirror. Not added to `shared.ts` — that file is `EVID-01`'s. */
function hasContextAfter(
  view: ScanView,
  scanIndex: number,
  terms: readonly string[],
  window: number = AFTER_WINDOW,
): boolean {
  let text = view.scan.slice(scanIndex, scanIndex + window);
  const cut = text.search(/[\n!?]|\.\s/u);
  if (cut >= 0) text = text.slice(0, cut);
  const lower = text.toLowerCase();
  return terms.some((term) => lower.includes(term));
}

function pushCapture(
  into: RuleCandidate[],
  rule: EntityRuleName,
  match: RegExpMatchArray,
  group: number,
): void {
  const indices = match.indices?.[group];
  if (!indices) return;
  into.push({ rule, start: indices[0], end: indices[1] });
}

/** `Mr Jane Doe`, `Dr Ngô Thanh`. */
function honorificNames(view: ScanView): RuleCandidate[] {
  const found: RuleCandidate[] = [];
  const source = `\\b(?:Mr|Mrs|Ms|Miss|Dr|Prof|Sir|Dame|Rev)\\.?\\s{1,2}(${NAME_1_3})`;
  for (const match of scanMatches(view, source, 'du')) pushCapture(found, 'HONORIFIC_NAME', match, 1);
  return found;
}

/** A 2-3 token capitalised sequence inside an employment-relation context, before or after. */
function employmentRelationNames(view: ScanView): RuleCandidate[] {
  const found: RuleCandidate[] = [];
  for (const match of scanMatches(view, `(${NAME_2_3})`, 'du')) {
    const indices = match.indices?.[1];
    if (!indices) continue;
    const [start, end] = indices;
    if (
      hasContextBefore(view, start, EMPLOYMENT_CUES) ||
      hasContextAfter(view, end, EMPLOYMENT_CUES)
    ) {
      found.push({ rule: 'EMPLOYMENT_RELATION_NAME', start, end });
    }
  }
  return found;
}

/** `Hi Marta Kowalski,` / `Regards, Marta Kowalski` / a trailing `-- Marta Kowalski`. */
function signatureOrGreetingNames(view: ScanView): RuleCandidate[] {
  const found: RuleCandidate[] = [];
  const greeting =
    `(?:^|[.!?\\n]\\s{0,2})(?:Hi|Hello|Dear|Regards|Kind regards|Many thanks|Thanks|Thank you|Sincerely|Cheers)` +
    `[,\\s]{1,3}(${NAME_1_3})`;
  for (const match of scanMatches(view, greeting, 'du')) {
    pushCapture(found, 'SIGNATURE_OR_GREETING_NAME', match, 1);
  }
  const signoff = `(?:--|-\\s|\\u2014)\\s{0,2}(${NAME_1_3})\\s{0,2}$`;
  for (const match of scanMatches(view, signoff, 'du')) {
    pushCapture(found, 'SIGNATURE_OR_GREETING_NAME', match, 1);
  }
  return found;
}

/** The private-contact categories whose presence makes an adjacent capitalised token a name. */
const CONTACT_CATEGORIES: readonly string[] = deepFreeze([
  'PRIVATE_CONTACT_EMAIL',
  'PRIVATE_CONTACT_PHONE',
  'PRIVATE_SOCIAL_IDENTIFIER',
  'HOME_ADDRESS_OR_PRECISE_LOCATION',
] as const);

/**
 * A capitalised sequence within the context window of a span ALREADY carrying a private contact
 * detail. This is the one rule that reads the incoming findings, which is why it appends only — it
 * cannot see, and cannot change, why the earlier finding exists.
 *
 * TWO TO THREE TOKENS, not one: proximity to a phone number is a weak cue, and a one-token form
 * would make every sentence-initial capital beside a contact detail ("Please call …") a name. The
 * cost is a documented blind spot — a mononym next to a contact detail is not caught here.
 */
function adjacentContactNames(view: ScanView, findings: readonly PiiFinding[]): RuleCandidate[] {
  const anchors = findings.filter(
    (finding) => finding.field === view.field && CONTACT_CATEGORIES.includes(finding.category),
  );
  if (anchors.length === 0) return [];

  const found: RuleCandidate[] = [];
  for (const match of scanMatches(view, `(${NAME_2_3})`, 'du')) {
    const indices = match.indices?.[1];
    if (!indices) continue;
    const [start, end] = indices;
    const nfcStart = view.startOf[start];
    const nfcEnd = view.endOf[end - 1];
    if (nfcStart === undefined || nfcEnd === undefined) continue;
    const adjacent = anchors.some(
      (anchor) => nfcStart - anchor.end <= 48 && anchor.start - nfcEnd <= 48,
    );
    // A candidate that IS the anchor span (an address contains capitalised street words) is not a
    // separate name.
    const overlapsAnchor = anchors.some(
      (anchor) => nfcStart < anchor.end && anchor.start < nfcEnd,
    );
    if (adjacent && !overlapsAnchor) found.push({ rule: 'ADJACENT_CONTACT_NAME', start, end });
  }
  return found;
}

/**
 * A single capitalised token in a personal-possessive employment context. The HIGHEST false-positive
 * rule in this file and the only `ADVISORY` producer — it exists so `ADVISORY` and the
 * `RESIDUAL_IDENTIFIER` combination dimension are reachable rather than dead. The token pattern is
 * `\p{Lu}\p{Ll}{2,20}` on purpose: it excludes acronyms ("NSW"), single letters ("Employee A's
 * roster") and ALL-CAPS shouting.
 */
function possessivePersonalMononyms(view: ScanView): RuleCandidate[] {
  const found: RuleCandidate[] = [];
  const noun = '(?:roster|rosters|shift|shifts|timesheet|probation|resignation|dismissal)';
  const possessive = `(\\p{Lu}\\p{Ll}{2,20})'s\\s{1,2}${noun}\\b`;
  for (const match of scanMatches(view, possessive, 'du')) {
    pushCapture(found, 'POSSESSIVE_PERSONAL_MONONYM', match, 1);
  }
  const rostered = `(\\p{Lu}\\p{Ll}{2,20})\\s{1,2}was\\s{1,2}rostered\\b`;
  for (const match of scanMatches(view, rostered, 'du')) {
    pushCapture(found, 'POSSESSIVE_PERSONAL_MONONYM', match, 1);
  }
  return found;
}

/** Deliverable 2's *"every rule is named … and documented with its false-positive risk"*. */
export const ENTITY_RULES: readonly EntityRule[] = deepFreeze([
  {
    name: 'HONORIFIC_NAME',
    severity: 'BLOCKING',
    falsePositiveRisk:
      'Place names carrying an honorific ("Dr Martin Place"). Mitigated by the gazetteer only when the place is listed.',
  },
  {
    name: 'EMPLOYMENT_RELATION_NAME',
    severity: 'BLOCKING',
    falsePositiveRisk:
      'An employer or regulator name in the same sentence as an employment cue ("the employee works for Example Widgets Pty Ltd"). Mitigated by the organisation-head test.',
  },
  {
    name: 'SIGNATURE_OR_GREETING_NAME',
    severity: 'BLOCKING',
    falsePositiveRisk:
      'A greeting addressed to an organisation ("Dear Fair Work Commission"). Mitigated by the gazetteer.',
  },
  {
    name: 'ADJACENT_CONTACT_NAME',
    severity: 'BLOCKING',
    falsePositiveRisk:
      'A business name next to a published business line ("Head Office on 1300 123 456"). Mitigated by the gazetteer and by the organisation-head test; the published-line shapes themselves are EVID-01 negatives.',
  },
  {
    name: 'POSSESSIVE_PERSONAL_MONONYM',
    severity: 'ADVISORY',
    falsePositiveRisk:
      'Highest of the five: any capitalised word before "’s roster". Held to zero false positives across every EVID-01 negative by the differential replay in test/context/stages-regression.test.ts; ADVISORY rather than BLOCKING because a mononym alone is weak evidence.',
  },
] as const);

const SEVERITY_OF = new Map<EntityRuleName, EntityRule>(
  ENTITY_RULES.map((rule) => [rule.name, rule] as const),
);

export function ruleByName(name: EntityRuleName): EntityRule | undefined {
  return SEVERITY_OF.get(name);
}

/**
 * Every candidate in `view`, already filtered by the gazetteer, the citation guard and the
 * necessary-fact rule set. Returned in scan order, deduplicated on `(rule, start, end)`.
 */
export function candidatesIn(
  view: ScanView,
  findings: readonly PiiFinding[],
): readonly RuleCandidate[] {
  const raw: RuleCandidate[] = [
    ...honorificNames(view),
    ...employmentRelationNames(view),
    ...signatureOrGreetingNames(view),
    ...adjacentContactNames(view, findings),
    ...possessivePersonalMononyms(view),
  ];

  const citations: readonly ScanRange[] = citationSentences(view);
  const kept: RuleCandidate[] = [];
  const seen = new Set<string>();
  for (const candidate of raw) {
    const text = view.scan.slice(candidate.start, candidate.end);
    if (isAllowedEntityForm(text)) continue;
    if (isFollowedByOrganisationHead(view, candidate.end)) continue;
    if (isInsideAnyRange(citations, candidate.start, candidate.end)) continue;
    if (isNecessaryFactSpan(view, candidate.start, candidate.end)) continue;
    const key = `${candidate.rule} ${String(candidate.start)} ${String(candidate.end)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    kept.push(candidate);
  }
  return kept.sort((left, right) =>
    left.start !== right.start
      ? left.start - right.start
      : left.end !== right.end
        ? left.end - right.end
        : left.rule < right.rule
          ? -1
          : left.rule > right.rule
            ? 1
            : 0,
  );
}
