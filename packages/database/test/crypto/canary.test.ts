import Database from 'better-sqlite3';
import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import { encryptedColumnDdl, encryptedTextCodec } from '../../src/crypto/codec.js';
import { loadKeyRegistry } from '../../src/crypto/keys.js';
import { assertSchemaConventions } from '../../src/migrate/conventions-lint.js';
import { idColumn, timestampColumn } from '../../src/migrate/conventions.js';
import { applyAppPragmas } from '../../src/migrate/pragmas.js';
import { canary, randomKeyConfig, withTempDatabase } from './helpers.js';

describe('SQLite ciphertext canary', () => {
  it('never stores customer plaintext in the database or WAL', async () => {
    await withTempDatabase(async (databasePath) => {
      const value = canary();
      const db = new Database(databasePath);
      applyAppPragmas(db);
      db.exec(`CREATE TABLE canary (${idColumn('id')}, ${timestampColumn('created_at')}, ${encryptedColumnDdl('content_ciphertext')})`);
      expect(() => assertSchemaConventions(db, [{ group: 'crypto-canary', tables: [{ name: 'canary', scope: 'GLOBAL', mutability: 'IMMUTABLE', requiredColumns: ['content_ciphertext'] }] }])).not.toThrow();
      const registry = loadKeyRegistry(randomKeyConfig('ACTIVE'));
      const encoded = encryptedTextCodec({ table: 'canary', column: 'content_ciphertext' }).encode({ organizationId: null, registry }, 'row-1', value);
      db.prepare('INSERT INTO canary (id, created_at, content_ciphertext) VALUES (?, ?, ?)').run('row-1', new Date().toISOString(), encoded);
      db.pragma('wal_checkpoint(TRUNCATE)');
      db.close();
      for (const path of [databasePath, `${databasePath}-wal`, `${databasePath}-shm`]) {
        if (existsSync(path)) expect(readFileSync(path).includes(value, 0, 'utf8')).toBe(false);
      }
    });
  });
});
