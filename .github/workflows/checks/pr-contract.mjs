/**
 * FND-02 deliverable 5 — the PRD section 45.4 pull-request contract check.
 *
 * Tolerant **by design**, and the reason is recorded, not improvised: `.github/PULL_REQUEST_TEMPLATE.md`
 * is unallocated by breakdown plan section 4 (sub-PRD 00-foundation open question Q-F6), so this check
 * must work against the template as it stands and must never edit it. It therefore asserts the two
 * things the template can carry today:
 *
 *   1. at least one requirement ID, or an explicit `Requirement IDs: none` line; and
 *   2. the template's `## Constraint check` heading.
 *
 * The PR body reaches this script through the `PR_BODY` environment variable only. Interpolating
 * `${{ github.event.pull_request.body }}` into a `run:` block would execute attacker-controlled text
 * on the runner; the workflows.test.mjs harness asserts no `run:` block in any workflow contains an
 * expression at all.
 *
 * Pure text processing. No filesystem access, no network.
 */
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const REQUIREMENT_ID = /\b(AUTH|SRCH|ANS|COV|CMP|REC|MON|EXP|DEV|ADM|COR|PII|SEC|OPS|EVAL)-\d{3}\b/;
export const NONE_LINE = /^\s*Requirement IDs:\s*none\s*$/im;
export const CONSTRAINT_HEADING = '## Constraint check';

export const PRD_45_4_ITEMS = [
  'requirement and UAT IDs;',
  'user-visible change and non-goals;',
  'schema/API/event compatibility impact;',
  'tenant/PII/security and retention impact;',
  'source/licence/provenance impact if applicable;',
  'tests run and manual founder test steps;',
  'model/token/cost, memory/disk and latency impact where applicable;',
  'rollback or feature-flag path;',
  'known gaps and follow-up IDs.',
];

/** Pure: returns `{ ok, failures }` for one PR body. Never reads a file or the environment. */
export function checkPrBody(body) {
  const text = typeof body === 'string' ? body : '';
  const failures = [];

  if (text.trim() === '') {
    failures.push('the pull-request body is empty');
  }
  if (!REQUIREMENT_ID.test(text) && !NONE_LINE.test(text)) {
    failures.push(
      'no requirement ID found. State at least one id matching ' +
        `${REQUIREMENT_ID.source} (for example the epic's ticket requirement), or an explicit ` +
        '"Requirement IDs: none" line if this change carries none.',
    );
  }
  if (!text.includes(CONSTRAINT_HEADING)) {
    failures.push(
      `the "${CONSTRAINT_HEADING}" heading from .github/PULL_REQUEST_TEMPLATE.md is missing — ` +
        'the PR was not written from the template.',
    );
  }

  return { ok: failures.length === 0, failures };
}

export function failureReport(failures) {
  return [
    'PRD section 45.4 pull-request contract not satisfied:',
    ...failures.map((failure) => `  - ${failure}`),
    '',
    'PRD section 45.4 requires every implementation PR to state:',
    ...PRD_45_4_ITEMS.map((item) => `  - ${item}`),
    '',
    'Changes to an immutable/public contract include regenerated bindings and compatibility tests.',
    '',
    'This check is deliberately tolerant: .github/PULL_REQUEST_TEMPLATE.md has no requirement-ID',
    'section and no module owns it (breakdown plan section 4; sub-PRD 00-foundation Q-F6, open).',
    'Fix the PR body. Do not edit the template to make this pass.',
  ].join('\n');
}

// Runs only when invoked directly, so the unit tests can import `checkPrBody` without exiting.
if (process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) {
  const { ok, failures } = checkPrBody(process.env.PR_BODY);
  if (!ok) {
    process.stderr.write(`${failureReport(failures)}\n`);
    process.exit(1);
  }
  process.stdout.write('PR body satisfies the PRD section 45.4 contract check.\n');
}
