import { SNAKE_CASE } from '../migrate/conventions.js';
import { discoverTableManifests, type TableManifest } from '../migrate/manifest.js';
import type { RecoveryPointProvider } from '../migrate/runner.js';
import { decryptField, encryptField } from './cipher.js';
import { FieldEncryptionError } from './errors.js';
import { parseEnvelopeHeader } from './envelope.js';
import type { KeyRegistry } from './keys.js';

export interface RotationRow {
  rowId: string;
  organizationId: string | null;
  envelope: Uint8Array | null;
}
export interface RotationWrite {
  rowId: string;
  previousEnvelope: Uint8Array;
  envelope: Buffer;
}
export interface RotationTarget {
  table: string;
  column: string;
}
export interface RotationScan {
  /** Return rows ordered by ascending rowId, strictly after cursor, up to limit. */
  readBatch(
    target: RotationTarget,
    cursor: string | null,
    limit: number,
  ): Promise<RotationRow[]> | RotationRow[];
  /** Compare-and-set on (rowId, previousEnvelope); return rowIds that were not written. */
  writeBatch(target: RotationTarget, writes: RotationWrite[]): Promise<string[]> | string[];
}
export interface RotationColumnReport {
  table: string;
  column: string;
  scanned: number;
  reencrypted: number;
  skipped: number;
  conflicted: number;
}
export interface RotationReport {
  recoveryPoint: { id: string; takenAt: string };
  batches: number;
  columns: RotationColumnReport[];
}
export interface RotateFieldKeysOptions {
  registry: KeyRegistry;
  scan: RotationScan;
  batchSize: number;
  recoveryPoint?: RecoveryPointProvider | undefined;
  manifests?: readonly TableManifest[] | undefined;
}

export async function rotateFieldKeys(options: RotateFieldKeysOptions): Promise<RotationReport> {
  // This must precede validation, discovery and every scan operation.
  if (options.recoveryPoint === undefined) {
    throw new FieldEncryptionError('FIELD_ROTATION_RECOVERY_POINT_REQUIRED');
  }
  const recoveryPoint = await options.recoveryPoint();

  if (!Number.isInteger(options.batchSize) || options.batchSize <= 0) {
    throw new FieldEncryptionError('FIELD_BINDING_INVALID');
  }
  const manifests = options.manifests ?? discoverTableManifests();
  const targets: RotationTarget[] = [];
  for (const manifest of manifests) {
    for (const table of manifest.tables) {
      for (const column of table.encryptedColumns ?? []) {
        if (!SNAKE_CASE.test(table.name) || !SNAKE_CASE.test(column)) {
          throw new FieldEncryptionError('FIELD_BINDING_INVALID', { table: table.name, column });
        }
        targets.push({ table: table.name, column });
      }
    }
  }
  targets.sort((a, b) => {
    if (a.table !== b.table) return a.table < b.table ? -1 : 1;
    if (a.column === b.column) return 0;
    return a.column < b.column ? -1 : 1;
  });

  let batches = 0;
  const columns: RotationColumnReport[] = [];
  for (const target of targets) {
    const report: RotationColumnReport = {
      ...target,
      scanned: 0,
      reencrypted: 0,
      skipped: 0,
      conflicted: 0,
    };
    let cursor: string | null = null;
    for (;;) {
      const rows = await options.scan.readBatch(target, cursor, options.batchSize);
      batches += 1;
      report.scanned += rows.length;
      const writes: RotationWrite[] = [];
      for (const row of rows) {
        if (row.envelope === null) {
          report.skipped += 1;
          continue;
        }
        const parsed = parseEnvelopeHeader(row.envelope);
        if (parsed.keyId === options.registry.activeKey().keyId) {
          report.skipped += 1;
          continue;
        }
        const binding = {
          organizationId: row.organizationId,
          table: target.table,
          column: target.column,
          rowId: row.rowId,
        };
        const plaintext = decryptField(row.envelope, binding, options.registry);
        const envelope = encryptField(plaintext, binding, options.registry);
        writes.push({ rowId: row.rowId, previousEnvelope: row.envelope, envelope });
      }
      if (writes.length > 0) {
        const refused = new Set(await options.scan.writeBatch(target, writes));
        for (const write of writes) {
          if (refused.has(write.rowId)) report.conflicted += 1;
          else report.reencrypted += 1;
        }
      }
      if (rows.length < options.batchSize) break;
      const last = rows.at(-1);
      if (last === undefined) break;
      cursor = last.rowId;
    }
    columns.push(report);
  }
  return { recoveryPoint, batches, columns };
}
