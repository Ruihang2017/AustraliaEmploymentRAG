/**
 * FND-01 — the assertions shared by the verification script (tools/check-workspace.mjs) and the test
 * suite (tools/tests/**). Every function returns an array of human-readable problem strings and names
 * the offending path or value, so a negative test (rename a directory, downgrade a pin, add a
 * `console.log` to an entry file) fails loudly rather than flipping a boolean.
 *
 * Pure filesystem reads. No network, no mutation, no credential access (PRD section 20.2).
 */
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/** Entry-file content the skeleton is allowed to contain, per the FND-01 File-scope. */
export const ENTRY_FILE_CONTENT = {
  ts: 'export {};\n',
  rs: '',
  py: '',
};

export function loadFixture(name, root = REPO_ROOT) {
  return JSON.parse(readFileSync(join(root, 'tools/fixtures', name), 'utf8'));
}

function isDirectory(path) {
  return existsSync(path) && statSync(path).isDirectory();
}

// ---------------------------------------------------------------------------------------------
// (a) PRD section 20.1 layout
// ---------------------------------------------------------------------------------------------

export function assertLayout(root = REPO_ROOT) {
  const fixture = loadFixture('prd-20-1-layout.json', root);
  const problems = [];

  for (const dir of fixture.directories) {
    if (!isDirectory(join(root, dir))) {
      problems.push(`PRD 20.1 directory is missing from the filesystem: ${dir}`);
    }
  }

  const allowed = new Set([
    ...fixture.topLevelFromLayout,
    ...fixture.topLevelPreexistingAllowed.entries,
    ...fixture.topLevelIgnored.entries,
  ]);
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    if (!allowed.has(entry.name)) {
      problems.push(
        `unexpected top-level directory "${entry.name}" — not in PRD 20.1, not a pre-existing ` +
          'entry and not an ignored build artifact',
      );
    }
  }

  return problems;
}

// ---------------------------------------------------------------------------------------------
// (b) Toolchain pins — breakdown plan section 8 Q12 (CONFIRMED) / sub-PRD D17
// ---------------------------------------------------------------------------------------------

/** Reads the actual value a pin fixture entry points at. Returns null when it cannot be found. */
export function readPinValue(pin, root = REPO_ROOT) {
  const path = join(root, pin.file);
  if (!existsSync(path)) return null;
  const text = readFileSync(path, 'utf8');

  if (pin.file === '.node-version') return text.trim();
  if (pin.file === 'package.json') {
    const manifest = JSON.parse(text);
    return pin.field.split('.').reduce((node, key) => (node == null ? node : node[key]), manifest) ?? null;
  }
  if (pin.file === 'rust-toolchain.toml') {
    return text.match(/^\s*channel\s*=\s*"([^"]+)"/m)?.[1] ?? null;
  }
  if (pin.file === 'pyproject.toml') {
    return text.match(/^\s*requires-python\s*=\s*"([^"]+)"/m)?.[1] ?? null;
  }
  throw new Error(`no reader for pin file ${pin.file}`);
}

const Q12 =
  'breakdown plan section 8 Q12 (CONFIRMED) / sub-PRD 00-foundation D17 — a valid-but-different ' +
  'version is still a failure; follow FND-01 Feedback obligation 3 before changing any pin';

export function assertPins(root = REPO_ROOT) {
  const fixture = loadFixture('toolchain-pins.json', root);
  const problems = [];

  for (const pin of fixture.pins) {
    const actual = readPinValue(pin, root);
    if (actual === null) {
      problems.push(`pin ${pin.id}: ${pin.file} # ${pin.field} is absent — expected "${pin.expected}" (${Q12})`);
      continue;
    }
    if (actual !== pin.expected) {
      problems.push(
        `pin ${pin.id}: ${pin.file} # ${pin.field} is "${actual}" but must be exactly ` +
          `"${pin.expected}" (${Q12})`,
      );
      continue;
    }
    for (const marker of fixture.rangeMarkersForbidden) {
      // `==3.14.6` legitimately contains `=`; only the listed range markers are rejected, and the
      // requires-python pin is compared for equality above anyway.
      const stripped = pin.file === 'pyproject.toml' ? actual.replace(/^==/, '') : actual;
      if (stripped.includes(marker)) {
        problems.push(
          `pin ${pin.id}: ${pin.file} # ${pin.field} = "${actual}" contains the range marker ` +
            `"${marker}"; PRD section 18.2 requires an exact version (${Q12})`,
        );
      }
    }
  }

  return problems;
}

