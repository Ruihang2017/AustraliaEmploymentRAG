# Compatibility baseline — how it is advanced

`v1.yaml` is the frozen `/v1` contract `checkCompatibility(baseline, candidate)` diffs the working
`../openapi.yaml` against (FND-04 deliverable 5). PRD §16.1 is the rule it enforces:

> Optional fields may be added within v1; breaking changes require v2.

The exact breaking-change rule table is **decision D25** in
[`docs/prd/00-foundation/README.md`](../../../docs/prd/00-foundation/README.md), not in the checker
and not here — "the definition of *breaking* is a contract with every SDK consumer (`PLTF-02`,
`PLTF-03`), not a local heuristic" (FND-04 Feedback obligation 5).

## The one rule that matters

**A baseline advance is an explicit, reviewed commit. It is never an automatic side effect of
`pnpm generate`.**

That is not only prose. `packages/contracts/src/openapi/generate.mjs` refuses to write any path
outside `packages/contracts/src/generated/`, and
`packages/contracts/test/generated/determinism.test.ts` asserts the emitter's entire write-set
contains no path under `schemas/openapi/baseline/`. A generator that could quietly re-baseline would
make the compatibility gate report success by moving the goalposts.

## Procedure

1. Change `../openapi.yaml`. Do **not** touch `v1.yaml`.
2. Run `pnpm --filter @taxrag/contracts test`. `test/openapi/compatibility.test.ts` reports every
   finding, split into `breaking` and `compatible`.
3. If **nothing is breaking**, the change is additive and PRD §16.1 permits it inside `/v1`. Advance
   the baseline in the same PR: re-capture `v1.yaml` from `../openapi.yaml`, keeping the header block
   at the top of the file, and say so in the PR's *schema/API/event compatibility impact* line
   (PRD §45.4).
4. If **anything is breaking**, stop. PRD §16.1 requires `/v2`, which is a new base path, a new
   server entry and a second baseline — and a product decision under PRD §45.5, not a Builder's.
   Do not silence the finding by editing `v1.yaml`; the whole point of the file is that it is the
   record of what was published.
5. If the checker's verdict looks *wrong* rather than inconvenient, that is FND-04 Feedback
   obligation 5: record the rule in the sub-PRD (D25) and update the ticket's deliverable 4
   **before** changing `compatibility.mjs`.

## Why the header block

`v1.yaml` opens with a comment block and then the captured document verbatim. YAML comments are not
part of the parsed value, so the block costs nothing structurally, and it puts the "do not edit this
to make a check pass" instruction where somebody about to do exactly that will read it.

## First capture

Captured 2026-08-08 in the same commit that published `../openapi.yaml`, so the first
`checkCompatibility` run is a tautology by design (FND-04 deliverable 5's ordering constraint) and
every subsequent one is meaningful.
