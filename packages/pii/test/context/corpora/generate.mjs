/**
 * EVID-02 deliverable 10 — the stage-5/6 corpus author's tool.
 *
 * EVERY VALUE IN THIS FILE IS INVENTED (PRD §45.1 item 6, sub-PRD D22): no role, workplace, event,
 * employer, ABN or matter came from a real request. The ABN used below is `EVID-01`'s synthesised
 * mod-89-valid value, and its checksum-failing sibling is that value with one digit changed.
 *
 * Same discipline as `EVID-01`'s corpus and this ticket's `test/entity/corpora/generate.mjs`: cases
 * are authored against PRD §37.1 and §10.1, never against the code; no detector is consulted here;
 * a case is never deleted or softened to make a number go up.
 *
 * Three files come out:
 *
 * - `combination.json` — cases at/above the `COMBINATION_RULE_V1` threshold, each NAMING the
 *   dimensions expected to fire, plus near-miss cases that must produce nothing;
 * - `necessary-facts.json` — PRD §10.1's *"necessary role/duty/location facts MAY be accepted"*,
 *   every case expected to replay `ACCEPT`;
 * - `public-entity-matrix.json` — `UAT-PII-02`'s mechanical half: the same string supplied in the
 *   structured channel and only in free text, with BOTH observed outcomes recorded.
 *
 * Run with:  node packages/pii/test/context/corpora/generate.mjs
 */
import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));

const write = (name, data) =>
  writeFileSync(join(HERE, name), `${JSON.stringify(data, null, 2)}\n`, 'utf8');

// ---------------------------------------------------------------------------------------------
// combination.json
// ---------------------------------------------------------------------------------------------

const ROLE = 'ROLE_SPECIFICITY';
const SMALL = 'SMALL_WORKPLACE';
const EVENT = 'PERSONAL_EVENT';
const TIME = 'PRECISE_TIME_OR_PLACE';

let blockedCounter = 0;
const blocked = [];
function blockedCase(value, expectedDimensions, note) {
  blockedCounter += 1;
  blocked.push({
    id: `ctx-combo-b-${String(blockedCounter).padStart(2, '0')}`,
    field: 'question',
    value,
    expectedDimensions,
    note,
    synthetic: true,
  });
}

// Required (PERSONAL_EVENT) + one narrowing dimension — the threshold exactly.
blockedCase('The only night baker at the site had a stroke during the shift.', [ROLE, EVENT], 'role specificity plus a personal event');
blockedCase('Our sole drone pilot was charged with drink driving last month.', [ROLE, EVENT], 'role specificity plus a personal event');
blockedCase('The single piano tuner engaged by the site had a mental health admission.', [ROLE, EVENT], 'role specificity plus a personal event');
blockedCase('Our one saltwater crocodile keeper took stress leave after the incident.', [ROLE, EVENT], 'role specificity plus a personal event');
blockedCase('The lone avalanche forecaster suffered a heart attack on rotation.', [ROLE, EVENT], 'role specificity plus a personal event');
blockedCase('The only bagpipe instructor engaged by the site was investigated for misconduct.', [ROLE, EVENT], 'role specificity plus a personal event');
blockedCase('Our sole falconer was diagnosed with epilepsy after the incident.', [ROLE, EVENT], 'role specificity plus a personal event');
blockedCase('The only harbour pilot rostered nights disclosed a gambling problem.', [ROLE, EVENT], 'role specificity plus a personal event');
blockedCase('The single stained-glass restorer engaged this year went through IVF.', [ROLE, EVENT], 'role specificity plus a personal event');
blockedCase('Our lone night-shift mortuary technician had a workplace injury.', [ROLE, EVENT], 'role specificity plus a personal event');
blockedCase('The one third-generation cooper engaged here lost his father in April.', [ROLE, EVENT], 'role specificity plus a bereavement');
blockedCase('The only sign-writer engaged by the site had a miscarriage.', [ROLE, EVENT], 'role specificity plus a personal event');

