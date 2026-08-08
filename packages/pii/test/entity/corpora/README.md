# The synthetic person-name corpus (EVID-02 deliverable 10)

**Every value in this directory is invented.** No name, employer, phone number, email address or
matter came from a real person, a real request or any production system — PRD §45.1 item 6 and
sub-PRD **D22**. The names are constructed; any resemblance to a real person is accidental and the
values are meaningless.

## Layout

| File | What it is |
|---|---|
| `entity-person-name.json` | `EVID-01`'s `CorpusCategoryFile` shape: positives with computed NFC offsets, and negatives drawn from PRD §37.1's **Allowed** column. |
| `generate.mjs` | How the JSON was produced: authored `(prefix, pii, suffix)` triples with the offsets **computed**. |

The stage-5/6 corpora live next door in `packages/pii/test/context/corpora/`.

## Positive context classes

The case id names the class, so `test/entity/corpus-replay.test.ts` can assert each one separately —
an aggregate recall number can hide a class that never fires.

| Prefix | Class | Rule it exercises |
|---|---|---|
| `name-greet-` | greeting | `SIGNATURE_OR_GREETING_NAME` |
| `name-rel-` | employment relation | `EMPLOYMENT_RELATION_NAME` |
| `name-sig-` | signature / sign-off | `SIGNATURE_OR_GREETING_NAME` |
| `name-adj-` | adjacent private contact detail | `ADJACENT_CONTACT_NAME` |
| `name-hon-` | honorific | `HONORIFIC_NAME` |

The name set deliberately mixes Latin-script non-Anglo forms with diacritics (`Ana Popović`,
`Ngô Thanh`, `Nguyễn Anh`, `Wiremu Tane`, `Tomas Söderberg`) — so NFC handling is proved — with names
that are also ordinary English words (`Grace`, `Rose`, `Will`, `Summer`), which are the ones a
gazetteer-first recogniser gets wrong.

## What this corpus does NOT measure

Every rule keys on Latin-script capitalisation. **Scripts without case — CJK, Arabic, Hebrew, Thai —
are not covered at all**, and neither is an all-lower-case name or a bare mononym with no possessive
cue. Those cases are absent on purpose rather than present and failing: a corpus that quietly omits
what the detector cannot do turns a recall number into a fiction, so the gap is named here, in
`packages/pii/README.md` and in `docs/adr/0001-local-pii-entity-runtime.md`.

## Why the offsets are generated and the cases are not

`generate.mjs` computes `expected` from `nfc.indexOf(pii.normalize('NFC'))`, because hand-counting
offsets is how a corpus quietly stops meaning anything, and it refuses an authored span that does not
occur exactly once. It **never consults a detector**: if it did, the corpus would measure the
implementation against itself and every recall number in `recall-report.json` would be 1 by
construction.

## Adding a case

1. Add the authored triple to `generate.mjs` under its class.
2. Run `node packages/pii/test/entity/corpora/generate.mjs`.
3. Run the suite. If the new positive fails, **that is the point** — fix the rule, or follow the
   ticket's Feedback obligation (a recall shortfall is sub-PRD **Q-EVID-2**, owner Founder).
4. Regenerate the report deliberately:
   `PII_UPDATE_ENTITY_REPORT=1 pnpm --filter @taxrag/pii test`.

## The one rule

**A case is never deleted, and never softened, to make a number go up.** A false positive on an
**Allowed** row is fixed by adding the negative case and narrowing the rule — never by an override,
and never by deleting the negative (PRD §37.2, sub-PRD D2).
