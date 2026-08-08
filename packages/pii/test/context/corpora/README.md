# The synthetic stage-5/6 corpora (EVID-02 deliverable 10)

**Every value in this directory is invented** — PRD §45.1 item 6, sub-PRD **D22**. No role,
workplace, event, employer, ABN or matter came from a real request. The ABN is `EVID-01`'s
synthesised mod-89-valid value; its checksum-failing sibling is that value with one digit changed.

## Layout

| File | What it is |
|---|---|
| `combination.json` | `blocked` — cases at and above the `COMBINATION_RULE_V1` threshold, each **naming the dimensions expected to fire**; `nearMisses` — cases that must produce nothing. |
| `necessary-facts.json` | PRD §10.1's *"necessary role/duty/location facts MAY be accepted"*, each case filed under the rule it exercises and expected to replay `ACCEPT`. |
| `public-entity-matrix.json` | `UAT-PII-02`'s mechanical half: the same string in its structured channel and in free text, with **both** observed decisions recorded. |
| `generate.mjs` | How the JSON was produced. Authored against PRD §37.1 and §10.1, never against the code. |

## Read the matrix notes before reading the matrix

Two rows record `ACCEPT`/`ACCEPT` for **both** channels, and say so in their `note`. Nothing in the
shipped detector set fires on eleven bare digits (`pe-abn-02`) or on one capitalised word
(`pe-party-02`), so at the DECISION level those rows cannot distinguish the channels. The rules that
make the difference — the ABN mod-89 checksum and the citation requirement — are asserted where they
are **not** vacuous: against the predicate itself, in `test/context/public-entity.test.ts`.

Recording that honestly is the point. A matrix row that quietly asserts nothing is worse than one
that admits it, and inventing a differential the detectors do not actually produce would be worse
still.

The rows that DO differentiate are `pe-emp-03` (a public employer name with a private phone number
appended — the span is not the whole value, so the channel does not explain it) and `pe-emp-04` (a
personal email pasted into the `employer` channel — `PRIVATE_CONTACT_EMAIL` is not a category that
channel covers).

## Why the combination cases name their dimensions

`expectedDimensions` is asserted against `evaluateCombination(...).fired`, not against the finding.
`PiiFinding` has exactly six members and `EVID-01`'s type test asserts that list exhaustively, so the
fired dimensions are returned by a pure evaluation function exported alongside the stage. The list
carries dimension NAMES from a frozen vocabulary — never text (sub-PRD **D3**).

The near-miss set deliberately includes the two shapes a naive threshold gets wrong:

- a personal event with an **exact date** and nothing identity-narrowing (`ctx-combo-n-06`…`-08`) —
  which a plain threshold of 2 would block, and which PRD §10.1 says MAY be accepted;
- a narrowing dimension with **no personal event** (`ctx-combo-n-09`…`-14`).

## Adding a case

1. Add it to `generate.mjs` under its section.
2. Run `node packages/pii/test/context/corpora/generate.mjs`.
3. Run the suite. A failing new case is information, not a reason to edit the case.
4. If the *threshold* is wrong, change `COMBINATION_RULE_V1` as versioned data with a **new version
   number** and record it in `docs/prd/12-evidence-safety/README.md` — never edit the constant in
   place, and never remove the dimension (PRD §37.1 lists identifying combinations as blocked).

## The one rule

**A case is never deleted, and never softened, to make a number go up.**
