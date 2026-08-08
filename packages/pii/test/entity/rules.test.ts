/**
 * EVID-02 deliverable 2 — every rule is testable IN ISOLATION.
 *
 * The corpus replay proves the recogniser as a whole; this suite proves each named rule fires on its
 * own cue and, just as importantly, does NOT fire without one. The last describe block is the one to
 * read first: a sentence-initial capital, an ALL-CAPS acronym and a plain capitalised bigram with no
 * cue must all produce nothing, because that is the difference between a recogniser and a
 * capital-letter counter.
 */
import { describe, expect, it } from 'vitest';

import { normaliseForScan } from '../../src/deterministic/normalise.js';
import { ENTITY_RULES, candidatesIn } from '../../src/entity/deterministic/rules.js';
import { ENTITY_RULE_NAMES } from '../../src/entity/port.js';
import type { PiiFinding } from '../../src/contract/finding.js';

function rulesFiring(value: string, findings: readonly PiiFinding[] = []): string[] {
  const view = normaliseForScan('question', value);
  return [...new Set(candidatesIn(view, findings).map((candidate) => candidate.rule))].sort();
}

function spansFor(value: string, findings: readonly PiiFinding[] = []): string[] {
  const view = normaliseForScan('question', value);
  return candidatesIn(view, findings).map((candidate) =>
    view.scan.slice(candidate.start, candidate.end),
  );
}

const phoneFinding: PiiFinding = {
  field: 'question',
  start: 30,
  end: 42,
  category: 'PRIVATE_CONTACT_PHONE',
  severity: 'BLOCKING',
  suggestedPlaceholder: '[PHONE REMOVED]',
};

describe('the rule table itself', () => {
  it('documents every declared rule, with a false-positive risk', () => {
    expect(ENTITY_RULES.map((rule) => rule.name).sort()).toEqual([...ENTITY_RULE_NAMES].sort());
    for (const rule of ENTITY_RULES) {
      expect(rule.falsePositiveRisk.length, rule.name).toBeGreaterThan(30);
    }
  });

  it('ships exactly one ADVISORY rule (the sanitiser’s only real producer)', () => {
    const advisory = ENTITY_RULES.filter((rule) => rule.severity === 'ADVISORY');
    expect(advisory.map((rule) => rule.name)).toEqual(['POSSESSIVE_PERSONAL_MONONYM']);
  });
});

describe('HONORIFIC_NAME', () => {
  it('fires on an honorific and captures only the name', () => {
    expect(rulesFiring('The letter was signed by Ms Marta Kowalski last week.')).toContain(
      'HONORIFIC_NAME',
    );
    expect(spansFor('The letter was signed by Ms Marta Kowalski last week.')).toContain(
      'Marta Kowalski',
    );
  });

  it('does not fire without the honorific', () => {
    expect(rulesFiring('The letter was signed by the site supervisor last week.')).toEqual([]);
  });
});

describe('EMPLOYMENT_RELATION_NAME', () => {
  it('fires on a cue before the name', () => {
    expect(rulesFiring('My employee Marta Kowalski asked about the roster.')).toContain(
      'EMPLOYMENT_RELATION_NAME',
    );
  });

  it('fires on a cue after the name', () => {
    expect(rulesFiring('Marta Kowalski works for us as a casual.')).toContain(
      'EMPLOYMENT_RELATION_NAME',
    );
  });

  it('does not fire on an organisation in the same cue window', () => {
    expect(rulesFiring('The employee works for Example Widgets Pty Ltd on a casual basis.')).toEqual(
      [],
    );
  });

  it('does not fire on a capitalised bigram with no cue at all', () => {
    expect(rulesFiring('The Sunday Roster is published each Friday.')).toEqual([]);
  });
});

describe('SIGNATURE_OR_GREETING_NAME', () => {
  it('fires on a greeting', () => {
    expect(rulesFiring('Hi Marta Kowalski, what notice applies?')).toContain(
      'SIGNATURE_OR_GREETING_NAME',
    );
  });

  it('fires on a trailing sign-off', () => {
    expect(rulesFiring('Thanks for the help with the roster. -- Marta Kowalski')).toContain(
      'SIGNATURE_OR_GREETING_NAME',
    );
  });

  it('does not fire on a greeting addressed to a tribunal', () => {
    expect(rulesFiring('Dear Fair Work Commission, we seek guidance on coverage.')).toEqual([]);
  });
});

describe('ADJACENT_CONTACT_NAME', () => {
  const value = 'Please call Marta Kowalski on 0412 345 678 about the shift.';

  it('fires only when an earlier stage found a private contact detail', () => {
    expect(rulesFiring(value, [phoneFinding])).toContain('ADJACENT_CONTACT_NAME');
    expect(rulesFiring(value, [])).toEqual([]);
  });

  it('does not turn a sentence-initial capital into a name (two tokens minimum)', () => {
    expect(spansFor(value, [phoneFinding])).not.toContain('Please');
  });
});

describe('POSSESSIVE_PERSONAL_MONONYM (the highest false-positive rule)', () => {
  it('fires on a personal possessive', () => {
    expect(rulesFiring('Kowalski’s roster was changed without notice.')).toContain(
      'POSSESSIVE_PERSONAL_MONONYM',
    );
  });

  it('does not fire on the §37.1 placeholder form', () => {
    expect(rulesFiring('Employee A’s roster was changed without notice.')).toEqual([]);
  });

  it('does not fire on an acronym or a single letter', () => {
    expect(rulesFiring('NSW’s roster rules differ from Victoria’s.')).toEqual([]);
  });
});

describe('what is deliberately NOT a candidate', () => {
  it.each([
    ['a sentence-initial capital', 'Overtime is paid at time and a half.'],
    ['an ALL-CAPS acronym', 'The FWC and the ATO both published guidance.'],
    ['a capitalised bigram with no cue', 'The Christmas Shutdown runs for two weeks.'],
    ['a citation party', 'The matter is Smith v Example Widgets Pty Ltd [2024] FWC 123.'],
    ['a placeholder form', 'Employee A was rostered on the night shift.'],
    ['a qualification', 'The role requires a Certificate III and a licence.'],
  ])('%s', (_label, value) => {
    expect(rulesFiring(value)).toEqual([]);
  });
});
