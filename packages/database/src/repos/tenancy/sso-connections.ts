/**
 * `sso_connection` — PRD §38.3's lifecycle rows and §35.4's "enforcement requires successful current
 * test" (AUTH-005: "Failed IdP test cannot lock out the organisation").
 *
 * # The row id must exist before the configuration is encrypted
 *
 * DATA-03's AAD binds the ciphertext to `organizationId + table + column + rowId`. Encoding before
 * the id exists, or inserting under a different id, produces a row that is undecryptable — and the
 * failure surfaces only on read, long after the write looked fine. So `create` mints the id first
 * and passes the same id to `encode` and to the INSERT.
 *
 * # Enforcement
 *
 * `enforce()` refuses unless the connection is in the successful-test state (`ACTIVE`, PRD §38.3)
 * **and** `tested_at` sits within {@link SSO_TEST_FRESHNESS_MS} *before* the moment enforcement is
 * evaluated at — the window is closed at **both** ends. A `tested_at` after that moment is not a
 * fresher test, it is an inconsistent pair, and it is refused: comparing only the far end let a
 * negative age satisfy any window at all. That window is provisional: PRD §38.3
 * gives no number, and this is the same treatment DATA-02 gave `ELEVATION_MAX_AGE_MS` — named,
 * exported and documented as awaiting a decision (sub-PRD M-Q9), rather than an unexplained literal
 * buried in a comparison.
 */
import { encryptedTextCodec } from '../../crypto/codec.js';
import type { KeyRegistry } from '../../crypto/keys.js';
import type { AppDatabaseHandle } from '../../tenant/connection.js';
import type { TenantContext } from '../../tenant/context.js';
import { defineTenantRepository } from '../../tenant/repository.js';
import type { Row } from '../../tenant/repository.js';
import type { Tx } from '../../tenant/tx-internal.js';
import { TENANCY_TABLE_SPECS } from '../../schema/tenancy.js';

import { assertOrganizationOpen } from './closure.js';
import { TenancyError } from './errors.js';
import { compareAndSwap, newId, resolveNow } from './internal/support.js';
import type { RepositoryOptions } from './internal/support.js';

/**
 * Module-private on purpose (sub-PRD **D12**): this group exports concrete, pre-bound,
 * **guarded** repositories and never the factory definition. `.for(db, ctx)` on a raw definition
 * yields `defineTenantRepository`'s unguarded CRUD, which skips `assertOrganizationOpen`, the
 * last-Owner invariant, the value validations and the `row_version` CAS. Keeping the binding inside
 * this module is what makes those guards unbypassable rather than merely conventional; the
 * `test/tenancy/surface.test.ts` regression pins it.
 */
const ssoConnectionDefinition = defineTenantRepository({
  table: 'sso_connection',
  spec: TENANCY_TABLE_SPECS.sso_connection,
});

/**
 * How recent a successful SSO test must be for enforcement — **provisional**, 24 hours.
 *
 * PRD §38.3 requires "a successful current test" and defines no window. Exported and named so the
 * number is visible and replaceable in one place when `02-auth-core` or the Founder decides
 * (sub-PRD M-Q9).
 */
export const SSO_TEST_FRESHNESS_MS = 24 * 60 * 60 * 1000;

/** PRD §38.3 — the state that records a successful test. */
export const SSO_STATE_TESTED_OK = 'ACTIVE';

const configurationCodec = encryptedTextCodec({
  table: 'sso_connection',
  column: 'configuration_ciphertext',
});

export interface CreateSsoConnectionRequest {
  readonly protocol: string;
  readonly state: string;
  /** Plaintext configuration; stored only as ciphertext. */
  readonly configuration: string | null;
  readonly id?: string;
}

export interface SsoConnectionsRepository {
  find(id: string): Row | undefined;
  get(id: string): Row;
  list(options?: { limit?: number; offset?: number }): Row[];
  create(tx: Tx, request: CreateSsoConnectionRequest): Row;
  /** Decrypts the stored configuration for `id`. */
  readConfiguration(id: string): string | null;
  /** Records a test result: the state and the `tested_at` stamp, through the CAS path. */
  recordTest(tx: Tx, id: string, expectedRowVersion: number, state: string, testedAt?: string): Row;
  /** Sets `enforced_at`. Refuses with `SSO_TEST_REQUIRED` on a stale or unsuccessful test. */
  enforce(tx: Tx, id: string, expectedRowVersion: number, at?: string): Row;
}

export interface SsoRepositoryOptions extends RepositoryOptions {
  /** Required — the configuration column cannot be read or written without it. */
  readonly registry: KeyRegistry;
}

