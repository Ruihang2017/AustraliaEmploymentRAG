-- aer:phase expand
CREATE TABLE fixture_bulk_three (
  id  INTEGER PRIMARY KEY,
  pad TEXT NOT NULL
);
INSERT INTO fixture_bulk_three (id, pad)
WITH RECURSIVE seq(n) AS (
  SELECT 1 UNION ALL SELECT n + 1 FROM seq WHERE n < 40000
)
SELECT n, hex(randomblob(48)) FROM seq;
CREATE INDEX fixture_bulk_three_pad ON fixture_bulk_three (pad);
