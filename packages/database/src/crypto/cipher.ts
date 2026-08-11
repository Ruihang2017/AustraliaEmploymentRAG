import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

import { SNAKE_CASE } from '../migrate/conventions.js';
import { FieldEncryptionError } from './errors.js';
import { buildEnvelope, ENVELOPE_VERSION, NONCE_BYTES, parseEnvelopeHeader, TAG_BYTES } from './envelope.js';
import { internalKeyBytes, type KeyRegistry } from './keys.js';

export interface FieldBinding {
  organizationId: string | null;
  table: string;
  column: string;
  rowId: string;
}

function assertBinding(binding: FieldBinding): void {
  if (
    typeof binding !== 'object' ||
    binding === null ||
    typeof binding.table !== 'string' ||
    !SNAKE_CASE.test(binding.table) ||
    typeof binding.column !== 'string' ||
    !SNAKE_CASE.test(binding.column) ||
    typeof binding.rowId !== 'string' ||
    binding.rowId.length === 0 ||
    (binding.organizationId !== null &&
      (typeof binding.organizationId !== 'string' || binding.organizationId.length === 0))
  ) {
    throw new FieldEncryptionError('FIELD_BINDING_INVALID', {
      table: typeof binding?.table === 'string' ? binding.table : undefined,
      column: typeof binding?.column === 'string' ? binding.column : undefined,
    });
  }
}

function lengthPrefixed(value: string): Buffer {
  const bytes = Buffer.from(value, 'utf8');
  const length = Buffer.allocUnsafe(4);
  length.writeUInt32BE(bytes.length);
  return Buffer.concat([length, bytes]);
}

export function buildAad(envelopeVersion: number, keyId: string, binding: FieldBinding): Buffer {
  assertBinding(binding);
  if (!Number.isInteger(envelopeVersion) || envelopeVersion < 0 || envelopeVersion > 255) {
    throw new FieldEncryptionError('FIELD_BINDING_INVALID', {
      table: binding.table,
      column: binding.column,
      keyId,
    });
  }
  const parts = [
    Buffer.from('taxrag.field-encryption.v1', 'utf8'),
    Buffer.from([envelopeVersion]),
    lengthPrefixed(keyId),
  ];
  if (binding.organizationId === null) {
    parts.push(Buffer.from([0]));
  } else {
    parts.push(Buffer.from([1]), lengthPrefixed(binding.organizationId));
  }
  parts.push(lengthPrefixed(binding.table), lengthPrefixed(binding.column), lengthPrefixed(binding.rowId));
  return Buffer.concat(parts);
}

/**
 * Encrypts with a fresh random 96-bit GCM nonce. Random nonce collision risk grows at the birthday
 * bound, so safe per-key message counts must remain well below 2^32; multi-version keys and rotation
 * exist to keep that bound manageable.
 */
export function encryptField(plaintext: string, binding: FieldBinding, registry: KeyRegistry): Buffer {
  assertBinding(binding);
  if (typeof plaintext !== 'string') {
    throw new FieldEncryptionError('FIELD_BINDING_INVALID', {
      table: binding.table,
      column: binding.column,
    });
  }
  const handle = registry.activeKey();
  const nonce = randomBytes(NONCE_BYTES);
  const plaintextBytes = Buffer.from(plaintext, 'utf8');
  const cipher = createCipheriv('aes-256-gcm', internalKeyBytes(registry, handle.keyId), nonce, {
    authTagLength: TAG_BYTES,
  });
  cipher.setAAD(buildAad(ENVELOPE_VERSION, handle.keyId, binding), {
    plaintextLength: plaintextBytes.length,
  });
  const ciphertext = Buffer.concat([cipher.update(plaintextBytes), cipher.final()]);
  return buildEnvelope({ keyId: handle.keyId, nonce, ciphertext, authTag: cipher.getAuthTag() });
}

export function decryptField(envelope: Uint8Array, binding: FieldBinding, registry: KeyRegistry): string {
  assertBinding(binding);
  const parsed = parseEnvelopeHeader(envelope);
  // Preserve unknown/retired distinctions: registry lookup happens outside the AEAD error boundary.
  registry.keyById(parsed.keyId);
  const key = internalKeyBytes(registry, parsed.keyId);
  try {
    const decipher = createDecipheriv('aes-256-gcm', key, parsed.nonce, {
      authTagLength: TAG_BYTES,
    });
    decipher.setAAD(buildAad(parsed.version, parsed.keyId, binding), {
      plaintextLength: parsed.ciphertext.length,
    });
    decipher.setAuthTag(parsed.authTag);
    const plaintext = Buffer.concat([decipher.update(parsed.ciphertext), decipher.final()]);
    return plaintext.toString('utf8');
  } catch {
    throw new FieldEncryptionError('FIELD_DECRYPT_FAILED', {
      table: binding.table,
      column: binding.column,
      keyId: parsed.keyId,
    });
  }
}
