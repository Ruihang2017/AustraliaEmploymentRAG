/**
 * DATA-04 acceptance items 2 and 3 — DATA-01's `assertSchemaConventions` passes for the tenancy
 * manifest at head, and a drifted enum CHECK fails.
 *
 * The drift case is the one that matters. A green convention check that cannot go red proves
 * nothing, so the negative here builds a real table whose `role` CHECK carries an extra value and a
 * matching hand-built `TableSpec`, and requires the linter to report it against the
 * `packages/contracts` `Role` family.
 */
import { describe, expect, it } from 'vitest';

import { getEnumValues } from '../../src/migrate/contracts.js';
import { assertSchemaConventions } from '../../src/migrate/conventions-lint.js';
import { discoverTableManifests } from '../../src/migrate/manifest.js';
import type { TableSpec } from '../../src/migrate/manifest.js';
import { tableManifest } from '../../src/schema/tenancy.js';

import { withTenancyDatabase } from './helpers.js';

function specOf(name: string): TableSpec {
  const spec = tableManifest.tables.find((table) => table.name === name);
  if (!spec) throw new Error(`no TableSpec named ${name}`);
  return spec;
}

describe('DATA-04 manifest conventions (PRD §35.1)', () => {
  it('passes assertSchemaConventions at head for every discovered manifest', async () => {
    await withTenancyDatabase(({ db }) => {
      const manifests = discoverTableManifests();
      expect(manifests.map((manifest) => manifest.group)).toContain('tenancy');
      expect(() => assertSchemaConventions(db.sqlite, manifests)).not.toThrow();
    });
  });

  it('declares the scopes and mutabilities the ticket specifies', () => {
    expect(specOf('user').scope).toBe('GLOBAL');
    expect(specOf('actor').scope).toBe('GLOBAL');
    for (const name of [
      'organization',
      'membership',
      'service_account',
      'api_credential',
      'invitation',
      'sso_connection',
    ]) {
      expect(specOf(name).scope, `${name} scope`).toBe('TENANT');
    }

    for (const name of ['organization', 'membership', 'service_account', 'sso_connection']) {
      expect(specOf(name).mutability, `${name} mutability`).toBe('MUTABLE_METADATA');
    }
    // Their lifecycle is stamps (accepted_at / revoked_at / last_used_at), not row rewriting.
    for (const name of ['invitation', 'api_credential', 'actor']) {
      expect(specOf(name).mutability, `${name} mutability`).toBe('APPEND_ONLY');
    }
    expect(specOf('user').mutability).toBe('MUTABLE_METADATA');
  });

  it('declares the sso_connection ciphertext column as encrypted, and no other', () => {
    expect(specOf('sso_connection').encryptedColumns).toEqual(['configuration_ciphertext']);
    for (const table of tableManifest.tables) {
      if (table.name === 'sso_connection') continue;
      expect(table.encryptedColumns, `${table.name} declares encrypted columns`).toBeUndefined();
    }
  });

  it('registers exactly the three enum columns that have a packages/contracts family', () => {
    const registered = tableManifest.tables.flatMap((table) =>
      Object.entries(table.enumColumns ?? {}).map(([column, family]) => `${table.name}.${column}=${family}`),
    );
    expect(registered.sort()).toEqual([
      'invitation.role=Role',
      'membership.role=Role',
      'sso_connection.state=SsoConnectionState',
    ]);
    // Non-vacuity: those families must actually resolve in the registry (FND-03).
    expect(getEnumValues('Role')).toContain('OWNER');
    expect(getEnumValues('SsoConnectionState')).toContain('ACTIVE');
  });

  it('fails a drifted enum CHECK — the drift test bites (acceptance item 3)', async () => {
    await withTenancyDatabase(({ db }) => {
      db.sqlite.exec(
        `CREATE TABLE drifted_membership (
           id TEXT NOT NULL PRIMARY KEY,
           organization_id TEXT NOT NULL,
           role TEXT NOT NULL CHECK (role IN ('OWNER','ADMIN','RESEARCHER','VIEWER','DEVELOPER','SUPERUSER')),
           created_at TEXT NOT NULL
         );`,
      );
      const drifted: TableSpec = {
        name: 'drifted_membership',
        scope: 'TENANT',
        mutability: 'APPEND_ONLY',
        requiredColumns: ['id', 'organization_id', 'role', 'created_at'],
        enumColumns: { role: 'Role' },
      };
      expect(() =>
        assertSchemaConventions(db.sqlite, [{ group: 'drift-fixture', tables: [drifted] }]),
      ).toThrowError(/drifted from packages\/contracts Role/);
    });
  });

  it('fails a table that drops a manifest-required column', async () => {
    await withTenancyDatabase(({ db }) => {
      db.sqlite.exec(
        `CREATE TABLE thin_membership (
           id TEXT NOT NULL PRIMARY KEY,
           organization_id TEXT NOT NULL,
           created_at TEXT NOT NULL
         );`,
      );
      const thin: TableSpec = {
        ...specOf('membership'),
        name: 'thin_membership',
      };
      expect(() =>
        assertSchemaConventions(db.sqlite, [{ group: 'drift-fixture', tables: [thin] }]),
      ).toThrowError(/manifest requires column/);
    });
  });
});
