-- aer:phase expand
--
-- An unrelated table group's expand migration. It sorts AFTER the contract migration and shares
-- nothing with it, so a run that refuses the contract migration must still apply this one.
CREATE TABLE fixture_gamma (
  id         TEXT PRIMARY KEY,
  created_at TEXT NOT NULL
);
