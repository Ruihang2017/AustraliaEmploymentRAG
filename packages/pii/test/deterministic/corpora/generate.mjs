/**
 * EVID-01 deliverable 11 — the corpus author's tool.
 *
 * EVERY VALUE IN THIS FILE IS INVENTED (PRD §45.1 item 6, sub-PRD D22). No value came from a real
 * person, a real payslip, a real card or a real customer request. The checksum-bearing numbers are
 * SYNTHESISED here by searching for the smallest value above a fixed seed that satisfies the
 * published algorithm, so they are valid-shaped and meaningless.
 *
 * WHAT THIS TOOL DOES, AND WHAT IT DELIBERATELY DOES NOT DO. It takes authored
 * (prefix, pii, suffix) triples and writes the corpus JSON with the expected NFC offsets COMPUTED —
 * `nfc.indexOf(pii.normalize('NFC'))` — because hand-counting three hundred character offsets is how
 * a corpus quietly stops meaning anything. It NEVER consults a detector: if it did, the corpus would
 * measure the implementation against itself and every recall number in the report would be 1 by
 * construction. A case that the detectors miss is a red test, not a corpus edit.
 *
 * Run with:  node packages/pii/test/deterministic/corpora/generate.mjs
 * The committed JSON is the artifact; this file is how it was produced and how to extend it.
 */
import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));

// ---------------------------------------------------------------------------------------------
// Synthetic checksum-valid values
// ---------------------------------------------------------------------------------------------

const tfnValid = (d) => {
  const w = [1, 4, 3, 7, 5, 8, 6, 9, 10];
  let sum = 0;
  for (let i = 0; i < 9; i += 1) sum += Number(d[i]) * w[i];
  return sum % 11 === 0;
};

const medicareValid = (d) => {
  if (Number(d[0]) < 2 || Number(d[0]) > 6) return false;
  const w = [1, 3, 7, 9, 1, 3, 7, 9];
  let sum = 0;
  for (let i = 0; i < 8; i += 1) sum += Number(d[i]) * w[i];
  if (sum % 10 !== Number(d[8])) return false;
  // Digits after the check digit are the issue number, which is 1-9 on a real card.
  for (let i = 9; i < d.length; i += 1) {
    if (Number(d[i]) < 1 || Number(d[i]) > 9) return false;
  }
  return true;
};

const luhnValid = (d) => {
  let sum = 0;
  let double = false;
  for (let i = d.length - 1; i >= 0; i -= 1) {
    let digit = Number(d[i]);
    if (double) {
      digit *= 2;
      if (digit > 9) digit -= 9;
    }
    sum += digit;
    double = !double;
  }
  return sum % 10 === 0;
};

const abnValid = (d) => {
  const w = [10, 1, 3, 5, 7, 9, 11, 13, 15, 17, 19];
  let sum = (Number(d[0]) - 1) * 10;
  for (let i = 1; i < 11; i += 1) sum += Number(d[i]) * w[i];
  return sum % 89 === 0;
};

/** The `count` smallest `length`-digit values at or above `seed` that satisfy `isValid`. */
function synthesise(seed, length, count, isValid) {
  const found = [];
  let value = seed;
  while (found.length < count) {
    const digits = String(value).padStart(length, '0');
    if (digits.length === length && isValid(digits)) found.push(digits);
    value += 1;
  }
  return found;
}

const TFNS = synthesise(123456780, 9, 5, tfnValid);
const MEDICARES = synthesise(2123456700, 10, 5, medicareValid);
const CARDS = synthesise(4111111111111100, 16, 5, luhnValid);
const ABNS = synthesise(51824753550, 11, 3, abnValid);

// ---------------------------------------------------------------------------------------------
// Evasion transforms (deliverable 7: "resistant to the obvious evasions")
// ---------------------------------------------------------------------------------------------

const ZWSP = String.fromCodePoint(0x200b);
const ZWJ = String.fromCodePoint(0x200d);
const SOFT_HYPHEN = String.fromCodePoint(0x00ad);
const FULLWIDTH_AT = String.fromCodePoint(0xff20);

const fullwidthDigits = (text) =>
  text.replace(/\d/g, (digit) => String.fromCodePoint(0xff10 + Number(digit)));

const group = (digits, sizes, separator) => {
  let out = '';
  let at = 0;
  for (const size of sizes) {
    if (at > 0) out += separator;
    out += digits.slice(at, at + size);
    at += size;
  }
  return out + digits.slice(at);
};

const insertMid = (text, marker) => {
  const at = Math.floor(text.length / 2);
  return text.slice(0, at) + marker + text.slice(at);
};

// ---------------------------------------------------------------------------------------------
// Authoring helpers
// ---------------------------------------------------------------------------------------------

function positive(category, id, prefix, pii, suffix, note) {
  const value = `${prefix}${pii}${suffix}`;
  const nfc = value.normalize('NFC');
  const target = pii.normalize('NFC');
  const start = nfc.indexOf(target);
  if (start < 0) throw new Error(`${id}: the pii text is not present in the case value`);
  return {
    id,
    field: 'question',
    value,
    expected: [{ start, end: start + target.length }],
    note,
    synthetic: true,
  };
}

/** A case whose finding spans the whole field (payslip extracts, limit violations). */
function wholeField(id, field, value, note) {
  return {
    id,
    field,
    value,
    expected: [{ start: 0, end: value.normalize('NFC').length }],
    note,
    synthetic: true,
  };
}

function negative(id, value, note, prdAllowedRow, field = 'question') {
  return { id, field, value, note, prdAllowedRow, synthetic: true };
}

function file(category, prdRow, cases, negatives, deferred = []) {
  return { category, prdRow, positives: cases, negatives, deferred };
}

// ---------------------------------------------------------------------------------------------
// TAX_FILE_NUMBER
// ---------------------------------------------------------------------------------------------

const TFN_ROW = 'TFN, bank/card details, Medicare/passport/licence number';

