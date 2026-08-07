/**
 * LNCH-01 deliverable 9 — assertions for check-policies.mjs, run by Node's built-in test runner:
 *
 *   node --test docs/policies/tools/check-policies.test.mjs
 *
 * No test framework dependency (sub-PRD D11). Not picked up by `pnpm test`: the root vitest config
 * includes only `tools/tests/**`, which is `FND-01`-owned and out of this ticket's file-scope.
 *
 * Nothing is written inside the repository. `--report` output goes to an `mkdtemp` directory that is
 * removed in a `finally`, so the tests are safe to run concurrently in parallel git worktrees.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  DOCUMENTS,
  REQUIRED_SECTIONS,
  REGISTER_DOCUMENT_ROWS,
  REGISTER_SURFACE_ROWS,
  compileClaimRules,
  scanClaims,
  normalizeForScan,
  classifySection,
  parseFrontmatter,
  validateAgainstSchema,
  unsupportedSchemaKeywords,
  readText,
} from './check-policies.mjs';

const CHECKER = fileURLToPath(new URL('./check-policies.mjs', import.meta.url));
const POLICIES_ROOT = fileURLToPath(new URL('../', import.meta.url));
const FIXTURES = fileURLToPath(new URL('./fixtures/', import.meta.url));

/** Runs the checker as a child process, exactly as a human or CI would. */
function run(args = []) {
  const result = spawnSync(process.execPath, [CHECKER, ...args], { encoding: 'utf8' });
  assert.equal(result.error, undefined, `spawn failed: ${result.error}`);
  const lines = result.stdout.split('\n').filter((l) => l.trim() !== '');
  return {
    status: result.status,
    stdout: result.stdout,
    stderr: result.stderr,
    violations: lines.filter((l) => !l.startsWith('check-policies:')),
    summary: lines.filter((l) => l.startsWith('check-policies:')),
  };
}

// ---------------------------------------------------------------------------------------------
// The committed tree
// ---------------------------------------------------------------------------------------------

test('the committed docs/policies tree passes with exit 0 and one summary line', () => {
  const r = run();
  assert.equal(r.status, 0, `expected exit 0, got ${r.status}:\n${r.stdout}`);
  assert.deepEqual(r.violations, []);
  assert.equal(r.summary.length, 1);
  assert.match(r.summary[0], /^check-policies: OK — 4 documents, 7 open/);
});

test('the committed tree covers every PRD §11.2 document and register row', () => {
  assert.deepEqual(Object.keys(DOCUMENTS).sort(), [
    'acceptable-use-policy',
    'disclaimer',
    'privacy-policy',
    'terms-of-service',
  ]);
  assert.equal(REGISTER_DOCUMENT_ROWS.length, 4);
  assert.equal(REGISTER_SURFACE_ROWS.length, 3);
  for (const [id, filename] of Object.entries(DOCUMENTS)) {
    const fm = parseFrontmatter(readText(join(POLICIES_ROOT, filename)));
    assert.deepEqual(fm.errors, [], `${filename} frontmatter must parse cleanly`);
    assert.equal(fm.data.id, id);
    assert.equal(fm.data.legal_review, 'LEGAL_REVIEW_PENDING');
    assert.ok(REQUIRED_SECTIONS[id].length > 0);
  }
});

test('every register row in the committed tree is OPEN and never closed by a ticket', () => {
  const register = JSON.parse(readText(join(POLICIES_ROOT, 'legal-review-register.json')));
  const ids = register.rows.map((r) => r.id);
  for (const id of [...REGISTER_DOCUMENT_ROWS, ...REGISTER_SURFACE_ROWS]) assert.ok(ids.includes(id), id);
  for (const row of register.rows) assert.equal(row.status, 'OPEN', `${row.id} must stay OPEN`);
});

// ---------------------------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------------------------

test('the valid fixture tree exits 0 — the baseline each negative fixture is derived from', () => {
  const r = run(['--root', join(FIXTURES, 'valid')]);
  assert.equal(r.status, 0, `expected exit 0, got ${r.status}:\n${r.stdout}`);
  assert.deepEqual(r.violations, []);
});

const NEGATIVE_FIXTURES = [
  ['missing-section', 'section-missing'],
  ['prohibited-claim', 'definite-compliance'],
  ['register-resolved', 'register-row-not-open'],
  ['short-form-leak', 'legal-review-pending-leak'],
  ['prose-and-marker', 'section-both-prose-and-marker'],
];

for (const [name, expectedRule] of NEGATIVE_FIXTURES) {
  test(`negative fixture \`${name}\` exits 1 with exactly one \`${expectedRule}\` violation`, () => {
    const r = run(['--root', join(FIXTURES, name)]);
    assert.equal(r.status, 1, `expected exit 1, got ${r.status}:\n${r.stdout}`);
    assert.equal(
      r.violations.length,
      1,
      `the fixture must fail for its seeded reason only, got:\n${r.violations.join('\n')}`,
    );
    assert.match(r.violations[0], new RegExp(`: ${expectedRule}: `));
  });
}

