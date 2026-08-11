import { inspect } from 'node:util';
import { describe, expect, it } from 'vitest';

import { decryptField, encryptField } from '../../src/crypto/cipher.js';
import { FieldEncryptionError } from '../../src/crypto/errors.js';
import { internalKeyBytes, loadKeyRegistry } from '../../src/crypto/keys.js';
import { redactForLog } from '../../src/crypto/redaction.js';
import type { RotationRow, RotationScan, RotationTarget, RotationWrite } from '../../src/crypto/rotate.js';
import { rotateFieldKeys } from '../../src/crypto/rotate.js';
import { canary, randomKeyConfig } from './helpers.js';

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

  it('redacts a value it must redact -- positive control against a no-op redactor', () => {
    // A redactor that redacts nothing would still pass a naive "absence of a specific secret" test.
    // Prove the mechanism actually acts: feed it something on the allowlist's denial path and assert
    // the input value is not present verbatim in the output.
    const secret = canary();
    expect(redactForLog(secret)).toBe('[redacted]');
    expect(redactForLog(secret)).not.toBe(secret);
    expect(redactForLog({ note: secret })).toEqual({});
  });

  it('never leaks the canary or derived key bytes through an error actually thrown by encryptField/decryptField', () => {
    const secret = canary();
    const binding = { organizationId: 'org', table: 'notes', column: 'body_ciphertext', rowId: 'row-1' };
    const registry = loadKeyRegistry(randomKeyConfig('ACTIVE'));
    const keyHex = internalKeyBytes(registry, registry.activeKey().keyId).toString('hex');

    const envelope = encryptField(secret, binding, registry);
    // Tamper the ciphertext region so decryption fails after the plaintext (the canary) has already
    // been produced internally -- this is the realistic leak path: a catch block that stringifies the
    // wrong thing, not a constructor call that is handed plaintext directly.
    const tampered = Buffer.from(envelope);
    const lastIndex = tampered.length - 1;
    tampered[lastIndex] = (tampered[lastIndex] ?? 0) ^ 1;

    let thrown: unknown;
    try {
      decryptField(tampered, binding, registry);
    } catch (error) {
      thrown = error;
    }
    expect(thrown).toBeInstanceOf(FieldEncryptionError);

    const serialized = [JSON.stringify(thrown), String(thrown), inspect(thrown)];
    for (const rendered of serialized) {
      expect(rendered).not.toContain(secret);
      expect(rendered).not.toContain(keyHex);
    }
  });

  it('never leaks a row plaintext or derived key bytes through an error thrown during rotation', async () => {
    const secret = canary();
    const target: RotationTarget = { table: 'notes', column: 'body_ciphertext' };
    const initial = randomKeyConfig('ACTIVE');
    const oldRegistry = loadKeyRegistry(initial);
    const rotatedConfig = {
      keys: [{ ...initial.keys[0]!, state: 'RETIRING' as const }, { ...randomKeyConfig('ACTIVE').keys[0]!, keyId: 'k2' }],
    };
    const newRegistry = loadKeyRegistry(rotatedConfig);
    const oldKeyHex = internalKeyBytes(oldRegistry, 'k1').toString('hex');
    const newKeyHex = internalKeyBytes(newRegistry, 'k2').toString('hex');

    const binding = { organizationId: 'org', ...target, rowId: 'row-1' };
    const envelope = encryptField(secret, binding, oldRegistry);
    // Tamper the row's stored envelope so the decrypt step inside rotateFieldKeys throws
    // FIELD_DECRYPT_FAILED with the canary plaintext already materialized on the stack.
    const tampered = Buffer.from(envelope);
    const lastIndex = tampered.length - 1;
    tampered[lastIndex] = (tampered[lastIndex] ?? 0) ^ 1;

    const rows = new Map<string, RotationRow>([['row-1', { rowId: 'row-1', organizationId: 'org', envelope: tampered }]]);
    const scan: RotationScan = {
      readBatch: (_target, cursor) => (cursor === null ? [...rows.values()] : []),
      writeBatch: (_target, writes: RotationWrite[]): string[] => {
        for (const write of writes) rows.set(write.rowId, { rowId: write.rowId, organizationId: 'org', envelope: write.envelope });
        return [];
      },
    };

    let thrown: unknown;
    try {
      await rotateFieldKeys({
        registry: newRegistry,
        scan,
        batchSize: 8,
        manifests: [{ group: 'test', tables: [{ name: target.table, scope: 'TENANT', mutability: 'IMMUTABLE', requiredColumns: [], encryptedColumns: [target.column] }] }],
        recoveryPoint: async () => ({ id: 'rp1', takenAt: new Date().toISOString() }),
      });
    } catch (error) {
      thrown = error;
    }
    expect(thrown).toBeInstanceOf(FieldEncryptionError);

    const serialized = [JSON.stringify(thrown), String(thrown), inspect(thrown)];
    for (const rendered of serialized) {
      expect(rendered).not.toContain(secret);
      expect(rendered).not.toContain(oldKeyHex);
      expect(rendered).not.toContain(newKeyHex);
    }
  });

  it('never leaks caller-supplied material through the fail-closed loadKeyRegistry error', () => {
    const config = randomKeyConfig('ACTIVE');
    const material = config.keys[0]?.material as string;
    // Corrupt the material so it still parses as a candidate string but fails the length check --
    // loadKeyRegistry must fail closed without ever putting `material` on the thrown error.
    const invalidConfig = { keys: [{ ...config.keys[0]!, material: material.slice(0, 8) }] };

    let thrown: unknown;
    try {
      loadKeyRegistry(invalidConfig);
    } catch (error) {
      thrown = error;
    }
    expect(thrown).toBeInstanceOf(FieldEncryptionError);

    const serialized = [JSON.stringify(thrown), String(thrown), inspect(thrown)];
    for (const rendered of serialized) {
      expect(rendered).not.toContain(material);
    }
  });
});
