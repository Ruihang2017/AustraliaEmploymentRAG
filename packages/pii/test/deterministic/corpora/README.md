# The synthetic PII corpus (EVID-01 deliverable 11)

**Every value in every file in this directory is invented.** No value came from a real person, a real
payslip, a real card, a real customer request or any production system. The checksum-bearing numbers
(TFN, Medicare, card, ABN) were *synthesised* by searching for the smallest value above a fixed seed
that satisfies the published algorithm — they are valid-shaped and meaningless. This is PRD §45.1
item 6 and sub-PRD **D22**, and it is not a formality: a corpus containing one real value would make
this repository a place where employee PII lives forever.

## Layout

| File | What it is |
|---|---|
| `<kebab-category>.json` | One per member of `PII_CATEGORY_VALUES`. Positives (with expected NFC offsets), the category's own negatives, and any `deferred` cases. |
| `negatives-shared.json` | PRD §37.1's **Allowed** column. Replayed against **every** category, because an allowed value must not be blocked by *any* detector. |
| `canaries.json` | Distinctive, obviously synthetic tokens for the leak assertions. `ASSR-03` can reuse this file verbatim. |
| `generate.mjs` | How the JSON was produced: authored `(prefix, pii, suffix)` triples with the offsets **computed**. |

## Why the offsets are generated and the cases are not

`generate.mjs` computes `expected` from `nfc.indexOf(pii.normalize('NFC'))`, because hand-counting
three hundred character offsets is how a corpus quietly stops meaning anything. It **never consults a
detector**: if it did, the corpus would measure the implementation against itself and every recall
number in `recall-report.json` would be 1 by construction. The *cases* — the sentences, the labels,
the evasion variants, the near-misses — are authored against PRD §37.1, not against the code.

## Adding a case

1. Add the authored triple to `generate.mjs` under its category.
2. Run `node packages/pii/test/deterministic/corpora/generate.mjs`.
3. Run the suite. If the new positive fails, **that is the point** — fix the detector, or follow the
   ticket's Feedback obligation (a recall shortfall is sub-PRD **Q-EVID-2**, owner Founder).
4. Regenerate the report deliberately: `PII_UPDATE_RECALL_REPORT=1 pnpm --filter @taxrag/pii test`.

## The one rule

**A case is never deleted, and never moved to `deferred`, to make a number go up.** `deferred` exists
for exactly one situation — a PRD §37.1 row whose detection belongs to a later ticket — and every
deferred case carries an `owner` and a `reason` and is printed by the recall report on every run.
Today that is `IDENTIFYING_COMBINATION` (PRD §37.1 blocked row 7), which *is* the combination/risk
stage PRD §37.2 places after entity recognition and which EVID-01's Non-goals assign to `EVID-02`. It
is reported at **0% recall**, not omitted.

A false positive on an **Allowed** row is fixed by adding the negative case and narrowing the
pattern — never by an override, and never by deleting the negative (PRD §37.2, sub-PRD D2).