// ---------------------------------------------------------------------------------------------
// Member skeleton
// ---------------------------------------------------------------------------------------------

export function pnpmMembers(root = REPO_ROOT) {
  const yaml = readFileSync(join(root, 'pnpm-workspace.yaml'), 'utf8');
  const globs = [...yaml.matchAll(/^\s*-\s*'([^']+)'\s*$/gm)].map((match) => match[1]);
  const members = [];
  for (const glob of globs) {
    const [parent, leaf] = glob.split('/');
    if (leaf !== '*') throw new Error(`unsupported workspace glob (only '<dir>/*'): ${glob}`);
    if (!isDirectory(join(root, parent))) continue;
    for (const entry of readdirSync(join(root, parent), { withFileTypes: true })) {
      if (entry.isDirectory()) members.push(`${parent}/${entry.name}`);
    }
  }
  return members.sort();
}

export function cargoMembers(root = REPO_ROOT) {
  const text = readFileSync(join(root, 'Cargo.toml'), 'utf8');
  const list = text.match(/members\s*=\s*\[([^\]]*)\]/)?.[1] ?? '';
  return [...list.matchAll(/"([^"]+)"/g)].map((match) => match[1]).sort();
}

export function uvMembers(root = REPO_ROOT) {
  const text = readFileSync(join(root, 'pyproject.toml'), 'utf8');
  const section = text.match(/\[tool\.uv\.workspace\][\s\S]*?members\s*=\s*\[([^\]]*)\]/)?.[1] ?? '';
  const globs = [...section.matchAll(/"([^"]+)"/g)].map((match) => match[1]);
  const members = [];
  for (const glob of globs) {
    if (!glob.endsWith('/*')) {
      members.push(glob);
      continue;
    }
    const parent = glob.slice(0, -2);
    if (!isDirectory(join(root, parent))) continue;
    for (const entry of readdirSync(join(root, parent), { withFileTypes: true })) {
      if (entry.isDirectory()) members.push(`${parent}/${entry.name}`);
    }
  }
  return members.sort();
}

export function assertSkeleton(root = REPO_ROOT) {
  const problems = [];

  for (const member of pnpmMembers(root)) {
    for (const file of ['package.json', 'tsconfig.json', 'src/index.ts']) {
      if (!existsSync(join(root, member, file))) {
        problems.push(`pnpm member ${member} is missing ${file}`);
      }
    }
    const tsconfigPath = join(root, member, 'tsconfig.json');
    if (existsSync(tsconfigPath)) {
      const tsconfig = JSON.parse(readFileSync(tsconfigPath, 'utf8'));
      const target = resolve(join(root, member), tsconfig.extends ?? '');
      if (target !== resolve(root, 'tsconfig.base.json')) {
        problems.push(
          `pnpm member ${member}: tsconfig.json#extends resolves to "${relative(root, target)}", ` +
            'expected tsconfig.base.json',
        );
      }
      // RUNT-06 (shared with RUNT-05): `compilerOptions` joins the allowed key set. A member MAY
      // carry a platform fact the shared base cannot express — `packages/ui` and `apps/web` need
      // `jsx` and the DOM lib, and PRD §18.2 fixes React + Vite — but it still MUST extend the
      // shared base (asserted above) and MUST NOT add `files`, a second `extends` or anything else.
      // Without this, no `.tsx` file anywhere in the repository can pass `pnpm typecheck` (TS17004).
      // See docs/prd/03-app-runtime/README.md §6 QR12; `tools/**` is `00-foundation`'s row, so the
      // relaxation is escalated on the RUNT-06 PR rather than assumed.
      const extraKeys = Object.keys(tsconfig).filter(
        (key) => !['extends', 'include', 'references', 'compilerOptions'].includes(key),
      );
      if (extraKeys.length > 0) {
        problems.push(
          `pnpm member ${member}: tsconfig.json adds ${extraKeys.join(', ')}; the FND-01 skeleton ` +
            'allows only extends/include/references/compilerOptions',
        );
      }
    }
  }

  for (const member of cargoMembers(root)) {
    for (const file of ['Cargo.toml', 'src/lib.rs']) {
      if (!existsSync(join(root, member, file))) {
        problems.push(`cargo member ${member} is missing ${file}`);
      }
    }
  }

  for (const member of uvMembers(root)) {
    if (!existsSync(join(root, member, 'pyproject.toml'))) {
      problems.push(`uv member ${member} is missing pyproject.toml`);
      continue;
    }
    const packages = readdirSync(join(root, member), { withFileTypes: true }).filter(
      (entry) => entry.isDirectory() && existsSync(join(root, member, entry.name, '__init__.py')),
    );
    if (packages.length !== 1) {
      problems.push(
        `uv member ${member}: expected exactly one package directory containing __init__.py, ` +
          `found ${packages.length}`,
      );
    }
  }

  return problems;
}

