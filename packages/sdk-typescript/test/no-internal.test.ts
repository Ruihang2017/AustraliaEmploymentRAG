/**
 * PRD §8.11 — internal administration *"MUST NOT be shipped in customer SDKs"* (sub-PRD **D8**).
 */
import { describe, expect, it } from 'vitest';

import { isInternalPath, operations, publicOperationIds } from '../src/sdk.js';
import { createHarness } from './support/client.js';
import { searchResponse } from './fixtures/typed.js';
import { sourceWithoutComments } from './support/repo.js';

describe('no /internal/v1 surface (PRD §8.11, sub-PRD D8)', () => {
  it('exposes no operation whose generated path contains /internal', () => {
    for (const id of publicOperationIds()) {
      expect(operations[id].path.includes('/internal'), `${id} is an internal path`).toBe(false);
    }
  });

  it('filters, rather than merely reflecting a document that happens to be clean', () => {
    // Positive control on the filter itself: it must classify an internal path as internal.
    expect(isInternalPath('/internal/v1/tenants')).toBe(true);
    expect(isInternalPath('/answer-jobs/{job_id}')).toBe(false);
  });

  it('builds the client’s operation surface from the filtered set only', () => {
    const harness = createHarness(() => ({ status: 200, json: searchResponse }));
    expect(Object.keys(harness.client.operations).sort()).toEqual([...publicOperationIds()].sort());
    for (const key of Object.keys(harness.client.operations)) {
      expect(key.toLowerCase().includes('internal')).toBe(false);
    }
  });

  it('names an absolute /internal path in exactly one place — the filter that excludes it', () => {
    // An ABSOLUTE `/internal…` path literal. The relative module specifier
    // `./internal/contracts.js` is this package's own directory and is not a URL path.
    const INTERNAL_PATH = /['"`]\/internal/;
    const offenders = sourceWithoutComments()
      .filter(({ text }) => INTERNAL_PATH.test(text))
      .map(({ path }) => path);
    // `resources.ts#isInternalPath` is the exclusion itself; anything else would be a surface.
    expect(offenders).toEqual(['resources.ts']);

    // Positive control: the pattern must see a real path literal and must not see an import.
    expect(INTERNAL_PATH.test("const p = '/internal/v1/tenants';")).toBe(true);
    expect(INTERNAL_PATH.test("import x from './internal/contracts.js';")).toBe(false);
  });

  it('exposes no resource group named for an internal segment', () => {
    const harness = createHarness(() => ({ status: 200, json: searchResponse }));
    for (const key of Object.keys(harness.client.resources)) {
      expect(key.toLowerCase()).not.toBe('internal');
    }
  });
});
