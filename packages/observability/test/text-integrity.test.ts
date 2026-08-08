/**
 * Regression guard: every file this package ships must stay TEXT.
 *
 * Why this is a test and not a style preference. Git classifies a file as binary when a NUL byte
 * appears in the first 8000 bytes, and `.github/workflows/checks/secret-scan.mjs` applies the exact
 * same heuristic (`if (bytes.includes(0)) continue; // binary`). So a single stray control byte in a
 * source file has two silent consequences, both of which disable a review control this ticket depends
 * on:
 *
 *   1. the PR diff renders as "Binary file not shown" — the Reviewer/human stage reads nothing;
 *   2. the CI credential scanner SKIPS the file entirely — it is never scanned for secrets.
 *
 * Both fail open: CI stays green while the protection is gone. That happened once already, to
 * `src/metrics.ts`, where the label-key separator landed as a raw NUL byte rather than as the
 * six-character source escape (backslash, u, 0, 0, 0, 0). Identical runtime behaviour, opposite
 * reviewability — which is exactly why no behavioural test caught it. Hence this scan.
 *
 * The rule is narrow on purpose: TAB, LF and CR are legitimate text; every other C0 control byte and
 * a lone DEL are not. Source escapes are unaffected — they are printable ASCII in the file and only
 * become control characters at runtime.
 *
 * Files are read as `latin1`, where one byte maps to exactly one code unit, so byte offsets are exact
 * without needing `Buffer` typings this package does not declare (see src/node-builtins.d.ts).
 */
import { lstatSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { PACKAGE_DIR } from './support/paths.js';

/** Directories that are build output or dependencies rather than files this package ships. */
const SKIPPED_DIRECTORIES = new Set(['node_modules', 'dist', 'coverage', '.turbo']);

/** TAB, LF and CR are the only control bytes a text file may carry. */
const ALLOWED_CONTROL_BYTES = new Set([0x09, 0x0a, 0x0d]);

const NUL = 0x00;

function shippedFiles(directory: string = PACKAGE_DIR): string[] {
  const found: string[] = [];
  for (const entry of readdirSync(directory).sort()) {
    if (SKIPPED_DIRECTORIES.has(entry)) continue;
    const path = join(directory, entry);
    const stats = lstatSync(path);
    if (stats.isDirectory()) {
      found.push(...shippedFiles(path));
      continue;
    }
    if (stats.isFile()) found.push(path);
  }
  return found;
}

/** Byte offsets of every control byte that makes a file unreviewable. Empty means "clean text". */
function controlByteOffsets(bytes: string): number[] {
  const offsets: number[] = [];
  for (let index = 0; index < bytes.length; index += 1) {
    const byte = bytes.charCodeAt(index);
    if (byte === 0x7f || (byte < 0x20 && !ALLOWED_CONTROL_BYTES.has(byte))) offsets.push(index);
  }
  return offsets;
}

/** Package-relative name, for a failure message that names the offending file and not a temp path. */
function packageRelative(path: string): string {
  return path.startsWith(PACKAGE_DIR) ? path.slice(PACKAGE_DIR.length + 1) : path;
}

describe('the files this package ships', () => {
  const files = shippedFiles();

  it('reads a non-trivial number of files', () => {
    // A scan that silently reads nothing is a scan that asserts nothing.
    expect(files.length).toBeGreaterThan(20);
  });

  it('detects a control byte when one is present (positive control)', () => {
    // Proves the detector below can fail. Every probe is built from numeric char codes, so this file
    // stays free of the bytes it is testing for.
    const probe = (byte: number) => String.fromCharCode(0x61, byte, 0x62);
    expect(controlByteOffsets(probe(NUL))).toEqual([1]);
    expect(controlByteOffsets(probe(0x7f))).toEqual([1]); // DEL
    expect(controlByteOffsets(probe(0x07))).toEqual([1]); // BEL
    // TAB / CR / LF are text and must NOT be reported.
    expect(controlByteOffsets(String.fromCharCode(0x61, 0x09, 0x0d, 0x0a, 0x62))).toEqual([]);
  });

  it('contains no NUL byte, so git and the CI secret scan both read them as text', () => {
    for (const path of files) {
      const bytes = readFileSync(path, 'latin1');
      expect(
        bytes.indexOf(String.fromCharCode(NUL)),
        `${packageRelative(path)} contains a NUL byte: git renders it as binary and ` +
          '.github/workflows/checks/secret-scan.mjs skips it. Write the source escape instead.',
      ).toBe(-1);
    }
  });

  it('contains no other unreviewable control byte', () => {
    for (const path of files) {
      const offsets = controlByteOffsets(readFileSync(path, 'latin1'));
      expect(
        offsets,
        `${packageRelative(path)} carries control bytes at offsets ${offsets.join(', ')}`,
      ).toEqual([]);
    }
  });
});
