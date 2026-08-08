/**
 * EVID-02 deliverable 10 — the person-name corpus author's tool.
 *
 * EVERY VALUE IN THIS FILE IS INVENTED (PRD §45.1 item 6, sub-PRD D22). No name, employer, phone
 * number or matter came from a real person or a real request. The construction pattern is
 * `EVID-01`'s (`test/deterministic/corpora/generate.mjs`) and is not negotiable:
 *
 * - cases are authored as (prefix, pii, suffix) triples and the expected NFC offsets are COMPUTED
 *   with `nfc.indexOf(pii.normalize('NFC'))`, because hand-counting offsets is how a corpus quietly
 *   stops meaning anything;
 * - it NEVER consults a detector: if it did, the corpus would measure the implementation against
 *   itself and every recall number would be 1 by construction;
 * - every negative quotes the PRD §37.1 ALLOWED row it comes from;
 * - a case is never deleted, and never softened, to make a number go up.
 *
 * Run with:  node packages/pii/test/entity/corpora/generate.mjs
 */
import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));

/**
 * Invented names. Deliberately mixed: Latin-script non-Anglo forms with diacritics (so NFC handling
 * is proved), and names that are also ordinary English words (Grace, Rose, Will, Summer), which are
 * the ones a naive gazetteer recogniser gets wrong.
 */
const NAMES = [
  'Marta Kowalski',
  'Ana Popović',
  'Ngô Thanh',
  'Nguyễn Anh',
  'Wiremu Tane',
  'Grace Fields',
  'Rose Harding',
  'Will Baxter',
  'Summer Nolan',
  'Priya Raman',
  'Tomas Söderberg',
];

let counter = 0;
const positives = [];

/** One authored case. `pii` must occur exactly once in `prefix + pii + suffix`. */
function positive(idPrefix, prefix, pii, suffix, note) {
  counter += 1;
  const value = `${prefix}${pii}${suffix}`;
  const nfc = value.normalize('NFC');
  const start = nfc.indexOf(pii.normalize('NFC'));
  if (start < 0) throw new Error(`authored span not found in case ${idPrefix}`);
  if (nfc.indexOf(pii.normalize('NFC'), start + 1) >= 0) {
    throw new Error(`authored span is ambiguous in case ${idPrefix}`);
  }
  positives.push({
    id: `${idPrefix}-${String(counter).padStart(2, '0')}`,
    field: 'question',
    value,
    expected: [{ start, end: start + pii.normalize('NFC').length }],
    note,
    synthetic: true,
  });
}

// --- class 1: greeting -------------------------------------------------------------------------
const GREETINGS = [
  ['Hi ', ', could you explain the Sunday penalty rate?'],
  ['Hello ', ', what notice period applies to a casual?'],
  ['Dear ', ', please advise on the redundancy consultation.'],
];
NAMES.forEach((name, index) => {
  const [prefix, suffix] = GREETINGS[index % GREETINGS.length];
  positive('name-greet', prefix, name, suffix, 'greeting context');
});

// --- class 2: employment relation --------------------------------------------------------------
const RELATIONS = [
  ['My employee ', ' asked about the public holiday penalty rate.'],
  ['The employee ', ' reports to the site supervisor on weekends.'],
  ['', ' works for us as a casual and asked about notice.'],
  ['Our worker ', ' was terminated after the second warning.'],
];
NAMES.forEach((name, index) => {
  const [prefix, suffix] = RELATIONS[index % RELATIONS.length];
  positive('name-rel', prefix, name, suffix, 'employment-relation context');
});

// --- class 3: signature / sign-off --------------------------------------------------------------
const SIGNATURES = [
  ['Please advise on the notice period. Regards, ', ''],
  ['Thanks for your help with the roster question. -- ', ''],
  ['What is the award rate for a casual? Kind regards, ', ''],
];
NAMES.forEach((name, index) => {
  const [prefix, suffix] = SIGNATURES[index % SIGNATURES.length];
  positive('name-sig', prefix, name, suffix, 'signature or sign-off context');
});

