import { describe, expect, it } from 'vitest';

import { decryptField, encryptField } from '../../src/crypto/cipher.js';
import { parseEnvelopeHeader } from '../../src/crypto/envelope.js';
import { loadKeyRegistry } from '../../src/crypto/keys.js';
import { randomKeyConfig } from './helpers.js';

const binding = { organizationId: 'org-a', table: 'documents', column: 'content_ciphertext', rowId: 'row-1' };

describe('field cipher', () => {
  it.each(['', 'plain ASCII', '漢字 🚀', 'x'.repeat(1024 * 1024)])('round trips UTF-8', (plaintext) => {
    const registry = loadKeyRegistry(randomKeyConfig('ACTIVE'));
    expect(decryptField(encryptField(plaintext, binding, registry), binding, registry)).toBe(plaintext);
  });

  it('detects nonce, ciphertext and tag tampering', () => {
    const registry = loadKeyRegistry(randomKeyConfig('ACTIVE'));
    const original = encryptField('secret text', binding, registry);
    const parsed = parseEnvelopeHeader(original);
    for (const offset of [parsed.headerLength, parsed.headerLength + 12, original.length - 1]) {
      const tampered = Buffer.from(original);
      tampered[offset] = (tampered[offset] ?? 0) ^ 1;
      expect(() => decryptField(tampered, binding, registry)).toThrowError(expect.objectContaining({ code: 'FIELD_DECRYPT_FAILED' }));
    }
  });

  it.each([
    { ...binding, organizationId: 'org-b' },
    { ...binding, table: 'other_documents' },
    { ...binding, column: 'other_ciphertext' },
    { ...binding, rowId: 'row-2' },
  ])('rejects every cross-binding move with one code', (changed) => {
    const registry = loadKeyRegistry(randomKeyConfig('ACTIVE'));
    const envelope = encryptField('bound', binding, registry);
    expect(() => decryptField(envelope, changed, registry)).toThrowError(expect.objectContaining({ code: 'FIELD_DECRYPT_FAILED' }));
  });

  it('uses unique random nonces and ciphertexts', () => {
    const registry = loadKeyRegistry(randomKeyConfig('ACTIVE'));
    const nonces = new Set<string>();
    const envelopes = new Set<string>();
    for (let i = 0; i < 10_000; i += 1) {
      const envelope = encryptField('same', binding, registry);
      nonces.add(parseEnvelopeHeader(envelope).nonce.toString('hex'));
      envelopes.add(envelope.toString('hex'));
    }
    expect(nonces.size).toBe(10_000);
    expect(envelopes.size).toBe(10_000);
  });
});
