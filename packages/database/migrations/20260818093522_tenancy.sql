-- aer:phase expand
--
-- DATA-04 deliverable 1 — the PRD §35.4 tenancy and identity table group.
--
-- Basis: PRD §35.4 (normative table/column/constraint list), §15.4 (entity meanings and the
-- "every tenant-owned row MUST include organization_id" rule), §35.1 (column conventions),
-- §35.8 invariant 4 (tenant child rows cannot point at another tenant's parent rows),
-- §10.3 (organisation closure = export then deletion), §38.3 (SSO lifecycle), §38.4 (service
-- accounts), §30.2 AUTH-002/003/006.
--
-- AUTHORING FORMAT. Raw SQL, checked into git, is the only migration authoring format in this
-- repository (sub-PRD D2/D11, breakdown plan §8 Q13). The fragments below were produced once by
-- DATA-01's `src/migrate/conventions.ts`, DATA-02's `src/tenant/keys.ts` and DATA-03's
-- `encryptedColumnDdl`, and pasted here — nothing generates this file at runtime. The mechanical
-- anti-drift guarantee is `src/schema/tenancy.ts`'s manifest plus `assertSchemaConventions`, which
-- compares every enum CHECK against the `packages/contracts` registry on a migrated database.
--
-- RECORDED DEVIATIONS FROM PRD §35.4 (both written back to docs/prd/01-app-data/README.md, v0.5):
--
--   (1) `membership` (M-Q6). §35.4 says "composite PK" for (organization_id, user_id). DATA-02's
--       repository factory addresses every row by a single `id` — it refuses a spec without `id` in
--       requiredColumns, and every read/update/delete is `WHERE id = ? AND organization_id = ?`. So
--       `membership` carries a synthetic `id TEXT PRIMARY KEY` **and** `UNIQUE (organization_id,
--       user_id)`. The uniqueness §35.4 asks for is enforced identically; only the addressing key
--       differs.
--
--   (2) `organization.organization_id` (M-Q8). `organization` is TENANT-scoped, and both
--       `assertSchemaConventions` and `defineTenantRepository` refuse a TENANT table without an
--       `organization_id` column. It therefore carries its own, with `CHECK (organization_id = id)`.
--       Consequence: creating an organisation happens inside a `withTenantTransaction` whose
--       context's organizationId **is the new organisation's id** — the factory sets
--       `organization_id` from the context and the CHECK forces `id` to match. Which ticket mints
--       that bootstrap context is AUTC-01/IDNT-02's question, not this one's.
--
--   (3) Composite tenant FKs, "where feasible" (PRD §15.4, recorded under D1 / M-Q5). Feasible and
--       therefore structural: api_credential.(organization_id, service_account_id) ->
--       service_account.(organization_id, id). NOT feasible, each with a compensating application
--       check: invitation.invited_by_actor_id -> actor (actor is GLOBAL, no organization_id — the
--       invitations repository resolves the actor and refuses one whose linkage belongs to another
--       organisation, inside the same transaction); membership.user_id -> user (user is GLOBAL by
--       design, AUTH-002); actor.service_account_id -> service_account (a GLOBAL child pointing at
--       a tenant row).
--
--   (4) Controlled values without a canonical enum (M-Q7). Only `membership.role`,
--       `invitation.role` (Role) and `sso_connection.state` (SsoConnectionState) exist in the
--       `packages/contracts` registry; their CHECKs are pasted from `enumCheck(...)` and the
--       manifest lists them under `enumColumns`, which is what makes the drift test bite.
--       `organization.status`, `membership.status`, `actor.actor_type` and `sso_connection.protocol`
--       need a value set because this ticket's acceptance depends on distinguishing values, so they
--       carry a module-local frozen constant in `src/schema/tenancy.ts` and the CHECK below.
--       `organization.plan`, `organization.default_legal_date_policy`, `user.status` and
--       `service_account.status` have **no vocabulary anywhere in the PRD** — they are TEXT NOT NULL
--       with no CHECK rather than an invented one. FND-03 owns canonicalising all of these.
--
--   (5) `sso_connection` uniqueness is `(organization_id, protocol)` — one connection per protocol
--       per organisation (ticket deliverable 3 asks for the decision to be stated here). PRD §38.3
--       describes a single connection lifecycle per organisation and §16.3 lists the protocols as
--       alternatives; nothing in the PRD contemplates two simultaneous SAML connections.
--
-- `id TEXT NOT NULL PRIMARY KEY` rather than the bare `TEXT PRIMARY KEY` `idColumn()` emits: SQLite
-- famously allows NULL in a non-INTEGER PRIMARY KEY, and a NULL id is unreachable through a
-- repository whose every statement is `WHERE id = ?`. Same spelling `test/tenant/helpers.ts` uses.

-- ---------------------------------------------------------------------------------------------
-- user — GLOBAL (PRD §15.4: "Human identity"; a user belongs to several organisations, AUTH-002).
-- ---------------------------------------------------------------------------------------------
CREATE TABLE user (
  id TEXT NOT NULL PRIMARY KEY,
  email_normalized TEXT NOT NULL,
  display_name TEXT NOT NULL,
  status TEXT NOT NULL,
  created_at TEXT NOT NULL CHECK (created_at GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]T[0-9][0-9]:[0-9][0-9]:[0-9][0-9]*Z'),
  updated_at TEXT NOT NULL CHECK (updated_at GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]T[0-9][0-9]:[0-9][0-9]:[0-9][0-9]*Z'),
  row_version INTEGER NOT NULL DEFAULT 1,
  UNIQUE (email_normalized)
);

-- ---------------------------------------------------------------------------------------------
-- organization — TENANT (PRD §15.4: "Tenant boundary, plan, retention, defaults and limits").
-- `status` closure blocks writes (PRD §10.3, §35.4) — enforced in the repository layer, which reads
-- this column inside the caller's transaction before every tenancy write.
-- ---------------------------------------------------------------------------------------------
CREATE TABLE organization (
  id TEXT NOT NULL PRIMARY KEY,
  organization_id TEXT NOT NULL,
  name TEXT NOT NULL,
  slug TEXT NOT NULL,
  plan TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('ACTIVE','CLOSING','CLOSED')),
  default_legal_date_policy TEXT NOT NULL,
  retention_policy_json TEXT NOT NULL,
  created_at TEXT NOT NULL CHECK (created_at GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]T[0-9][0-9]:[0-9][0-9]:[0-9][0-9]*Z'),
  updated_at TEXT NOT NULL CHECK (updated_at GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]T[0-9][0-9]:[0-9][0-9]:[0-9][0-9]*Z'),
  row_version INTEGER NOT NULL DEFAULT 1,
  CHECK (organization_id = id),
  UNIQUE (slug),
  UNIQUE (organization_id, id)
);

