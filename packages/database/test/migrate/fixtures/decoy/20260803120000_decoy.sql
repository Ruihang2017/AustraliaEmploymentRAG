-- aer:phase expand
-- we will never DROP TABLE here, and this ALTER TABLE fixture_alpha RENAME TO x is only prose.
/* Nor in a block comment:
   DROP TABLE fixture_alpha;
   ALTER TABLE fixture_alpha DROP COLUMN created_at;
   DELETE FROM fixture_alpha;
*/
CREATE TABLE fixture_decoy (
  id    TEXT PRIMARY KEY,
  note  TEXT NOT NULL DEFAULT 'DROP TABLE x',
  quirk TEXT NOT NULL DEFAULT 'it''s a DELETE FROM y with no where clause'
);

-- A `--` inside a string literal must not start a comment, and a `'` inside a comment must not
-- start a literal. Both are what makes the single-scan stripper necessary.
INSERT INTO fixture_decoy (id, note, quirk)
SELECT 'seed', '-- DROP TABLE z', 'UPDATE fixture_decoy SET note = 1';

-- A trigger body legitimately contains BEGIN … END and an inner UPDATE.
CREATE TRIGGER fixture_decoy_touch AFTER INSERT ON fixture_decoy
BEGIN
  UPDATE fixture_decoy SET note = note WHERE id = NEW.id;
END;