const tfnCases = [];
TFNS.forEach((tfn, index) => {
  const variants = [
    [tfn, 'plain, checksum-valid'],
    [group(tfn, [3, 3, 3], ' '), 'space-separated groups'],
    [group(tfn, [3, 3, 3], '-'), 'hyphen-separated groups'],
    [fullwidthDigits(tfn), 'full-width digits'],
  ];
  variants.forEach(([pii, note], variant) => {
    tfnCases.push(
      positive(
        'TAX_FILE_NUMBER',
        `tfn-p-${String(index * 4 + variant + 1).padStart(2, '0')}`,
        'The worker gave me their tax file number ',
        pii,
        ' when they started, is that a problem?',
        note,
      ),
    );
  });
});
tfnCases.push(
  positive(
    'TAX_FILE_NUMBER',
    'tfn-p-21',
    'TFN on file: ',
    insertMid(TFNS[0], ZWSP),
    ' — should I keep it?',
    'zero-width space inside the number',
  ),
  positive(
    'TAX_FILE_NUMBER',
    'tfn-p-22',
    'Their tax file no is ',
    insertMid(TFNS[1], SOFT_HYPHEN),
    ', can we store it?',
    'soft hyphen inside the number',
  ),
  positive(
    'TAX_FILE_NUMBER',
    'tfn-p-23',
    'tfn ',
    '123456780',
    ' was written on the form',
    'checksum-INVALID number in an explicit TFN context (deliverable 7 row 1)',
  ),
  positive(
    'TAX_FILE_NUMBER',
    'tfn-p-24',
    'Tax File Number: ',
    group('123456780', [3, 3, 3], ' '),
    ' — from the paper form',
    'checksum-invalid, spaced, in context',
  ),
);

const tfnNegatives = [
  negative(
    'tfn-n-01',
    'Our invoice reference 123456781 covers the overtime period.',
    'nine-digit invoice reference that fails the mod-11 check',
    'Approximate wage/rate facts without identity',
  ),
  negative(
    'tfn-n-02',
    'The award clause numbers are 12, 13 and 21.4 for overtime.',
    'short numbers cannot form a nine-digit run',
    'Anonymous role, duties, qualifications and employment type',
  ),
  negative(
    'tfn-n-03',
    'Annual turnover was 123456781 cents last financial year.',
    'checksum-invalid nine-digit financial figure',
    'Approximate wage/rate facts without identity',
  ),
  negative(
    'tfn-n-04',
    'The matter number is 20240001 in the Commission file.',
    'eight-digit matter number with no TFN context',
    'Public case party/citation',
  ),
  negative(
    'tfn-n-05',
    'Ten employees each worked 1234567812 minutes in total this year.',
    'ten-digit run: maximality means it is never read as a nine-digit TFN',
    'Approximate wage/rate facts without identity',
  ),
];

// ---------------------------------------------------------------------------------------------
// MEDICARE_NUMBER
// ---------------------------------------------------------------------------------------------

const medicareCases = [];
MEDICARES.forEach((number, index) => {
  const variants = [
    [number, 'plain, valid check digit'],
    [group(number, [4, 5], ' '), 'space-separated groups'],
    [group(number, [4, 5], '-'), 'hyphen-separated groups'],
    [fullwidthDigits(number), 'full-width digits'],
  ];
  variants.forEach(([pii, note], variant) => {
    medicareCases.push(
      positive(
        'MEDICARE_NUMBER',
        `medicare-p-${String(index * 4 + variant + 1).padStart(2, '0')}`,
        'They emailed me a scan showing ',
        pii,
        ' for the workers compensation claim.',
        note,
      ),
    );
  });
});
medicareCases.push(
  positive(
    'MEDICARE_NUMBER',
    'medicare-p-21',
    'Medicare card ',
    insertMid(MEDICARES[0], ZWSP),
    ' was attached to the form.',
    'zero-width space inside the number',
  ),
  positive(
    'MEDICARE_NUMBER',
    'medicare-p-22',
    'The claim form lists ',
    insertMid(MEDICARES[1], ZWJ),
    ' as the card number.',
    'zero-width joiner inside the number',
  ),
);

const medicareNegatives = [
  negative(
    'medicare-n-01',
    'The roster covers 1234567890 minutes across the quarter.',
    'ten-digit run failing the Medicare check digit and the leading-digit rule',
    'Approximate wage/rate facts without identity',
  ),
  negative(
    'medicare-n-02',
    'Our purchase order 7123456789 was raised for the training.',
    'ten-digit run with a leading digit outside 2-6',
    'Anonymous role, duties, qualifications and employment type',
  ),
  negative(
    'medicare-n-03',
    'The enterprise agreement code is AG2024/123 in the register.',
    'no ten or eleven digit run at all',
    'Public case party/citation',
  ),
  negative(
    'medicare-n-04',
    'Payroll processed 2123456701234 cents in allowances.',
    'thirteen-digit run: maximality prevents a ten-digit prefix match',
    'Approximate wage/rate facts without identity',
  ),
  negative(
    'medicare-n-05',
    'The site employs about 30 people across two shifts.',
    'ordinary workforce facts with no card number',
    'Anonymous role, duties, qualifications and employment type',
  ),
];

// ---------------------------------------------------------------------------------------------
// BANK_OR_CARD_DETAIL
// ---------------------------------------------------------------------------------------------

const bankCases = [];
CARDS.forEach((card, index) => {
  const variants = [
    [card, 'plain, Luhn-valid'],
    [group(card, [4, 4, 4, 4], ' '), 'space-separated groups'],
    [group(card, [4, 4, 4, 4], '-'), 'hyphen-separated groups'],
  ];
  variants.forEach(([pii, note], variant) => {
    bankCases.push(
      positive(
        'BANK_OR_CARD_DETAIL',
        `bank-p-${String(index * 3 + variant + 1).padStart(2, '0')}`,
        'The reimbursement was made to card ',
        pii,
        ' which the employee gave me.',
        note,
      ),
    );
  });
});
bankCases.push(
  positive(
    'BANK_OR_CARD_DETAIL',
    'bank-p-16',
    'Payroll pays into ',
    '062-000 12345678',
    ' every fortnight.',
    'BSB adjacent to an account number',
  ),
  positive(
    'BANK_OR_CARD_DETAIL',
    'bank-p-17',
    'Their nominated account is ',
    '083 004 987654321',
    ' for wages.',
    'space-separated BSB adjacent to an account number',
  ),
  positive(
    'BANK_OR_CARD_DETAIL',
    'bank-p-18',
    'Wages go to BSB ',
    '013-006 acct 45678901',
    ' each pay run.',
    'BSB and account separated by a label word',
  ),
  positive(
    'BANK_OR_CARD_DETAIL',
    'bank-p-19',
    'The card on file is ',
    fullwidthDigits(CARDS[0]),
    ' for expenses.',
    'full-width digits',
  ),
  positive(
    'BANK_OR_CARD_DETAIL',
    'bank-p-20',
    'Card ',
    insertMid(CARDS[1], ZWSP),
    ' was used for the tools.',
    'zero-width space inside the card number',
  ),
);

