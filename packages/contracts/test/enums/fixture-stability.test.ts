/**
 * FND-03 deliverable 7 / acceptance item 9 — the stability rule, encoded.
 *
 * No registered enum member may be removed or renamed relative to the committed fixture: renaming a
 * controlled value is a breaking change requiring `/v2` (PRD §16.1) and a PRD update (PRD §45.5), not
 * a refactor. Adding a member is allowed (additive within /v1, PRD §16.1).
 *
 * The comparison runs against the fixture as committed on the base branch. On the branch that first
 * lands the fixture there is no committed blob to compare with — so the guard would be trivially
 * green forever if that were the whole test. It is not: `regressions()` is also exercised against a
 * synthetic prior fixture, proving the guard can fail and that its message names the family.
 */
import { spawnSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';

import {
  FIXTURE_RELATIVE_PATH,
  PACKAGE_ROOT,
  familyOf,
  loadFixture,
  parseFixture,
  type EnumFixture,
} from './fixture.js';

const REPO_ROOT = `${PACKAGE_ROOT}/../..`;
const FIXTURE_PATH_FROM_REPO_ROOT = `packages/contracts/${FIXTURE_RELATIVE_PATH}`;

/**
 * Members present in `previous` and absent from `current` — i.e. removals and the losing half of a
 * rename. Each message names its family so the failure is actionable without a diff.
 */
export function regressions(previous: EnumFixture, current: EnumFixture): string[] {
  const problems: string[] = [];
  for (const [family, before] of Object.entries(previous.families)) {
    const after = current.families[family];
    if (!after) {
      problems.push(`${family}: the whole family was removed (PRD ${before.prdSection})`);
      continue;
    }
    const kept = new Set(after.values);
    for (const member of before.values) {
      if (!kept.has(member)) {
        problems.push(
          `${family}: member ${member} was removed or renamed — a breaking change requiring /v2 ` +
            `(PRD §16.1), not a refactor`,
        );
      }
    }
  }
  return problems;
}

function committedFixture(): EnumFixture | null {
  for (const ref of ['main', 'origin/main']) {
    const exists = spawnSync('git', ['rev-parse', '--verify', '--quiet', ref], {
      cwd: REPO_ROOT,
      encoding: 'utf8',
    });
    if (exists.status !== 0) continue;
    const blob = spawnSync('git', ['show', `${ref}:${FIXTURE_PATH_FROM_REPO_ROOT}`], {
      cwd: REPO_ROOT,
      encoding: 'utf8',
      maxBuffer: 32 * 1024 * 1024,
    });
    if (blob.status === 0) return parseFixture(blob.stdout);
  }
  return null;
}

const current = loadFixture();

/** A deep, mutable copy for the synthetic cases below. */
interface MutableFixture {
  families: Record<string, { prdSection: string; values: string[] }>;
}
function mutableClone(fixture: EnumFixture): MutableFixture {
  return structuredClone(fixture) as unknown as MutableFixture;
}
/** Mutable access to a cloned family, failing loudly instead of asserting non-null. */
function mutableFamily(clone: MutableFixture, name: string): { values: string[] } {
  const family = clone.families[name];
  if (!family) throw new Error(`family ${name} is missing from the clone`);
  return family;
}

describe('enum stability', () => {
  it('removes or renames no member relative to the committed fixture', () => {
    const previous = committedFixture();
    if (!previous) {
      // First landing: nothing committed on the base branch yet. Not a pass by assumption — the
      // synthetic cases below prove the guard works, and this branch disappears once it lands.
      expect(current.families).toBeDefined();
      return;
    }
    expect(regressions(previous, current)).toEqual([]);
  });

  it('reports a removed member and names its family', () => {
    const previous = mutableClone(current);
    previous.families.LegalStatus = {
      prdSection: '§6.7',
      values: [...familyOf(current, 'LegalStatus').values, 'GHOST_STATUS'],
    };
    const problems = regressions(previous as unknown as EnumFixture, current);
    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain('LegalStatus');
    expect(problems[0]).toContain('GHOST_STATUS');
  });

  it('reports a renamed member, naming the family and the old spelling', () => {
    const previous = mutableClone(current);
    mutableFamily(previous, 'AnswerStatus').values[1] = 'CONDITIONALLY_SUPPORTED';
    const problems = regressions(previous as unknown as EnumFixture, current);
    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain('AnswerStatus');
    expect(problems[0]).toContain('CONDITIONALLY_SUPPORTED');
  });

  it('reports a removed family', () => {
    const trimmed = mutableClone(current);
    delete trimmed.families.SsoConnectionState;
    const problems = regressions(current, trimmed as unknown as EnumFixture);
    expect(problems.join('\n')).toContain('SsoConnectionState');
  });

  it('allows an added member — additive within /v1 (PRD §16.1)', () => {
    const next = mutableClone(current);
    mutableFamily(next, 'SseEventType').values.push('job.retried');
    expect(regressions(current, next as unknown as EnumFixture)).toEqual([]);
  });
});
