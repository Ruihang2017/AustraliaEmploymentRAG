-- aer:phase expand
CREATE TABLE fixture_bulk_two (
  id  INTEGER PRIMARY KEY,
  pad TEXT NOT NULL
);
INSERT INTO fixture_bulk_two (id, pad)
WITH RECURSIVE seq(n) AS (
  SELECT 1 UNION ALL SELECT n + 1 FROM seq WHERE n < 40000
)
SELECT n, hex(randomblob(48)) FROM seq;
CREATE INDEX fixture_bulk_two_pad ON fixture_bulk_two (pad);