const bankNegatives = [
  negative(
    'bank-n-01',
    'Our payroll runs through BSB 062-000 with the bank.',
    'a lone BSB identifies a branch, not a person',
    'Approximate wage/rate facts without identity',
  ),
  negative(
    'bank-n-02',
    'Reference 4111111111111112 was quoted on the remittance.',
    'sixteen-digit reference that fails Luhn',
    'Approximate wage/rate facts without identity',
  ),
  negative(
    'bank-n-03',
    'The employee is paid $1,250 gross per fortnight.',
    'approximate wage facts with no account details',
    'Approximate wage/rate facts without identity',
  ),
  negative(
    'bank-n-04',
    'Invoice 900000000000002 remains unpaid after 30 days.',
    'fifteen-digit invoice number failing Luhn',
    'Approximate wage/rate facts without identity',
  ),
  negative(
    'bank-n-05',
    'Superannuation is paid quarterly to the default fund.',
    'no numbers at all',
    'Anonymous role, duties, qualifications and employment type',
  ),
];

// ---------------------------------------------------------------------------------------------
// PRIVATE_CONTACT_EMAIL
// ---------------------------------------------------------------------------------------------

const EMAILS = [
  'jane.doe@example.invalid',
  'quiet.worker@mailbox.invalid',
  'sam_oconnor@homemail.invalid',
  'r.patel99@personalmail.invalid',
  'k.nguyen@privatehost.invalid',
];

const emailCases = [];
EMAILS.forEach((email, index) => {
  const [local, domain] = email.split('@');
  const variants = [
    [email, 'plain address'],
    [`${local} @ ${domain}`, 'spaces around the @'],
    [`${local}(at)${domain.split('.').join('(dot)')}`, '(at)/(dot) obfuscation'],
    [`${local}${FULLWIDTH_AT}${domain}`, 'full-width commercial at'],
  ];
  variants.forEach(([pii, note], variant) => {
    emailCases.push(
      positive(
        'PRIVATE_CONTACT_EMAIL',
        `email-p-${String(index * 4 + variant + 1).padStart(2, '0')}`,
        'They asked me to write to ',
        pii,
        ' about the roster change.',
        note,
      ),
    );
  });
});
emailCases.push(
  positive(
    'PRIVATE_CONTACT_EMAIL',
    'email-p-21',
    'Contact ',
    insertMid(EMAILS[0], ZWSP),
    ' for the payslip.',
    'zero-width space inside the address',
  ),
  positive(
    'PRIVATE_CONTACT_EMAIL',
    'email-p-22',
    'Write to ',
    'jane.doe [at] example [dot] invalid',
    ' if you need the roster.',
    '[at]/[dot] obfuscation',
  ),
);

const emailNegatives = [
  negative(
    'email-n-01',
    'The award is published on fairwork.gov.au for anyone to read.',
    'a bare domain is not an address',
    'Public case party/citation',
  ),
  negative(
    'email-n-02',
    'We employ about 40 people at the Geelong site.',
    'no address of any kind',
    'State/territory and non-precise work location',
  ),
  negative(
    'email-n-03',
    'The decision is at https://www.fwc.gov.au/documents/decisionssigned.htm today.',
    'a public URL with no @ equivalent',
    'Public case party/citation',
  ),
  negative(
    'email-n-04',
    'The category of the role is cleaner, level 2 under the award.',
    'the word "category" contains "at" but no address shape',
    'Anonymous role, duties, qualifications and employment type',
  ),
  negative(
    'email-n-05',
    'Our HR inbox is monitored during business hours only.',
    'a reference to an inbox with no address',
    'Anonymous role, duties, qualifications and employment type',
  ),
];

// ---------------------------------------------------------------------------------------------
// PRIVATE_CONTACT_PHONE
// ---------------------------------------------------------------------------------------------

const MOBILES = ['0412345678', '0423987654', '0455112233', '0466778899', '0477334455'];

const phoneCases = [];
MOBILES.forEach((mobile, index) => {
  const variants = [
    [mobile, 'plain mobile'],
    [group(mobile, [4, 3, 3], ' '), 'space-separated mobile'],
    [group(mobile, [4, 3, 3], '-'), 'hyphen-separated mobile'],
    [`+61 ${mobile.slice(1, 4)} ${mobile.slice(4, 7)} ${mobile.slice(7)}`, '+61 international form'],
  ];
  variants.forEach(([pii, note], variant) => {
    phoneCases.push(
      positive(
        'PRIVATE_CONTACT_PHONE',
        `phone-p-${String(index * 4 + variant + 1).padStart(2, '0')}`,
        'They said to call them on ',
        pii,
        ' after the shift.',
        note,
      ),
    );
  });
});
phoneCases.push(
  positive(
    'PRIVATE_CONTACT_PHONE',
    'phone-p-21',
    'Their home number is ',
    '(02) 9876 5432',
    ' if that matters.',
    'parenthesised landline',
  ),
  positive(
    'PRIVATE_CONTACT_PHONE',
    'phone-p-22',
    'Ring ',
    fullwidthDigits('0412345678'),
    ' to confirm the roster.',
    'full-width digits',
  ),
);

const phoneNegatives = [
  negative(
    'phone-n-01',
    'The Fair Work Infoline is 13 13 94 for general advice.',
    'a published 13 business line is not private contact detail',
    'Public case party/citation',
  ),
  negative(
    'phone-n-02',
    'Call the head office on 1300 123 456 during business hours.',
    'a published 1300 business line',
    'Public employer name and ABN',
  ),
  negative(
    'phone-n-03',
    'The union hotline is 1800 555 000 for members.',
    'a published 1800 business line',
    'Public case party/citation',
  ),
  negative(
    'phone-n-04',
    'The shift runs 0600 to 1400 on weekdays.',
    'times, not phone numbers',
    'Anonymous role, duties, qualifications and employment type',
  ),
  negative(
    'phone-n-05',
    'About 250 000 workers are covered by the award nationally.',
    'a population figure, not a number to call',
    'Approximate wage/rate facts without identity',
  ),
];

// ---------------------------------------------------------------------------------------------
// PRIVATE_SOCIAL_IDENTIFIER
// ---------------------------------------------------------------------------------------------

const HANDLES = ['@quiet_worker_91', '@j.doe.melb', '@nightshift_sam', '@rp_patel', '@kn_worker'];
const PROFILES = [
  'linkedin.com/in/jane-doe-91',
  'facebook.com/quiet.worker.91',
  'instagram.com/nightshift_sam',
  'x.com/rp_patel',
  't.me/kn_worker',
];

