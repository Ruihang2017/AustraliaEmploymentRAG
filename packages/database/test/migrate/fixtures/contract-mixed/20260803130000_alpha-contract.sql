-- aer:phase contract
-- aer:expanded-in 20260803120000_alpha
--
-- The destructive half of the expand/contract pair, deliberately placed BETWEEN its own expand and an
-- unrelated later expand (`20260803140000_gamma.sql`). Under breakdown plan §2.1 A5 that is the normal
-- shape of a batch: DATA-04…DATA-07 author independently, so a run routinely mixes one module's
-- contract migration with another module's expand migration. This fixture is what proves the gate
-- refuses THIS file without taking `gamma` down with it.
DROP TABLE fixture_alpha;
