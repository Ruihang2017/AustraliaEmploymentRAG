/**
 * EVID-07 deliverable 13 and the acceptance items "No tool surface" and "TenantContext only"
 * (PRD §37.5, §21.1, §21.2, §45.2; sub-PRD D13; `SEC-001`).
 *
 * This is the suite the whole ticket rests on: the claim is that the package CANNOT reach a shell, a
 * filesystem, a network, a database, an email service, a webhook or a browser, and the only way to
 * make that claim mechanical is to read every source file and prove nothing there could.
 *
 * Every scanner below has a POSITIVE CONTROL over a synthetic string, and the file walk has a
 * non-vacuity assertion. A scanner that silently matches nothing is indistinguishable from clean code.
 *
 * NEGATIVE CONTROL (ticket test-plan step 7 / plan §5): adding
 * `import { execSync } from 'node:child_process';` to `src/providers/generate.ts` on a scratch change
 * makes both "imports nothing but relative paths" and the capability scan fail. Run and discarded.
 */
import { readFileSync } from 'node:fs';
import { resolve, sep } from 'node:path';
import { describe, expect, it } from 'vitest';

import './support/network-stub.js';
import { PACKAGE_ROOT, SRC_ROOT } from './support/fixture.js';
import { codeOnly, exportedNames, named, sourceFiles, specifiersOf } from './support/source-scan.js';

const CONTRACTS_SRC = resolve(PACKAGE_ROOT, '..', 'contracts', 'src');
const PII_SRC = resolve(PACKAGE_ROOT, '..', 'pii', 'src');

const files = sourceFiles(SRC_ROOT);
const fileNames = files.map((file) => named(PACKAGE_ROOT, file));

describe('the walk is not vacuous', () => {
  it('reads every source file in the package', () => {
    expect(files.length).toBeGreaterThanOrEqual(24);
    for (const expected of [
      'src/index.ts',
      'src/profiles/registry.ts',
      'src/profiles/resolve.ts',
      'src/providers/generate.ts',
      'src/providers/transport/cassette.ts',
      'src/providers/stub/deterministic.ts',
      'src/schema/response.ts',
      'src/schema/request.ts',
    ]) {
      expect(fileNames).toContain(expected);
    }
  });
});

describe('import graph', () => {
  it('imports nothing but relative paths — no npm package, no node: built-in', () => {
    const offenders: string[] = [];
    for (const file of files) {
      for (const specifier of specifiersOf(readFileSync(file, 'utf8'))) {
        if (!specifier.startsWith('./') && !specifier.startsWith('../')) {
          offenders.push(`${named(PACKAGE_ROOT, file)} -> ${specifier}`);
        }
      }
    }
    expect(offenders, `non-relative import in src/**:\n${offenders.join('\n')}`).toEqual([]);
  });

  it('leaves the package only from the two boundary files, and only towards contracts and pii', () => {
    const escapers: string[] = [];
    for (const file of files) {
      for (const specifier of specifiersOf(readFileSync(file, 'utf8'))) {
        const target = resolve(file, '..', specifier);
        if (target.startsWith(SRC_ROOT + sep)) continue;
        const name = named(PACKAGE_ROOT, file);
        escapers.push(`${name} -> ${specifier}`);
        expect(
          target.startsWith(CONTRACTS_SRC + sep) || target.startsWith(PII_SRC + sep),
          `${specifier} escapes the package towards something other than packages/contracts/src or packages/pii/src`,
        ).toBe(true);
      }
    }
    const escapingFiles = [...new Set(escapers.map((entry) => entry.split(' -> ')[0]))].sort();
    expect(escapingFiles).toEqual(['src/schema/contracts.ts', 'src/schema/sanitized.ts']);
    expect(escapers.length, 'the cross-package boundary disappeared').toBeGreaterThan(0);
  });

  it('imports no other workspace package — no database, retrieval-client, citations, observability', () => {
    const offenders: string[] = [];
    for (const file of files) {
      for (const specifier of specifiersOf(readFileSync(file, 'utf8'))) {
        for (const forbidden of [
          'database',
          'retrieval-client',
          'citations',
          'observability',
          'domain',
          'auth',
          'jobs',
          'ui',
          'sdk-typescript',
        ]) {
          if (new RegExp(`(^|[./])${forbidden}(/|$)`).test(specifier.replace(/\.js$/, ''))) {
            offenders.push(`${named(PACKAGE_ROOT, file)} -> ${specifier}`);
          }
        }
      }
    }
    expect(offenders, offenders.join('\n')).toEqual([]);
  });
});

