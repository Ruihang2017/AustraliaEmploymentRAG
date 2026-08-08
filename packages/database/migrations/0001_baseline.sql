-- aer:phase expand
--
-- DATA-01 deliverable 3 — the migration ledger.
--
-- This is the only `0001_*` migration; every later migration is `<UTC YYYYMMDDHHMMSS>_<group>.sql`
-- so `0001_` sorts first lexicographically without a special case (breakdown plan §2.1 A5).
--
-- It creates no application table. `organization`, `job` and `answer_snapshot` belong to
-- DATA-04…DATA-07.
--
-- `run_id` groups everything applied by one `runMigrations` invocation. That is what makes the
-- same-release contract rule decidable (PRD §39.7 step 4): a contract migration may only run when
-- its `-- aer:expanded-in` target is already in this table with a *different* `run_id`.

CREATE TABLE schema_migration (
  name        TEXT PRIMARY KEY,
  checksum    TEXT NOT NULL,
  applied_at  TEXT NOT NULL,
  duration_ms INTEGER NOT NULL,
  run_id      TEXT NOT NULL,
  phase       TEXT NOT NULL CHECK (phase IN ('expand','contract'))
);
