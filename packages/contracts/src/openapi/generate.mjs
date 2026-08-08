/**
 * FND-04 deliverable 7 — `pnpm generate`.
 *
 * Reachable from the root delegator (`node tools/workspace-script.mjs generate` ->
 * `pnpm -r --if-present run generate` -> this file). No root file is edited; `packages/contracts`
 * simply provides the script name PRD §45.3 already lists (sub-PRD D22 records why the FND-01
 * fixture entry moved out of `owners` when that happened).
 *
 * Writes ONLY under `packages/contracts/src/generated/`, deleting files the emitter no longer
 * produces. It never writes `schemas/openapi/baseline/**` — a baseline advance is an explicit,
 * reviewed commit (FND-04 deliverable 5, `schemas/openapi/baseline/README.md`).
 *
 * THE EMITTER IS LF-ONLY; THE WORKING TREE IS WHATEVER GIT WOULD CHECK OUT.
 *
 * `emit()` produces LF bytes and nothing else — that is what lands in the index, and
 * `test/generated/working-tree.test.ts` asserts every committed generated blob is LF, exactly as
 * `tools/tests/line-endings.test.mjs` does for `tools/**`.
 *
 * Writing those LF bytes straight to disk was WRONG on this repository, and the earlier claim that
 * `pnpm generate && pnpm generated:check` was "unaffected either way" was false. Repository-local
 * `core.autocrlf=true` (and `.gitattributes` cannot be used to override it here — breakdown plan §4
 * leaves `.gitattributes` unallocated and `tools/tests/frozen-paths.test.mjs` forbids editing it on a
 * ticket branch). Under `core.autocrlf=true` git CHECKS OUT these files as CRLF and compares the
 * working tree against that checkout form. An LF working-tree file therefore shows as ` M` in
 * `git status --porcelain` even though `git hash-object` proves the content is byte-identical to the
 * committed blob — which is precisely the check FND-04 acceptance item 6 / DEV-001 names as its
 * evidence, and it failed.
 *
 * So the write step reproduces git's own checkout transformation instead of fighting it: the newline
 * written to disk is the newline `git checkout` would have written for that path, derived from
 * `git check-attr text eol` first and `core.autocrlf` second (`workingTreeNewline()` below). On Linux
 * CI (`core.autocrlf` unset/false) that is LF, so CI output is unchanged; on a Windows checkout it is
 * CRLF, the working tree matches the checkout form, and `git status --porcelain` is empty. The index
 * bytes stay LF either way, because `core.autocrlf=true` normalises CRLF back to LF on add.
 *
 * This changes NOTHING about determinism: `emit()` stays pure and byte-stable
 * (`test/generated/determinism.test.ts`), and `generated:check` still compares emitter bytes, never a
 * fuzzy match. Only the I/O boundary is platform-aware, in exactly the way git itself is.
 */
