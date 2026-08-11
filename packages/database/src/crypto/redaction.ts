import { FieldEncryptionError } from './errors.js';

const ALLOWED_KEYS = new Set([
  'code',
  'table',
  'column',
  'keyId',
  'batchSize',
  'scanned',
  'reencrypted',
  'skipped',
  'conflicted',
]);
const MAX_DEPTH = 4;

/** Redacts by allowlist so newly-added fields are private by default. */
export function redactForLog(value: unknown): unknown {
  return redact(value, 0, new WeakSet<object>());
}

function redact(value: unknown, depth: number, seen: WeakSet<object>): unknown {
  if (
    typeof value === 'string' ||
    typeof value === 'bigint' ||
    typeof value === 'symbol' ||
    typeof value === 'function' ||
    value instanceof Uint8Array
  ) {
    return '[redacted]';
  }
  if (value === null || value === undefined || typeof value === 'number' || typeof value === 'boolean') {
    return value;
  }
  if (value instanceof FieldEncryptionError) return value.toJSON();
  if (depth >= MAX_DEPTH || typeof value !== 'object') return '[redacted]';
  if (seen.has(value)) return '[redacted]';
  seen.add(value);

  if (Array.isArray(value)) return value.map((item) => redact(item, depth + 1, seen));

  const output: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value)) {
    if (ALLOWED_KEYS.has(key)) output[key] = redact(item, depth + 1, seen);
  }
  return output;
}
