/**
 * `DEV-001` / sub-PRD **D1** — no `/v1` request or response body type is DECLARED in this package.
 *
 * The scan is deliberately name-based against the generated barrel: any `interface X` or `type X`
 * under `src/**` whose name is also exported by `packages/contracts/src/generated/index.ts` is a
 * re-declaration, which PRD §20.1 forbids and which would let this SDK drift from the document.
 *
 * `scanForRedeclarations` is pure and total, so the positive control below can prove it non-vacuous
 * against a synthetic source string — which is exactly the check the ticket's Test plan step 4 asks
 * a reviewer to perform on a scratch branch, done here instead so it runs on every branch.
 */
import { describe, expect, it } from 'vitest';

import * as generated from '../src/internal/contracts.js';
import { readText, sourceCodeOnly, PACKAGE_ROOT } from './support/repo.js';
import { join } from 'node:path';

/** Every type name the generated core exports, read from the barrel's own `export type { … }` lists. */
function generatedTypeNames(): Set<string> {
  const barrel = readText(join(PACKAGE_ROOT, '..', 'contracts', 'src', 'generated', 'index.ts'));
  const names = new Set<string>();
  for (const match of barrel.matchAll(/export type \{([^}]+)\}/g)) {
    for (const raw of (match[1] as string).split(',')) {
      const name = raw.trim();
      if (name.length > 0) names.add(name);
    }
  }
  return names;
}

const DECLARATION = /^\s*(?:export\s+)?(?:declare\s+)?(?:interface|type)\s+([A-Za-z0-9_]+)/gm;

/** Names declared as an `interface`/`type` in `text` that collide with `forbidden`. */
export function scanForRedeclarations(text: string, forbidden: ReadonlySet<string>): string[] {
  const found: string[] = [];
  for (const match of text.matchAll(DECLARATION)) {
    const name = match[1] as string;
    if (forbidden.has(name)) found.push(name);
  }
  return found;
}

describe('no locally declared /v1 request or response type (DEV-001, PRD §20.1)', () => {
  const forbidden = generatedTypeNames();

  it('reads a non-trivial set of generated type names', () => {
    expect(forbidden.size).toBeGreaterThan(50);
    expect(forbidden.has('SearchResponse')).toBe(true);
    expect(forbidden.has('AnswerSnapshot')).toBe(true);
  });

  it('finds no re-declaration anywhere under src/', () => {
    const offences: string[] = [];
    for (const { path, text } of sourceCodeOnly()) {
      for (const name of scanForRedeclarations(text, forbidden)) offences.push(`${path}: ${name}`);
    }
    expect(offences).toEqual([]);
  });

  // Positive control: a scanner that cannot detect anything discharges nothing.
  it('catches a synthetic re-declaration', () => {
    expect(scanForRedeclarations('export interface SearchResponse { x: number }', forbidden)).toEqual([
      'SearchResponse',
    ]);
    expect(scanForRedeclarations('type AnswerSnapshot = { id: string };', forbidden)).toEqual([
      'AnswerSnapshot',
    ]);
  });

  it('does not fire on this package’s own option and record types', () => {
    expect(scanForRedeclarations('export interface AerClientOptions { baseUrl: string }', forbidden)).toEqual(
      [],
    );
    expect(scanForRedeclarations('export interface TelemetryRecord { attempt: number }', forbidden)).toEqual(
      [],
    );
  });

  it('re-exports the generated maps as the SAME objects, not copies', async () => {
    const contracts = await import('../../contracts/src/generated/index.js');
    expect(generated.operations).toBe(contracts.operations);
    expect(generated.errorCodes).toBe(contracts.errorCodes);
    expect(generated.errorHttpStatusByCode).toBe(contracts.errorHttpStatusByCode);
    expect(generated.errorRetryableByCode).toBe(contracts.errorRetryableByCode);
    expect(generated.apiBasePath).toBe(contracts.apiBasePath);
  });
});
