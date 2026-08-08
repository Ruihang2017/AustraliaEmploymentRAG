/**
 * The retryable-write projection cannot rot silently (ticket deliverable 4; plan **OQ-2**).
 *
 * `src/internal/retryable-writes.ts` carries a local set because the RUNTIME generated map exposes no
 * `x-retryable-write` flag. This suite re-derives the same set INDEPENDENTLY, from
 * `packages/contracts/src/generated/operations.ts`, using the third arm of the equivalence
 * `packages/contracts/src/openapi/conventions.mjs` enforces: an operation declares
 * `IDEMPOTENCY_CONFLICT` if and only if it is a retryable write.
 *
 * It also asserts the count against the OpenAPI document itself, so that a change on either side —
 * document or generated code — fails here rather than producing an SDK that sends an
 * `Idempotency-Key` where the document declares none, or omits one where the document requires it.
 */
import { describe, expect, it } from 'vitest';
import { join } from 'node:path';

import { RETRYABLE_WRITE_COUNT, RETRYABLE_WRITE_OPERATION_IDS } from '../src/internal/retryable-writes.js';
import { PACKAGE_ROOT, REPO_ROOT, readText } from './support/repo.js';

/** Operation ids whose generated interface declares `IDEMPOTENCY_CONFLICT`. */
function deriveFromGeneratedOperations(): string[] {
  const text = readText(join(PACKAGE_ROOT, '..', 'contracts', 'src', 'generated', 'operations.ts'));
  const ids: string[] = [];
  for (const match of text.matchAll(/export interface \w+ \{([\s\S]*?)\n\}/g)) {
    const body = match[1] as string;
    if (!body.includes('IDEMPOTENCY_CONFLICT')) continue;
    const id = body.match(/operationId: "(\w+)"/);
    if (id) ids.push(id[1] as string);
  }
  return ids.sort();
}

describe('retryable writes (PRD §34.1, §8.10)', () => {
  it('matches the set derived from the generated operation interfaces, exactly', () => {
    expect([...RETRYABLE_WRITE_OPERATION_IDS].sort()).toEqual(deriveFromGeneratedOperations());
  });

  it('matches the count the OpenAPI document marks x-retryable-write: true', () => {
    const document = readText(join(REPO_ROOT, 'schemas', 'openapi', 'openapi.yaml'));
    const marked = document.split('\n').filter((line) => line.includes('x-retryable-write: true')).length;
    expect(marked).toBe(RETRYABLE_WRITE_COUNT);
    expect(RETRYABLE_WRITE_OPERATION_IDS.size).toBe(RETRYABLE_WRITE_COUNT);
  });

  it('includes createAnswerJob and EXCLUDES cancelAnswerJob', () => {
    expect(RETRYABLE_WRITE_OPERATION_IDS.has('createAnswerJob')).toBe(true);
    // The document marks cancel `x-retryable-write: false` and declares no Idempotency-Key for it.
    expect(RETRYABLE_WRITE_OPERATION_IDS.has('cancelAnswerJob')).toBe(false);
    expect(RETRYABLE_WRITE_OPERATION_IDS.has('search')).toBe(false);
  });

  // Positive control: the derivation must be able to see a difference.
  it('derives a different set when the marker is absent', () => {
    const derived = deriveFromGeneratedOperations();
    expect(derived.length).toBe(RETRYABLE_WRITE_COUNT);
    expect(derived).not.toContain('cancelAnswerJob');
  });
});
