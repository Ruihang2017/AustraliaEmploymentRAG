/**
 * EVID-02 deliverable 5 — the contextual public-entity allow rules (PRD §37.2 stage 5).
 *
 * THIS IS THE ONLY STAGE THAT MAY REMOVE A FINDING, AND THIS FILE IS THE WHOLE REASON IT MAY. A
 * reviewer asking "can a blocking finding be lost?" has one predicate to read, and that predicate
 * takes EXACTLY TWO PARAMETERS:
 *
 *     isExplainedByStructuredChannel(finding, structured)
 *
 * No role, header, flag, acknowledgement, environment variable or permission can reach it — PRD
 * §37.2: *"Public-entity exceptions must come from structured `employer`, `abn` or
 * `public_case_party` fields, **not a generic 'ignore warning' button**"* (sub-PRD D4, `UAT-PII-02`).
 * `test/context/types.test-d.ts` asserts the parameter list at the type level and
 * `@ts-expect-error`s a call that adds a third argument; the negative control (adding an
 * `acknowledged` parameter on a scratch branch and watching `pnpm typecheck` go red) was run and
 * discarded, per the ticket's test-plan step 4.
 *
 * WHAT IT DELIBERATELY DOES NOT IMPORT: `necessaryFacts.ts` and the entity gazetteer. Those are
 * CANDIDATE filters consulted by stages 4 and 6. If either could reach this predicate, pasting a
 * company suffix would become the ignore-warning button. `test/entity/purity.test.ts` asserts both
 * import edges are absent.
 *
 * NOTHING IN `freeText` IS EVER SUPPRESSED. `src/deterministic/limits.ts` rejects a `freeText` field
 * whose name starts with `structured.` before a single character is scanned, so the reserved channel
 * cannot be impersonated; a regression case covers it.
 *
 * NARROWER THAN `CONSERVATIVE_STAGE_DEFAULTS`, on purpose: `structured.publicCaseParty` additionally
 * requires the channel value itself to carry a citation-shaped reference, so
 * "Smith v Acme Pty Ltd [2024] FWC 123" is public material and a bare "Smith" is not (deliverable 5).
 */
import type { PiiCategory } from '../contract/category.js';
import type { PiiFinding } from '../contract/finding.js';
import type { PiiStages, StageInput } from '../contract/pipeline.js';
import type { StructuredChannels } from '../contract/request.js';
import { STRUCTURED_FIELD_NAMES } from '../contract/request.js';
import { deepFreeze } from '../contract/freeze.js';
import { isValidAbn } from '../deterministic/detectors/checksums.js';

/**
 * ONLY FOR THE CATEGORIES IT COVERS — the acceptance item's own words.
 *
 * A structured channel explains a PUBLIC ENTITY: an employer name, an ABN, a case party. It does not
 * explain a private email, a phone number, a social handle, a home address, a licence or passport
 * number, a payslip extract, a date of birth or an identifying combination. Without this table, a
 * customer who pasted a personal email address into the `employer` field would have it cleared by an
 * allow rule written for company names — a bypass reachable from ordinary input, and strictly wider
 * than `CONSERVATIVE_STAGE_DEFAULTS` needed to be. This is narrower than the merged default on
 * purpose; it can only ever REJECT more.
 */
export const SUPPRESSIBLE_CATEGORIES: Readonly<Record<string, readonly PiiCategory[]>> = deepFreeze({
  /** A company name that a name rule mistook for a person. */
  [STRUCTURED_FIELD_NAMES.employer]: ['EMPLOYEE_OR_PRIVATE_INDIVIDUAL_NAME'],
  /** The numeric-identifier categories an eleven-digit ABN can trip, and nothing else. */
  [STRUCTURED_FIELD_NAMES.abn]: [
    'TAX_FILE_NUMBER',
    'MEDICARE_NUMBER',
    'EMPLOYEE_OR_PAYROLL_IDENTIFIER',
  ],
  /** A case party is a name in public material. */
  [STRUCTURED_FIELD_NAMES.publicCaseParty]: ['EMPLOYEE_OR_PRIVATE_INDIVIDUAL_NAME'],
} as const);

/** The citation shapes, duplicated here as one line rather than imported from the entity gazetteer. */
const CITATION_IN_VALUE =
  /\[(?:19|20)\d{2}\]\s{1,2}[A-Z]{2,6}\s{1,2}\d{1,5}|\((?:19|20)\d{2}\)\s{1,2}\d{1,4}\s{1,2}[A-Z]{2,6}/;

function channelValue(field: string, structured: StructuredChannels): string | undefined {
  if (field === STRUCTURED_FIELD_NAMES.employer) return structured.employer;
  if (field === STRUCTURED_FIELD_NAMES.abn) return structured.abn;
  if (field === STRUCTURED_FIELD_NAMES.publicCaseParty) return structured.publicCaseParty;
  return undefined;
}

/**
 * Whether the span is the whole channel value modulo leading/trailing whitespace. This is the
 * ticket's *"exact or normalised match (case, whitespace, legal-suffix normalisation)"* reduced to
 * its only reachable case: a finding on `structured.employer` indexes into `structured.employer`
 * itself, so a partial span (a public employer name with a phone number appended) is still blocked.
 */
function coversWholeValue(finding: PiiFinding, value: string): boolean {
  const nfc = value.normalize('NFC');
  const firstNonSpace = nfc.length - nfc.trimStart().length;
  const lastNonSpace = nfc.trimEnd().length;
  if (lastNonSpace <= firstNonSpace) return false;
  return finding.start <= firstNonSpace && finding.end >= lastNonSpace && finding.end <= nfc.length;
}

/** The whole suppression surface of this module. Two parameters, and there will never be a third. */
export function isExplainedByStructuredChannel(
  finding: PiiFinding,
  structured: StructuredChannels | undefined,
): boolean {
  if (structured === undefined) return false;
  const value = channelValue(finding.field, structured);
  if (value === undefined) return false;
  const covered = SUPPRESSIBLE_CATEGORIES[finding.field];
  if (!covered || !covered.includes(finding.category)) return false;
  if (!coversWholeValue(finding, value)) return false;

  if (finding.field === STRUCTURED_FIELD_NAMES.abn) {
    // A checksum-failing ABN is never a public entity (deliverable 5, `UAT-PII-02`).
    return isValidAbn(value.replace(/[^0-9]/g, ''));
  }
  if (finding.field === STRUCTURED_FIELD_NAMES.publicCaseParty) {
    return CITATION_IN_VALUE.test(value.normalize('NFC'));
  }
  return true;
}

/** PRD §37.2 stage 5. A filter, and the only remover in the pipeline. */
export const applyPublicEntityRules: PiiStages['applyPublicEntityRules'] = (
  input: StageInput,
  findings: readonly PiiFinding[],
): readonly PiiFinding[] =>
  findings.filter((finding) => !isExplainedByStructuredChannel(finding, input.request.structured));