// Required + two narrowing dimensions — above the threshold.
blockedCase('The only farrier at our three-person stable broke his leg at the party.', [ROLE, SMALL, EVENT], 'role specificity, a tiny workplace and a personal event');
blockedCase('Our sole welder in a four-person workshop declared bankruptcy.', [ROLE, SMALL, EVENT], 'role specificity, a tiny workplace and a personal event');
blockedCase('The single puppeteer in the two-person troupe filed for family violence leave.', [ROLE, SMALL, EVENT], 'role specificity, a tiny workplace and a personal event');
blockedCase('Our only interpreter on a five-person team had a stroke on shift.', [ROLE, SMALL, EVENT], 'role specificity, a tiny workplace and a personal event');
blockedCase('The only glassblower in a three-person studio was made redundant.', [ROLE, SMALL, EVENT], 'role specificity, a tiny workplace and a personal event');
blockedCase('The only beekeeper at a small business was hospitalised after an allergic reaction.', [ROLE, SMALL, EVENT], 'role specificity, a small workplace and a personal event');

// Required + narrowing + a precise time or place — the maximum this rule sees in practice.
blockedCase('The only paramedic in a two-person clinic was dismissed on 12/03/2024.', [ROLE, SMALL, EVENT, TIME], 'four dimensions, including an exact date');
blockedCase('Our sole tram driver on the heritage route disclosed a cancer diagnosis on 4 March 2024.', [ROLE, EVENT, TIME], 'role specificity, a personal event and an exact date');
blockedCase('The only cleaner at the small office was stood down on 01/02/2024.', [ROLE, SMALL, EVENT, TIME], 'four dimensions, including an exact date');
blockedCase('A packer at our three-person depot was terminated after the investigation.', [SMALL, EVENT], 'a tiny workplace plus a personal event, with NO uniqueness cue — the narrowing dimension does not have to be role specificity');

let missCounter = 0;
const nearMisses = [];
function nearMiss(value, note, prdAllowedRow) {
  missCounter += 1;
  nearMisses.push({
    id: `ctx-combo-n-${String(missCounter).padStart(2, '0')}`,
    field: 'question',
    value,
    note,
    prdAllowedRow,
    synthetic: true,
  });
}

const ROLE_ROW = 'Anonymous role, duties, qualifications and employment type';
const LOCATION_ROW = 'State/territory and non-precise work location';
const WAGE_ROW = 'Approximate wage/rate facts without identity';
const AGE_ROW = 'Age band where legally relevant';

// A personal event with NO narrowing dimension — a general role at a general workplace.
nearMiss('A cleaner at a large national retailer took personal leave last week.', 'a common role and a personal event, nothing narrowing', ROLE_ROW);
nearMiss('One of about 400 warehouse pickers was dismissed after the audit.', 'a large denominator', ROLE_ROW);
nearMiss('A part-time administrator was stood down during the shutdown.', 'employment type and a personal event', ROLE_ROW);
nearMiss('An apprentice electrician had a workplace injury on site.', 'a common role and a personal event', ROLE_ROW);
nearMiss('A storeperson under the modern award was made redundant.', 'a common role and a personal event', ROLE_ROW);

// A personal event plus an exact date only — the case that a plain threshold of two would block.
nearMiss('The dismissal took effect on 12/03/2024 after the meeting.', 'a personal event and an exact date, with nothing identity-narrowing', ROLE_ROW);
nearMiss('The stand-down was confirmed on 4 March 2024 by letter.', 'a personal event and an exact date', ROLE_ROW);
nearMiss('A worker was terminated on 01/02/2024 during the probation period.', 'a personal event and an exact date', ROLE_ROW);

// A narrowing dimension with NO personal event.
nearMiss('The only qualified first aid officer completed the refresher course.', 'role specificity with no personal event', ROLE_ROW);
nearMiss('Our three-person workshop moved onto a new enterprise agreement.', 'a tiny workplace with no personal event', ROLE_ROW);
nearMiss('The only forklift licence holder works the afternoon shift.', 'role specificity with no personal event', ROLE_ROW);
nearMiss('The sole trading entity is registered in Victoria.', 'a uniqueness cue about an entity, not a person', LOCATION_ROW);
nearMiss('Our small team of four operates two vans in regional NSW.', 'a small workplace and a state-level location', LOCATION_ROW);
nearMiss('The only site in Queensland is covered by the same agreement.', 'a uniqueness cue about a site', LOCATION_ROW);

