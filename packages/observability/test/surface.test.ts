/**
 * RUNT-07 acceptance item 2 — "No public API accepts an arbitrary object — there is no
 * `extra`/`meta`/`data`/`payload` parameter anywhere in the export surface, asserted at the type
 * level and by a source scan."
 *
 * The type-level half is `test/types/no-arbitrary-object.test-d.ts`, compiled by `pnpm typecheck`
 * because `tsconfig.json` includes `test`. This file is the source scan.
 */
import { describe, expect, it } from 'vitest';

import { sourceFiles } from './support/paths.js';

/**
 * Removes block and line comments plus string literals, so the scan reads CODE only. Without this
 * step the scan would fire on its own documentation — every one of these names is written down in a
 * file header explaining why it does not exist as a parameter.
 */
function code(text: string): string {
  return text
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/(^|[^:])\/\/.*$/gm, '$1 ')
    .replace(/'(?:[^'\\\n]|\\.)*'/g, "''")
    .replace(/"(?:[^"\\\n]|\\.)*"/g, '""')
    .replace(/`(?:[^`\\]|\\.)*`/g, '``');
}

describe('the exported surface', () => {
  const raw = sourceFiles();
  const files = raw.map((file) => ({ name: file.name, text: code(file.text) }));

  it('reads a non-trivial number of source files', () => {
    expect(files.length).toBeGreaterThan(8);
  });

  it('declares no escape-hatch parameter or property', () => {
    for (const file of files) {
      for (const name of ['extra', 'meta', 'payload', 'details', 'context', 'data']) {
        const pattern = new RegExp(`\\b${name}\\s*\\??\\s*:`);
        expect(pattern.test(file.text), `${file.name} declares a "${name}" parameter`).toBe(false);
      }
    }
  });

  it('never types anything as any, object or Record<string, unknown>', () => {
    for (const file of files) {
      expect(/:\s*any\b/.test(file.text), `${file.name} uses any`).toBe(false);
      expect(/:\s*object\b/.test(file.text), `${file.name} uses object`).toBe(false);
      expect(
        /Record<\s*string\s*,\s*unknown\s*>/.test(file.text),
        `${file.name} uses Record<string, unknown>`,
      ).toBe(false);
    }
  });

  it('accepts `unknown` only in a boolean validator', () => {
    // `unknown` is legitimate for a guard — it is how a validator says "I will check this before
    // anyone trusts it". It is illegitimate for anything that RECORDS, because a recorded `unknown`
    // is a free-text channel. The rule: every `: unknown` parameter belongs to a function that
    // returns a type predicate or a boolean, and whose name says so.
    for (const file of files) {
      for (const line of file.text.split('\n')) {
        if (!/:\s*unknown\b/.test(line)) continue;
        const isGuard = / is [A-Za-z]/.test(line) || /\b(?:is|validate|assert)[A-Z]\w*\s*\(/.test(line);
        const returnsBoolean = / is [A-Za-z]/.test(line) || /\)\s*:\s*boolean\b/.test(line);
        expect(
          isGuard && returnsBoolean,
          `${file.name}: "unknown" outside a boolean validator -> ${line.trim()}`,
        ).toBe(true);
      }
    }
  });

  it('never accepts an Error, and never reads message, stack or cause', () => {
    for (const file of files) {
      expect(/:\s*Error\b/.test(file.text), `${file.name} accepts an Error`).toBe(false);
      for (const member of ['.stack', '.cause']) {
        expect(file.text.includes(member), `${file.name} reads ${member}`).toBe(false);
      }
    }
  });

  it('never stringifies, interpolates or inspects a caller value', () => {
    for (const file of files) {
      expect(/\bString\(/.test(file.text), `${file.name} calls String()`).toBe(false);
      expect(file.text.includes('util.inspect'), `${file.name} inspects`).toBe(false);
      expect(file.text.includes('JSON.parse'), `${file.name} parses caller JSON`).toBe(false);
    }
  });

  it('never calls AsyncLocalStorage.enterWith', () => {
    for (const file of files) {
      expect(file.text.includes('enterWith'), `${file.name} calls enterWith`).toBe(false);
    }
  });

  it('schedules no timer and installs no global process handler', () => {
    for (const file of files) {
      for (const forbidden of [
        'setInterval',
        'setTimeout',
        'process.on(',
        'uncaughtException',
        'unhandledRejection',
      ]) {
        expect(file.text.includes(forbidden), `${file.name} uses ${forbidden}`).toBe(false);
      }
    }
  });

  it('touches node:fs, node:path and node:process from exactly one module each', () => {
    // Import specifiers are string literals, so this one reads the RAW source, not the stripped code.
    const importers = (specifier: string) =>
      raw.filter((file) => file.text.includes(`from ${specifier}`)).map((file) => file.name);
    expect(importers("'node:fs'")).toEqual(['retention.ts']);
    expect(importers("'node:path'")).toEqual(['retention.ts']);
    expect(importers("'node:process'").sort()).toEqual(['retention.ts', 'sinks.ts']);
    expect(importers("'node:async_hooks'")).toEqual(['correlation.ts']);
  });

  it('reaches packages/contracts only through src/contracts.ts', () => {
    for (const file of raw) {
      if (file.name === 'contracts.ts') continue;
      expect(
        file.text.includes('../../contracts'),
        `${file.name} bypasses the contracts import boundary`,
      ).toBe(false);
    }
  });
});