const socialCases = [];
HANDLES.forEach((handle, index) => {
  socialCases.push(
    positive(
      'PRIVATE_SOCIAL_IDENTIFIER',
      `social-p-${String(index * 2 + 1).padStart(2, '0')}`,
      'They posted about the roster from ',
      handle,
      ' last night.',
      'plain handle',
    ),
    positive(
      'PRIVATE_SOCIAL_IDENTIFIER',
      `social-p-${String(index * 2 + 2).padStart(2, '0')}`,
      'The account is ',
      `${FULLWIDTH_AT}${handle.slice(1)}`,
      ' according to the complaint.',
      'full-width commercial at',
    ),
  );
});
PROFILES.forEach((profile, index) => {
  socialCases.push(
    positive(
      'PRIVATE_SOCIAL_IDENTIFIER',
      `social-p-${String(11 + index * 2).padStart(2, '0')}`,
      'Their profile is ',
      profile,
      ' if you need to check.',
      'profile URL without a scheme',
    ),
    positive(
      'PRIVATE_SOCIAL_IDENTIFIER',
      `social-p-${String(12 + index * 2).padStart(2, '0')}`,
      'See ',
      `https://www.${profile}`,
      ' for the post in question.',
      'profile URL with scheme and www',
    ),
  );
});

const socialNegatives = [
  negative(
    'social-n-01',
    'The company page is linkedin.com/company/example-widgets for anyone to see.',
    'a company page is public business information',
    'Public employer name and ABN',
  ),
  negative(
    'social-n-02',
    'The decision is published at fwc.gov.au/decisions for the public.',
    'a public institutional URL',
    'Public case party/citation',
  ),
  negative(
    'social-n-03',
    'Staff were told about the change at the team meeting.',
    'no identifier of any kind',
    'Anonymous role, duties, qualifications and employment type',
  ),
  negative(
    'social-n-04',
    'The employer trades as Example Widgets Pty Ltd in Victoria.',
    'a public employer name',
    'Public employer name and ABN',
  ),
  negative(
    'social-n-05',
    'We advertised the role on a jobs board in March.',
    'a hiring fact with no handle',
    'Anonymous role, duties, qualifications and employment type',
  ),
];

// ---------------------------------------------------------------------------------------------
// EMPLOYEE_OR_PRIVATE_INDIVIDUAL_NAME
// ---------------------------------------------------------------------------------------------

const NAMES = ['Jane Doe', 'Samuel O-Connor', 'Rina Patel', 'Kim Nguyen', 'Alex Fairweather'];
const NAME_LABELS = [
  ['The employee name: ', 'employee name label'],
  ['My name is ', 'first-person label'],
  ["The worker's name is ", 'possessive worker label'],
  ['Full name: ', 'full name label'],
];

const nameCases = [];
NAMES.forEach((name, index) => {
  NAME_LABELS.forEach(([label, note], variant) => {
    nameCases.push(
      positive(
        'EMPLOYEE_OR_PRIVATE_INDIVIDUAL_NAME',
        `name-p-${String(index * 4 + variant + 1).padStart(2, '0')}`,
        label,
        name,
        ' and the dismissal was in March.',
        note,
      ),
    );
  });
});
nameCases.push(
  positive(
    'EMPLOYEE_OR_PRIVATE_INDIVIDUAL_NAME',
    'name-p-21',
    'Name of the employee: ',
    insertMid('Jane Doe', ZWSP),
    ' as recorded on the file.',
    'zero-width space inside the name',
  ),
  positive(
    'EMPLOYEE_OR_PRIVATE_INDIVIDUAL_NAME',
    'name-p-22',
    "The client's name is ",
    'Rina Patel',
    ' and she lodged the claim.',
    'client label',
  ),
);

const nameNegatives = [
  negative(
    'name-n-01',
    'Employee A was rostered on the night shift for six months.',
    'the PRD §37.1 synthetic placeholder itself',
    '"Employee A", "the worker", synthetic placeholders',
  ),
  negative(
    'name-n-02',
    'The employer name is Example Widgets Pty Ltd in Geelong.',
    'a public employer name uses a different label and is allowed',
    'Public employer name and ABN',
  ),
  negative(
    'name-n-03',
    'The worker was employed as a level 3 cleaner for two years.',
    'an anonymous role description',
    'Anonymous role, duties, qualifications and employment type',
  ),
  negative(
    'name-n-04',
    'The matter is Smith v Example Widgets Pty Ltd [2024] FWC 123.',
    'a public case party in a citation',
    'Public case party/citation',
  ),
  negative(
    'name-n-05',
    'The applicant was represented at the conciliation conference.',
    'a role, not a name',
    '"Employee A", "the worker", synthetic placeholders',
  ),
];

// ---------------------------------------------------------------------------------------------
// HOME_ADDRESS_OR_PRECISE_LOCATION
// ---------------------------------------------------------------------------------------------

const ADDRESSES = [
  '12 Wattle Street, Northbridge NSW 2063',
  'Unit 4/18 Bunya Road, Kew VIC 3101',
  '7A Kookaburra Crescent, Redland QLD 4165',
  '221 Marlin Parade, Semaphore SA 5019',
  '9 Karri Court, Bunbury WA 6230',
];

const addressCases = [];
ADDRESSES.forEach((address, index) => {
  const variants = [
    [address, 'plain postcode-anchored address'],
    [fullwidthDigits(address), 'full-width digits'],
    [insertMid(address, ZWSP), 'zero-width space inside the address'],
    [address.split(', ').join(' '), 'comma removed'],
  ];
  variants.forEach(([pii, note], variant) => {
    addressCases.push(
      positive(
        'HOME_ADDRESS_OR_PRECISE_LOCATION',
        `address-p-${String(index * 4 + variant + 1).padStart(2, '0')}`,
        'They live at ',
        pii,
        ' and travel to the site daily.',
        note,
      ),
    );
  });
});

const addressNegatives = [
  negative(
    'address-n-01',
    'The site is in regional NSW, about an hour from the depot.',
    'a state-level location is allowed',
    'State/territory and non-precise work location',
  ),
  negative(
    'address-n-02',
    'Most of the crew work across Sydney metro on rotation.',
    'a non-precise work location',
    'State/territory and non-precise work location',
  ),
  negative(
    'address-n-03',
    'The employer runs three warehouses in Victoria.',
    'a state reference with no street or postcode',
    'State/territory and non-precise work location',
  ),
  negative(
    'address-n-04',
    'The hearing was listed in the Brisbane registry in May.',
    'a public venue, not a home address',
    'Public case party/citation',
  ),
  negative(
    'address-n-05',
    'The depot is 12 kilometres from the QLD border.',
    'a distance and a state, with no street type or postcode',
    'State/territory and non-precise work location',
  ),
];

// ---------------------------------------------------------------------------------------------
// PASSPORT_NUMBER
// ---------------------------------------------------------------------------------------------