// Ordinary questions carrying only PRD §37.1 allowed material.
nearMiss('The worker is a level 3 cleaner working ordinary hours on weekdays.', 'anonymous role and duties', ROLE_ROW);
nearMiss('The employee was paid about $28 an hour, roughly the award rate.', 'approximate wage facts', WAGE_ROW);
nearMiss('The employee is aged 30-39, which the discrimination claim relies on.', 'an age band where legally relevant', AGE_ROW);
nearMiss('Several drivers at the depot asked about the new roster pattern.', 'a group, not an individual', ROLE_ROW);
nearMiss('About 250 staff are covered by the enterprise agreement.', 'workforce scale', ROLE_ROW);
nearMiss('The employer operates in VIC, QLD and SA under one agreement.', 'multiple states', LOCATION_ROW);
nearMiss('The role requires a Certificate III and two years of experience.', 'qualifications without identity', ROLE_ROW);
nearMiss('Overtime is paid at time and a half for the first two hours.', 'a rate fact with no identity', WAGE_ROW);

write('combination.json', {
  rule: 'COMBINATION_RULE_V1',
  prdRow: 'Identifying combination of rare role + tiny workplace + personal event',
  blocked,
  nearMisses,
});

// ---------------------------------------------------------------------------------------------
// necessary-facts.json — PRD §10.1 "necessary role/duty/location facts MAY be accepted"
// ---------------------------------------------------------------------------------------------

let factCounter = 0;
const facts = [];
function fact(value, rule, note, prdAllowedRow) {
  factCounter += 1;
  facts.push({
    id: `ctx-fact-${String(factCounter).padStart(2, '0')}`,
    field: 'question',
    value,
    rule,
    note,
    prdAllowedRow,
    synthetic: true,
  });
}

fact('The worker is a level 3 cleaner engaged on a casual basis.', 'ANONYMOUS_ROLE_OR_DUTY', 'anonymous role', ROLE_ROW);
fact('Our storeperson stacks pallets and operates the forklift.', 'ANONYMOUS_ROLE_OR_DUTY', 'duties', ROLE_ROW);
fact('The employee is a part-time administrator with fixed hours.', 'ANONYMOUS_ROLE_OR_DUTY', 'role and employment type', ROLE_ROW);
fact('The employment type is casual with no guaranteed hours.', 'EMPLOYMENT_TYPE', 'employment type', ROLE_ROW);
fact('The role is full-time and ongoing under the modern award.', 'EMPLOYMENT_TYPE', 'employment type', ROLE_ROW);
fact('Labour hire workers on site are covered by the host agreement.', 'EMPLOYMENT_TYPE', 'employment type', ROLE_ROW);
fact('The role requires a Certificate III and a current licence.', 'AWARD_OR_CLASSIFICATION', 'qualifications', ROLE_ROW);
fact('The classification is level 4 under the enterprise agreement.', 'AWARD_OR_CLASSIFICATION', 'classification language', ROLE_ROW);
fact('The modern award sets the ordinary hours for the classification.', 'AWARD_OR_CLASSIFICATION', 'award language', ROLE_ROW);
fact('The worker was paid about $28 an hour, roughly the award rate.', 'APPROXIMATE_WAGE_OR_RATE', 'approximate wage facts', WAGE_ROW);
fact('Overtime is paid at time and a half for the first two hours.', 'APPROXIMATE_WAGE_OR_RATE', 'a rate fact', WAGE_ROW);
fact('The penalty rate for Sunday work is set by the award.', 'APPROXIMATE_WAGE_OR_RATE', 'a rate fact', WAGE_ROW);
fact('The work is performed in regional NSW across two depots.', 'STATE_OR_TERRITORY_LOCATION', 'a state-level location', LOCATION_ROW);
fact('The employer operates in Victoria and South Australia.', 'STATE_OR_TERRITORY_LOCATION', 'state-level locations', LOCATION_ROW);
fact('The site is around Sydney metro and the depot is near the airport.', 'STATE_OR_TERRITORY_LOCATION', 'a non-precise location', LOCATION_ROW);
fact('The employee is aged 30-39, which the discrimination claim relies on.', 'AGE_BAND', 'an age band', AGE_ROW);
fact('An age band is enough for the claim; the exact date is not needed.', 'AGE_BAND', 'an age band', AGE_ROW);

write('necessary-facts.json', {
  prdClause: 'PRD §10.1 — "necessary role/duty/location facts MAY be accepted"',
  cases: facts,
});

// ---------------------------------------------------------------------------------------------
// public-entity-matrix.json — UAT-PII-02's mechanical half
// ---------------------------------------------------------------------------------------------

/** EVID-01's synthesised mod-89-valid ABN, and the same value with one digit changed. */
const ABN_VALID = '51824753556';
const ABN_INVALID = '51824753557';