// --- class 4: adjacent to a private contact detail ----------------------------------------------
const ADJACENT = [
  ['Please call ', ' on 0412 345 678 about the shift swap.'],
  // Deliberately NOT "… at private.person@…": `EVID-01`'s email detector also matches the
  // "name at domain" obfuscation, and its span would then swallow the name.
  ['Write to ', ' via private.person@example.invalid about the roster.'],
  ['Send the roster to ', ' on 0499 887 766 before Friday.'],
];
NAMES.forEach((name, index) => {
  const [prefix, suffix] = ADJACENT[index % ADJACENT.length];
  positive('name-adj', prefix, name, suffix, 'adjacent private contact detail');
});

// --- class 5: honorific --------------------------------------------------------------------------
positive('name-hon', 'The complaint names Dr ', 'Ana Popović', ' as the treating doctor.', 'honorific');
positive('name-hon', 'The letter was signed by Ms ', 'Marta Kowalski', ' on behalf of the team.', 'honorific');
positive('name-hon', 'Mr ', 'Will Baxter', ' lodged the unfair dismissal application.', 'honorific');

// --- negatives: PRD §37.1's ALLOWED column ------------------------------------------------------
let negativeCounter = 0;
const negatives = [];
function negative(value, note, prdAllowedRow) {
  negativeCounter += 1;
  negatives.push({
    id: `name-en-${String(negativeCounter).padStart(2, '0')}`,
    field: 'question',
    value,
    note,
    prdAllowedRow,
    synthetic: true,
  });
}

const EMPLOYER_ROW = 'Public employer name and ABN';
const CASE_ROW = 'Public case party/citation';
const ROLE_ROW = 'Anonymous role, duties, qualifications and employment type';
const PLACEHOLDER_ROW = '"Employee A", "the worker", synthetic placeholders';
const LOCATION_ROW = 'State/territory and non-precise work location';
const WAGE_ROW = 'Approximate wage/rate facts without identity';

// Company names that look exactly like person names — the hardest negatives in the file.
negative('Smith & Co Pty Ltd is the employer named in the agreement.', 'a person-shaped company name', EMPLOYER_ROW);
negative('The employer is Example Widgets Pty Ltd in Geelong.', 'a public employer name', EMPLOYER_ROW);
negative('Harper Holdings Limited operates three sites under one agreement.', 'a person-shaped company name', EMPLOYER_ROW);
negative('The employee works for Example Widgets Pty Ltd on a casual basis.', 'an employment cue beside an employer name', EMPLOYER_ROW);
negative('Our worker is engaged by Fielding Partners Trust as a contractor.', 'an employment cue beside a trust name', EMPLOYER_ROW);
negative('Wilson Group Services Inc runs the depot in regional NSW.', 'a person-shaped company name', EMPLOYER_ROW);
negative('Acme Bakery Pty Ltd employs about forty staff across two sites.', 'a public employer name', EMPLOYER_ROW);
negative('Hi Example Widgets Pty Ltd, what notice applies to a casual?', 'a greeting addressed to a company', EMPLOYER_ROW);
negative('The trading name is Baxter Winery and the ABN is on the invoice.', 'a person-shaped trading name', EMPLOYER_ROW);
negative('Nolan Depot Pty Ltd is listed on the public register.', 'a person-shaped company name', EMPLOYER_ROW);