const PASSPORTS = ['PA1234567', 'PB2345678', 'PC3456789', 'PD4567890', 'PE5678901'];

const passportCases = [];
PASSPORTS.forEach((passport, index) => {
  const variants = [
    [passport, 'two-letter prefix, fires without context'],
    [fullwidthDigits(passport), 'full-width digits'],
    [insertMid(passport, ZWSP), 'zero-width space inside the number'],
  ];
  variants.forEach(([pii, note], variant) => {
    passportCases.push(
      positive(
        'PASSPORT_NUMBER',
        `passport-p-${String(index * 3 + variant + 1).padStart(2, '0')}`,
        'They sent a photo of the document showing ',
        pii,
        ' for the visa check.',
        note,
      ),
    );
  });
});
['N1234567', 'N2345678', 'E3456789', 'E4567890', 'M5678901'].forEach((passport, index) => {
  passportCases.push(
    positive(
      'PASSPORT_NUMBER',
      `passport-p-${String(16 + index).padStart(2, '0')}`,
      'Their passport number is ',
      passport,
      ' as shown on the visa record.',
      'one-letter prefix, requires an explicit passport context',
    ),
  );
});

const passportNegatives = [
  negative(
    'passport-n-01',
    'The reference N1234567 appears on the purchase order.',
    'a one-letter reference with no passport context',
    'Anonymous role, duties, qualifications and employment type',
  ),
  negative(
    'passport-n-02',
    'The worker holds a subclass 482 visa for the role.',
    'a visa class is not a passport number',
    'Anonymous role, duties, qualifications and employment type',
  ),
  negative(
    'passport-n-03',
    'Documents were checked at induction as the policy requires.',
    'a process description with no number',
    'Anonymous role, duties, qualifications and employment type',
  ),
  negative(
    'passport-n-04',
    'The decision reference is [2024] FWC 1234 in the register.',
    'a citation, not a travel document',
    'Public case party/citation',
  ),
  negative(
    'passport-n-05',
    'Their qualification certificate number is 12345 from TAFE.',
    'a five-digit certificate number',
    'Anonymous role, duties, qualifications and employment type',
  ),
];

// ---------------------------------------------------------------------------------------------
// DRIVER_LICENCE_NUMBER
// ---------------------------------------------------------------------------------------------

const LICENCE_CONTEXTS = [
  ['Their driver licence number is ', 'driver licence context'],
  ['Licence no: ', 'licence no label'],
  ['The licence is ', 'licence context'],
  ['Drivers licence ', 'drivers licence context'],
];
const LICENCES = ['12345678', '9876543', '456789', 'S123456', '1234AB'];

const licenceCases = [];
LICENCES.forEach((licence, index) => {
  LICENCE_CONTEXTS.forEach(([prefix, note], variant) => {
    licenceCases.push(
      positive(
        'DRIVER_LICENCE_NUMBER',
        `licence-p-${String(index * 4 + variant + 1).padStart(2, '0')}`,
        prefix,
        licence,
        ' and it is current.',
        note,
      ),
    );
  });
});

const licenceNegatives = [
  negative(
    'licence-n-01',
    'The truck fleet has 12345678 kilometres logged this year.',
    'an eight-digit figure with no licence context',
    'Approximate wage/rate facts without identity',
  ),
  negative(
    'licence-n-02',
    'The role requires a current HR licence class for the truck.',
    'a licence CLASS identifies no person',
    'Anonymous role, duties, qualifications and employment type',
  ),
  negative(
    'licence-n-03',
    'Our contractor number is 456789 in the supplier system.',
    'a six-digit contractor number with no licence context',
    'Approximate wage/rate facts without identity',
  ),
  negative(
    'licence-n-04',
    'Vehicle inspections were completed for all 12 vehicles.',
    'no long numbers at all',
    'Anonymous role, duties, qualifications and employment type',
  ),
  negative(
    'licence-n-05',
    'The award covers drivers of vehicles over 4.5 tonnes.',
    'a licence-adjacent topic with no number',
    'Anonymous role, duties, qualifications and employment type',
  ),
];

// ---------------------------------------------------------------------------------------------
// EXACT_DATE_OF_BIRTH
// ---------------------------------------------------------------------------------------------

const DOB_CONTEXTS = [
  ['The employee was born on ', 'born context'],
  ['DOB ', 'DOB label'],
  ['Their date of birth is ', 'date of birth label'],
  ['Birthdate: ', 'birthdate label'],
];
const DOBS = [
  ['12/03/1990', 'dd/mm/yyyy'],
  ['1990-03-12', 'yyyy-mm-dd'],
  ['12 March 1990', 'd Month yyyy'],
  ['March 12, 1990', 'Month d, yyyy'],
  ['05-11-1984', 'dd-mm-yyyy'],
];

const dobCases = [];
DOBS.forEach(([date, dateNote], index) => {
  DOB_CONTEXTS.forEach(([prefix, contextNote], variant) => {
    dobCases.push(
      positive(
        'EXACT_DATE_OF_BIRTH',
        `dob-p-${String(index * 4 + variant + 1).padStart(2, '0')}`,
        prefix,
        date,
        ' according to the personnel file.',
        `${dateNote}, ${contextNote}`,
      ),
    );
  });
});

const dobNegatives = [
  negative(
    'dob-n-01',
    'The employee is aged 30-39 which is relevant to the claim.',
    'an age band is explicitly allowed',
    'Age band where legally relevant',
  ),
  negative(
    'dob-n-02',
    'She is in her 40s and has worked here for a decade.',
    'an approximate age',
    'Age band where legally relevant',
  ),
  negative(
    'dob-n-03',
    'The dismissal took effect on 12/03/2024 after the meeting.',
    'a dismissal date is not a birth date',
    'Anonymous role, duties, qualifications and employment type',
  ),
  negative(
    'dob-n-04',
    'The award commenced on 1 January 2010 for this industry.',
    'an instrument commencement date',
    'Public case party/citation',
  ),
  negative(
    'dob-n-05',
    'Workers over 55 are covered by the transition provisions.',
    'an age threshold, not a birth date',
    'Age band where legally relevant',
  ),
];

// ---------------------------------------------------------------------------------------------
// EMPLOYEE_OR_PAYROLL_IDENTIFIER
// ---------------------------------------------------------------------------------------------

const ID_LABELS = [
  ['Employee no ', 'employee no label'],
  ['Payroll id: ', 'payroll id label'],
  ['Staff number = ', 'staff number label'],
  ['Emp # ', 'emp hash label'],
];
const IDENTIFIERS = ['12345', 'E-90210', 'AB1234', '778899', 'P-4455'];

