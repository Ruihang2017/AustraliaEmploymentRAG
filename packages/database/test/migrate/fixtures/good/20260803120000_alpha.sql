-- aer:phase expand
-- A synthetic expand migration. Table and column names are invented for the test harness; they are
-- not part of any PRD table group.
CREATE TABLE fixture_alpha (
  id         TEXT PRIMARY KEY,
  created_at TEXT NOT NULL
);