const EMPLOYER_ROW = 'Public employer name and ABN';
const CASE_ROW = 'Public case party/citation';

const matrix = [
  {
    id: 'pe-emp-01',
    channel: 'employer',
    value: 'Example Widgets Pty Ltd',
    structuredDecision: 'ACCEPT',
    freeTextDecision: 'ACCEPT',
    note: 'a plain public employer name: allowed through the channel, and the ordinary rules do not block it in free text either',
    prdAllowedRow: EMPLOYER_ROW,
    synthetic: true,
  },
  {
    id: 'pe-emp-02',
    channel: 'employer',
    value: 'Smith & Co Pty Ltd',
    structuredDecision: 'ACCEPT',
    freeTextDecision: 'ACCEPT',
    note: 'a person-shaped company name — the gazetteer keeps it out of the name rules in free text',
    prdAllowedRow: EMPLOYER_ROW,
    synthetic: true,
  },
  {
    id: 'pe-emp-03',
    channel: 'employer',
    value: 'Example Widgets Pty Ltd 0412 345 678',
    structuredDecision: 'REJECT',
    freeTextDecision: 'REJECT',
    note: 'a public employer name with a private phone number appended: the span is not the whole value, so the channel does not explain it (deliverable 5)',
    prdAllowedRow: EMPLOYER_ROW,
    synthetic: true,
  },
  {
    id: 'pe-emp-04',
    channel: 'employer',
    value: 'private.person@example.invalid',
    structuredDecision: 'REJECT',
    freeTextDecision: 'REJECT',
    note: 'a personal email pasted into the employer channel: PRIVATE_CONTACT_EMAIL is not a category this channel covers, so the whole-value match does not save it',
    prdAllowedRow: EMPLOYER_ROW,
    synthetic: true,
  },
  {
    id: 'pe-abn-01',
    channel: 'abn',
    value: ABN_VALID,
    structuredDecision: 'ACCEPT',
    freeTextDecision: 'ACCEPT',
    note: 'a checksum-valid ABN in its own channel',
    prdAllowedRow: EMPLOYER_ROW,
    synthetic: true,
  },
  {
    id: 'pe-abn-02',
    channel: 'abn',
    value: ABN_INVALID,
    structuredDecision: 'ACCEPT',
    freeTextDecision: 'ACCEPT',
    note: 'a checksum-FAILING ABN. Recorded honestly: no shipped detector fires on eleven bare digits, so the decision is ACCEPT either way — the checksum rule is what stops it being SUPPRESSED, and that is asserted at the predicate level in public-entity.test.ts, where it is not vacuous',
    prdAllowedRow: EMPLOYER_ROW,
    synthetic: true,
  },
  {
    id: 'pe-abn-03',
    channel: 'abn',
    value: 'The tax file number is 123 456 782',
    structuredDecision: 'REJECT',
    freeTextDecision: 'REJECT',
    note: 'a TFN smuggled through the ABN channel: the finding covers the digits, not the whole value, and TAX_FILE_NUMBER is only suppressible when the whole value is a valid ABN',
    prdAllowedRow: EMPLOYER_ROW,
    synthetic: true,
  },
  {
    id: 'pe-party-01',
    channel: 'publicCaseParty',
    value: 'Smith v Acme Pty Ltd [2024] FWC 123',
    structuredDecision: 'ACCEPT',
    freeTextDecision: 'ACCEPT',
    note: 'a party name accompanied by a citation-shaped reference — public material',
    prdAllowedRow: CASE_ROW,
    synthetic: true,
  },
  {
    id: 'pe-party-02',
    channel: 'publicCaseParty',
    value: 'Smith',
    structuredDecision: 'ACCEPT',
    freeTextDecision: 'ACCEPT',
    note: 'a bare party name with no citation. Recorded honestly: nothing fires on one capitalised word, so the decision is ACCEPT either way — the citation requirement is what stops it being SUPPRESSED, asserted at the predicate level',
    prdAllowedRow: CASE_ROW,
    synthetic: true,
  },
];

write('public-entity-matrix.json', { cases: matrix });

process.stdout.write(
  `wrote combination.json (${String(blocked.length)} blocked, ${String(
    nearMisses.length,
  )} near-miss), necessary-facts.json (${String(facts.length)}), public-entity-matrix.json (${String(
    matrix.length,
  )})\n`,
);
