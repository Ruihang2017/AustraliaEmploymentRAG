import { describe, expect, it } from 'vitest';

import { encryptField } from '../../src/crypto/cipher.js';
import { parseEnvelopeHeader } from '../../src/crypto/envelope.js';
import { loadKeyRegistry } from '../../src/crypto/keys.js';
import { rotateFieldKeys, type RotationScan, type RotationTarget, type RotationWrite } from '../../src/crypto/rotate.js';
import type { TableManifest } from '../../src/migrate/manifest.js';
import { randomKeyConfig } from './helpers.js';

const manifests: TableManifest[] = [{ group: 'test', tables: [{ name: 'notes', scope: 'TENANT', mutability: 'IMMUTABLE', requiredColumns: [], encryptedColumns: ['body_ciphertext'] }] }];
const target: RotationTarget = { table: 'notes', column: 'body_ciphertext' };
const mapKey = (rowId: string): string => `${target.table}.${target.column}.${rowId}`;

function fakeScan(rows: Map<string, { organizationId: string | null; envelope: Uint8Array | null }>): RotationScan {
  return {
    readBatch(_target, cursor, limit) {
      return [...rows.entries()]
        .filter(([key]) => key.startsWith(`${target.table}.${target.column}.`))
        .map(([key, value]) => ({ rowId: key.split('.').at(-1) as string, ...value }))
        .filter((row) => cursor === null || row.rowId > cursor)
        .sort((a, b) => a.rowId.localeCompare(b.rowId))
        .slice(0, limit);
    },
    writeBatch(_target, writes: RotationWrite[]) {
      const refused: string[] = [];
      for (const write of writes) {
        const key = mapKey(write.rowId);
        const current = rows.get(key);
        if (current === undefined || current.envelope === null || !Buffer.from(current.envelope).equals(Buffer.from(write.previousEnvelope))) {
          refused.push(write.rowId);
        } else rows.set(key, { organizationId: current.organizationId, envelope: write.envelope });
      }
      return refused;
    },
  };
}

describe('field key rotation', () => {
  it('requires recovery before all scanning', async () => {
    let reads = 0;
    const scan: RotationScan = { readBatch: () => { reads += 1; return []; }, writeBatch: () => [] };
    await expect(rotateFieldKeys({ registry: loadKeyRegistry(randomKeyConfig('ACTIVE')), scan, batchSize: 1, manifests })).rejects.toMatchObject({ code: 'FIELD_ROTATION_RECOVERY_POINT_REQUIRED' });
    expect(reads).toBe(0);
  });

  it('rotates in batches and is idempotent', async () => {
    const initial = randomKeyConfig('ACTIVE');
    const old = loadKeyRegistry(initial);
    const nextConfig = { keys: [{ ...initial.keys[0]!, state: 'RETIRING' as const }, { ...randomKeyConfig('ACTIVE').keys[0]!, keyId: 'k2' }] };
    const next = loadKeyRegistry(nextConfig);
    const rows = new Map<string, { organizationId: string | null; envelope: Uint8Array | null }>();
    for (let i = 0; i < 75; i += 1) {
      const rowId = i.toString().padStart(3, '0');
      rows.set(mapKey(rowId), { organizationId: 'org', envelope: encryptField(`value-${i}`, { organizationId: 'org', ...target, rowId }, old) });
    }
    const scan = fakeScan(rows);
    const options = { registry: next, scan, batchSize: 16, manifests, recoveryPoint: async () => ({ id: 'rp1', takenAt: new Date().toISOString() }) };
    const first = await rotateFieldKeys(options);
    expect(first.columns[0]).toMatchObject({ scanned: 75, reencrypted: 75, skipped: 0, conflicted: 0 });
    for (const row of rows.values()) expect(parseEnvelopeHeader(row.envelope as Uint8Array).keyId).toBe('k2');
    const second = await rotateFieldKeys(options);
    expect(second.columns[0]).toMatchObject({ scanned: 75, reencrypted: 0, skipped: 75 });
  });
});
