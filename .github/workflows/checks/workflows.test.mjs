/**
 * FND-02 — the acceptance harness for `.github/workflows/**`.
 *
 *   node --test .github/workflows/checks/workflows.test.mjs
 *
 * It lives here rather than under `tools/tests/` for two reasons: `tools/**` belongs to FND-01 and is
 * outside this ticket's File-scope, and `tools/vitest.config.mjs` collects only
 * `tools/tests/ **.test.mjs`, so a file placed anywhere else would never be collected. It runs on
 * `node:test`, a Node built-in, so it adds no dependency, and CI runs it inside the `ts-type-unit`
 * job — a gate check that never runs in CI decays.
 *
 * Every suite is annotated with the ticket acceptance item it discharges. Suite K asserts the whole
 * harness is non-vacuous: a check that inspected nothing must fail rather than pass.
 *
 * Read-only. No network. Reads no environment variable that could carry a credential (PRD 20.2).
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readdirSync, readFileSync, existsSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  jobIds,
  parseWorkflow,
  sourceLines,
  triggers,
  usesReferences,
  walk,
  WorkflowSyntaxError,
} from './workflow-model.mjs';
import { CONSTRAINT_HEADING, checkPrBody, failureReport } from './pr-contract.mjs';
import { ALLOWLIST, PROSE_TREES, VALUE_PATTERN_IDS, isProse, scan, scanRepository } from './secret-scan.mjs';

const CHECKS_DIR = dirname(fileURLToPath(import.meta.url));
const WORKFLOWS_DIR = resolve(CHECKS_DIR, '..');
const REPO_ROOT = resolve(WORKFLOWS_DIR, '..', '..');

/** Every file this harness read, so suite K can prove it inspected something. */
const filesRead = new Set();

function read(relativeToRepo) {
  const path = join(REPO_ROOT, relativeToRepo);
  assert.ok(existsSync(path), `${relativeToRepo} does not exist`);
  filesRead.add(relativeToRepo);
  return readFileSync(path, 'utf8');
}

function listFiles(dir, acc = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) listFiles(full, acc);
    else if (entry.isFile()) acc.push(full.slice(REPO_ROOT.length + 1).split('\\').join('/'));
  }
  return acc;
}

const WORKFLOW_FILES = ['ci.yml', 'pr-contract.yml', 'release-candidate.yml'];
const COMPOSITE = '.github/workflows/actions/setup/action.yml';

const text = {};
const doc = {};
for (const name of WORKFLOW_FILES) {
  text[name] = read(`.github/workflows/${name}`);
  doc[name] = parseWorkflow(text[name]);
}
const compositeText = read(COMPOSITE);
const composite = parseWorkflow(compositeText);
const fixture = JSON.parse(read('.github/workflows/fixtures/prd-20-3-gates.json'));
const pins = JSON.parse(read('tools/fixtures/toolchain-pins.json'));

// ---------------------------------------------------------------------------------------------
// Detectors. Every positive control below drives the same function the real assertion drives.
// ---------------------------------------------------------------------------------------------

function keysAtAnyDepth(node) {
  const keys = [];
  walk(node, (key, value, path) => keys.push({ key, value, path: path.join('.') }));
  return keys;
}

function guardKeys(node) {
  return keysAtAnyDepth(node).filter((entry) => entry.key === 'if' || entry.key === 'continue-on-error');
}

