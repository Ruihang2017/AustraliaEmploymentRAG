/**
 * The parity manifest (ticket deliverable 13; sub-PRD **D3**).
 *
 * Asserted in BOTH directions: an export with no manifest entry fails, and a manifest entry with no
 * export fails. `PLTF-03` reads the same file, so a capability that exists in one language only
 * becomes a test failure rather than a discovery at Gate 2.
 */
import { describe, expect, it } from 'vitest';
import { join } from 'node:path';

import * as sdk from '../src/sdk.js';
import { publicOperationIds } from '../src/sdk.js';
import { PACKAGE_ROOT, readJson } from './support/repo.js';

interface Capability {
  readonly canonical: string;
  readonly description: string;
  readonly typescript: string;
  readonly python: string;
}

interface Manifest {
  readonly schema_version: string;
  readonly ticket: string;
  readonly capabilities: readonly Capability[];
  readonly exports: readonly string[];
  readonly operations: readonly string[];
}

const manifest = readJson<Manifest>(join(PACKAGE_ROOT, 'parity', 'surface.json'));

describe('parity/surface.json (sub-PRD D3)', () => {
  it('records exactly this package’s runtime exports', () => {
    expect([...manifest.exports]).toEqual(Object.keys(sdk).sort());
  });

  // Positive control: the comparison must fail when the two differ.
  it('fails when an export is added without a manifest entry', () => {
    const withExtra = [...Object.keys(sdk).sort(), 'aScratchExport'].sort();
    expect(withExtra).not.toEqual([...manifest.exports]);
  });

  it('records exactly the public /v1 operation ids', () => {
    expect([...manifest.operations]).toEqual([...publicOperationIds()]);
    expect(manifest.operations.some((id) => id.toLowerCase().includes('internal'))).toBe(false);
  });

  it('names every PRD §8.10 capability, in both languages', () => {
    const canonical = manifest.capabilities.map((c) => c.canonical);
    for (const required of [
      'stream',
      'create_and_wait',
      'cancel',
      'verify_webhook_signature',
      'pages',
      'items',
      'page_data',
      'error_classes',
      'assert_telemetry_safe',
      'assert_not_provisional',
    ]) {
      expect(canonical, `capability "${required}" is missing`).toContain(required);
    }
    for (const capability of manifest.capabilities) {
      expect(capability.typescript.length).toBeGreaterThan(0);
      expect(capability.python.length).toBeGreaterThan(0);
      expect(capability.description.length).toBeGreaterThan(10);
    }
    expect(new Set(canonical).size).toBe(canonical.length);
  });

  it('points every module-level TypeScript capability at a real export', () => {
    for (const capability of manifest.capabilities) {
      if (capability.typescript.includes('.') || capability.typescript !== capability.typescript.trim()) continue;
      if (!/^[a-z]/i.test(capability.typescript)) continue;
      if (['data', 'pages', 'items'].includes(capability.typescript)) continue;
      expect(Object.keys(sdk), `${capability.canonical}`).toContain(capability.typescript);
    }
  });

  it('is a versioned document that names its owning ticket', () => {
    expect(manifest.schema_version).toBe('1.0');
    expect(manifest.ticket).toBe('PLTF-02');
  });
});
