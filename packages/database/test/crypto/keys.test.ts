import { inspect } from 'node:util';
import { describe, expect, it } from 'vitest';

import { decryptField, encryptField } from '../../src/crypto/cipher.js';
import { FieldEncryptionError } from '../../src/crypto/errors.js';
import { loadKeyRegistry } from '../../src/crypto/keys.js';
import { randomKeyConfig } from './helpers.js';

const binding = { organizationId: 'org', table: 'notes', column: 'body_ciphertext', rowId: 'row' };

describe('key registry', () => {
  it.each([
    undefined,
    {},
    { keys: [] },
    randomKeyConfig('RETIRING'),
    randomKeyConfig('ACTIVE', 'ACTIVE'),
    { keys: [{ keyId: 'k1', material: Buffer.alloc(32), state: 'ACTIVE' }, { keyId: 'k1', material: Buffer.alloc(32), state: 'RETIRING' }] },
    { keys: [{ keyId: 'bad key', material: Buffer.alloc(32), state: 'ACTIVE' }] },
    { keys: [{ keyId: 'k1', material: Buffer.alloc(31), state: 'ACTIVE' }] },
    { keys: [{ keyId: 'k1', material: 'not base64!', state: 'ACTIVE' }] },
  ])('fails closed for invalid config', (config) => {
    expect(() => loadKeyRegistry(config)).toThrowError(expect.objectContaining({ code: 'FIELD_ENCRYPTION_KEY_INVALID' }));
  });

  it('enforces states and derives deterministically', () => {
    const config = randomKeyConfig('ACTIVE', 'RETIRING', 'RETIRED');
    const first = loadKeyRegistry(config);
    const second = loadKeyRegistry(config);
    expect(first.activeKey()).toMatchObject({ keyId: 'k1', state: 'ACTIVE' });
    expect(first.keyById('k2')).toMatchObject({ state: 'RETIRING' });
    expect(() => first.keyById('k3')).toThrowError(expect.objectContaining({ code: 'FIELD_KEY_RETIRED' }));
    const envelope = encryptField('cross-process', binding, first);
    expect(decryptField(envelope, binding, second)).toBe('cross-process');
  });

  it('does not expose material and becomes unusable after zeroize', () => {
    const config = randomKeyConfig('ACTIVE');
    const material = config.keys[0]?.material as string;
    const registry = loadKeyRegistry(config);
    for (const rendered of [String(registry), JSON.stringify(registry), inspect(registry)]) {
      expect(rendered).not.toContain(material);
    }
    registry.zeroize();
    for (const call of [() => registry.activeKey(), () => registry.keyById('k1'), () => registry.keyIds()]) {
      expect(call).toThrowError(FieldEncryptionError);
      expect(call).toThrowError(expect.objectContaining({ code: 'FIELD_ENCRYPTION_KEY_INVALID' }));
    }
  });
});
