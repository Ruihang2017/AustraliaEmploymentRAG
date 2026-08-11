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

  it('detects header tampering (version, keyIdLength, keyId bytes)', () => {
    // Unlike the AEAD-covered region, header bytes are consulted before any key is looked up, so a
    // regression here would surface as FIELD_ENVELOPE_MALFORMED or a key-lookup error, never
    // FIELD_DECRYPT_FAILED. A parser regression that silently accepted an unknown version, a bogus
    // key-id length, or a mutated key id must fail loudly, not decrypt garbage.
    const registry = loadKeyRegistry(randomKeyConfig('ACTIVE'));
    const original = encryptField('secret text', binding, registry);

    // Offset 0: the version byte. Flipping it away from ENVELOPE_VERSION is unconditionally caught
    // by the header length/version check before any key-id bytes are read — deterministic.
    const versionTampered = Buffer.from(original);
    versionTampered[0] = (versionTampered[0] ?? 0) ^ 1;
    expect(() => decryptField(versionTampered, binding, registry)).toThrowError(
      expect.objectContaining({ code: 'FIELD_ENVELOPE_MALFORMED' }),
    );

    // Offset 2: the first byte of the key id itself ('k' -> 'j' for the fixture's "k1"). Flipping the
    // low bit of an ASCII letter stays inside the allowed key-id charset, so the header still parses,
    // but the resulting key id is not one the registry holds -> a distinguishable key-lookup error.
    const keyIdTampered = Buffer.from(original);
    keyIdTampered[2] = (keyIdTampered[2] ?? 0) ^ 1;
    expect(() => decryptField(keyIdTampered, binding, registry)).toThrowError(
      expect.objectContaining({ code: 'FIELD_KEY_UNKNOWN' }),
    );

    // Offset 1: the keyIdLength byte. Whether the resulting (possibly longer) key id still parses as
    // valid ASCII charset depends on the random nonce byte it absorbs, so only assert it is caught by
    // one of the two header-stage error codes -- never silently accepted, and never mistaken for a
    // ciphertext/tag AEAD failure.
    const lengthTampered = Buffer.from(original);
    lengthTampered[1] = (lengthTampered[1] ?? 0) ^ 1;
    expect(() => decryptField(lengthTampered, binding, registry)).toThrowError(
      expect.objectContaining({
        code: expect.stringMatching(/^(FIELD_ENVELOPE_MALFORMED|FIELD_KEY_UNKNOWN)$/) as unknown as string,
      }),
    );
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
