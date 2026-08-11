import { describe, expect, it } from 'vitest';

import { decryptField, encryptField } from '../../src/crypto/cipher.js';
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

/** A store keyed generically over any (table, column, rowId) so multi-target tests can share it. */
type Store = Map<string, { organizationId: string | null; envelope: Uint8Array | null }>;
const storeKey = (t: RotationTarget, rowId: string): string => `${t.table}.${t.column}.${rowId}`;

interface MultiScanOptions {
  /** rowIds refused by writeBatch exactly once, simulating a concurrent application writer. */
  refuseOnce?: Set<string>;
  /** After this many writeBatch calls have completed, the next writeBatch call throws instead of writing. */
  interruptAfterWriteBatches?: number;
  /** Records how many times writeBatch attempted to write each rowId (for double-write assertions). */
  writeAttempts?: Map<string, number>;
}

function multiTargetScan(store: Store, options: MultiScanOptions = {}): RotationScan {
  let writeBatches = 0;
  return {
    readBatch(t, cursor, limit) {
      const prefix = `${t.table}.${t.column}.`;
      return [...store.entries()]
        .filter(([key]) => key.startsWith(prefix))
        .map(([key, value]) => ({ rowId: key.slice(prefix.length), ...value }))
        .filter((row) => cursor === null || row.rowId > cursor)
        .sort((a, b) => a.rowId.localeCompare(b.rowId))
        .slice(0, limit);
    },
    writeBatch(t, writes: RotationWrite[]) {
      writeBatches += 1;
      if (options.interruptAfterWriteBatches !== undefined && writeBatches > options.interruptAfterWriteBatches) {
        throw new Error('simulated interruption');
      }
      const refused: string[] = [];
      for (const write of writes) {
        if (options.writeAttempts) {
          options.writeAttempts.set(write.rowId, (options.writeAttempts.get(write.rowId) ?? 0) + 1);
        }
        if (options.refuseOnce?.has(write.rowId)) {
          options.refuseOnce.delete(write.rowId);
          refused.push(write.rowId);
          continue;
        }
        const key = storeKey(t, write.rowId);
        const current = store.get(key);
        if (current === undefined || current.envelope === null || !Buffer.from(current.envelope).equals(Buffer.from(write.previousEnvelope))) {
          refused.push(write.rowId);
        } else {
          store.set(key, { organizationId: current.organizationId, envelope: write.envelope });
        }
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

  it('rotates 250 rows across two table manifests, sorted deterministically by target', async () => {
    const twoManifests: TableManifest[] = [
      { group: 'test-a', tables: [{ name: 'notes', scope: 'TENANT', mutability: 'IMMUTABLE', requiredColumns: [], encryptedColumns: ['body_ciphertext'] }] },
      { group: 'test-b', tables: [{ name: 'documents', scope: 'TENANT', mutability: 'IMMUTABLE', requiredColumns: [], encryptedColumns: ['content_ciphertext'] }] },
    ];
    const notesTarget: RotationTarget = { table: 'notes', column: 'body_ciphertext' };
    const documentsTarget: RotationTarget = { table: 'documents', column: 'content_ciphertext' };

    const initial = randomKeyConfig('ACTIVE');
    const old = loadKeyRegistry(initial);
    const nextConfig = { keys: [{ ...initial.keys[0]!, state: 'RETIRING' as const }, { ...randomKeyConfig('ACTIVE').keys[0]!, keyId: 'k2' }] };
    const next = loadKeyRegistry(nextConfig);

    const store: Store = new Map();
    for (const t of [notesTarget, documentsTarget]) {
      for (let i = 0; i < 125; i += 1) {
        const rowId = i.toString().padStart(3, '0');
        store.set(storeKey(t, rowId), {
          organizationId: 'org',
          envelope: encryptField(`value-${t.table}-${i}`, { organizationId: 'org', table: t.table, column: t.column, rowId }, old),
        });
      }
    }

    const scan = multiTargetScan(store);
    const options = { registry: next, scan, batchSize: 32, manifests: twoManifests, recoveryPoint: async () => ({ id: 'rp1', takenAt: new Date().toISOString() }) };
    const report = await rotateFieldKeys(options);

    expect(report.columns).toHaveLength(2);
    // Sorted by table name, so 'documents' precedes 'notes'.
    expect(report.columns.map((c) => c.table)).toEqual(['documents', 'notes']);
    for (const column of report.columns) {
      expect(column).toMatchObject({ scanned: 125, reencrypted: 125, skipped: 0, conflicted: 0 });
    }
    for (const [key, row] of store) {
      expect(parseEnvelopeHeader(row.envelope as Uint8Array).keyId, key).toBe('k2');
    }
  });

  it('is resumable: interrupting mid-rotation and re-running finishes with no double-encryption and no stranded row', async () => {
    const initial = randomKeyConfig('ACTIVE');
    const old = loadKeyRegistry(initial);
    const nextConfig = { keys: [{ ...initial.keys[0]!, state: 'RETIRING' as const }, { ...randomKeyConfig('ACTIVE').keys[0]!, keyId: 'k2' }] };
    const next = loadKeyRegistry(nextConfig);

    const store: Store = new Map();
    const rowCount = 100;
    const batchSize = 10;
    for (let i = 0; i < rowCount; i += 1) {
      const rowId = i.toString().padStart(3, '0');
      store.set(storeKey(target, rowId), {
        organizationId: 'org',
        envelope: encryptField(`value-${i}`, { organizationId: 'org', ...target, rowId }, old),
      });
    }

    const writeAttempts = new Map<string, number>();
    // Three write batches (30 rows) commit successfully; the fourth throws before any of its writes
    // land, simulating a crash/restart mid-rotation.
    const interruptedScan = multiTargetScan(store, { interruptAfterWriteBatches: 3, writeAttempts });
    const recoveryPoint = async (): Promise<{ id: string; takenAt: string }> => ({ id: 'rp1', takenAt: new Date().toISOString() });
    const optionsInterrupted = { registry: next, scan: interruptedScan, batchSize, manifests, recoveryPoint };

    await expect(rotateFieldKeys(optionsInterrupted)).rejects.toThrow('simulated interruption');

    const rotatedAfterInterruption = [...store.values()].filter(
      (row) => parseEnvelopeHeader(row.envelope as Uint8Array).keyId === 'k2',
    ).length;
    expect(rotatedAfterInterruption).toBe(30);
    expect(rotatedAfterInterruption).toBeLessThan(rowCount);

    // Re-run to completion, uninterrupted this time.
    const resumeScan = multiTargetScan(store, { writeAttempts });
    const optionsResume = { registry: next, scan: resumeScan, batchSize, manifests, recoveryPoint };
    const resumeReport = await rotateFieldKeys(optionsResume);

    expect(resumeReport.columns[0]).toMatchObject({ scanned: rowCount, reencrypted: rowCount - 30, skipped: 30, conflicted: 0 });
    for (const row of store.values()) {
      expect(parseEnvelopeHeader(row.envelope as Uint8Array).keyId).toBe('k2');
    }
    // Every row was written by writeBatch at most once across both runs — no double-encryption.
    for (const [rowId, attempts] of writeAttempts) {
      expect(attempts, `rowId ${rowId} was attempted ${attempts} times`).toBeLessThanOrEqual(1);
    }
    expect(writeAttempts.size).toBe(rowCount);
  });

  it('reports a compare-and-set conflict, leaves the row on its prior key, and converges on a second run', async () => {
    const initial = randomKeyConfig('ACTIVE');
    const old = loadKeyRegistry(initial);
    const nextConfig = { keys: [{ ...initial.keys[0]!, state: 'RETIRING' as const }, { ...randomKeyConfig('ACTIVE').keys[0]!, keyId: 'k2' }] };
    const next = loadKeyRegistry(nextConfig);

    const store: Store = new Map();
    const rowCount = 20;
    for (let i = 0; i < rowCount; i += 1) {
      const rowId = i.toString().padStart(3, '0');
      store.set(storeKey(target, rowId), {
        organizationId: 'org',
        envelope: encryptField(`value-${i}`, { organizationId: 'org', ...target, rowId }, old),
      });
    }
    const conflictRowId = '010';
    const conflictKey = storeKey(target, conflictRowId);

    const recoveryPoint = async (): Promise<{ id: string; takenAt: string }> => ({ id: 'rp1', takenAt: new Date().toISOString() });
    const refuseOnce = new Set([conflictRowId]);
    const scan = multiTargetScan(store, { refuseOnce });
    const options = { registry: next, scan, batchSize: 8, manifests, recoveryPoint };

    const report = await rotateFieldKeys(options);
    expect(report.columns[0]).toMatchObject({ scanned: rowCount, reencrypted: rowCount - 1, skipped: 0, conflicted: 1 });

    // The conflicted row was NOT force-written: it still decrypts under the old key, proving a
    // concurrent application write in that slot would not have been silently discarded.
    const conflictedRow = store.get(conflictKey)!;
    expect(parseEnvelopeHeader(conflictedRow.envelope as Uint8Array).keyId).toBe(old.activeKey().keyId);
    expect(decryptField(conflictedRow.envelope as Uint8Array, { organizationId: 'org', ...target, rowId: conflictRowId }, old)).toBe(
      'value-10',
    );
    // Every other row rotated normally.
    for (const [key, row] of store) {
      if (key === conflictKey) continue;
      expect(parseEnvelopeHeader(row.envelope as Uint8Array).keyId, key).toBe('k2');
    }

    // A second, uncontended run converges: the previously-refused row now rotates cleanly.
    const scanSecond = multiTargetScan(store);
    const secondReport = await rotateFieldKeys({ registry: next, scan: scanSecond, batchSize: 8, manifests, recoveryPoint });
    expect(secondReport.columns[0]).toMatchObject({ scanned: rowCount, reencrypted: 1, skipped: rowCount - 1, conflicted: 0 });
    for (const row of store.values()) {
      expect(parseEnvelopeHeader(row.envelope as Uint8Array).keyId).toBe('k2');
    }
  });
});
