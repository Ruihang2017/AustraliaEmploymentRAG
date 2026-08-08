-- aer:phase expand
-- Deliberately slow. The concurrency criterion needs a real overlap window, not two runs that were
-- effectively sequential because each finished in a microsecond.
CREATE TABLE fixture_bulk_one (
  id  INTEGER PRIMARY KEY,
  pad TEXT NOT NULL
);
INSERT INTO fixture_bulk_one (id, pad)
WITH RECURSIVE seq(n) AS (
  SELECT 1 UNION ALL SELECT n + 1 FROM seq WHERE n < 40000
)
SELECT n, hex(randomblob(48)) FROM seq;
CREATE INDEX fixture_bulk_one_pad ON fixture_bulk_one (pad);
