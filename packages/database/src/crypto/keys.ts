import { hkdfSync } from 'node:crypto';
import { FieldEncryptionError } from './errors.js';

export type FieldKeyState = 'ACTIVE' | 'RETIRING' | 'RETIRED';
export interface FieldKeyConfigEntry {
  keyId: string;
  material: string | Uint8Array;
  state: FieldKeyState;
}
export interface FieldKeyRegistryConfig {
  keys: readonly FieldKeyConfigEntry[];
}
export interface KeyHandle {
  readonly keyId: string;
  readonly state: FieldKeyState;
}
export interface KeyRegistry {
  activeKey(): KeyHandle;
  keyById(keyId: string): KeyHandle;
  keyIds(): readonly string[];
  zeroize(): void;
}

const KEY_ID = /^[A-Za-z0-9._-]{1,64}$/;
const KEY_STATES = new Set<FieldKeyState>(['ACTIVE', 'RETIRING', 'RETIRED']);
const INTERNAL_KEYS = new WeakMap<KeyRegistry, (keyId: string) => Buffer>();
const CUSTOM_INSPECT = Symbol.for('nodejs.util.inspect.custom');

function invalid(): never {
  throw new FieldEncryptionError('FIELD_ENCRYPTION_KEY_INVALID');
}

function safeHandle(keyId: string, state: FieldKeyState): KeyHandle {
  const shape = (): { keyId: string; state: FieldKeyState } => ({ keyId, state });
  return Object.freeze({
    keyId,
    state,
    toString: (): string => JSON.stringify(shape()),
    toJSON: shape,
    [CUSTOM_INSPECT]: shape,
  });
}

function decodeMaterial(material: unknown): Buffer {
  if (typeof material === 'string') {
    const decoded = Buffer.from(material, 'base64');
    if (decoded.toString('base64') !== material) invalid();
    return decoded;
  }
  if (material instanceof Uint8Array) return Buffer.from(material);
  return invalid();
}

/**
 * Loads and derives field keys. HKDF is deterministic across processes so API and worker processes
 * derive the same AES key from the same material and key id. Including the id in `info` binds the
 * derived key to that id and safely accepts material longer than 32 bytes without truncation.
 *
 * Derived buffers are wiped by `zeroize()`. Caller-supplied strings are immutable JavaScript values
 * and cannot be wiped; callers should provide `Uint8Array` material where practical and manage the
 * lifetime of their input buffer.
 */
export function loadKeyRegistry(config: unknown): KeyRegistry {
  if (typeof config !== 'object' || config === null || !Array.isArray((config as { keys?: unknown }).keys)) {
    return invalid();
  }
  const entries = (config as { keys: unknown[] }).keys;
  if (entries.length === 0) return invalid();

  const handles = new Map<string, KeyHandle>();
  const derived = new Map<string, Buffer>();
  let active: KeyHandle | undefined;
  try {
    for (const candidate of entries) {
      if (typeof candidate !== 'object' || candidate === null) return invalid();
      const entry = candidate as Record<string, unknown>;
      if (
        typeof entry.keyId !== 'string' ||
        !KEY_ID.test(entry.keyId) ||
        typeof entry.state !== 'string' ||
        !KEY_STATES.has(entry.state as FieldKeyState) ||
        handles.has(entry.keyId)
      ) {
        return invalid();
      }
      const material = decodeMaterial(entry.material);
      try {
        if (material.length < 32) return invalid();
        const bytes = Buffer.from(
          hkdfSync(
            'sha256',
            material,
            Buffer.alloc(0),
            `taxrag.field-encryption.v1|${entry.keyId}`,
            32,
          ),
        );
        derived.set(entry.keyId, bytes);
      } finally {
        material.fill(0);
      }
      const handle = safeHandle(entry.keyId, entry.state as FieldKeyState);
      handles.set(entry.keyId, handle);
      if (handle.state === 'ACTIVE') {
        if (active !== undefined) return invalid();
        active = handle;
      }
    }
    if (active === undefined) return invalid();
  } catch (error) {
    for (const bytes of derived.values()) bytes.fill(0);
    if (error instanceof FieldEncryptionError) throw error;
    return invalid();
  }

  let usable = true;
  const assertUsable = (): void => {
    if (!usable) invalid();
  };
  const registryShape = (): { keyIds: readonly string[]; activeKeyId: string } => ({
    keyIds: [...handles.keys()],
    activeKeyId: active.keyId,
  });
  const registry: KeyRegistry = {
    activeKey(): KeyHandle {
      assertUsable();
      return active;
    },
    keyById(keyId: string): KeyHandle {
      assertUsable();
      const handle = handles.get(keyId);
      if (handle === undefined) throw new FieldEncryptionError('FIELD_KEY_UNKNOWN', { keyId });
      if (handle.state === 'RETIRED') throw new FieldEncryptionError('FIELD_KEY_RETIRED', { keyId });
      return handle;
    },
    keyIds(): readonly string[] {
      assertUsable();
      return Object.freeze([...handles.keys()]);
    },
    zeroize(): void {
      if (!usable) return;
      for (const bytes of derived.values()) bytes.fill(0);
      derived.clear();
      usable = false;
    },
    toString(): string {
      return JSON.stringify(registryShape());
    },
    toJSON: registryShape,
    [CUSTOM_INSPECT]: registryShape,
  } as KeyRegistry;

  INTERNAL_KEYS.set(registry, (keyId: string): Buffer => {
    assertUsable();
    const bytes = derived.get(keyId);
    if (bytes === undefined) throw new FieldEncryptionError('FIELD_KEY_UNKNOWN', { keyId });
    return bytes;
  });
  return registry;
}

/** Package-private: used by the cipher and deliberately omitted from the public barrel. */
export function internalKeyBytes(registry: KeyRegistry, keyId: string): Buffer {
  registry.keyById(keyId);
  const access = INTERNAL_KEYS.get(registry);
  if (access === undefined) return invalid();
  return access(keyId);
}
