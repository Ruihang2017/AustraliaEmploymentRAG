/**
 * FND-21 — regression guard for `.github/workflows/ci.yml`.
 *
 *   node --test .github/workflows/checks/checkout-depth.test.mjs
 *
 * Two things it holds in place, both of which failed silently before:
 *
 * 1. Every `actions/checkout` step fetches full history (`fetch-depth: 0`). A shallow checkout
 *    leaves a `pull_request` run with no `main` and no `origin/main`, so the repository-wide
 *    frozen-path guard and the contract fixture-stability check cannot resolve a base ref and error
 *    out instead of running. A guard that cannot diff is not a lenient guard; it has stopped.
 * 2. The blocking dependency audit stays scoped to production dependencies and stays blocking —
 *    `--prod --audit-level=high`, never a lowered level and never a swallowed exit status
 *    (Founder decision D-CI1).
 *
 * It reads `ci.yml` through the restricted reader in `workflow-model.mjs` and never through a second
 * YAML parser: a construct the reader cannot model must fail the check rather than pass it silently.
 * Every negative control drives the same detector function as the real assertion, which is what
 * makes the control meaningful.
 *
 * Read-only. No network. Reads no environment variable.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { parseWorkflow } from './workflow-model.mjs';

const CHECKS_DIR = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(CHECKS_DIR, '..', '..', '..');

/** Every file this guard read, so the non-vacuity suite can prove it inspected something. */
const filesRead = new Set();

function read(relativeToRepo) {
  const path = join(REPO_ROOT, relativeToRepo);
  assert.ok(existsSync(path), `${relativeToRepo} does not exist`);
  filesRead.add(relativeToRepo);
  return readFileSync(path, 'utf8');
}

const CI_PATH = '.github/workflows/ci.yml';
const AUDIT_STEP = 'Dependency audit and lockfile integrity';
const ci = parseWorkflow(read(CI_PATH));

// ---------------------------------------------------------------------------------------------
// Detectors. The synthetic controls at the bottom drive these same functions.
// ---------------------------------------------------------------------------------------------

/** Every checkout step in the model, with the job it belongs to and its index in that job. */
function checkoutSteps(doc) {
  const found = [];
  for (const [jobId, job] of Object.entries(doc.jobs ?? {})) {
    const steps = Array.isArray(job?.steps) ? job.steps : [];
    steps.forEach((step, index) => {
      if (typeof step?.uses === 'string' && step.uses.includes('actions/checkout')) {
        found.push({ jobId, index, fetchDepth: step.with?.['fetch-depth'] ?? null });
      }
    });
  }
  return found;
}

/** Checkout steps that do not fetch full history, named by job id and step index. */
function checkoutProblems(doc) {
  return checkoutSteps(doc)
    .filter((step) => step.fetchDepth !== '0')
    .map(
      (step) =>
        `job "${step.jobId}" step ${step.index}: actions/checkout declares fetch-depth ` +
        `${step.fetchDepth === null ? '(absent)' : `"${step.fetchDepth}"`} — it must be "0", or a ` +
        'pull_request run has no base ref to diff against',
    );
}

/** The single `pnpm audit` line of the dependency-audit step, or null when there is none. */
function auditLine(doc) {
  const steps = doc.jobs?.['supply-chain-scan']?.steps;
  if (!Array.isArray(steps)) return null;
  const step = steps.find((candidate) => candidate?.name === AUDIT_STEP);
  if (step === undefined || typeof step.run !== 'string') return null;
  const lines = step.run.split('\n').filter((line) => line.includes('pnpm audit'));
  return lines.length === 1 ? lines[0].trim() : null;
}

/** Ways the dependency gate could stop being a scoped, blocking gate. */
function auditProblems(doc) {
  const line = auditLine(doc);
  if (line === null) {
    return [`ci.yml has no single "pnpm audit" line in the "${AUDIT_STEP}" step`];
  }
  const problems = [];
  if (!line.includes('--prod')) {
    problems.push(`the audit line is not scoped to production dependencies (D-CI1): ${line}`);
  }
  if (!line.includes('--audit-level=high')) {
    problems.push(`the audit line no longer blocks at high severity: ${line}`);
  }
  if (line.includes('--audit-level=critical')) {
    problems.push(`the audit severity threshold was lowered: ${line}`);
  }
  if (/\|\|\s*true|;\s*true|continue-on-error/.test(line)) {
    problems.push(`the audit exit status is swallowed, so the gate cannot fail: ${line}`);
  }
  return problems;
}

