/**
 * PRD §39.1 — *"Dependency directions are enforced in CI"*; PRD §45.2 — `apps/api` owns
 * "HTTP auth/admission/DTO mapping/SSE" and must NOT own duplicated business rules or reach
 * sideways into a provider SDK.
 *
 * The scanner is the FND-12-repaired one from `packages/contracts/test/enums/package-purity.test.ts`
 * — same four patterns, same `${` interpolation guard, same "the test is on the specifier, never on
 * its container" rule. It is a TEXT SCAN, not a parser: a backtick-quoted specifier is not matched.
 * That accepted limitation is inherited deliberately rather than papered over here.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { URL, fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const APP_ROOT = fileURLToPath(new URL('..', import.meta.url));
const SRC = join(APP_ROOT, 'src');

/** The four extraction patterns, verbatim from FND-12's repaired scanner. */
const SPECIFIER_PATTERNS = [
  /\bfrom\s*['"]([^'"]+)['"]/g,
  /\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
  /\bimport\s+['"]([^'"]+)['"]/g,
  /\brequire\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
];

function specifiersOf(source: string): string[] {
  const found: string[] = [];
  for (const pattern of SPECIFIER_PATTERNS) {
    for (const match of source.matchAll(pattern)) {
      const specifier = match[1];
      if (!specifier) continue;
      // Generated import TEXT, not an import (FND-12).
      if (specifier.includes('${')) continue;
      found.push(specifier);
    }
  }
  return found;
}

function sourceFiles(dir: string, found: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) sourceFiles(path, found);
    else if (entry.name.endsWith('.ts')) found.push(path);
  }
  return found;
}

/** `@scope/name` from the first two segments, otherwise the first segment. */
function packageNameOf(specifier: string): string {
  return specifier.startsWith('@')
    ? specifier.split('/').slice(0, 2).join('/')
    : (specifier.split('/')[0] as string);
}

/**
 * Package names `apps/api/src/**` must never import.
 *
 * A UI framework, a model provider SDK, a cloud-platform SDK and a database driver each represent a
 * different direction the dependency arrow must not point (PRD §39.1, sub-PRD D12).
 */
const FORBIDDEN = [
  'react',
  'react-dom',
  'openai',
  '@anthropic-ai/sdk',
  'aws-sdk',
  '@aws-sdk/client-s3',
  '@cloudflare/workers-types',
  'wrangler',
  'better-sqlite3',
  'kysely',
];

const FORBIDDEN_SCOPES = ['@aws-sdk', '@anthropic-ai', '@cloudflare'];

function forbiddenImports(label: string, source: string): string[] {
  const offenders: string[] = [];
  for (const specifier of specifiersOf(source)) {
    const name = packageNameOf(specifier);
    const scope = name.startsWith('@') ? (name.split('/')[0] as string) : '';
    if (FORBIDDEN.includes(name) || (scope !== '' && FORBIDDEN_SCOPES.includes(scope))) {
      offenders.push(`${label} -> ${specifier}`);
    }
  }
  return offenders;
}

const files = sourceFiles(SRC);

describe('apps/api dependency direction', () => {
  it('walks the whole source tree (non-vacuity)', () => {
    expect(files.length).toBeGreaterThanOrEqual(8);
  });

  it('imports no UI framework, provider SDK, cloud SDK or database driver', () => {
    const offenders: string[] = [];
    for (const file of files) {
      offenders.push(...forbiddenImports(file.slice(APP_ROOT.length), readFileSync(file, 'utf8')));
    }
    expect(offenders).toEqual([]);
  });

  // Positive control: without this the assertion above proves nothing — a scanner that matched
  // nothing at all would pass it.
  it.each([
    ["import React from 'react';", 'react'],
    ["import OpenAI from 'openai';", 'openai'],
    ["const { S3 } = require('@aws-sdk/client-s3');", '@aws-sdk/client-s3'],
    ["await import('@anthropic-ai/sdk');", '@anthropic-ai/sdk'],
    ["import Database from 'better-sqlite3';", 'better-sqlite3'],
    ["export { x } from 'wrangler';", 'wrangler'],
    ["import '@cloudflare/workers-types';", '@cloudflare/workers-types'],
  ])('catches %s', (source, expected) => {
    expect(forbiddenImports('synthetic.ts', source)).toEqual([`synthetic.ts -> ${expected}`]);
  });

  it('keeps the FND-12 interpolation guard, so generated import TEXT is not a violation', () => {
    expect(forbiddenImports('gen.ts', 'lines.push(`import x from "${specifier}";`);')).toEqual([]);
    expect(specifiersOf("emit(`from '${name}'`)")).toEqual([]);
  });

  it('does not import packages/domain or packages/database — those arrows belong elsewhere', () => {
    const offenders: string[] = [];
    for (const file of files) {
      for (const specifier of specifiersOf(readFileSync(file, 'utf8'))) {
        if (specifier.includes('packages/domain') || specifier.includes('packages/database')) {
          offenders.push(`${file.slice(APP_ROOT.length)} -> ${specifier}`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });

  it('reaches packages/contracts and nothing else outside this app', () => {
    const external = new Set<string>();
    for (const file of files) {
      for (const specifier of specifiersOf(readFileSync(file, 'utf8'))) {
        if (specifier.startsWith('node:')) continue;
        if (specifier.startsWith('./')) continue;
        if (specifier.startsWith('../')) {
          // Only `packages/contracts` may be reached by a relative path out of this app.
          if (!specifier.includes('/packages/contracts/')) external.add(specifier);
          continue;
        }
        external.add(packageNameOf(specifier));
      }
    }
    expect([...external].sort()).toEqual(['fastify']);
  });
});
