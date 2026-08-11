import { randomBytes, randomUUID } from 'node:crypto';

import type { FieldKeyRegistryConfig, FieldKeyState } from '../../src/crypto/keys.js';

export { withTempDatabase, withTempDir } from '../migrate/helpers.js';

export function randomKeyConfig(...states: FieldKeyState[]): FieldKeyRegistryConfig {
  return {
    keys: states.map((state, index) => ({
      keyId: `k${index + 1}`,
      material: randomBytes(32).toString('base64'),
      state,
    })),
  };
}

export function canary(): string {
  return `CANARY-DATA03-${randomUUID()}`;
}
