/**
 * DATA-08 — errors for the ephemeral store.
 *
 * Callers branch on `code`, never on message text.
 *
 * **Hard rule for this whole module:** no error constructor, message, log line or returned value ever
 * carries a payload, a plaintext, key material or a ciphertext. `test/ephemeral/canary.test.ts` is
 * what proves it.
 */
export type EphemeralErrorCode =
  /** An `ATTACH`/`DETACH` reached the guarded execution path (deliverable 1). */
  | 'EPHEMERAL_ATTACH_FORBIDDEN'
  /** `PRAGMA database_list` saw a schema other than `main`. */
  | 'EPHEMERAL_ATTACHED_DATABASE'
  /** Empty `jobId`/`organizationRef`, non-string payload, unknown kind, invalid clock argument. */
  | 'EPHEMERAL_INPUT_INVALID'
  /** Use after `close()`. */
  | 'EPHEMERAL_STORE_CLOSED';

export interface EphemeralErrorDetails {
  table?: string | undefined;
  /** Free-form, payload-free context: never a job id, an organisation ref or any plaintext. */
  detail?: string | undefined;
}

export class EphemeralError extends Error {
  readonly code: EphemeralErrorCode;
  readonly table: string | undefined;

  constructor(code: EphemeralErrorCode, details: EphemeralErrorDetails = {}) {
    const context = [details.table, details.detail].filter(Boolean).join('/');
    super(context.length === 0 ? code : `${code} (${context})`);
    this.name = 'EphemeralError';
    this.code = code;
    this.table = details.table;
  }

  toJSON(): { name: string; code: EphemeralErrorCode; table: string | undefined } {
    return { name: this.name, code: this.code, table: this.table };
  }
}