/** Comment lines inside `jobs:` that, stripped of `#`, look like a step — a commented-out gate. */
function commentedOutSteps(source) {
  const lines = sourceLines(source);
  const start = lines.findIndex((line) => line.trimEnd() === 'jobs:');
  if (start === -1) return [];
  const flagged = [];
  lines.slice(start).forEach((line, offset) => {
    const trimmed = line.trim();
    if (!trimmed.startsWith('#')) return;
    const body = trimmed.replace(/^#+\s*/, '');
    if (/^-\s/.test(body) || /^(uses|run|name|with|steps):/.test(body)) {
      flagged.push({ line: start + offset + 1, body });
    }
  });
  return flagged;
}

function runBlocksWithExpressions(node) {
  return keysAtAnyDepth(node).filter(
    (entry) => entry.key === 'run' && typeof entry.value === 'string' && entry.value.includes('${{'),
  );
}

function secretReferences(source) {
  return [...source.matchAll(/secrets\.([A-Za-z_][A-Za-z0-9_]*)/g)].map((match) => match[1]);
}

function jobsOf(workflow) {
  return jobIds(doc[workflow]);
}

/**
 * THE gate-list replay. Both the real assertion and the deleted-gate negative control go through
 * this one function, which is what makes the negative control meaningful. Returns problem strings;
 * every one names the gate id AND its verbatim PRD §20.3 text.
 */
export function replayProblems(jobsByWorkflow) {
  const problems = [];
  const claimed = new Map(); // workflow -> Set(job ids the fixture claims)

  for (const gate of fixture.gates) {
    const ids = jobsByWorkflow[gate.workflow] ?? [];
    if (!claimed.has(gate.workflow)) claimed.set(gate.workflow, new Set());
    for (const job of gate.jobs) {
      claimed.get(gate.workflow).add(job);
      if (!ids.includes(job)) {
        problems.push(
          `PRD §20.3 gate "${gate.id}" — "${gate.prd}" — has no job "${job}" in ${gate.workflow} ` +
            `(that workflow declares: ${ids.join(', ') || 'nothing'})`,
        );
      }
    }
  }
  claimed.get(fixture.artifactJob.workflow)?.add(fixture.artifactJob.job);

  for (const [workflow, ids] of claimed) {
    for (const job of jobsByWorkflow[workflow] ?? []) {
      if (!ids.has(job)) {
        problems.push(`${workflow} declares job "${job}", which maps to no PRD §20.3 gate class`);
      }
    }
  }
  return problems;
}

/** Deletes one top-level job block from a workflow's source text, for the negative control. */
function withoutJob(source, id) {
  const lines = sourceLines(source);
  const start = lines.findIndex((line) => line.trimEnd() === `  ${id}:`);
  if (start === -1) throw new Error(`no job "${id}" to delete`);
  let end = start + 1;
  while (end < lines.length && !/^ {2}\S/.test(lines[end])) end += 1;
  return [...lines.slice(0, start), ...lines.slice(end)].join('\n');
}

// ---------------------------------------------------------------------------------------------

describe('A. the fixture is a verbatim transcription of PRD §20.3', () => {
  const prd = read('docs/PRD.md');
  const lines = sourceLines(prd);
  const start = lines.findIndex((line) => line.trim() === '### 20.3 CI gates');
  const end = lines.findIndex((line, index) => index > start && line.startsWith('### '));

  it('finds the §20.3 section in docs/PRD.md', () => {
    assert.notEqual(start, -1, 'docs/PRD.md has no "### 20.3 CI gates" heading');
    assert.ok(end > start, 'could not find the end of §20.3');
  });

  const section = lines.slice(start + 1, end);
  const bullets = section.filter((line) => line.startsWith('- ')).map((line) => line.slice(2).trim());
  const paragraphs = section
    .filter((line) => line.trim() !== '' && !line.startsWith('- '))
    .map((line) => line.trim());

  it('has one fixture gate per §20.3 bullet, byte-identical and in order', () => {
    assert.equal(bullets.length, 9, `PRD §20.3 has ${bullets.length} bullets, expected 9`);
    assert.equal(fixture.gates.length, bullets.length, 'fixture gate count differs from PRD §20.3');
    fixture.gates.forEach((gate, index) => {
      assert.equal(
        gate.prd,
        bullets[index],
        `fixture gate "${gate.id}" paraphrases PRD §20.3 bullet ${index + 1}: ` +
          `fixture ${JSON.stringify(gate.prd)} vs PRD ${JSON.stringify(bullets[index])}`,
      );
    });
  });

  it('carries the immutable-artifact paragraph verbatim', () => {
    assert.ok(
      paragraphs.includes(fixture.artifactParagraph),
      `fixture.artifactParagraph is not verbatim PRD §20.3. PRD paragraphs: ${JSON.stringify(paragraphs)}`,
    );
  });
});

describe('B. gate-list replay: PRD §20.3 ↔ workflow jobs, 1:1 in both directions', () => {
  const actual = Object.fromEntries(WORKFLOW_FILES.map((name) => [name, jobsOf(name)]));

  it('maps every PRD §20.3 gate to a job and every job to a gate', () => {
    assert.deepEqual(replayProblems(actual), []);
  });

  it('ci.yml declares exactly the jobs its gates claim — no extra, none missing', () => {
    const claimed = fixture.gates
      .filter((gate) => gate.workflow === 'ci.yml')
      .flatMap((gate) => gate.jobs);
    assert.deepEqual(
      [...jobsOf('ci.yml')].sort(),
      [...claimed].sort(),
      'ci.yml jobs and the PRD §20.3 gate mapping disagree',
    );
    assert.equal(jobsOf('ci.yml').length, 9, 'ci.yml must declare exactly nine gate jobs');
  });

  it('release-candidate.yml declares its gate jobs plus the immutable-artifact job', () => {
    const claimed = fixture.gates
      .filter((gate) => gate.workflow === 'release-candidate.yml')
      .flatMap((gate) => gate.jobs);
    assert.equal(fixture.artifactJob.workflow, 'release-candidate.yml');
    assert.deepEqual(
      [...jobsOf('release-candidate.yml')].sort(),
      [...claimed, fixture.artifactJob.job].sort(),
      'release-candidate.yml jobs and the PRD §20.3 release-candidate mapping disagree',
    );
  });

  it('maps every non-gate job explicitly', () => {
    for (const entry of fixture.nonGateJobs) {
      assert.ok(
        jobsOf(entry.workflow).includes(entry.job),
        `${entry.workflow} has no job "${entry.job}" (${entry.why})`,
      );
    }
    assert.deepEqual(jobsOf('pr-contract.yml'), ['pr-contract']);
  });

  it('gives no job id to two gates', () => {
    const seen = new Map();
    for (const gate of fixture.gates) {
      for (const job of gate.jobs) {
        const key = `${gate.workflow}#${job}`;
        assert.equal(seen.get(key), undefined, `job "${job}" is claimed by ${seen.get(key)} and ${gate.id}`);
        seen.set(key, gate.id);
      }
    }
  });

  it('fails, naming the gate and its PRD text, when a job is deleted (negative control)', () => {
    const doctored = { ...actual, 'ci.yml': jobIds(parseWorkflow(withoutJob(text['ci.yml'], 'pii-citation'))) };
    const problems = replayProblems(doctored);
    assert.equal(problems.length, 1, `expected exactly one problem, got: ${problems.join(' | ')}`);
    assert.match(problems[0], /pii-citation/);
    assert.match(problems[0], /PII and citation validation suites\./);
  });

  it('fails when a job maps to no gate class (reverse negative control)', () => {
    const problems = replayProblems({ ...actual, 'ci.yml': [...actual['ci.yml'], 'sneaky-extra'] });
    assert.equal(problems.length, 1);
    assert.match(problems[0], /sneaky-extra/);
  });
});

describe('C. no gate is silently absent (sub-PRD D4)', () => {
  it('ci.yml carries no if: and no continue-on-error: at any depth', () => {
    const found = guardKeys(doc['ci.yml']);
    assert.deepEqual(found.map((entry) => entry.path), [], `ci.yml has skip/guard keys: ${JSON.stringify(found)}`);
  });

  it('the setup composite carries no if: and no continue-on-error: either', () => {
    assert.deepEqual(guardKeys(composite).map((entry) => entry.path), []);
  });

  it('ci.yml has no commented-out step inside jobs:', () => {
    assert.deepEqual(commentedOutSteps(text['ci.yml']), []);
  });

  it('detects an if: guard in a synthetic control', () => {
    const control = parseWorkflow(['jobs:', '  a:', '    steps:', '      - run: x', '    if: false', ''].join('\n'));
    assert.equal(guardKeys(control).length, 1);
  });

  it('detects continue-on-error in a synthetic control', () => {
    const control = parseWorkflow(['jobs:', '  a:', '    continue-on-error: true', ''].join('\n'));
    assert.equal(guardKeys(control).length, 1);
  });

  it('detects a commented-out step in a synthetic control', () => {
    const control = ['jobs:', '  a:', '    steps:', '      # - run: cargo test --workspace', ''].join('\n');
    assert.equal(commentedOutSteps(control).length, 1);
  });
});

describe('D. every uses: is pinned (PRD §21.1)', () => {
  const SHA = /^[A-Za-z0-9._-]+\/[A-Za-z0-9._/-]+@[0-9a-f]{40}$/;

  it('pins every third-party action to a 40-hex SHA with a readable version comment', () => {
    let thirdParty = 0;
    for (const [label, source] of [...WORKFLOW_FILES.map((n) => [n, text[n]]), [COMPOSITE, compositeText]]) {
      for (const reference of usesReferences(source)) {
        if (reference.value.startsWith('./')) continue;
        thirdParty += 1;
        assert.match(
          reference.value,
          SHA,
          `${label}:${reference.line} — "${reference.value}" is not owner/repo@<40-hex commit sha>`,
        );
        assert.ok(
          reference.trailingComment && /^v?\d/.test(reference.trailingComment),
          `${label}:${reference.line} — no trailing "# v<version>" comment on ${reference.value}`,
        );
      }
    }
    assert.ok(thirdParty >= 4, `only ${thirdParty} third-party actions inspected`);
  });

  it('resolves every local uses: to an action.yml in this tree', () => {
    let local = 0;
    for (const [label, source] of [...WORKFLOW_FILES.map((n) => [n, text[n]]), [COMPOSITE, compositeText]]) {
      for (const reference of usesReferences(source)) {
        if (!reference.value.startsWith('./')) continue;
        local += 1;
        const target = join(REPO_ROOT, reference.value.slice(2), 'action.yml');
        assert.ok(existsSync(target), `${label}:${reference.line} — ${reference.value}/action.yml does not exist`);
      }
    }
    assert.ok(local >= 1, 'no local composite reference found');
  });
});

describe('E. no version literal lives in a workflow file (PRD §45.3)', () => {
  const versions = Object.values(pins.versions);
  const files = listFiles(WORKFLOWS_DIR);

  it('reads the pinned versions from the fixture, never from a literal here', () => {
    assert.equal(versions.length, 4);
  });

  it('contains no pinned version string anywhere under .github/workflows/**', () => {
    assert.ok(files.length >= 8, `only ${files.length} files found under .github/workflows/**`);
    for (const file of files) {
      const body = read(file);
      for (const version of versions) {
        assert.ok(
          !body.includes(version),
          `${file} contains the version literal "${version}" — it belongs in FND-01's pin files only`,
        );
      }
    }
  });

  it('uses only *-version-file keys, never a literal version key', () => {
    const forbidden = ['node-version', 'pnpm-version', 'python-version', 'rust-version', 'toolchain', 'channel'];
    for (const [label, model] of [...WORKFLOW_FILES.map((n) => [n, doc[n]]), [COMPOSITE, composite]]) {
      for (const entry of keysAtAnyDepth(model)) {
        assert.ok(
          !forbidden.includes(entry.key),
          `${label} sets "${entry.key}: ${entry.value}" — resolve the version from its pin file instead`,
        );
      }
    }
  });

  it('resolves the toolchain from the pin files in the composite action', () => {
    assert.match(compositeText, /node-version-file:\s*\.node-version/);
    assert.match(compositeText, /rust-toolchain\.toml/);
    assert.match(compositeText, /corepack install/);
    assert.match(compositeText, /verify-toolchain\.mjs/);
  });
});

describe('F. release-candidate.yml never runs on a pull request', () => {
  it('triggers on push and workflow_dispatch only', () => {
    const on = triggers(doc['release-candidate.yml']);
    assert.deepEqual([...on].sort(), ['push', 'workflow_dispatch']);
    assert.ok(!on.includes('pull_request'), 'release-candidate.yml lists pull_request');
  });

  it('does not cancel a half-finished release build', () => {
    assert.equal(doc['release-candidate.yml'].concurrency['cancel-in-progress'], 'false');
    assert.equal(doc['ci.yml'].concurrency['cancel-in-progress'], 'true');
  });
});

describe('G. secret hygiene and least privilege (PRD §20.2, §21.1)', () => {
  it('uses no pull_request_target anywhere', () => {
    for (const name of WORKFLOW_FILES) {
      assert.ok(!triggers(doc[name]).includes('pull_request_target'), `${name} uses pull_request_target`);
      assert.ok(!text[name].includes('pull_request_target'), `${name} mentions pull_request_target`);
    }
  });

  it('references no secret other than GITHUB_TOKEN', () => {
    for (const [label, source] of [...WORKFLOW_FILES.map((n) => [n, text[n]]), [COMPOSITE, compositeText]]) {
      for (const name of secretReferences(source)) {
        assert.equal(name, 'GITHUB_TOKEN', `${label} references secrets.${name}`);
      }
    }
  });

  it('declares permissions at the workflow and at every job', () => {
    for (const name of WORKFLOW_FILES) {
      assert.deepEqual(doc[name].permissions, { contents: 'read' }, `${name} has no top-level read-only permissions`);
      for (const [id, job] of Object.entries(doc[name].jobs)) {
        assert.deepEqual(job.permissions, { contents: 'read' }, `${name}#${id} declares no permissions`);
      }
    }
  });

  it('interpolates no expression inside a run: block (script injection)', () => {
    for (const [label, model] of [...WORKFLOW_FILES.map((n) => [n, doc[n]]), [COMPOSITE, composite]]) {
      const found = runBlocksWithExpressions(model);
      assert.deepEqual(found.map((entry) => entry.path), [], `${label} interpolates \${{ }} inside a run: block`);
    }
  });

  it('passes the PR body through env:, not through the shell', () => {
    const step = doc['pr-contract.yml'].jobs['pr-contract'].steps.find((candidate) => candidate.env);
    assert.equal(step.env.PR_BODY, '${{ github.event.pull_request.body }}');
    assert.ok(!step.run.includes('${{'));
  });

  it('detects an injected expression in a synthetic control', () => {
    const control = parseWorkflow(['jobs:', '  a:', '    steps:', '      - run: echo ${{ github.event.issue.title }}', ''].join('\n'));
    assert.equal(runBlocksWithExpressions(control).length, 1);
  });
});

describe('H. committed line endings under .github/workflows/**', () => {
  it('stores every committed workflow file as UTF-8 with LF and no BOM', () => {
    const listed = spawnSync('git', ['ls-files', '-z', '.github/workflows'], {
      cwd: REPO_ROOT,
      encoding: 'utf8',
      maxBuffer: 32 * 1024 * 1024,
    });
    assert.equal(listed.status, 0, listed.stderr);
    const files = listed.stdout.split('\0').filter(Boolean);
    for (const file of files) {
      const blob = spawnSync('git', ['show', `HEAD:${file}`], {
        cwd: REPO_ROOT,
        encoding: 'buffer',
        maxBuffer: 32 * 1024 * 1024,
      });
      if (blob.status !== 0) continue; // not committed yet — the first run on a fresh branch
      assert.ok(!blob.stdout.includes(0x0d), `${file} has CRLF in the committed blob`);
      assert.ok(
        !blob.stdout.subarray(0, 3).equals(Buffer.from([0xef, 0xbb, 0xbf])),
        `${file} has a UTF-8 BOM`,
      );
    }
  });
});

describe('I. the PRD §45.4 pull-request contract check', () => {
  const body = (extra) => `## Summary\n\n${extra}\n\n${CONSTRAINT_HEADING}\n\n- [x] no secrets\n`;

  it('passes on a body carrying a requirement ID and the constraint heading', () => {
    assert.deepEqual(checkPrBody(body('Implements DEV-001.')), { ok: true, failures: [] });
  });

  it('passes on an explicit "Requirement IDs: none" line', () => {
    assert.equal(checkPrBody(body('Requirement IDs: none')).ok, true);
  });

  it('fails when neither a requirement ID nor the none-line is present', () => {
    const result = checkPrBody(body('Tidies a comment.'));
    assert.equal(result.ok, false);
    assert.match(result.failures.join('\n'), /no requirement ID/);
  });

  it('fails when the constraint-check heading is missing', () => {
    const result = checkPrBody('Implements DEV-001, no template.');
    assert.equal(result.ok, false);
    assert.match(result.failures.join('\n'), /Constraint check/);
  });

  it('fails on an empty body', () => {
    assert.equal(checkPrBody('').ok, false);
    assert.equal(checkPrBody(undefined).ok, false);
  });

  it('quotes PRD §45.4 in the failure message', () => {
    const report = failureReport(checkPrBody('').failures);
    assert.match(report, /PRD section 45\.4/);
    assert.match(report, /requirement and UAT IDs;/);
    assert.match(report, /rollback or feature-flag path;/);
    assert.match(report, /Q-F6/);
  });
});

describe('J. secret-scan controls', () => {
  it('allowlists exactly one literal and no wildcard', () => {
    assert.deepEqual(ALLOWLIST, ['GITHUB_TOKEN']);
    for (const entry of [...ALLOWLIST, ...PROSE_TREES, ...VALUE_PATTERN_IDS]) {
      assert.ok(!entry.includes('*'), `"${entry}" is a wildcard — it would blind the scan`);
    }
    assert.deepEqual(PROSE_TREES, ['docs/']);
    assert.deepEqual(VALUE_PATTERN_IDS, ['private-key-block']);
  });

  it('detects a synthetic credential assembled at runtime (positive control)', () => {
    const synthetic = ['AWS', 'SECRET', 'ACCESS', 'KEY'].join('_');
    const findings = scan(`env:\n  ${synthetic}: value\n`, 'synthetic.yml');
    assert.ok(findings.length > 0, `the scanner did not detect ${synthetic}`);
  });

  it('still detects a value-shaped secret inside prose (narrowing is not a blind spot)', () => {
    const block = `-----BEGIN ${['RSA', 'PRIVATE', 'KEY'].join(' ')}-----`;
    assert.ok(scan(block, 'docs/whatever.md').length > 0, 'a private key block in docs/ was not detected');
    assert.ok(isProse('docs/whatever.md'));
    assert.ok(!isProse('.github/workflows/ci.yml'));
  });

  it('flags nothing on ordinary prose or on the allowlisted token', () => {
    assert.deepEqual(scan('This paragraph mentions no credential at all.', 'notes.md'), []);
    assert.deepEqual(scan('${{ secrets.GITHUB_TOKEN }}', '.github/workflows/x.yml'), []);
  });

  it('finds no credential-shaped name in the git-tracked tree', () => {
    const { findings, inspected } = scanRepository(REPO_ROOT);
    assert.ok(inspected.length > 50, `the scan inspected only ${inspected.length} files`);
    assert.ok(inspected.some((file) => file.startsWith('docs/')), 'the value-shaped scan never read docs/');
    assert.deepEqual(findings, []);
  });
});

describe('R. the restricted YAML reader refuses what it cannot model', () => {
  it('parses a block mapping, a block sequence and a sequence of maps', () => {
    const model = parseWorkflow(
      ['a: 1', 'b:', '  - x', "  - 'y'", 'c:', '  - k: v', '    m: w', ''].join('\n'),
    );
    assert.deepEqual(model, { a: '1', b: ['x', 'y'], c: [{ k: 'v', m: 'w' }] });
  });

  it('captures a block scalar verbatim', () => {
    const model = parseWorkflow(['run: |', '  one', '  two # not a comment', ''].join('\n'));
    assert.equal(model.run, 'one\ntwo # not a comment');
  });

  it('strips comments outside quotes only', () => {
    const model = parseWorkflow(['a: b # trailing', "c: 'd # kept'", ''].join('\n'));
    assert.deepEqual(model, { a: 'b', c: 'd # kept' });
  });

  it('throws on a flow collection', () => {
    assert.throws(() => parseWorkflow('branches: [main]\n'), WorkflowSyntaxError);
  });

  it('throws on a tab', () => {
    assert.throws(() => parseWorkflow('a:\n\t- b\n'), WorkflowSyntaxError);
  });

  it('throws on an anchor, a document marker and a merge key', () => {
    assert.throws(() => parseWorkflow('a: &anchor 1\n'), WorkflowSyntaxError);
    assert.throws(() => parseWorkflow('---\na: 1\n'), WorkflowSyntaxError);
    assert.throws(() => parseWorkflow('a:\n  <<: b\n'), WorkflowSyntaxError);
  });

  it('throws on a duplicate key and on an unclassifiable line', () => {
    assert.throws(() => parseWorkflow('a: 1\na: 2\n'), WorkflowSyntaxError);
    assert.throws(() => parseWorkflow('just a bare line\n'), WorkflowSyntaxError);
  });
});

describe('K. non-vacuity — a check that inspected nothing must fail', () => {
  it('parsed nine jobs out of ci.yml', () => {
    assert.equal(jobsOf('ci.yml').length, 9);
    assert.equal(Object.keys(doc['ci.yml'].jobs).length, 9);
  });

  it('read every workflow file, the composite, both fixtures and every check script', () => {
    for (const file of listFiles(WORKFLOWS_DIR)) read(file); // order-independent: read them here too
    for (const name of WORKFLOW_FILES) assert.ok(filesRead.has(`.github/workflows/${name}`));
    assert.ok(filesRead.has(COMPOSITE));
    assert.ok(filesRead.has('.github/workflows/fixtures/prd-20-3-gates.json'));
    assert.ok(filesRead.has('tools/fixtures/toolchain-pins.json'));
    assert.ok(filesRead.has('docs/PRD.md'));
    for (const script of ['workflow-model', 'verify-toolchain', 'pr-contract', 'secret-scan']) {
      assert.ok(filesRead.has(`.github/workflows/checks/${script}.mjs`), `${script}.mjs was never read`);
    }
    assert.ok(filesRead.size >= 12, `only ${filesRead.size} files were read`);
  });

  it('sees a non-empty step list in every job of every workflow', () => {
    for (const name of WORKFLOW_FILES) {
      for (const [id, job] of Object.entries(doc[name].jobs)) {
        assert.ok(Array.isArray(job.steps) && job.steps.length > 0, `${name}#${id} has no steps`);
        assert.equal(job['runs-on'], 'ubuntu-latest');
        assert.ok(statSync(join(REPO_ROOT, '.github/workflows', name)).size > 0);
      }
    }
  });
});