export function ssoConnectionsRepository(
  db: AppDatabaseHandle,
  ctx: TenantContext,
  options: SsoRepositoryOptions,
): SsoConnectionsRepository {
  const repository = ssoConnectionDefinition.for(db, ctx);
  const now = resolveNow(options);
  const cryptoContext = { organizationId: ctx.organizationId, registry: options.registry };

  return {
    find: (id) => repository.find(id),
    get: (id) => repository.get(id),
    list: (listOptions) => repository.list(listOptions),

    create(tx, request) {
      assertOrganizationOpen(db, ctx, tx, 'sso_connection.create');
      // The id first — the AAD binds the ciphertext to it (see the file header).
      const id = request.id ?? newId('sso');
      const ciphertext = configurationCodec.encode(cryptoContext, id, request.configuration);
      const timestamp = now();
      return repository.insert(tx, {
        id,
        protocol: request.protocol,
        state: request.state,
        configuration_ciphertext: ciphertext,
        tested_at: null,
        enforced_at: null,
        created_at: timestamp,
        updated_at: timestamp,
        row_version: 1,
      });
    },

    readConfiguration(id) {
      const row = repository.get(id);
      const stored = row['configuration_ciphertext'];
      return configurationCodec.decode(
        cryptoContext,
        id,
        stored === null || stored === undefined ? null : (stored as Uint8Array),
      );
    },

    recordTest(tx, id, expectedRowVersion, state, testedAt) {
      assertOrganizationOpen(db, ctx, tx, 'sso_connection.recordTest');
      return compareAndSwap(db, ctx, tx, now(), {
        table: 'sso_connection',
        id,
        expectedRowVersion,
        patch: { state, tested_at: testedAt ?? now() },
        scope: 'TENANT',
        kind: 'sso_connection',
      });
    },

    enforce(tx, id, expectedRowVersion, at) {
      assertOrganizationOpen(db, ctx, tx, 'sso_connection.enforce');
      const when = at ?? now();
      const row = repository.get(id);

      if (row['state'] !== SSO_STATE_TESTED_OK) {
        throw new TenancyError(
          'SSO_TEST_REQUIRED',
          `enforcement requires a successful test; the connection is in state ` +
            `${JSON.stringify(row['state'])} (PRD §38.3, §35.4)`,
          'state',
        );
      }
      const testedAt = row['tested_at'];
      if (typeof testedAt !== 'string') {
        throw new TenancyError(
          'SSO_TEST_REQUIRED',
          'enforcement requires a successful test; none is recorded (PRD §38.3, §35.4)',
          'tested_at',
        );
      }
      // Fail closed at BOTH ends of the window. `age > SSO_TEST_FRESHNESS_MS` on its own left the
      // gate open to an inconsistent pair: a `tested_at` later than `when` yields a NEGATIVE age,
      // which fails `age > window` for every possible window and so let enforcement through no
      // matter how much time had really elapsed since the last successful test. Both operands are
      // caller-supplied — `when` through `enforce`'s `at`, `tested_at` through `recordTest`'s
      // `testedAt` — so neither can be trusted to bound the other. A test dated after the moment
      // enforcement is being evaluated at is not "a successful current test" (PRD §38.3) but an
      // unusable measurement, and a security gate handed an unusable measurement must refuse.
      // `age === 0` stays legitimate: recording a test and enforcing within the same millisecond.
      const age = Date.parse(when) - Date.parse(testedAt);
      if (!Number.isFinite(age) || age < 0) {
        throw new TenancyError(
          'SSO_TEST_REQUIRED',
          'enforcement requires a successful test whose `tested_at` is not after the moment ' +
            `enforcement is evaluated at; got tested_at=${JSON.stringify(testedAt)} and ` +
            `at=${JSON.stringify(when)} (PRD §38.3, §35.4)`,
          'tested_at',
        );
      }
      if (age > SSO_TEST_FRESHNESS_MS) {
        throw new TenancyError(
          'SSO_TEST_REQUIRED',
          `the last successful test is older than SSO_TEST_FRESHNESS_MS (${SSO_TEST_FRESHNESS_MS}ms) ` +
            '(PRD §38.3 — window provisional, sub-PRD M-Q9)',
          'tested_at',
        );
      }

      return compareAndSwap(db, ctx, tx, now(), {
        table: 'sso_connection',
        id,
        expectedRowVersion,
        patch: { enforced_at: when },
        scope: 'TENANT',
        kind: 'sso_connection',
      });
    },
  };
}