/** Entry files must contain nothing but an empty export/module (FND-01 File-scope). */
export function assertEntryFilesEmpty(root = REPO_ROOT) {
  const problems = [];
  const check = (relPath, expected) => {
    const path = join(root, relPath);
    if (!existsSync(path)) return;
    // git's core.autocrlf=true rewrites LF to CRLF in a Windows working tree on checkout. The
    // committed blob is still LF (asserted separately by tools/tests/line-endings.test.mjs); what
    // this check is about is *content*, so normalise before comparing.
    const actual = readFileSync(path, 'utf8').split('\r\n').join('\n');
    if (actual !== expected) {
      problems.push(
        `skeleton entry file ${relPath} is not empty: expected ${JSON.stringify(expected)}, ` +
          `found ${JSON.stringify(actual.length > 80 ? `${actual.slice(0, 80)}…` : actual)}`,
      );
    }
  };

  for (const member of pnpmMembers(root)) check(`${member}/src/index.ts`, ENTRY_FILE_CONTENT.ts);
  for (const member of cargoMembers(root)) check(`${member}/src/lib.rs`, ENTRY_FILE_CONTENT.rs);
  for (const member of uvMembers(root)) {
    for (const entry of readdirSync(join(root, member), { withFileTypes: true })) {
      if (entry.isDirectory() && existsSync(join(root, member, entry.name, '__init__.py'))) {
        check(`${member}/${entry.name}/__init__.py`, ENTRY_FILE_CONTENT.py);
      }
    }
  }

  return problems;
}

// ---------------------------------------------------------------------------------------------
// Secret scan (PRD section 20.2)
// ---------------------------------------------------------------------------------------------

/** Scans one blob of text. Exported so the test suite can feed it a synthetic positive control. */
export function scanText(text, label, root = REPO_ROOT) {
  const fixture = loadFixture('secret-patterns.json', root);
  const findings = [];
  for (const pattern of fixture.patterns) {
    const regex = new RegExp(pattern.regex, 'g');
    for (const match of text.matchAll(regex)) {
      findings.push({ label, patternId: pattern.id, match: match[0] });
    }
  }
  return findings;
}

function walk(dir, root, acc) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (['node_modules', '__pycache__', '.pytest_cache', 'target', '.venv'].includes(entry.name)) continue;
      walk(full, root, acc);
    } else if (entry.isFile()) {
      acc.push(relative(root, full).split('\\').join('/'));
    }
  }
  return acc;
}

export function scanForSecrets(root = REPO_ROOT) {
  const fixture = loadFixture('secret-patterns.json', root);
  const excluded = new Set(fixture.excludedPaths);
  const findings = [];

  const files = [...fixture.scanRootFiles];
  for (const scanRoot of fixture.scanRoots) {
    if (isDirectory(join(root, scanRoot))) walk(join(root, scanRoot), root, files);
  }

  for (const file of files) {
    if (excluded.has(file)) continue;
    const path = join(root, file);
    if (!existsSync(path)) continue;
    let text;
    try {
      text = readFileSync(path, 'utf8');
    } catch {
      continue;
    }
    if (file === 'package.json') {
      text = JSON.stringify(JSON.parse(text).scripts ?? {});
    }
    findings.push(...scanText(text, file, root));
  }

  return findings;
}

/** Files the secret scan actually inspected — used to prove the scan is not vacuous. */
export function secretScanInventory(root = REPO_ROOT) {
  const fixture = loadFixture('secret-patterns.json', root);
  const excluded = new Set(fixture.excludedPaths);
  const files = [...fixture.scanRootFiles];
  for (const scanRoot of fixture.scanRoots) {
    if (isDirectory(join(root, scanRoot))) walk(join(root, scanRoot), root, files);
  }
  return files.filter((file) => !excluded.has(file));
}
