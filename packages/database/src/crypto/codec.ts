import { SNAKE_CASE } from '../migrate/conventions.js';
import { decryptField, encryptField } from './cipher.js';
import { FieldEncryptionError } from './errors.js';
import type { KeyRegistry } from './keys.js';

/**
 * Structural minimum for repository contexts. DATA-02's TenantContext is structurally compatible;
 * this seam intentionally has no dependency on the tenant module.
 */
export interface FieldCryptoContext {
  readonly organizationId: string | null;
  readonly registry: KeyRegistry;
}

export interface EncryptedTextCodec {
  encode(ctx: FieldCryptoContext, rowId: string, value: string | null): Buffer | null;
  decode(ctx: FieldCryptoContext, rowId: string, stored: Uint8Array | null): string | null;
}

export function encryptedTextCodec(spec: { table: string; column: string }): EncryptedTextCodec {
  if (!SNAKE_CASE.test(spec.table) || !SNAKE_CASE.test(spec.column)) {
    throw new FieldEncryptionError('FIELD_BINDING_INVALID', {
      table: spec.table,
      column: spec.column,
    });
  }
  return {
    encode(ctx, rowId, value) {
      if (value === null) return null;
      return encryptField(
        value,
        { organizationId: ctx.organizationId, table: spec.table, column: spec.column, rowId },
        ctx.registry,
      );
    },
    decode(ctx, rowId, stored) {
      if (stored === null) return null;
      return decryptField(
        stored,
        { organizationId: ctx.organizationId, table: spec.table, column: spec.column, rowId },
        ctx.registry,
      );
    },
  };
}

/**
 * Envelopes are binary, so BLOB avoids base64's 33% expansion and invalid UTF-8 round-trip risks.
 * better-sqlite3 binds Buffer values as BLOB and returns them as Buffer/Uint8Array values.
 */
export function encryptedColumnDdl(
  name: string,
  options: { nullable?: boolean | undefined } = {},
): string {
  if (!SNAKE_CASE.test(name)) {
    throw new FieldEncryptionError('FIELD_BINDING_INVALID', { column: name });
  }
  return options.nullable === false ? `${name} BLOB NOT NULL` : `${name} BLOB`;
}