const idCases = [];
IDENTIFIERS.forEach((identifier, index) => {
  ID_LABELS.forEach(([prefix, note], variant) => {
    idCases.push(
      positive(
        'EMPLOYEE_OR_PAYROLL_IDENTIFIER',
        `empid-p-${String(index * 4 + variant + 1).padStart(2, '0')}`,
        prefix,
        identifier,
        ' is the one on the roster.',
        note,
      ),
    );
  });
});

const idNegatives = [
  negative(
    'empid-n-01',
    'The employee worked 12345 minutes of overtime this quarter.',
    'a number after "employee" with no identifier label',
    'Approximate wage/rate facts without identity',
  ),
  negative(
    'empid-n-02',
    'We employ 250 staff across three states.',
    'a headcount, not an identifier',
    'Anonymous role, duties, qualifications and employment type',
  ),
  negative(
    'empid-n-03',
    'Clause 15.3 of the award covers the overtime rate.',
    'a clause reference',
    'Anonymous role, duties, qualifications and employment type',
  ),
  negative(
    'empid-n-04',
    'The payroll system was upgraded in March last year.',
    'the word payroll with no identifier',
    'Anonymous role, duties, qualifications and employment type',
  ),
  negative(
    'empid-n-05',
    'Staff turnover was about 12 per cent last year.',
    'a percentage, not an identifier',
    'Approximate wage/rate facts without identity',
  ),
];

// ---------------------------------------------------------------------------------------------
// PAYSLIP_OR_PERSONNEL_EXTRACT
// ---------------------------------------------------------------------------------------------

const payslipCases = [];
for (let index = 0; index < 20; index += 1) {
  const gross = 1200 + index * 37;
  const net = gross - 260;
  const superAmount = 130 + index;
  const body =
    index % 2 === 0
      ? `Pay period 01/07 to 14/07\nGross ${String(gross)}.00\nNet pay $${String(net)}.00\nYTD $${String(gross * 12)}.00\nSuperannuation $${String(superAmount)}.00\nTax withheld $260.00\nEmployee no ${String(10000 + index)}`
      : `PAYSLIP EXTRACT\nOrdinary hours 76\nGross $${String(gross)}.00\nAllowances $45.00\nTax withheld $${String(260 + index)}.00\nLeave balance 38.5 hours\nYear to date $${String(gross * 10)}.00`;
  payslipCases.push(
    wholeField(
      `payslip-p-${String(index + 1).padStart(2, '0')}`,
      'question',
      body,
      index % 2 === 0
        ? 'pasted payslip with an employee identifier'
        : 'pasted payslip with multiple currency amounts',
    ),
  );
}

const payslipNegatives = [
  negative(
    'payslip-n-01',
    'The employee is paid about $1,200 gross per fortnight.',
    'one payslip marker in prose is an approximate wage fact',
    'Approximate wage/rate facts without identity',
  ),
  negative(
    'payslip-n-02',
    'Superannuation is paid quarterly under the guarantee.',
    'a single marker with no structure',
    'Anonymous role, duties, qualifications and employment type',
  ),
  negative(
    'payslip-n-03',
    'Does tax withheld from an allowance change the overtime base rate?',
    'two markers in a genuine legal question',
    'Approximate wage/rate facts without identity',
  ),
  negative(
    'payslip-n-04',
    'The award sets ordinary hours at 38 per week.',
    'an award fact using a payslip word',
    'Anonymous role, duties, qualifications and employment type',
  ),
  negative(
    'payslip-n-05',
    'Leave balances are shown to staff in the portal each month.',
    'a process description',
    'Anonymous role, duties, qualifications and employment type',
  ),
];

// ---------------------------------------------------------------------------------------------
// IDENTIFYING_COMBINATION — deferred to EVID-02 (see report.ts and the ticket amendment)
// ---------------------------------------------------------------------------------------------

const COMBINATIONS = [
  'The only night-shift farrier at our three-person stable broke his leg at the Christmas party.',
  'Our sole female welder in a four-person workshop miscarried during the shutdown.',
  'The single apprentice glassblower at the studio came out to the team last month.',
  'The one remote-site paramedic in a two-person clinic went through a divorce in June.',
  'Our only Auslan interpreter on a five-person team had a stroke on shift.',
  'The lone night baker at the village bakery declared bankruptcy in March.',
  'Our sole drone pilot in a three-person survey crew was charged with drink driving.',
  'The only tram driver on the heritage line disclosed a cancer diagnosis.',
  'The single piano tuner employed by the school had a mental health admission.',
  'Our one saltwater crocodile handler took stress leave after the incident.',
  'The only third-generation cooper at the winery lost his father in April.',
  'Our sole night-shift mortuary technician had a workplace injury last week.',
  'The single stained-glass restorer on staff went through IVF this year.',
  'The only bagpipe instructor at the college was investigated for misconduct.',
  'Our lone avalanche forecaster at the alpine site had a heart attack.',
  'The single puppeteer in the two-person troupe filed for family violence leave.',
  'The only harbour pilot rostered nights disclosed a gambling problem.',
  'Our sole falconer at the airfield was diagnosed with epilepsy.',
  'The only sign-writer at the four-person depot had a miscarriage in July.',
  'The single beekeeper on the estate was hospitalised after an allergic reaction.',
];

const combinationDeferred = COMBINATIONS.map((value, index) => ({
  id: `combo-d-${String(index + 1).padStart(2, '0')}`,
  field: 'question',
  value,
  owner: 'EVID-02',
  reason:
    'PRD §37.1 blocked row 7 (identifying combination) is the combination/risk stage PRD §37.2 places after entity recognition; EVID-01 Non-goals assign it to EVID-02. Authored here so the gap is measured, not absent.',
  synthetic: true,
}));

const combinationNegatives = [
  negative(
    'combo-n-01',
    'A cleaner at a large national retailer was rostered on Sundays.',
    'a common role at a large workplace identifies nobody',
    'Anonymous role, duties, qualifications and employment type',
  ),
  negative(
    'combo-n-02',
    'One of about 400 warehouse pickers took personal leave last week.',
    'a large denominator',
    'Anonymous role, duties, qualifications and employment type',
  ),
  negative(
    'combo-n-03',
    'A level 3 chef in the hospitality sector queried the penalty rate.',
    'a role and a sector, no personal event',
    'Anonymous role, duties, qualifications and employment type',
  ),
  negative(
    'combo-n-04',
    'Several drivers at the depot asked about the new roster pattern.',
    'a group, not an individual',
    'Anonymous role, duties, qualifications and employment type',
  ),
  negative(
    'combo-n-05',
    'The employer has around 2,000 staff across the eastern states.',
    'workforce scale only',
    'State/territory and non-precise work location',
  ),
];