describe('capability scan (PRD §37.5, sub-PRD D13)', () => {
  const FORBIDDEN_TOKENS = [
    // shell and process
    'child_process',
    'execSync',
    'spawnSync',
    'spawn(',
    'exec(',
    'process.exit',
    'process.env',
    // filesystem
    'node:fs',
    'readFileSync',
    'writeFileSync',
    'writeFile',
    'createWriteStream',
    'appendFile',
    // network
    'fetch(',
    'XMLHttpRequest',
    'WebSocket',
    'EventSource',
    'node:http',
    'node:https',
    'node:net',
    'node:dgram',
    'node:tls',
    'createServer',
    'createConnection',
    'navigator.sendBeacon',
    // database
    'better-sqlite3',
    'kysely',
    'Database(',
    'createPool',
    'createConnectionPool',
    // email, webhook, browser automation
    'nodemailer',
    'sendMail',
    'smtp',
    'puppeteer',
    'playwright',
    'webdriver',
    // url construction
    'new URL(',
    'URLSearchParams',
  ] as const;

  it('fires on a synthetic capability (positive control)', () => {
    const control = codeOnly(
      "import { execSync } from 'node:child_process';\nconst r = await fetch('x');\nnew URL('y');",
    );
    const hits = FORBIDDEN_TOKENS.filter((token) => control.includes(token));
    expect(hits.length).toBeGreaterThanOrEqual(3);
  });

  it('finds none of them anywhere in src/**', () => {
    const offenders: string[] = [];
    for (const file of files) {
      const source = codeOnly(readFileSync(file, 'utf8'));
      for (const token of FORBIDDEN_TOKENS) {
        if (source.includes(token)) offenders.push(`${named(PACKAGE_ROOT, file)} contains ${token}`);
      }
    }
    expect(offenders, `a capability appeared in src/**:\n${offenders.join('\n')}`).toEqual([]);
  });

  it('uses no clock, randomness or crypto — every one of those arrives as a port', () => {
    const offenders: string[] = [];
    for (const file of files) {
      const source = codeOnly(readFileSync(file, 'utf8'));
      for (const token of ['Date.now', 'new Date', 'Math.random', 'performance.now', 'crypto.']) {
        if (source.includes(token)) offenders.push(`${named(PACKAGE_ROOT, file)} contains ${token}`);
      }
    }
    expect(offenders, offenders.join('\n')).toEqual([]);
  });

  it('declares no module-scope global regex used with test/exec (a shared lastIndex is a data race)', () => {
    const offenders: string[] = [];
    for (const file of files) {
      const source = readFileSync(file, 'utf8');
      for (const [index, line] of source.split('\n').entries()) {
        if (/^\s*(?:export\s+)?const\s+\w+\s*[:=][^=]*\/[^/\n]+\/[a-z]*g[a-z]*\s*;/.test(line)) {
          offenders.push(`${named(PACKAGE_ROOT, file)}:${String(index + 1)} ${line.trim()}`);
        }
      }
    }
    expect(offenders, offenders.join('\n')).toEqual([]);
  });
});

