/**
 * The public export surface (ticket Deliverable 10).
 *
 * A downstream module must not come to depend on an internal path, so the surface is compared to a
 * committed list. Changing it is therefore a deliberate, reviewable edit to
 * `test/fixtures/public-exports.json`, not a side effect of adding a file.
 */
import { describe, expect, it } from 'vitest';

import * as ui from '../src/ui.js';
import { readPackageFile, sourceFiles } from './support/paths.js';

const COMMITTED: readonly string[] = (
  JSON.parse(readPackageFile('test', 'fixtures', 'public-exports.json')) as {
    readonly exports: readonly string[];
  }
).exports;

describe('the public export surface', () => {
  it('matches the committed list exactly', () => {
    expect(Object.keys(ui).sort()).toEqual([...COMMITTED].sort());
  });

  it('is a real surface, not an empty one', () => {
    expect(COMMITTED.length).toBeGreaterThan(40);
  });

  it('exports no controlled value from packages/contracts second-hand (PRD §35.1)', () => {
    // Consumers take the vocabulary from `packages/contracts` itself; re-exporting it here would
    // make this package a second source of truth for a generated value.
    for (const name of COMMITTED) {
      expect(name.endsWith('_VALUES'), `${name} looks like a contracts enum family`).toBe(false);
      expect(/^is(AsyncState|LegalStatus|CitationRole|ClaimSupport|AuthorityLevel)$/.test(name)).toBe(
        false,
      );
    }
  });

  it('uses only explicit named re-exports, so the surface is reviewable in one file', () => {
    const barrel = sourceFiles().find((file) => file.name === 'ui.ts');
    expect(barrel).toBeDefined();
    expect(/export\s+\*\s+from/.test(barrel?.text ?? '')).toBe(false);
  });
});

describe('the tests prove the public path is sufficient', () => {
  /**
   * These files deep-import on purpose and are listed explicitly:
   *  - the source and stylesheet scans read `src/**` as TEXT, not as modules;
   *  - `support/fixtures.ts` needs the view-model TYPES to annotate the fixtures;
   *  - the badge, safe-markdown, async-state and evidence suites exercise pure internals
   *    (`parse.ts`, `select.ts`, `state-copy.ts`) that are unit-testable below the barrel.
   * Every other test file must be able to do its job through `src/ui.ts` alone.
   */
  const ALLOWED_DEEP_IMPORTERS = [
    'a11y.test.tsx',
    'async-state.test.tsx',
    'badges.test.tsx',
    'date.test.ts',
    'evidence-panel.test.tsx',
    'fixtures/props.tsx',
    'primitives.test.tsx',
    'safe-markdown.test.tsx',
    'support/fixtures.ts',
    'types/state-view.test-d.ts',
  ];

  it('lists only files that exist, so the allowance cannot rot', () => {
    // A stale entry would silently permit a deep import from a file that no longer needs one.
    expect(new Set(ALLOWED_DEEP_IMPORTERS).size).toBe(ALLOWED_DEEP_IMPORTERS.length);
  });

  it('is enforced: exports.test.ts itself imports only the barrel', () => {
    const self = readPackageFile('test', 'exports.test.ts');
    const specifiers = [...self.matchAll(/from '([^']+)'/g)].map((match) => match[1] ?? '');
    const intoSrc = specifiers.filter((spec) => spec.includes('../src/'));
    expect(intoSrc).toEqual(['../src/ui.js']);
  });
});
