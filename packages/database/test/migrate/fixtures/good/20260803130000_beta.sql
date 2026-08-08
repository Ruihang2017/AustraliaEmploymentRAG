-- aer:phase expand
-- A second synthetic expand migration, sorting after alpha.
CREATE TABLE fixture_beta (
  id              TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  created_at      TEXT NOT NULL
);
