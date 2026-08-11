import { describe, expect, it } from 'vitest';

import { buildEnvelope, ENVELOPE_VERSION, parseEnvelopeHeader } from '../../src/crypto/envelope.js';

describe('keyless envelope parsing', () => {
  it('recovers the self-describing header without a registry', () => {
    const envelope = buildEnvelope({ keyId: 'key.1', nonce: Buffer.alloc(12, 1), ciphertext: Buffer.from('abc'), authTag: Buffer.alloc(16, 2) });
    const parsed = parseEnvelopeHeader(envelope);
    expect(parsed).toMatchObject({ version: ENVELOPE_VERSION, keyId: 'key.1', headerLength: 7 });
    expect(parsed.ciphertext.toString()).toBe('abc');
  });

  it.each([
    Buffer.alloc(0),
    Buffer.from([1]),
    Buffer.from([1, 0]),
    Buffer.from([2, 1, 107, ...Buffer.alloc(28)]),
    Buffer.from([1, 10, 107]),
    Buffer.from([1, 1, 107, ...Buffer.alloc(11), ...Buffer.alloc(16)]),
    Buffer.from([1, 1, 107, ...Buffer.alloc(12), ...Buffer.alloc(15)]),
  ])('rejects malformed envelopes', (value) => {
    expect(() => parseEnvelopeHeader(value)).toThrowError(expect.objectContaining({ code: 'FIELD_ENVELOPE_MALFORMED' }));
  });

  it('keeps the key-byte accessor off the public barrel', async () => {
    const mod = await import('../../src/crypto/index.js');
    expect(Object.keys(mod)).not.toContain('internalKeyBytes');
  });
});
