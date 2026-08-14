/**
 * EVID-07 — positive controls for the shared scanners.
 *
 * The architecture, purity and determinism suites are all "assert that nothing matches" suites, and a
 * scanner that silently matches nothing is the most comfortable kind of green test. This file proves
 * each helper fires on synthetic input, so the empty results elsewhere mean something.
 */
import { describe, expect, it } from 'vitest';

import './support/network-stub.js';
import { codeOnly, exportedNames, specifiersOf, stripComments, stripStrings } from './support/source-scan.js';

describe('specifiersOf', () => {
  it('extracts static, dynamic and require specifiers', () => {
    expect(specifiersOf("import Fastify from 'fastify';")).toEqual(['fastify']);
    expect(specifiersOf("const db = require('better-sqlite3');")).toEqual(['better-sqlite3']);
    expect(specifiersOf("await import('@aws-sdk/client-s3');")).toEqual(['@aws-sdk/client-s3']);
    expect(specifiersOf("export * from './contracts.js';")).toEqual(['./contracts.js']);
    expect(specifiersOf("import 'node:fs';")).toEqual(['node:fs']);
  });

  it('finds nothing in a file with no imports', () => {
    expect(specifiersOf('export const a = 1;')).toEqual([]);
  });
});

describe('stripComments', () => {
  it('removes prose but keeps code', () => {
    expect(stripComments('/** never calls Date.now */\nconst a = 1;\n')).not.toContain('Date.now');
    expect(stripComments('const a = 1; // Math.random\n')).not.toContain('Math.random');
    expect(stripComments('const a = Date.now();')).toContain('Date.now');
  });
});

describe('stripStrings', () => {
  it('blanks literals but preserves the line count', () => {
    expect(stripStrings("const a = 'node:fs';")).not.toContain('node:fs');
    expect(stripStrings('const a = "https://example.invalid";')).not.toContain('https');
    expect(stripStrings('const a = `x\ny`;').split('\n')).toHaveLength(2);
  });
});

describe('codeOnly', () => {
  it('removes both comments and strings', () => {
    const source = "// process.env\nconst a = 'child_process';\nconst b = process.env;";
    const scanned = codeOnly(source);
    expect(scanned).not.toContain('child_process');
    expect(scanned).toContain('process.env');
  });
});

describe('exportedNames', () => {
  it('reads declaration exports and export clauses, including renames', () => {
    expect(exportedNames('export const alpha = 1;')).toContain('alpha');
    expect(exportedNames('export function beta() {}')).toContain('beta');
    expect(exportedNames('export declare const gamma: unique symbol;')).toContain('gamma');
    expect(exportedNames('export interface Delta { a: 1 }')).toContain('Delta');
    expect(exportedNames("export { inner as outer } from './x.js';")).toEqual(['outer']);
    expect(exportedNames("export type { Epsilon } from './x.js';")).toEqual(['Epsilon']);
  });

  it('reports nothing for a module with no exports', () => {
    expect(exportedNames('const a = 1;')).toEqual([]);
  });
});