// ---------------------------------------------------------------------------------------------
// Positive controls — a scanner that detects nothing must not be able to pass
// ---------------------------------------------------------------------------------------------

const RULE_FAMILIES = [
  'definite-compliance',
  'legal-representation',
  'government-endorsement',
  'sla-promise',
  'unlimited-capacity',
  'complete-coverage',
];

test('all six PRD-traceable rule families are present and none is narrowed to a trivial literal', () => {
  const set = JSON.parse(readText(join(POLICIES_ROOT, 'claim-language', 'prohibited-claims.json')));
  const ids = set.rules.map((r) => r.id);
  for (const family of RULE_FAMILIES) assert.ok(ids.includes(family), `rule family \`${family}\` is missing`);
  for (const rule of set.rules) {
    assert.equal(rule.severity, 'error');
    assert.ok(rule.prd_ref, `${rule.id} must cite its PRD section`);
    assert.ok(rule.pattern.length > 20, `${rule.id} pattern looks narrowed to a trivial literal`);
  }
  for (const neg of set.allowed_negations) {
    assert.ok(neg.why && neg.why.includes('PRD'), `${neg.id} must name the PRD sentence that forces the wording`);
    assert.ok(Array.isArray(neg.covers) && neg.covers.length > 0, `${neg.id} must name the rules it covers`);
  }
});

test('every rule family fires on a known-bad string fed through the exported scanner', () => {
  const set = JSON.parse(readText(join(POLICIES_ROOT, 'claim-language', 'prohibited-claims.json')));
  const compiled = compileClaimRules(set);
  assert.deepEqual(compiled.errors, [], 'every pattern must compile');
  const samples = {
    'definite-compliance': 'After this review your organisation is fully compliant.',
    'legal-representation': 'Our team provides legal advice tailored to you.',
    'government-endorsement': 'This is an official government product.',
    'sla-promise': 'We offer a contractual SLA and guaranteed uptime.',
    'unlimited-capacity': 'Your plan includes unlimited searches.',
    'complete-coverage': 'We provide complete coverage of all Australian law.',
  };
  for (const [ruleId, text] of Object.entries(samples)) {
    const hits = scanClaims(text, compiled).map((h) => h.ruleId);
    assert.ok(hits.includes(ruleId), `\`${ruleId}\` did not fire on ${JSON.stringify(text)}`);
  }
});

test('a prohibited claim wrapped across Markdown lines or written with typographic characters still fires', () => {
  const set = JSON.parse(readText(join(POLICIES_ROOT, 'claim-language', 'prohibited-claims.json')));
  const compiled = compileClaimRules(set);
  const wrapped = 'Your organisation is fully\ncompliant with the Fair Work Act.';
  assert.ok(scanClaims(wrapped, compiled).some((h) => h.ruleId === 'definite-compliance'));
  const curly = 'We offer 24 / 7 support and don’t charge extra.';
  assert.ok(scanClaims(curly, compiled).some((h) => h.ruleId === 'sla-promise'));
  // Length-preserving normalisation is what keeps reported line numbers real.
  assert.equal(normalizeForScan(wrapped).length, wrapped.length);
  // A paragraph break is a NUL sentinel, so a claim cannot be assembled across two paragraphs.
  const acrossParagraphs = 'Your organisation is fully\n\ncompliant with the Fair Work Act.';
  assert.deepEqual(scanClaims(acrossParagraphs, compiled), []);
});

test('allowed_negations excuse only the denial, never the assertion', () => {
  const set = JSON.parse(readText(join(POLICIES_ROOT, 'claim-language', 'prohibited-claims.json')));
  const compiled = compileClaimRules(set);
  assert.deepEqual(
    scanClaims('The product does not state that a customer is definitely compliant.', compiled),
    [],
    'the PRD §11.2 denial must not trip the rule it denies',
  );
  assert.ok(
    scanClaims('The product states that a customer is definitely compliant.', compiled).length > 0,
    'the assertion must still be caught',
  );
  assert.deepEqual(scanClaims('... conditional guidance, not legal representation.', compiled), []);
  assert.ok(scanClaims('We provide legal representation.', compiled).length > 0);
});

test('the LEGAL_REVIEW_PENDING token is absent from every customer-facing field and body', () => {
  for (const filename of Object.values(DOCUMENTS)) {
    const text = readText(join(POLICIES_ROOT, filename));
    const fm = parseFrontmatter(text);
    const body = text.slice(fm.bodyOffset);
    assert.ok(!body.includes('LEGAL_REVIEW_PENDING'), `${filename} body leaks the internal token`);
    for (const field of ['short_form', 'export_form']) {
      const value = fm.data[field];
      if (typeof value === 'string') assert.ok(!value.includes('LEGAL_REVIEW_PENDING'), `${filename}.${field}`);
    }
  }
});

// ---------------------------------------------------------------------------------------------
// Unit-level behaviour the fixtures cannot reach
// ---------------------------------------------------------------------------------------------

