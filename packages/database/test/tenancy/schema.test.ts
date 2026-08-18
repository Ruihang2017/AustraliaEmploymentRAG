/**
 * DATA-04 acceptance item 1 — a clean database migrates to head and contains exactly the eight
 * PRD §35.4 tables with every listed required column.
 *
 * The expectation table below is **transcribed from PRD §35.4 by hand**, in this file. That is the
 * point of the test: deriving it from `src/schema/tenancy.ts` would compare the schema module
 * against itself and would pass for any schema at all, including one that dropped a column the PRD
 * requires. The three columns the transcription adds beyond §35.4 are marked, each with the reason.
 */
import { describe, expect, it } from 'vitest';

import { withTenancyDatabase } from './helpers.js';

/** PRD §35.4's "Required columns" cell, verbatim, per table. */
const PRD_REQUIRED_COLUMNS: Readonly<Record<string, readonly string[]>> = {
  organization: [
    'id',
    'name',
    'slug',
    'plan',
    'status',
    'default_legal_date_policy',
    'retention_policy_json',
    'row_version',
  ],
  // "auth-library linkage" is left unspecified by the PRD on purpose (AUTC-01 owns it); the seam is
  // `AUTH_LIBRARY_LINKAGE_COLUMNS` in src/schema/tenancy.ts, which names these four.
  user: ['id', 'email_normalized', 'display_name', 'status'],
  membership: ['organization_id', 'user_id', 'role', 'status', 'joined_at', 'row_version'],
  invitation: [
    'id',
    'organization_id',
    'email_normalized',
    'role',
    'token_hash',
    'expires_at',
    'accepted_at',
    'invited_by_actor_id',
  ],
  service_account: [
    'id',
    'organization_id',
    'name',
    'status',
    'scopes_json',
    'expires_at',
    'ip_allowlist_json',
    'budget_limit',
    'row_version',
  ],
  api_credential: [
    'id',
    'organization_id',
    'service_account_id',
    'prefix',
    'secret_hash',
    'created_at',
    'expires_at',
    'last_used_at',
    'revoked_at',
  ],
  // "encrypted configuration" — this schema's column for it is `configuration_ciphertext` (BLOB,
  // DATA-03 envelope), asserted separately below.
  sso_connection: [
    'id',
    'organization_id',
    'protocol',
    'state',
    'tested_at',
    'enforced_at',
    'row_version',
  ],
  // "nullable user/service/system linkage" — `user_id` and `service_account_id`, both nullable;
  // SYSTEM is the row with neither set.
  actor: ['id', 'actor_type'],
};

const PRD_TABLES = Object.keys(PRD_REQUIRED_COLUMNS).sort();

interface ColumnInfo {
  name: string;
  type: string;
  notnull: number;
  dflt_value: unknown;
  pk: number;
}

