/**
 * FND-02 — the "secret" class of PRD section 20.3's "Dependency, secret, container and artifact
 * scans", widened from FND-01's `tools/**` sweep to the whole git-tracked tree.
 *
 * The patterns are FND-01's, imported from `tools/fixtures/secret-patterns.json` and never copied:
 * a second copy is a second thing to forget to update.
 *
 * ALLOWLIST: the fixture's `token` pattern matches `GITHUB_TOKEN`, which every workflow may
 * legitimately name (PRD section 20.2 permits exactly that one, scoped per job). The allowlist
 * therefore holds exactly one literal entry and no wildcard — a wildcard here would blind the scan,
 * which is the same discipline FND-01 applied to its single excluded path. The harness asserts the
 * length is 1.
 *
 * PROSE (`docs/**`): seven of the fixture's eight patterns match credential-shaped *environment
 * variable names*, not credential *values*. The planning corpus necessarily writes those names down:
 * a provider's API-key variable, an error code ending in `_INVALID`, a test fixture's environment
 * name — all prose, in files that are frozen or owned by other tickets anyway (`docs/PRD.md`,
 * `docs/discovery/**`, every ticket file). Under `docs/**` this scan therefore applies only
 * the one **value**-shaped pattern, `private-key-block`, which matches an inlined signing or SSH key
 * and can never be legitimate prose. Everywhere else — code, config, workflows, manifests, lockfiles
 * — every pattern applies. The harness asserts the value-shaped scan really does read `docs/**`
 * files, so the narrowing cannot silently become "docs are not scanned".
 *
 * Read-only: git plumbing plus `readFileSync`. No network. Reads no environment variable that could
 * carry a credential (PRD section 20.2).
 */
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { REPO_ROOT, loadFixture, scanText } from '../../../tools/workspace-assertions.mjs';

/** Exactly one entry, and it is a literal, never a pattern. */
export const ALLOWLIST = ['GITHUB_TOKEN'];

/** Prose trees: only value-shaped patterns apply. Exactly one prefix, and it is not a wildcard. */
export const PROSE_TREES = ['docs/'];

/** The fixture patterns that match a credential *value* rather than a variable *name*. */
export const VALUE_PATTERN_IDS = ['private-key-block'];

const MAX_BYTES = 8 * 1024 * 1024;

export function isProse(label) {
  return PROSE_TREES.some((prefix) => label.startsWith(prefix));
}

/** Pure-ish: scans one blob, drops allowlisted matches, and narrows prose to value-shaped patterns. */
export function scan(text, label = '<memory>') {
  return scanText(text, label, REPO_ROOT)
    .filter((finding) => !ALLOWLIST.includes(finding.match))
    .filter((finding) => !isProse(label) || VALUE_PATTERN_IDS.includes(finding.patternId));
}

/** Git-tracked files, minus the fixture's excluded paths. */
export function trackedFiles(root = REPO_ROOT) {
  const listed = spawnSync('git', ['ls-files', '-z'], {
    cwd: root,
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  });
  if (listed.status !== 0) {
    throw new Error(`git ls-files failed: ${listed.stderr}`);
  }
  const excluded = new Set(loadFixture('secret-patterns.json', root).excludedPaths);
  return listed.stdout.split('\0').filter((path) => path.length > 0 && !excluded.has(path));
}

export function scanRepository(root = REPO_ROOT) {
  const findings = [];
  const inspected = [];
  for (const file of trackedFiles(root)) {
    const path = join(root, file);
    if (!existsSync(path) || statSync(path).size > MAX_BYTES) continue;
    const bytes = readFileSync(path);
    if (bytes.includes(0)) continue; // binary
    inspected.push(file);
    findings.push(...scan(bytes.toString('utf8'), file));
  }
  return { findings, inspected };
}

// Runs only when invoked directly, so the harness can import `scan` for its positive control.
if (process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) {
  const { findings, inspected } = scanRepository();
  process.stdout.write(`secret scan: ${inspected.length} git-tracked text files inspected\n`);
  if (inspected.length === 0) {
    process.stderr.write('secret scan inspected nothing — a scan that reads no file discharges nothing\n');
    process.exit(1);
  }
  if (findings.length > 0) {
    process.stderr.write(
      `\ncredential-shaped names found (PRD section 20.2 — CI must carry no production credential):\n${findings
        .map((finding) => `  - ${finding.label}: ${finding.match} (pattern ${finding.patternId})`)
        .join('\n')}\n`,
    );
    process.exit(1);
  }
  process.stdout.write('secret scan: no credential-shaped name outside the allowlist.\n');
}
