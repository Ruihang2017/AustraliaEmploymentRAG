import { describe, expect, it } from 'vitest';

import { FieldEncryptionError } from '../../src/crypto/errors.js';
import { redactForLog } from '../../src/crypto/redaction.js';
import { canary } from './helpers.js';

describe('log safety', () => {
  it('uses an allowlist recursively', () => {
    const secret = canary();
    const result = redactForLog({ arbitraryFieldName: secret, code: 'X', scanned: 5, nested: { code: secret } });
    expect(result).toEqual({ code: '[redacted]', scanned: 5 });
    expect(JSON.stringify(result)).not.toContain(secret);
  });

  it('serializes errors to the exact safe shape', () => {
    const error = new FieldEncryptionError('FIELD_DECRYPT_FAILED', { table: 'notes', column: 'body_ciphertext', keyId: 'k1' });
    expect(error.toJSON()).toEqual({ name: 'FieldEncryptionError', code: 'FIELD_DECRYPT_FAILED', table: 'notes', column: 'body_ciphertext', keyId: 'k1' });
    expect(redactForLog(error)).toEqual(error.toJSON());
  });

  it('bounds cycles and redacts byte-like values', () => {
    const value: { code: string; nested?: unknown } = { code: 'X' };
    value.nested = value;
    expect(() => redactForLog([Buffer.from('secret'), value])).not.toThrow();
    expect(redactForLog(Buffer.from('secret'))).toBe('[redacted]');
  });
});