describe('DATA-04 schema (PRD §35.4)', () => {
  it('creates exactly the eight PRD §35.4 tables and nothing else', async () => {
    await withTenancyDatabase(({ db }) => {
      const tables = db.sqlite
        .prepare<[], { name: string }>(
          "select name from sqlite_master where type = 'table' order by name",
        )
        .all()
        .map((row) => row.name)
        .filter((name) => name !== 'schema_migration' && !name.startsWith('sqlite_'));
      expect(tables).toEqual(PRD_TABLES);
    });
  });

  it('gives every table every required column PRD §35.4 lists', async () => {
    await withTenancyDatabase(({ db }) => {
      for (const [table, required] of Object.entries(PRD_REQUIRED_COLUMNS)) {
        const columns = (db.sqlite.pragma(`table_info(${table})`) as ColumnInfo[]).map(
          (column) => column.name,
        );
        for (const column of required) {
          expect(columns, `${table} is missing PRD §35.4 column ${column}`).toContain(column);
        }
      }
    });
  });

  it('stores the sso_connection configuration as an encrypted BLOB, not text', async () => {
    await withTenancyDatabase(({ db }) => {
      const columns = db.sqlite.pragma('table_info(sso_connection)') as ColumnInfo[];
      const configuration = columns.find((column) => column.name === 'configuration_ciphertext');
      expect(configuration).toBeDefined();
      expect(configuration?.type.toUpperCase()).toBe('BLOB');
      // The PRD says "encrypted configuration". A plaintext sibling would defeat it.
      expect(columns.map((column) => column.name)).not.toContain('configuration');
      expect(columns.map((column) => column.name)).not.toContain('configuration_json');
    });
  });

  it('carries created_at on every table and updated_at + row_version on the four mutable ones', async () => {
    await withTenancyDatabase(({ db }) => {
      for (const table of PRD_TABLES) {
        const columns = (db.sqlite.pragma(`table_info(${table})`) as ColumnInfo[]).map(
          (column) => column.name,
        );
        expect(columns, `${table} has no created_at (PRD §35.1)`).toContain('created_at');
      }
      // PRD §35.1's mutable-metadata set for this group, plus `user` (a status/display-name change
      // is a metadata edit — stated in src/schema/tenancy.ts).
      for (const table of ['organization', 'membership', 'service_account', 'sso_connection', 'user']) {
        const columns = (db.sqlite.pragma(`table_info(${table})`) as ColumnInfo[]).map(
          (column) => column.name,
        );
        expect(columns).toContain('updated_at');
        expect(columns).toContain('row_version');
      }
    });
  });

  it('makes every primary key a TEXT column (PRD §35.1)', async () => {
    await withTenancyDatabase(({ db }) => {
      for (const table of PRD_TABLES) {
        const primary = (db.sqlite.pragma(`table_info(${table})`) as ColumnInfo[]).filter(
          (column) => column.pk > 0,
        );
        expect(primary.map((column) => column.name), `${table} primary key`).toEqual(['id']);
        expect(primary[0]?.type.toUpperCase()).toBe('TEXT');
        // SQLite allows NULL in a non-INTEGER primary key; a NULL id is unreachable through a
        // repository whose every statement is `WHERE id = ?`.
        expect(primary[0]?.notnull, `${table}.id must be NOT NULL`).toBe(1);
      }
    });
  });

  it('carries organization_id on every TENANT-scoped table, including organization itself', async () => {
    await withTenancyDatabase(({ db }) => {
      for (const table of [
        'organization',
        'membership',
        'service_account',
        'api_credential',
        'invitation',
        'sso_connection',
      ]) {
        const columns = (db.sqlite.pragma(`table_info(${table})`) as ColumnInfo[]).map(
          (column) => column.name,
        );
        expect(columns, `${table} is TENANT-scoped (PRD §15.4)`).toContain('organization_id');
      }
      // GLOBAL by design (PRD §15.4, AUTH-002): a user belongs to several organisations.
      for (const table of ['user', 'actor']) {
        const columns = (db.sqlite.pragma(`table_info(${table})`) as ColumnInfo[]).map(
          (column) => column.name,
        );
        expect(columns, `${table} is GLOBAL and must not be tenant-scoped`).not.toContain(
          'organization_id',
        );
      }
    });
  });

  it('declares the PRD §35.4 uniqueness constraints', async () => {
    await withTenancyDatabase(({ db }) => {
      const ddl = (table: string): string =>
        (
          db.sqlite
            .prepare<[string], { sql: string }>(
              "select sql from sqlite_master where type = 'table' and name = ?",
            )
            .get(table)?.sql ?? ''
        ).replace(/\s+/g, ' ');

      expect(ddl('organization')).toContain('UNIQUE (slug)');
      expect(ddl('user')).toContain('UNIQUE (email_normalized)');
      // The §35.4 "composite PK" is enforced as a UNIQUE key; the addressing key is the synthetic
      // `id` DATA-02's factory requires (migration header deviation (1), sub-PRD M-Q6).
      expect(ddl('membership')).toContain('UNIQUE (organization_id, user_id)');
      expect(ddl('invitation')).toContain('UNIQUE (token_hash)');
      expect(ddl('api_credential')).toContain('UNIQUE (prefix)');
      expect(ddl('sso_connection')).toContain('UNIQUE (organization_id, protocol)');
      // Every tenant-owned table carries the parent-side composite key (PRD §35.1).
      for (const table of [
        'organization',
        'membership',
        'service_account',
        'api_credential',
        'invitation',
        'sso_connection',
      ]) {
        expect(ddl(table), `${table} needs UNIQUE (organization_id, id)`).toContain(
          'UNIQUE (organization_id, id)',
        );
      }
    });
  });

  it('indexes (organization_id, service_account_id) on api_credential (PRD §35.4)', async () => {
    await withTenancyDatabase(({ db }) => {
      const indexes = db.sqlite
        .prepare<[], { name: string; sql: string | null }>(
          "select name, sql from sqlite_master where type = 'index' and tbl_name = 'api_credential'",
        )
        .all();
      const explicit = indexes.filter((index) => index.sql !== null);
      expect(
        explicit.some((index) =>
          (index.sql ?? '').replace(/\s+/g, ' ').includes('(organization_id, service_account_id)'),
        ),
      ).toBe(true);
    });
  });
});