// Public case parties and citations.
negative('The matter is Smith v Example Widgets Pty Ltd [2024] FWC 123.', 'a public case party and citation', CASE_ROW);
negative('Re Application by the Australian Workers Union [2023] FWCFB 45 applies here.', 'a public case citation', CASE_ROW);
negative('See Harper v Acme Bakery Pty Ltd (2019) 268 CLR 1 for the principle.', 'a public case party in a reported citation', CASE_ROW);
negative('The Full Bench decision in Kowalski v Nolan Depot Pty Ltd [2022] FWCFB 9 is on point.', 'a public case party and citation', CASE_ROW);
negative('The decision in Baxter v Wilson Group Services Inc [2021] FWC 4567 was appealed.', 'a public case party and citation', CASE_ROW);
negative('Dear Fair Work Commission, we seek guidance on the award coverage.', 'a greeting addressed to a tribunal', CASE_ROW);
negative('The Fair Work Ombudsman published guidance on casual conversion.', 'a regulator name', CASE_ROW);
negative('Safe Work Australia issued the model code of practice this year.', 'a regulator name', CASE_ROW);
negative('The Australian Taxation Office confirmed the superannuation treatment.', 'a regulator name', CASE_ROW);
negative('The Federal Court of Australia remitted the matter to the Commission.', 'a court name', CASE_ROW);

// The PRD §37.1 placeholder forms themselves.
negative('Employee A was terminated after the second written warning.', 'the synthetic placeholder itself', PLACEHOLDER_ROW);
negative('Worker B reports to the site supervisor on weekends.', 'the synthetic placeholder itself', PLACEHOLDER_ROW);
negative('The worker asked whether the applicant may be represented.', 'roles, not names', PLACEHOLDER_ROW);
negative('Staff Member A lodged the complaint about the roster change.', 'the synthetic placeholder itself', PLACEHOLDER_ROW);
negative('The respondent employer disputes the casual classification.', 'a role, not a name', PLACEHOLDER_ROW);
negative('Person A and Person B both worked the night shift.', 'the synthetic placeholder itself', PLACEHOLDER_ROW);
negative('Regards, the worker who lodged the complaint.', 'a sign-off with no name', PLACEHOLDER_ROW);
negative('Hi there, my employee asked about the shift penalty.', 'a greeting with no name', PLACEHOLDER_ROW);

// Roles, duties, qualifications and employment type.
negative('The employee is a level 3 cleaner engaged on a casual basis.', 'anonymous role and employment type', ROLE_ROW);
negative('The role requires a Certificate III and two years of experience.', 'qualifications without identity', ROLE_ROW);
negative('Our worker was employed as a storeperson under the modern award.', 'anonymous role', ROLE_ROW);
negative('The employee works ordinary hours Monday to Friday.', 'ordinary hours, weekday names', ROLE_ROW);
negative('A part-time administrator asked about time off in lieu.', 'employment type', ROLE_ROW);
negative('The apprentice electrician is on a fixed-term contract.', 'anonymous role and employment type', ROLE_ROW);

// Locations and wages.
negative('The work is performed in regional NSW across two depots.', 'a state-level location', LOCATION_ROW);
negative('The employer operates in VIC, QLD and SA under one agreement.', 'multiple states, no street address', LOCATION_ROW);
negative('The site is around Sydney metro and the depot is near the airport.', 'a non-precise location', LOCATION_ROW);
negative('New South Wales and Western Australia have different long service rules.', 'state names', LOCATION_ROW);
negative('The worker was paid about $28 an hour, roughly the award rate.', 'approximate wage facts', WAGE_ROW);
negative('Overtime is paid at time and a half for the first two hours.', 'a rate fact with no identity', WAGE_ROW);
negative('The Christmas shutdown falls between December and January this year.', 'calendar vocabulary, not names', LOCATION_ROW);
negative('Head Office can be reached on 1300 123 456 during business hours.', 'a published business line', EMPLOYER_ROW);

const file = {
  category: 'EMPLOYEE_OR_PRIVATE_INDIVIDUAL_NAME',
  prdRow: 'Employee or private individual name',
  positives,
  negatives,
  deferred: [],
};

writeFileSync(
  join(HERE, 'entity-person-name.json'),
  `${JSON.stringify(file, null, 2)}\n`,
  'utf8',
);

process.stdout.write(
  `wrote entity-person-name.json: ${String(positives.length)} positives, ${String(
    negatives.length,
  )} negatives\n`,
);