describe('no exported function can trigger an external action (PRD §37.5)', () => {
  /**
   * Matched WORD BY WORD rather than by substring. A substring scan flags `ModelExecutionRecord` for
   * containing "exec" and `ProfileExecution` for the same reason — false positives that would get this
   * guard deleted rather than fixed. Splitting the identifier first keeps it sharp: `execute` is
   * forbidden, `execution` is not the same word.
   */
  const FORBIDDEN_WORDS = new Set([
    'send',
    'email',
    'mail',
    'webhook',
    'promote',
    'transition',
    'credential',
    'credentials',
    'apikey',
    'secret',
    'exec',
    'execute',
    'spawn',
    'delete',
    'publish',
    'notify',
  ]);

  const wordsOf = (name: string): string[] =>
    name
      .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
      .replace(/_/g, ' ')
      .toLowerCase()
      .split(/\s+/)
      .filter(Boolean);

  /** Names that only read as a capability once the separators are removed. */
  const FORBIDDEN_COLLAPSED = [/apikey/, /accesskey/, /privatekey/, /bearertoken/, /clientsecret/];

  const offends = (name: string): boolean => {
    const collapsed = name.replace(/[_\s-]/g, '').toLowerCase();
    if (FORBIDDEN_COLLAPSED.some((pattern) => pattern.test(collapsed))) return true;
    return wordsOf(name).some((word) => FORBIDDEN_WORDS.has(word));
  };

  it('fires on a synthetic export (positive control)', () => {
    expect(exportedNames('export function sendWebhook() {}').some(offends)).toBe(true);
    expect(exportedNames('export const promoteCorpus = 1;').some(offends)).toBe(true);
    expect(exportedNames('export function executeShell() {}').some(offends)).toBe(true);
    expect(exportedNames('export const API_KEY_HEADER = 1;').some(offends)).toBe(true);
    expect(exportedNames('export function generate() {}').some(offends)).toBe(false);
    expect(offends('ModelExecutionRecord')).toBe(false);
  });

  it('exports no such name from anywhere in src/**', () => {
    const offenders: string[] = [];
    for (const file of files) {
      for (const name of exportedNames(readFileSync(file, 'utf8'))) {
        if (offends(name)) offenders.push(`${named(PACKAGE_ROOT, file)} exports ${name}`);
      }
    }
    expect(offenders, offenders.join('\n')).toEqual([]);
  });
});

describe('the FND-01 skeleton is untouched', () => {
  it('leaves src/index.ts as the empty entry file', () => {
    expect(readFileSync(resolve(SRC_ROOT, 'index.ts'), 'utf8').replace(/\r\n/g, '\n')).toBe('export {};\n');
  });

  it('declares no dependency of any kind in package.json', () => {
    const manifestText = readFileSync(resolve(PACKAGE_ROOT, 'package.json'), 'utf8');
    const manifest = JSON.parse(manifestText) as {
      name?: string;
      main?: string;
      scripts?: Record<string, string>;
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
      peerDependencies?: Record<string, string>;
    };
    expect(manifest.dependencies ?? {}).toEqual({});
    expect(manifest.devDependencies ?? {}).toEqual({});
    expect(manifest.peerDependencies ?? {}).toEqual({});
    expect(manifest.name).toBe('@taxrag/model-gateway');
    expect(manifest.main).toBe('src/index.ts');
    expect(manifest.scripts?.typecheck).toBe('tsc -p tsconfig.json --noEmit');
    expect(manifest.scripts?.test).toBe('vitest run');
  });

  it('names no provider SDK, driver, framework or cloud library in package.json', () => {
    const manifestText = readFileSync(resolve(PACKAGE_ROOT, 'package.json'), 'utf8');
    for (const forbidden of [
      'openai',
      'anthropic',
      'ajv',
      'zod',
      'axios',
      'node-fetch',
      'undici',
      'better-sqlite3',
      'kysely',
      'fastify',
      '@aws-sdk',
      'nodemailer',
      'puppeteer',
    ]) {
      expect(manifestText, `${forbidden} appears in the manifest`).not.toContain(forbidden);
    }
  });

  it('keeps tsconfig.json to extends + include', () => {
    const tsconfig = JSON.parse(readFileSync(resolve(PACKAGE_ROOT, 'tsconfig.json'), 'utf8')) as Record<
      string,
      unknown
    >;
    expect(Object.keys(tsconfig).sort()).toEqual(['extends', 'include']);
    expect(tsconfig.extends).toBe('../../tsconfig.base.json');
  });
});
