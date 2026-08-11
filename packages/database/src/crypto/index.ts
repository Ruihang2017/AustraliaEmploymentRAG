/**
 * Field encryption provides confidentiality at rest inside app.sqlite and ephemeral.sqlite only.
 * Discarding a key is not deletion: the PRD A10.3 retention lifecycle remains a data operation.
 * This is not a PII control; that boundary occurs before persistence. Ciphertext supports neither
 * equality nor range search because this module intentionally provides no deterministic/searchable
 * encryption.
 *
 * Consumers import from `@taxrag/database/src/crypto/index.js`; in-package callers may use a
 * relative `../crypto/index.js` import.
 */
export * from './errors.js';
export * from './redaction.js';
export {
  loadKeyRegistry,
  type FieldKeyState,
  type FieldKeyConfigEntry,
  type FieldKeyRegistryConfig,
  type KeyHandle,
  type KeyRegistry,
} from './keys.js';
export * from './envelope.js';
export * from './cipher.js';
export * from './codec.js';
export * from './rotate.js';