// ---------------------------------------------------------------------------------------------
// REQUEST_LIMIT_EXCEEDED — not a §37.1 row (ticket amendment §0.1)
// ---------------------------------------------------------------------------------------------

const limitCases = [];
[
  ['structured.abn', 'a free-text field named after a reserved structured channel'],
  ['structured.employer', 'a free-text field named after the employer channel'],
  ['structured.publicCaseParty', 'a free-text field named after the public case party channel'],
  ['structured.other', 'any structured. prefix, not only the three reserved names'],
  ['', 'an empty field name'],
  ['9lives', 'a field name starting with a digit'],
  ['my field', 'a field name containing a space'],
  ['field-name', 'a field name containing a hyphen'],
  ['field.name', 'a field name containing a dot'],
  ['field/name', 'a field name containing a slash'],
  ['field[0]', 'a field name containing brackets'],
  ['__proto__x', 'a field name starting with an underscore'],
  ['a'.repeat(65), 'a field name longer than maxFieldNameChars'],
  ['a'.repeat(120), 'a much longer field name'],
  [`field${String.fromCodePoint(0x00e9)}`, 'a field name outside the ASCII identifier set'],
  ['field name with spaces', 'a multi-word field name'],
  ['FIELD-NAME-UPPER', 'an upper-case field name with hyphens'],
].forEach(([field, note], index) => {
  limitCases.push(
    wholeField(
      `limit-p-${String(index + 1).padStart(2, '0')}`,
      field,
      'Is the Sunday penalty rate different for casual staff?',
      note,
    ),
  );
});
[8001, 9000, 12000].forEach((length, index) => {
  limitCases.push(
    wholeField(
      `limit-p-${String(18 + index).padStart(2, '0')}`,
      'question',
      'a'.repeat(length),
      `a field of ${String(length)} characters, above maxFieldChars`,
    ),
  );
});

/**
 * The limit category's negatives are requests that must NOT trip a limit: valid field names of every
 * permitted shape, and values at or below the ceilings. The PRD §37.1 allowed rows are not this
 * category's negatives — it is not a §37.1 row — so it carries its own twenty.
 */
const LIMIT_NEGATIVE_FIELDS = [
  ['question', 'the ordinary field name'],
  ['question_2', 'digits and an underscore'],
  ['questionV2', 'camel case'],
  ['Q', 'a single letter'],
  ['a_b_c_d', 'several underscores'],
  ['Question', 'leading capital'],
  ['freeText1', 'trailing digit'],
  ['q0123456789', 'many digits'],
  ['structuredLooking', 'starts with the word structured but has no dot'],
  ['a'.repeat(64), 'exactly maxFieldNameChars characters'],
];

const LIMIT_NEGATIVE_VALUES = [
  ['Is the Sunday penalty rate different for casual staff?', 'an ordinary question'],
  ['What notice period applies after three years of service?', 'a short question'],
  ['Does the award allow time off in lieu of overtime?', 'a short question'],
  ['', 'an empty value is not a limit violation'],
  ['a'.repeat(8000), 'exactly maxFieldChars characters'],
  ['a'.repeat(7999), 'one below maxFieldChars'],
  ['Are casual loading and overtime compounded under the award?', 'an ordinary question'],
  ['How is a public holiday treated for a part-time worker?', 'an ordinary question'],
  ['When does the minimum engagement period apply?', 'an ordinary question'],
  ['Is a rest break paid for a shift over eight hours?', 'an ordinary question'],
];

const limitNegatives = [];
for (let index = 0; index < 20; index += 1) {
  const [field, fieldNote] = LIMIT_NEGATIVE_FIELDS[index % LIMIT_NEGATIVE_FIELDS.length];
  const [value, valueNote] = LIMIT_NEGATIVE_VALUES[index % LIMIT_NEGATIVE_VALUES.length];
  limitNegatives.push(
    negative(
      `limit-n-${String(index + 1).padStart(2, '0')}`,
      value,
      `${fieldNote}; ${valueNote}`,
      'Anonymous role, duties, qualifications and employment type',
      field,
    ),
  );
}

// ---------------------------------------------------------------------------------------------
// The shared negative corpus — PRD §37.1's ALLOWED column, replayed against every category
// ---------------------------------------------------------------------------------------------

const sharedNegatives = [
  negative(
    'shared-n-01',
    'The employer is Example Widgets Pty Ltd and the question is about overtime.',
    'a public employer name',
    'Public employer name and ABN',
  ),
  negative(
    'shared-n-02',
    'The work is performed in regional NSW across two depots.',
    'a state-level work location',
    'State/territory and non-precise work location',
  ),
  negative(
    'shared-n-03',
    'The worker is a level 3 cleaner working ordinary hours on weekdays.',
    'anonymous role and duties',
    'Anonymous role, duties, qualifications and employment type',
  ),
  negative(
    'shared-n-04',
    'The role requires a Certificate III and two years of experience.',
    'qualifications without identity',
    'Anonymous role, duties, qualifications and employment type',
  ),
  negative(
    'shared-n-05',
    'The employment type is casual with no guaranteed hours.',
    'employment type',
    'Anonymous role, duties, qualifications and employment type',
  ),
  negative(
    'shared-n-06',
    'The matter is Smith v Example Widgets Pty Ltd [2024] FWC 123.',
    'a public case party and citation',
    'Public case party/citation',
  ),
  negative(
    'shared-n-07',
    'The decision in Re Application by the Australian Workers Union [2023] FWCFB 45 applies.',
    'a public case citation',
    'Public case party/citation',
  ),
  negative(
    'shared-n-08',
    'The employee is aged 30-39, which the discrimination claim relies on.',
    'an age band where legally relevant',
    'Age band where legally relevant',
  ),
  negative(
    'shared-n-09',
    'Employee A worked the night shift for six months before resigning.',
    'the synthetic placeholder from the allowed column',
    '"Employee A", "the worker", synthetic placeholders',
  ),
  negative(
    'shared-n-10',
    'The worker was paid about $28 an hour, roughly the award rate.',
    'approximate wage facts without identity',
    'Approximate wage/rate facts without identity',
  ),
  negative(
    'shared-n-11',
    'Overtime is paid at time and a half for the first two hours.',
    'a rate fact with no identity',
    'Approximate wage/rate facts without identity',
  ),
  negative(
    'shared-n-12',
    'The Fair Work Infoline is 13 13 94 for general enquiries.',
    'a published business line',
    'Public case party/citation',
  ),
  negative(
    'shared-n-13',
    'Head office can be reached on 1300 123 456 during business hours.',
    'a published 1300 business line',
    'Public employer name and ABN',
  ),
  negative(
    'shared-n-14',
    'The company page is linkedin.com/company/example-widgets for anyone to see.',
    'a company page, not a personal profile',
    'Public employer name and ABN',
  ),
  negative(
    'shared-n-15',
    'The award commenced on 1 January 2010 and was varied in 2020.',
    'instrument dates',
    'Public case party/citation',
  ),
  negative(
    'shared-n-16',
    'The site is around Sydney metro and the depot is near the airport.',
    'a non-precise work location',
    'State/territory and non-precise work location',
  ),
  negative(
    'shared-n-17',
    'The employer operates in VIC, QLD and SA under one agreement.',
    'multiple states with no street address',
    'State/territory and non-precise work location',
  ),
  negative(
    'shared-n-18',
    'The worker asked about time off in lieu after a public holiday shift.',
    'a plain legal question',
    'Anonymous role, duties, qualifications and employment type',
  ),
  negative(
    'shared-n-19',
    'About 250 staff are covered by the enterprise agreement.',
    'workforce scale',
    'Anonymous role, duties, qualifications and employment type',
  ),
  negative(
    'shared-n-20',
    'The applicant was represented at the conciliation conference in May.',
    'a procedural fact with no identity',
    '"Employee A", "the worker", synthetic placeholders',
  ),
  negative(
    'shared-n-21',
    `The employer ABN is ${ABNS[0]} and the trading name is Example Widgets.`,
    'a valid ABN in free text, authored so its observed behaviour is measured (see abn.ts)',
    'Public employer name and ABN',
  ),
  negative(
    'shared-n-22',
    'The public register lists the business as registered since 2015.',
    'public business information',
    'Public employer name and ABN',
  ),
];

