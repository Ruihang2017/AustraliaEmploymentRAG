import { FieldEncryptionError } from './errors.js';

export const ENVELOPE_VERSION = 1;
export const NONCE_BYTES = 12;
export const TAG_BYTES = 16;

export interface ParsedEnvelope {
  version: number;
  keyId: string;
  nonce: Buffer;
  ciphertext: Buffer;
  authTag: Buffer;
  headerLength: number;
}

function malformed(): never {
  throw new FieldEncryptionError('FIELD_ENVELOPE_MALFORMED');
}

export function parseEnvelopeHeader(input: Uint8Array): ParsedEnvelope {
  const buf = Buffer.from(input);
  if (buf.length < 2) return malformed();
  const version = buf[0];
  const keyIdLength = buf[1];
  if (version === undefined || keyIdLength === undefined || keyIdLength < 1 || keyIdLength > 64) {
    return malformed();
  }
  const headerLength = 2 + keyIdLength;
  const minimumLength = headerLength + NONCE_BYTES + TAG_BYTES;
  if (buf.length < minimumLength) return malformed();
  if (version !== ENVELOPE_VERSION) return malformed();

  const keyIdBytes = buf.subarray(2, headerLength);
  for (const byte of keyIdBytes) {
    const valid =
      (byte >= 48 && byte <= 57) ||
      (byte >= 65 && byte <= 90) ||
      (byte >= 97 && byte <= 122) ||
      byte === 46 ||
      byte === 95 ||
      byte === 45;
    if (!valid) return malformed();
  }
  const nonceEnd = headerLength + NONCE_BYTES;
  const tagStart = buf.length - TAG_BYTES;
  return {
    version,
    keyId: keyIdBytes.toString('ascii'),
    nonce: Buffer.from(buf.subarray(headerLength, nonceEnd)),
    ciphertext: Buffer.from(buf.subarray(nonceEnd, tagStart)),
    authTag: Buffer.from(buf.subarray(tagStart)),
    headerLength,
  };
}

export function buildEnvelope(input: {
  keyId: string;
  nonce: Buffer;
  ciphertext: Buffer;
  authTag: Buffer;
}): Buffer {
  const keyId = Buffer.from(input.keyId, 'ascii');
  if (
    keyId.length < 1 ||
    keyId.length > 64 ||
    input.nonce.length !== NONCE_BYTES ||
    input.authTag.length !== TAG_BYTES ||
    !/^[A-Za-z0-9._-]+$/.test(input.keyId)
  ) {
    return malformed();
  }
  return Buffer.concat([
    Buffer.from([ENVELOPE_VERSION, keyId.length]),
    keyId,
    input.nonce,
    input.ciphertext,
    input.authTag,
  ]);
}