import { spawnSync } from 'node:child_process';
import { mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';

import { REPO_ROOT, loadOpenApiDocument } from './document.mjs';
import { GENERATED_DIR, emit } from './emit.mjs';

const PACKAGE_ROOT = join(REPO_ROOT, 'packages', 'contracts');

/**
 * The newline `git checkout` puts in the WORKING TREE for a text file, given git's own answers.
 *
 * Kept pure and exported so every branch is testable without a repository configured that way — the
 * regression test for the FND-04 bounce drives all four cases through this function directly.
 *
 * Mirrors gitattributes(5): an explicit `eol` attribute wins; a file marked binary (`-text`, reported
 * by `check-attr` as `unset`) is never converted; otherwise `core.autocrlf=true` means CRLF in the
 * working tree and LF in the index. `input` and `false` both check out LF.
 */
export function workingTreeNewline({ textAttribute, eolAttribute, autocrlf }) {
  if (textAttribute === 'unset') return '\n';
  if (eolAttribute === 'lf') return '\n';
  if (eolAttribute === 'crlf') return '\r\n';
  return autocrlf === 'true' ? '\r\n' : '\n';
}

/** Render LF emitter bytes into the checkout form. Throws if the emitter produced a CR itself. */
export function renderForWorkingTree(contents, newline) {
  if (contents.includes('\r')) {
    throw new Error('generate: the emitter produced a CR byte; generated output must be LF only');
  }
  return newline === '\n' ? contents : contents.split('\n').join(newline);
}

function git(args) {
  return spawnSync('git', args, { cwd: REPO_ROOT, encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 });
}

/** `git check-attr -z text eol -- <path>` -> `{ textAttribute, eolAttribute }`, or `{}` on failure. */
function attributesFor(absolutePath) {
  const result = git(['check-attr', '-z', 'text', 'eol', '--', absolutePath]);
  if (result.status !== 0 || typeof result.stdout !== 'string') return {};
  const fields = result.stdout.split('\0');
  const attributes = {};
  // -z emits a flat <path> NUL <attribute> NUL <value> NUL stream, so a path containing a colon or
  // a space cannot be mis-split the way the human-readable form can.
  for (let at = 0; at + 2 < fields.length; at += 3) attributes[fields[at + 1]] = fields[at + 2];
  return { textAttribute: attributes.text, eolAttribute: attributes.eol };
}

let autocrlfCache;
function autocrlf() {
  if (autocrlfCache === undefined) {
    const result = git(['config', '--get', 'core.autocrlf']);
    autocrlfCache = result.status === 0 ? String(result.stdout).trim().toLowerCase() : 'false';
  }
  return autocrlfCache;
}

const newlineCache = new Map();

/** The checkout newline for one absolute path, resolved from git and memoised for the process. */
export function workingTreeNewlineFor(absolutePath) {
  const cached = newlineCache.get(absolutePath);
  if (cached !== undefined) return cached;
  let newline;
  try {
    newline = workingTreeNewline({ ...attributesFor(absolutePath), autocrlf: autocrlf() });
  } catch {
    newline = '\n'; // no git on PATH: LF is the emitter's own form and the CI form
  }
  newlineCache.set(absolutePath, newline);
  return newline;
}

/** Every file currently under `packages/contracts/src/generated/`, repository-package-relative. */
export function existingGeneratedFiles(packageRoot = PACKAGE_ROOT) {
  const root = join(packageRoot, GENERATED_DIR);
  const found = [];
  const walk = (directory) => {
    let entries;
    try {
      entries = readdirSync(directory, { withFileTypes: true });
    } catch {
      return; // the tree does not exist yet — the first run on a fresh checkout
    }
    for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
      const absolute = join(directory, entry.name);
      if (entry.isDirectory()) walk(absolute);
      else found.push(relative(packageRoot, absolute).split('\\').join('/'));
    }
  };
  walk(root);
  return found.sort();
}

/**
 * Write `files` under `packageRoot`, removing anything under the generated tree that is not in it.
 * Returns the sorted list of paths written, so a caller can assert the write-set.
 */
export function writeGenerated(files, packageRoot = PACKAGE_ROOT) {
  for (const path of files.keys()) {
    if (!path.startsWith(`${GENERATED_DIR}/`)) {
      throw new Error(`generate: refusing to write outside ${GENERATED_DIR}: ${path}`);
    }
  }

  for (const stale of existingGeneratedFiles(packageRoot)) {
    if (!files.has(stale)) rmSync(join(packageRoot, stale), { force: true });
  }

  const written = [];
  for (const [path, contents] of files) {
    const absolute = join(packageRoot, path);
    mkdirSync(dirname(absolute), { recursive: true });
    // The bytes that go to disk are the emitter's LF bytes rendered into git's checkout form for
    // this path — see the header. The index still receives LF.
    const onDisk = renderForWorkingTree(contents, workingTreeNewlineFor(absolute));
    // Byte-identical rewrites are skipped so a no-op `pnpm generate` does not touch mtimes.
    let current = null;
    try {
      if (statSync(absolute).isFile()) current = readFileSync(absolute, 'utf8');
    } catch {
      current = null;
    }
    if (current !== onDisk) writeFileSync(absolute, onDisk, { encoding: 'utf8' });
    written.push(path);
  }
  return written.sort();
}

export function main() {
  const document = loadOpenApiDocument();
  const files = emit(document);
  const written = writeGenerated(files);
  process.stdout.write(`generate: ${written.length} file(s) under packages/contracts/${GENERATED_DIR}\n`);
  return 0;
}

if (process.argv[1] && process.argv[1].endsWith('generate.mjs')) {
  process.exit(main());
}