-- ---------------------------------------------------------------------------------------------
-- membership — TENANT (PRD §15.4: "User-to-organisation role/permissions").
-- Last-Owner invariant (PRD §35.4) is an application invariant evaluated inside the same
-- transaction as the write; see src/repos/tenancy/memberships.ts.
-- ---------------------------------------------------------------------------------------------
CREATE TABLE membership (
  id TEXT NOT NULL PRIMARY KEY,
  organization_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('OWNER','ADMIN','RESEARCHER','VIEWER','DEVELOPER')),
  status TEXT NOT NULL CHECK (status IN ('ACTIVE','SUSPENDED')),
  joined_at TEXT NOT NULL CHECK (joined_at GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]T[0-9][0-9]:[0-9][0-9]:[0-9][0-9]*Z'),
  created_at TEXT NOT NULL CHECK (created_at GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]T[0-9][0-9]:[0-9][0-9]:[0-9][0-9]*Z'),
  updated_at TEXT NOT NULL CHECK (updated_at GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]T[0-9][0-9]:[0-9][0-9]:[0-9][0-9]*Z'),
  row_version INTEGER NOT NULL DEFAULT 1,
  UNIQUE (organization_id, user_id),
  UNIQUE (organization_id, id),
  FOREIGN KEY (organization_id) REFERENCES organization(id),
  FOREIGN KEY (user_id) REFERENCES user(id)
);

