export type FieldEncryptionErrorCode =
  | 'FIELD_ENCRYPTION_KEY_INVALID'
  | 'FIELD_KEY_UNKNOWN'
  | 'FIELD_KEY_RETIRED'
  | 'FIELD_ENVELOPE_MALFORMED'
  | 'FIELD_DECRYPT_FAILED'
  | 'FIELD_BINDING_INVALID'
  | 'FIELD_ROTATION_RECOVERY_POINT_REQUIRED';

export interface FieldEncryptionErrorDetails {
  table?: string | undefined;
  column?: string | undefined;
  keyId?: string | undefined;
}

export class FieldEncryptionError extends Error {
  readonly code: FieldEncryptionErrorCode;
  readonly table: string | undefined;
  readonly column: string | undefined;
  readonly keyId: string | undefined;

  constructor(code: FieldEncryptionErrorCode, details: FieldEncryptionErrorDetails = {}) {
    const context = [details.table, details.column, details.keyId].filter(Boolean).join('/');
    super(context.length === 0 ? code : `${code} (${context})`);
    this.name = 'FieldEncryptionError';
    this.code = code;
    this.table = details.table;
    this.column = details.column;
    this.keyId = details.keyId;
  }

  toJSON(): {
    name: string;
    code: FieldEncryptionErrorCode;
    table: string | undefined;
    column: string | undefined;
    keyId: string | undefined;
  } {
    return {
      name: this.name,
      code: this.code,
      table: this.table,
      column: this.column,
      keyId: this.keyId,
    };
  }
}