test('a section is either prose or exactly one marker', () => {
  assert.deepEqual(classifySection('<!-- FOUNDER_INPUT_REQUIRED: why. -->'), {
    markerCount: 1,
    markerTexts: ['why.'],
    prose: '',
  });
  const both = classifySection('<!-- FOUNDER_INPUT_REQUIRED: why. -->\n\nAnd some prose.');
  assert.equal(both.markerCount, 1);
  assert.notEqual(both.prose, '');
  assert.equal(classifySection('\n\n').markerCount, 0);
  assert.equal(classifySection('\n\n').prose, '');
  assert.equal(
    classifySection('<!-- FOUNDER_INPUT_REQUIRED: a. -->\n<!-- FOUNDER_INPUT_REQUIRED: b. -->').markerCount,
    2,
  );
});

test('the frontmatter parser rejects unsupported syntax instead of misparsing it', () => {
  const ok = parseFrontmatter('---\nid: disclaimer\napplies_to: [a, b]\nprd_basis:\n  - "§11.2"\nshort_form: >-\n  one\n  two\n---\nbody\n');
  assert.deepEqual(ok.errors, []);
  assert.deepEqual(ok.data.applies_to, ['a', 'b']);
  assert.deepEqual(ok.data.prd_basis, ['§11.2']);
  assert.equal(ok.data.short_form, 'one two');

  for (const bad of [
    'no fence\n',
    '---\nid: disclaimer\n',
    '---\nid: &anchor\n---\n',
    '---\nnested:\n  key: value\n---\n',
    '---\nid: a: b\n---\n',
    '---\nblock: |\n  literal\n---\n',
  ]) {
    const r = parseFrontmatter(bad);
    assert.ok(r.errors.length > 0, `expected a violation for ${JSON.stringify(bad)}`);
    assert.ok(r.errors.every((e) => e.rule === 'frontmatter-unsupported-syntax'));
  }
});

test('the schema-subset validator enforces const, enum, pattern and additionalProperties', () => {
  const schema = JSON.parse(readText(join(POLICIES_ROOT, 'policy.schema.json')));
  assert.deepEqual(unsupportedSchemaKeywords(schema), [], 'the committed schema uses only supported keywords');

  const valid = parseFrontmatter(readText(join(POLICIES_ROOT, 'disclaimer.md'))).data;
  assert.deepEqual(validateAgainstSchema(valid, schema), []);

  assert.ok(validateAgainstSchema({ ...valid, owner: 'Someone else' }, schema).length > 0);
  assert.ok(validateAgainstSchema({ ...valid, legal_review: 'DONE' }, schema).length > 0);
  assert.ok(validateAgainstSchema({ ...valid, version: '1.0' }, schema).length > 0);
  assert.ok(validateAgainstSchema({ ...valid, status: 'WHATEVER' }, schema).length > 0);
  assert.ok(validateAgainstSchema({ ...valid, applies_to: ['nope'] }, schema).length > 0);
  assert.ok(validateAgainstSchema({ ...valid, prd_basis: ['11.2'] }, schema).length > 0);
  assert.ok(validateAgainstSchema({ ...valid, surprise: 1 }, schema).length > 0);
  const withoutShortForm = { ...valid };
  delete withoutShortForm.short_form;
  assert.ok(
    validateAgainstSchema(withoutShortForm, schema).length > 0,
    'the disclaimer conditional must require short_form',
  );
  // An unknown keyword must be reported, never silently ignored.
  assert.deepEqual(unsupportedSchemaKeywords({ type: 'object', multipleOf: 2 }), ['#/multipleOf']);
});

// ---------------------------------------------------------------------------------------------
// --report
// ---------------------------------------------------------------------------------------------

test('--report writes a deterministic summary, and nothing is written without the flag', () => {
  const dir = mkdtempSync(join(tmpdir(), 'lnch01-'));
  try {
    const target = join(dir, 'report.json');
    const first = run(['--report', target]);
    assert.equal(first.status, 0);
    const a = readFileSync(target, 'utf8');
    const second = run(['--report', target]);
    assert.equal(second.status, 0);
    const b = readFileSync(target, 'utf8');
    assert.equal(a, b, 'the report must not contain a timestamp or any other churning field');

    const report = JSON.parse(a);
    assert.equal(report.schema_version, 1);
    assert.equal(report.documents.length, 4);
    assert.equal(report.register.open_rows, 7);
    assert.deepEqual(report.violations, []);
    const outstanding = report.documents.flatMap((d) => d.founder_input_required);
    assert.ok(outstanding.includes('Warranties, liability and indemnity'));
    assert.ok(outstanding.includes('Governing law and jurisdiction'));
    assert.ok(outstanding.includes('Breach notification'));
    for (const d of report.documents) assert.equal(d.status, 'DRAFT_PENDING_FOUNDER_CONTENT');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('an unknown flag is a usage error that still exits 1', () => {
  const r = run(['--nope']);
  assert.equal(r.status, 1);
  assert.match(r.stdout, /usage-error/);
});