// ---------------------------------------------------------------------------------------------
// Canary manifest (deliverable 11; reusable by ASSR-03)
// ---------------------------------------------------------------------------------------------

const canaries = [
  {
    id: 'canary-01',
    category: 'EMPLOYEE_OR_PRIVATE_INDIVIDUAL_NAME',
    token: 'Zorvanth Quibblesworth',
    field: 'question',
    value: 'The employee name: Zorvanth Quibblesworth and the shift was Sunday.',
  },
  {
    id: 'canary-02',
    category: 'PRIVATE_CONTACT_EMAIL',
    token: 'canary-7f3a@example.invalid',
    field: 'question',
    value: 'Write to canary-7f3a@example.invalid about the roster.',
  },
  {
    id: 'canary-03',
    category: 'TAX_FILE_NUMBER',
    token: TFNS[2],
    field: 'question',
    value: `Their tax file number is ${TFNS[2]} on the form.`,
  },
  {
    id: 'canary-04',
    category: 'MEDICARE_NUMBER',
    token: MEDICARES[2],
    field: 'question',
    value: `The card shows ${MEDICARES[2]} for the claim.`,
  },
  {
    id: 'canary-05',
    category: 'BANK_OR_CARD_DETAIL',
    token: CARDS[2],
    field: 'question',
    value: `The card on file is ${CARDS[2]} for expenses.`,
  },
  {
    id: 'canary-06',
    category: 'PRIVATE_CONTACT_PHONE',
    token: '0499887766',
    field: 'question',
    value: 'Call them on 0499887766 after the shift.',
  },
  {
    id: 'canary-07',
    category: 'HOME_ADDRESS_OR_PRECISE_LOCATION',
    token: '13 Frobisher Vale Street, Quibbleton NSW 2999',
    field: 'question',
    value: 'They live at 13 Frobisher Vale Street, Quibbleton NSW 2999 near the depot.',
  },
  {
    id: 'canary-08',
    category: 'PRIVATE_SOCIAL_IDENTIFIER',
    token: '@zorvanth_quibble',
    field: 'question',
    value: 'They posted from @zorvanth_quibble last night.',
  },
];

// ---------------------------------------------------------------------------------------------
// Write
// ---------------------------------------------------------------------------------------------

const FILES = [
  file('EMPLOYEE_OR_PRIVATE_INDIVIDUAL_NAME', 'Employee or private individual name', nameCases, nameNegatives),
  file('PRIVATE_CONTACT_EMAIL', 'Personal email, phone or private social identifier', emailCases, emailNegatives),
  file('PRIVATE_CONTACT_PHONE', 'Personal email, phone or private social identifier', phoneCases, phoneNegatives),
  file('PRIVATE_SOCIAL_IDENTIFIER', 'Personal email, phone or private social identifier', socialCases, socialNegatives),
  file('HOME_ADDRESS_OR_PRECISE_LOCATION', 'Home address or precise private location', addressCases, addressNegatives),
  file('TAX_FILE_NUMBER', TFN_ROW, tfnCases, tfnNegatives),
  file('BANK_OR_CARD_DETAIL', TFN_ROW, bankCases, bankNegatives),
  file('MEDICARE_NUMBER', TFN_ROW, medicareCases, medicareNegatives),
  file('PASSPORT_NUMBER', TFN_ROW, passportCases, passportNegatives),
  file('DRIVER_LICENCE_NUMBER', TFN_ROW, licenceCases, licenceNegatives),
  file('EMPLOYEE_OR_PAYROLL_IDENTIFIER', 'Employee/payroll ID, payslip content or personnel-file extract', idCases, idNegatives),
  file('PAYSLIP_OR_PERSONNEL_EXTRACT', 'Employee/payroll ID, payslip content or personnel-file extract', payslipCases, payslipNegatives),
  file('EXACT_DATE_OF_BIRTH', 'Exact date of birth unless public case material', dobCases, dobNegatives),
  file('IDENTIFYING_COMBINATION', 'Identifying combination of rare role + tiny workplace + personal event', [], combinationNegatives, combinationDeferred),
  file('REQUEST_LIMIT_EXCEEDED', 'not a PRD §37.1 row — the admission-limit outcome (ticket amendment §0.1)', limitCases, limitNegatives),
];

const kebab = (category) => category.toLowerCase().split('_').join('-');

function write(name, data) {
  writeFileSync(join(HERE, name), `${JSON.stringify(data, null, 2)}\n`, 'utf8');
}

for (const entry of FILES) write(`${kebab(entry.category)}.json`, entry);
write('negatives-shared.json', { cases: sharedNegatives });
write('canaries.json', { canaries });

process.stdout.write(
  `wrote ${String(FILES.length + 2)} corpus files: ${String(
    FILES.reduce((total, entry) => total + entry.positives.length + entry.deferred.length, 0),
  )} positive/deferred cases, ${String(sharedNegatives.length)} shared negatives\n`,
);
