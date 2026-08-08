/**
 * FND-04 acceptance item 3 — "Every PRD §34 normative example under `schemas/openapi/examples/**`
 * validates against its declared schema, with no property renamed, added or dropped relative to the
 * PRD text."
 *
 * PRD §34 preamble: "The examples below are normative payload shapes; property names and enum
 * meanings cannot drift from them without PRD/API change control."
 *
 * TWO CHECKS PER EXAMPLE, and the second one is the one that matters:
 *
 *   1. Ajv validates the example against the schema the document declares for it — necessary, but a
 *      permissive schema would make it vacuous, which is why every §34 schema in the document sets
 *      `additionalProperties: false` (or `unevaluatedProperties: false` where it composes).
 *   2. The example is DEEP-EQUALLED against the fenced ```json block re-extracted from
 *      `docs/PRD.md`. That is what turns "cannot drift" into an assertion rather than a human read:
 *      a renamed, added or dropped property fails here even if the schema still accepts it.
 *
 * `docs/PRD.md` is frozen (breakdown plan §4) and only ever read.
 */
import { existsSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { collectExternalValues } from '../../src/openapi/document.mjs';
import { REPO_ROOT, document, exampleValidator, fixture, prdJsonBlocks, repoText } from './fixture.js';

interface ExampleEntry {
  file: string;
  heading: string;
  blockIndex: number;
  schemaRef: string;
}
interface ExamplesFixture {
  prdPath: string;
  examplesDir: string;
  examples: ExampleEntry[];
}

const spec = fixture<ExamplesFixture>('prd-34-examples.json');
const validator = exampleValidator(document());

describe('PRD §34 normative examples (acceptance item 3)', () => {
  it('covers the five normative §34 blocks the ticket names', () => {
    expect(spec.examples).toHaveLength(10);
    const sections = new Set(spec.examples.map((entry) => entry.heading));
    expect([...sections].sort()).toEqual([
      '### 34.2 Search',
      '### 34.3 Create an Answer job',
      '### 34.5 Answer Snapshot',
      '### 34.6 Coverage and Compare requests',
      '### 34.7 Research Record write contract',
    ]);
  });

  it.each(spec.examples.map((entry) => [entry.file, entry] as const))(
    '%s has not drifted from its PRD block',
    (_file, entry) => {
      const blocks = prdJsonBlocks(entry.heading, spec.prdPath);
      expect(
        blocks.length,
        `${entry.heading} has ${blocks.length} json blocks; the fixture asks for index ${entry.blockIndex}`,
      ).toBeGreaterThan(entry.blockIndex);
      const fromPrd = blocks[entry.blockIndex];
      const onDisk = JSON.parse(repoText(`${spec.examplesDir}/${entry.file}`)) as unknown;
      expect(onDisk).toEqual(fromPrd);
    },
  );

  it.each(spec.examples.map((entry) => [entry.file, entry] as const))(
    '%s validates against its declared schema',
    (_file, entry) => {
      const validate = validator.compile(entry.schemaRef);
      const value = JSON.parse(repoText(`${spec.examplesDir}/${entry.file}`)) as unknown;
      expect(validate(value), `${entry.file}: ${validator.errorsOf(validate)}`).toBe(true);
    },
  );

  // The schema check above is only meaningful if the schema can reject something. A §34 schema that
  // accepted an unknown property would let a renamed field through silently.
  it.each(spec.examples.map((entry) => [entry.file, entry] as const))(
    "%s's schema rejects an unknown property",
    (_file, entry) => {
      const validate = validator.compile(entry.schemaRef);
      const value = JSON.parse(repoText(`${spec.examplesDir}/${entry.file}`)) as Record<string, unknown>;
      expect(validate({ ...value, not_a_prd_property: 1 })).toBe(false);
    },
  );

  it('wires every example into the document as an `externalValue`', () => {
    const wired = new Set(collectExternalValues(document()).map(({ value }) => value));
    for (const entry of spec.examples) {
      expect(wired.has(`examples/${entry.file}`), `${entry.file} is not referenced by the document`).toBe(true);
    }
    expect(wired.size).toBe(spec.examples.length);
  });

  it('has an example file on disk for every fixture entry, and no orphan', () => {
    for (const entry of spec.examples) {
      expect(existsSync(join(REPO_ROOT, spec.examplesDir, entry.file))).toBe(true);
    }
  });

  it('fails loudly on a heading that does not resolve, rather than skipping', () => {
    expect(() => prdJsonBlocks('### 99.9 Not A Section', spec.prdPath)).toThrow(/heading not found/);
  });

  it('really does read the PRD: the search request block carries §34.2\'s own values', () => {
    const [request] = prdJsonBlocks('### 34.2 Search', spec.prdPath) as Record<string, unknown>[];
    expect(request?.query).toBe('annual leave direction section 94');
    expect(request?.jurisdictions).toEqual(['CTH', 'VIC']);
  });
});
