/**
 * EVID-02 acceptance item 10 — the loader verifies the pinned hash BEFORE load and refuses on
 * mismatch (PRD §21.1 *"no arbitrary runtime plugin/model/code download"*).
 *
 * The ORDER is the assertion that matters: read -> size -> digest -> READY. A loader that hashed
 * after handing the bytes over, or that returned them alongside a warning, would satisfy a naive
 * "does it detect a bad hash" test and still be a way to load an unverified artifact. The digest
 * function here counts its calls, so "the digest was never even computed for a size mismatch" is
 * observable.
 */
import { describe, expect, it } from 'vitest';

import type { ArtifactPin } from '../../src/entity/runtime/pin.js';
import { ENTITY_ARTIFACT_PINS } from '../../src/entity/runtime/pin.js';
import { loadPinnedArtifact } from '../../src/entity/runtime/loader.js';

const PIN: ArtifactPin = {
  id: 'pii-entity-ner',
  version: '0.0.0-test',
  digestAlgorithm: 'sha256',
  digest: 'aa'.repeat(32),
  sizeBytes: 4,
  licence: 'NOT-APPLICABLE-NO-ARTIFACT-SELECTED',
};

const GOOD = new Uint8Array([1, 2, 3, 4]);

function digestOf(value: string): { digest: (bytes: Uint8Array) => string; calls: () => number } {
  let calls = 0;
  return {
    digest: () => {
      calls += 1;
      return value;
    },
    calls: () => calls,
  };
}

describe('the pin table', () => {
  it('is empty by decision — ADR 0001 selects no artifact', () => {
    expect(ENTITY_ARTIFACT_PINS).toEqual([]);
  });
});

describe('loadPinnedArtifact', () => {
  it('returns READY with the bytes when size and digest both match', () => {
    const { digest } = digestOf(PIN.digest);
    const outcome = loadPinnedArtifact(PIN, { read: () => GOOD }, digest);
    expect(outcome.state).toBe('READY');
    if (outcome.state === 'READY') expect(outcome.bytes).toBe(GOOD);
  });

  it('reports ARTIFACT_ABSENT for a null read, without hashing anything', () => {
    const { digest, calls } = digestOf(PIN.digest);
    const outcome = loadPinnedArtifact(PIN, { read: () => null }, digest);
    expect(outcome).toEqual({ state: 'UNAVAILABLE', reason: 'ARTIFACT_ABSENT' });
    expect(calls()).toBe(0);
  });

  it('reports SIZE_MISMATCH BEFORE computing the digest', () => {
    const { digest, calls } = digestOf(PIN.digest);
    const outcome = loadPinnedArtifact(PIN, { read: () => new Uint8Array([1, 2]) }, digest);
    expect(outcome).toEqual({ state: 'UNAVAILABLE', reason: 'SIZE_MISMATCH' });
    expect(calls(), 'the digest must not be computed once the size is already wrong').toBe(0);
  });

  it('REFUSES on a digest mismatch and returns no bytes', () => {
    const { digest } = digestOf('bb'.repeat(32));
    const outcome = loadPinnedArtifact(PIN, { read: () => GOOD }, digest);
    expect(outcome).toEqual({ state: 'UNAVAILABLE', reason: 'DIGEST_MISMATCH' });
    expect(JSON.stringify(outcome)).not.toContain('bytes');
  });

  it('is case-insensitive about hex, and nothing else', () => {
    const { digest } = digestOf(PIN.digest.toUpperCase());
    expect(loadPinnedArtifact(PIN, { read: () => GOOD }, digest).state).toBe('READY');
  });

  it('reports READ_FAILED when the source throws, carrying no message from it', () => {
    const { digest } = digestOf(PIN.digest);
    const outcome = loadPinnedArtifact(
      PIN,
      {
        read: () => {
          throw new Error('ENOENT: /srv/release/models/secret-path.onnx');
        },
      },
      digest,
    );
    expect(outcome).toEqual({ state: 'UNAVAILABLE', reason: 'READ_FAILED' });
    expect(JSON.stringify(outcome)).not.toContain('secret-path');
  });

  it('reports READ_FAILED when the digest function itself throws', () => {
    const outcome = loadPinnedArtifact(
      PIN,
      { read: () => GOOD },
      () => {
        throw new Error('digest failure');
      },
    );
    expect(outcome).toEqual({ state: 'UNAVAILABLE', reason: 'READ_FAILED' });
  });

  it('has no branch that returns bytes without a matching digest', () => {
    const outcomes = [
      loadPinnedArtifact(PIN, { read: () => null }, () => PIN.digest),
      loadPinnedArtifact(PIN, { read: () => new Uint8Array([9]) }, () => PIN.digest),
      loadPinnedArtifact(PIN, { read: () => GOOD }, () => 'nope'),
    ];
    for (const outcome of outcomes) expect(outcome.state).toBe('UNAVAILABLE');
  });
});
