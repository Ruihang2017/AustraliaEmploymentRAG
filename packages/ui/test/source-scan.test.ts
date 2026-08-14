/**
 * Structural properties of `src/**` that no rendering test can establish.
 *
 * Every scan runs over `sourceFiles()` with comments and string/template bodies stripped by
 * `code()`, so prose that merely NAMES a forbidden construct (this file's own comments, and the long
 * explanatory headers throughout `src/`) cannot trip it.
 */
import { describe, expect, it } from 'vitest';

import { code, sourceFiles } from './support/paths.js';

const FILES = sourceFiles();

describe('the scan itself', () => {
  it('reads a real, non-trivial source tree — so no assertion below is vacuous', () => {
    // Sized by CONTENT, not by file count: the components are grouped a few to a file (deviation
    // D-2), so a file-count threshold would be an accident of that grouping rather than a guarantee
    // that the scans saw the whole package.
    expect(FILES.length).toBeGreaterThanOrEqual(8);
    expect(FILES.reduce((total, file) => total + file.text.length, 0)).toBeGreaterThan(40_000);
    expect(FILES.some((file) => file.name.endsWith('.tsx'))).toBe(true);
    expect(FILES.every((file) => file.text.length > 0)).toBe(true);
    // Every subdirectory of src/ is reached, so the walk is really recursive.
    for (const dir of ['primitives/', 'status/', 'safe/', 'format/']) {
      expect(FILES.some((file) => file.name.startsWith(dir)), `${dir} was not scanned`).toBe(true);
    }
  });

  it('excludes .d.ts, which declares rather than calls', () => {
    expect(FILES.some((file) => file.name.endsWith('.d.ts'))).toBe(false);
  });

  it('strips comments and string bodies, so a scan cannot be tripped by prose', () => {
    expect(code("// matchMedia\nconst x = 'matchMedia';")).not.toContain('matchMedia');
    expect(code('const x = matchMedia;')).toContain('matchMedia');
  });
});

describe('no controlled value is declared here (PRD §35.1; breakdown-plan §4.1)', () => {
  // An `as const` ARRAY of two or more UPPER_SNAKE string literals is what an enum family looks
  // like. The per-state and per-badge `Record` maps are KEYED BY the imported vocabulary and are
  // required — they are not matched by this, deliberately (see src/status/badges.tsx).
  const ENUM_ARRAY = /\[\s*(?:'[A-Z][A-Z0-9_]*'\s*,\s*){1,}'[A-Z][A-Z0-9_]*'\s*,?\s*\]\s*as\s+const/;

  it('declares no literal enum array anywhere under src/', () => {
    for (const file of FILES) {
      // String bodies are stripped by `code()`, so the raw text is what this one must read.
      expect(ENUM_ARRAY.test(file.text), `${file.name} declares a literal enum array`).toBe(false);
    }
  });

  it('is a real check: the pattern matches a synthetic enum array', () => {
    expect(ENUM_ARRAY.test("const X = ['IN_FORCE', 'REPEALED'] as const;")).toBe(true);
  });
});

describe('the one import boundary (F4)', () => {
  /** Every module specifier a file imports from or re-exports from. */
  function specifiers(text: string): string[] {
    return [...text.matchAll(/\bfrom\s+'([^']+)'/g)].map((match) => match[1] ?? '');
  }

  it('imports a path outside this package in src/contracts.ts and nowhere else', () => {
    const offenders = FILES.filter((file) => file.name !== 'contracts.ts').flatMap((file) =>
      specifiers(file.text)
        .filter((spec) => spec.startsWith('../../') || spec.startsWith('@taxrag/'))
        .map((spec) => `${file.name} -> ${spec}`),
    );
    expect(offenders).toEqual([]);
  });

  it('imports nothing from apps/ and nothing from another package, at any depth', () => {
    const offenders = FILES.flatMap((file) =>
      specifiers(file.text)
        .filter((spec) => /(^|\/)apps\//.test(spec))
        .map((spec) => `${file.name} -> ${spec}`),
    );
    expect(offenders).toEqual([]);
  });

  it('and src/contracts.ts really does hold that boundary, so the rule is not vacuous', () => {
    const boundary = FILES.find((file) => file.name === 'contracts.ts');
    expect(boundary?.text).toContain('../../contracts/src/enums/index.js');
  });
});

describe('responsiveness is CSS-only (PRD §41.1, risk in the plan §4.6)', () => {
  it.each(['matchMedia', 'innerWidth', 'ResizeObserver', 'getBoundingClientRect'])(
    'never reads %s to decide what to render',
    (api) => {
      const offenders = FILES.filter((file) => code(file.text).includes(api)).map((f) => f.name);
      expect(offenders).toEqual([]);
    },
  );
});

describe('customer research content never leaves the page (PRD §41.1)', () => {
  it.each([
    'document.title',
    'window.location',
    'history.pushState',
    'history.replaceState',
    'sendBeacon',
    'localStorage',
    'sessionStorage',
    'console.',
  ])('never touches %s', (api) => {
    const offenders = FILES.filter((file) => code(file.text).includes(api)).map((f) => f.name);
    expect(offenders).toEqual([]);
  });

  it('performs no network call of any kind — this package is prop-driven', () => {
    for (const file of FILES) {
      const stripped = code(file.text);
      expect(/\bfetch\s*\(/.test(stripped), `${file.name} calls fetch`).toBe(false);
      expect(/XMLHttpRequest/.test(stripped), `${file.name} uses XMLHttpRequest`).toBe(false);
      expect(/EventSource/.test(stripped), `${file.name} opens an EventSource`).toBe(false);
    }
  });
});

describe('the render-time security boundary (PRD §37.5; SEC-003)', () => {
  it('never uses dangerouslySetInnerHTML anywhere under src/', () => {
    // Over the STRIPPED text: `src/safe/parse.ts`'s header explains at length why this package
    // never reaches for it, and a scan that a doc comment can trip is a scan nobody keeps.
    // A real use is a JSX attribute name, which `code()` leaves intact.
    for (const file of FILES) {
      expect(code(file.text).includes('dangerouslySetInnerHTML'), `${file.name}`).toBe(false);
    }
  });

  it('is a real check: the stripper leaves a JSX attribute name intact', () => {
    expect(code('<div dangerouslySetInnerHTML={{ __html: x }} />')).toContain(
      'dangerouslySetInnerHTML',
    );
  });

  it('never assigns innerHTML or outerHTML, and never calls a DOM parser', () => {
    for (const file of FILES) {
      const stripped = code(file.text);
      expect(/\.innerHTML\b/.test(stripped), `${file.name}`).toBe(false);
      expect(/\.outerHTML\b/.test(stripped), `${file.name}`).toBe(false);
      expect(/insertAdjacentHTML/.test(stripped), `${file.name}`).toBe(false);
      expect(/DOMParser/.test(stripped), `${file.name}`).toBe(false);
    }
  });

  it('imports no Node built-in — this package renders and nothing more', () => {
    for (const file of FILES) {
      expect(/from\s+'node:/.test(file.text), `${file.name} imports a Node built-in`).toBe(false);
    }
  });
});