-- ---------------------------------------------------------------------------------------------
-- service_account — TENANT (PRD §15.4: "Non-human organisation actor with scopes"; §35.4 "no Web
-- login"). `UNIQUE (organization_id, id)` is tenantForeignKey(...).parentConstraint: without it
-- SQLite rejects api_credential's composite child reference with "foreign key mismatch" regardless
-- of organisation, and the cross-tenant FK test would pass for the wrong reason.
-- ---------------------------------------------------------------------------------------------
CREATE TABLE service_account (
  id TEXT NOT NULL PRIMARY KEY,
  organization_id TEXT NOT NULL,
  name TEXT NOT NULL,
  status TEXT NOT NULL,
  scopes_json TEXT NOT NULL,
  expires_at TEXT CHECK (expires_at IS NULL OR expires_at GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]T[0-9][0-9]:[0-9][0-9]:[0-9][0-9]*Z'),
  ip_allowlist_json TEXT,
  budget_limit INTEGER,
  created_at TEXT NOT NULL CHECK (created_at GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]T[0-9][0-9]:[0-9][0-9]:[0-9][0-9]*Z'),
  updated_at TEXT NOT NULL CHECK (updated_at GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]T[0-9][0-9]:[0-9][0-9]:[0-9][0-9]*Z'),
  row_version INTEGER NOT NULL DEFAULT 1,
  UNIQUE (organization_id, id),
  FOREIGN KEY (organization_id) REFERENCES organization(id)
);

-- ---------------------------------------------------------------------------------------------
-- actor — GLOBAL (PRD §15.4/§35.4: "Unified User, ServiceAccount or SystemJob audit identity",
-- "stable audit identity"). The UNIQUE linkage indexes are what make `ensureActor` idempotent under
-- concurrency; the exactly-one-linkage CHECK is what makes the union honest.
-- ---------------------------------------------------------------------------------------------
CREATE TABLE actor (
  id TEXT NOT NULL PRIMARY KEY,
  actor_type TEXT NOT NULL CHECK (actor_type IN ('USER','SERVICE_ACCOUNT','SYSTEM')),
  user_id TEXT,
  service_account_id TEXT,
  created_at TEXT NOT NULL CHECK (created_at GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]T[0-9][0-9]:[0-9][0-9]:[0-9][0-9]*Z'),
  UNIQUE (user_id),
  UNIQUE (service_account_id),
  FOREIGN KEY (user_id) REFERENCES user(id),
  FOREIGN KEY (service_account_id) REFERENCES service_account(id),
  CHECK (
    (actor_type = 'USER' AND user_id IS NOT NULL AND service_account_id IS NULL) OR
    (actor_type = 'SERVICE_ACCOUNT' AND service_account_id IS NOT NULL AND user_id IS NULL) OR
    (actor_type = 'SYSTEM' AND user_id IS NULL AND service_account_id IS NULL)
  )
);

-- ---------------------------------------------------------------------------------------------
-- api_credential — TENANT, append-only (PRD §15.4: "Hashed, rotatable, expiring machine
-- credential"; §35.4 "full secret displayed once"). There is deliberately NO column able to hold a
-- full secret: `prefix` is the displayed lookup handle and `secret_hash` is a hash produced by
-- 02-auth-core. AUTH-006's "old key fails immediately after rotation/revocation" is the
-- `revoked_at IS NULL AND (expires_at IS NULL OR expires_at > ?)` filter applied in SQL.
-- ---------------------------------------------------------------------------------------------
CREATE TABLE api_credential (
  id TEXT NOT NULL PRIMARY KEY,
  organization_id TEXT NOT NULL,
  service_account_id TEXT NOT NULL,
  prefix TEXT NOT NULL,
  secret_hash TEXT NOT NULL,
  created_at TEXT NOT NULL CHECK (created_at GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]T[0-9][0-9]:[0-9][0-9]:[0-9][0-9]*Z'),
  expires_at TEXT CHECK (expires_at IS NULL OR expires_at GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]T[0-9][0-9]:[0-9][0-9]:[0-9][0-9]*Z'),
  last_used_at TEXT CHECK (last_used_at IS NULL OR last_used_at GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]T[0-9][0-9]:[0-9][0-9]:[0-9][0-9]*Z'),
  revoked_at TEXT CHECK (revoked_at IS NULL OR revoked_at GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]T[0-9][0-9]:[0-9][0-9]:[0-9][0-9]*Z'),
  UNIQUE (prefix),
  UNIQUE (organization_id, id),
  FOREIGN KEY (organization_id, service_account_id) REFERENCES service_account(organization_id, id)
);

CREATE INDEX api_credential_organization_service_account_idx
  ON api_credential (organization_id, service_account_id);

-- ---------------------------------------------------------------------------------------------
-- invitation — TENANT, append-only (PRD §35.4: "token shown/sent, only hash stored; one use").
-- There is deliberately NO plaintext-token column. Single use is a conditional UPDATE in
-- src/repos/tenancy/invitations.ts, not a trigger.
-- ---------------------------------------------------------------------------------------------
CREATE TABLE invitation (
  id TEXT NOT NULL PRIMARY KEY,
  organization_id TEXT NOT NULL,
  email_normalized TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('OWNER','ADMIN','RESEARCHER','VIEWER','DEVELOPER')),
  token_hash TEXT NOT NULL,
  expires_at TEXT NOT NULL CHECK (expires_at GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]T[0-9][0-9]:[0-9][0-9]:[0-9][0-9]*Z'),
  accepted_at TEXT CHECK (accepted_at IS NULL OR accepted_at GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]T[0-9][0-9]:[0-9][0-9]:[0-9][0-9]*Z'),
  invited_by_actor_id TEXT NOT NULL,
  created_at TEXT NOT NULL CHECK (created_at GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]T[0-9][0-9]:[0-9][0-9]:[0-9][0-9]*Z'),
  UNIQUE (token_hash),
  UNIQUE (organization_id, id),
  FOREIGN KEY (organization_id) REFERENCES organization(id),
  FOREIGN KEY (invited_by_actor_id) REFERENCES actor(id)
);

-- ---------------------------------------------------------------------------------------------
-- sso_connection — TENANT (PRD §38.3 lifecycle; §35.4 "enforcement requires successful current
-- test"). The configuration is DATA-03 envelope ciphertext whose AAD binds organisation + table +
-- column + row id, so the row id must exist before `encode` is called.
-- ---------------------------------------------------------------------------------------------
CREATE TABLE sso_connection (
  id TEXT NOT NULL PRIMARY KEY,
  organization_id TEXT NOT NULL,
  protocol TEXT NOT NULL CHECK (protocol IN ('SAML','OIDC')),
  state TEXT NOT NULL CHECK (state IN ('DRAFT','TESTING','ACTIVE','ERROR','DISABLED')),
  configuration_ciphertext BLOB,
  tested_at TEXT CHECK (tested_at IS NULL OR tested_at GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]T[0-9][0-9]:[0-9][0-9]:[0-9][0-9]*Z'),
  enforced_at TEXT CHECK (enforced_at IS NULL OR enforced_at GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]T[0-9][0-9]:[0-9][0-9]:[0-9][0-9]*Z'),
  created_at TEXT NOT NULL CHECK (created_at GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]T[0-9][0-9]:[0-9][0-9]:[0-9][0-9]*Z'),
  updated_at TEXT NOT NULL CHECK (updated_at GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]T[0-9][0-9]:[0-9][0-9]:[0-9][0-9]*Z'),
  row_version INTEGER NOT NULL DEFAULT 1,
  UNIQUE (organization_id, protocol),
  UNIQUE (organization_id, id),
  FOREIGN KEY (organization_id) REFERENCES organization(id)
);
