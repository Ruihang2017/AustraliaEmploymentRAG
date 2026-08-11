import { describe, expect, it } from 'vitest';

import { encryptedColumnDdl, encryptedTextCodec } from '../../src/crypto/codec.js';
import { loadKeyRegistry } from '../../src/crypto/keys.js';
import { randomKeyConfig } from './helpers.js';

describe('encrypted text codec', () => {
  it('round trips and preserves SQL NULL', () => {
    const registry = loadKeyRegistry(randomKeyConfig('ACTIVE'));
    const ctx = { organizationId: 'org', registry };
    const codec = encryptedTextCodec({ table: 'notes', column: 'body_ciphertext' });
    expect(codec.decode(ctx, 'r1', codec.encode(ctx, 'r1', 'hello'))).toBe('hello');
    expect(codec.encode(ctx, 'r1', null)).toBeNull();
    expect(codec.decode(ctx, 'r1', null)).toBeNull();
  });

  it('surfaces retired keys specifically', () => {
    const config = randomKeyConfig('ACTIVE');
    const oldRegistry = loadKeyRegistry(config);
    const codec = encryptedTextCodec({ table: 'notes', column: 'body_ciphertext' });
    const stored = codec.encode({ organizationId: 'org', registry: oldRegistry }, 'r1', 'hello');
    const retired = loadKeyRegistry({ keys: [{ ...config.keys[0], state: 'RETIRED' }, ...randomKeyConfig('ACTIVE').keys.map((entry) => ({ ...entry, keyId: 'k2' }))] });
    expect(() => codec.decode({ organizationId: 'org', registry: retired }, 'r1', stored)).toThrowError(expect.objectContaining({ code: 'FIELD_KEY_RETIRED' }));
  });

  it('emits canonical BLOB DDL', () => {
    expect(encryptedColumnDdl('content_ciphertext')).toBe('content_ciphertext BLOB');
    expect(encryptedColumnDdl('content_ciphertext', { nullable: false })).toBe('content_ciphertext BLOB NOT NULL');
    expect(() => encryptedColumnDdl('BadName')).toThrowError(expect.objectContaining({ code: 'FIELD_BINDING_INVALID' }));
  });
});