// ---------------------------------------------------------------------------------------------

describe('A. every checkout in ci.yml fetches enough history to resolve a base ref', () => {
  it('declares fetch-depth 0 on every actions/checkout step', () => {
    assert.deepEqual(checkoutProblems(ci), []);
  });

  it('finds one checkout per job, and nine of them', () => {
    const steps = checkoutSteps(ci);
    assert.equal(steps.length, Object.keys(ci.jobs).length);
    assert.equal(steps.length, 9);
  });
});

describe('B. the dependency gate stays scoped and blocking (D-CI1)', () => {
  it('runs the audit with --prod and --audit-level=high, unswallowed', () => {
    assert.deepEqual(auditProblems(ci), []);
  });

  it('keeps the step name the gate fixture maps against', () => {
    const names = ci.jobs['supply-chain-scan'].steps.map((step) => step.name ?? null);
    assert.ok(names.includes(AUDIT_STEP), `the "${AUDIT_STEP}" step is gone: ${names.join(', ')}`);
  });
});

describe('C. non-vacuity — a check that inspected nothing must fail', () => {
  it('parsed a non-empty job map out of ci.yml', () => {
    assert.ok(Object.keys(ci.jobs ?? {}).length > 0, 'ci.yml parsed to no jobs at all');
  });

  it('actually read ci.yml', () => {
    assert.ok(filesRead.has(CI_PATH));
  });
});

describe('D. negative controls — the detectors bite on synthetic text', () => {
  const workflow = (withBlock) =>
    parseWorkflow(
      ['jobs:', '  synthetic-job:', '    steps:', `      - uses: actions/checkout@${'f'.repeat(40)}`, ...withBlock, ''].join(
        '\n',
      ),
    );

  it('flags a checkout step with no with: block', () => {
    const problems = checkoutProblems(workflow([]));
    assert.equal(problems.length, 1);
    assert.match(problems[0], /synthetic-job/);
    assert.match(problems[0], /absent/);
  });

  it('flags a checkout step pinned to a shallow depth', () => {
    const problems = checkoutProblems(workflow(['        with:', '          fetch-depth: 1']));
    assert.equal(problems.length, 1);
    assert.match(problems[0], /synthetic-job/);
  });

  it('passes a checkout step that fetches full history (not always-red)', () => {
    assert.deepEqual(checkoutProblems(workflow(['        with:', '          fetch-depth: 0'])), []);
  });

  const auditWorkflow = (command) =>
    parseWorkflow(
      [
        'jobs:',
        '  supply-chain-scan:',
        '    steps:',
        `      - name: ${AUDIT_STEP}`,
        '        run: |',
        `          ${command}`,
        '          uv lock --check',
        '',
      ].join('\n'),
    );

  it('flags an unscoped audit line', () => {
    const problems = auditProblems(auditWorkflow('corepack pnpm audit --audit-level=high'));
    assert.equal(problems.length, 1);
    assert.match(problems[0], /production dependencies/);
  });

  it('flags an audit line whose exit status is swallowed', () => {
    const problems = auditProblems(auditWorkflow('corepack pnpm audit --prod --audit-level=high || true'));
    assert.equal(problems.length, 1);
    assert.match(problems[0], /swallowed/);
  });

  it('passes the scoped, blocking audit line (not always-red)', () => {
    assert.deepEqual(auditProblems(auditWorkflow('corepack pnpm audit --prod --audit-level=high')), []);
  });

  it('flags a workflow whose audit step is missing entirely', () => {
    const problems = auditProblems(parseWorkflow(['jobs:', '  supply-chain-scan:', '    steps:', '      - run: echo hi', ''].join('\n')));
    assert.equal(problems.length, 1);
    assert.match(problems[0], /no single/);
  });
});
