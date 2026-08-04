---
id: RETR-02
title: Tantivy lexical/field/citation index
module: 11-retrieval-engine
lane: 11-retrieval-engine
size: L
agent: builder
status: draft
date: 2026-08-03
blocked_by: [RETR-01]
blocks: [RETR-03, RETR-04]
---

# RETR-02 — Tantivy lexical/field/citation index

Implements PRD §17.1, §17.2, §18.2, §18.4 — requirement IDs `SRCH-001`, `SRCH-002` (the lexical half),
epic `E17-INDEX` (read half).
No ADR — the decision is already made in PRD §18.2 (*"Lexical/field/citation search | Rust +
Tantivy"*) and PRD §17.1 (lexical-first hybrid order); this is build ticket 2 of 10 against it.
Parent sub-PRD: [11-retrieval-engine README](../README.md). Master spec: [PRD](../../../PRD.md).
Depends on: [RETR-01 — search-rs skeleton](RETR-01-search-rs-skeleton-read-only-bundle-release-pinning-localhost-api.md) (mirrors `blocked_by`).
**Why `builder`:** a bounded change inside one module's declared file-scope against a fixed contract
(the corpus schema from `CRPS-01`, the tier policy from `CRPS-04`, the frozen wire contract from
`RETR-01`) — not a new subsystem decision.

## Background + basis

**Lexical is the base layer, not a fallback.** PRD §17.1 fixes the order —
`query classification → hard legal filters → exact/citation retrieval → full-corpus lexical retrieval
→ selective dense retrieval → rank fusion → bounded rerank → evidence sufficiency` — and PRD §17.2
states the coverage rule: *"The complete eligible corpus receives metadata/lexical/field/citation
discovery. Tier 1 receives full dense indexing; Tier 2 selective/on-demand dense indexing; Tier 3 no
default embedding."* Lexical coverage is therefore **total over the eligible corpus** while dense
coverage is partial — the opposite of a conventional RAG system, and the reason requirement
`SRCH-001` can be satisfied *"with model gateway disabled"* (PRD §30.2).

**What "eligible" means here.** `CRPS-04` assigns `search_chunk.index_tier` from evidence and exposes
`is_eligible_for_lexical()`, true for `TIER_1_FULL_SEMANTIC`, `TIER_2_LEXICAL_AND_SELECTIVE_SEMANTIC`
and `TIER_3_METADATA_AND_ON_DEMAND`, and **false** for `EXCLUDED_LICENSING` and
`QUARANTINED_QUALITY`. PRD §11.1 requires unclear rights to default to *"metadata, limited quotation
and official links"*, and PRD §35.3 requires an open quarantine item to be unable to enter a promoted
release. Tier is therefore an **indexing** gate applied at build time; it is not a substitute for the
PRD §36.2 request-time filters, which are `RETR-04`'s.

**Field and citation search are first-class, not string matching.** PRD §8.2 requires Advanced Legal
Search to support *"Boolean expressions; exact phrases; neutral citations and case numbers; section,
clause, schedule and paragraph references; award/agreement identifiers and titles; employer name and
ABN; jurisdiction, document type, authority, legal status and date filters; relevance, authority and
date sorting."* PRD §35.2 (via `CRPS-01` deliverable 3) already indexes `official_identifier`,
`neutral_citation` and `employer_abn` on `legal_document`, and marks `node_version` as the FTS
source. This ticket builds the Tantivy schema that makes those queryable together with the text.

**Where the index comes from.** PRD §18.4 lists `tantivy/` as a bundle member, and PRD §19.1/§19.3
put index building in the **local pipeline**, not production. `04-corpus-contract`'s open question
**Q-CRPS-2** asks who builds it offline without importing `services/search-rs`; sub-PRD decision
**D9** answers it: this ticket ships the builder as a **second binary of this crate**, which `CRPS-06`
invokes as a process. The ADR file (`docs/adr/NNNN-offline-lexical-index-builder.md`) belongs to
`CRPS-06` under breakdown plan **A9** (per-file ADR ownership by the creating ticket) — this ticket
provides the mechanism and writes back, it does not create that ADR.

**Carried caveat (accepted, documented not enforced):** the committed `CRPS-08` fixture ships
`tantivy/INDEX_STATE.json = {"state": "PLACEHOLDER"}` and `versions.index = null`. This ticket
therefore builds its test index from the fixture's `corpus.sqlite` with its own builder binary, into
a temporary directory. That is not a workaround — it is the same code path `CRPS-06` will run, so
exercising it here is the point.

**Snippets come from source text.** PRD §8.2: *"Snippets MUST originate from source text, not
generated paraphrases."* PRD §34.2: *"`snippet.text` MUST equal the referenced NodeVersion substring
at the returned offsets after the documented canonical newline normalisation."* Tantivy's own
highlighter must therefore either be used only to *choose* offsets, with the text sliced from
`canonical_text` via `RETR-01`'s reader, or not used at all.

## Goal

Produce `services/search-rs/src/lexical/**`: a Tantivy index schema over the eligible corpus, a
deterministic offline index builder shipped as a second binary of this crate, a read-only index
reader loaded from a verified bundle, and a BM25 + field + citation query executor that returns
ranked candidates in `RETR-01`'s frozen `Candidate` form with `MatchReason::Lexical` and
`MatchReason::Field`, honouring the profile's `lexical_candidates` bound. Completion is mechanically
checkable: `cargo test --workspace` is green, the builder run twice over the fixture corpus produces
byte-identical index segments, every indexed chunk's tier is lexically eligible, and a query for a
term unique to a `EXCLUDED_LICENSING` document returns nothing.

## Non-goals

- **No exact-identifier parsing or precedence** — `RETR-03` (`src/exact/**`), which is `blocked_by`
  this ticket. This ticket indexes the identifier *fields*; the parsing, checksums and "always
  retained" precedence are `RETR-03`'s.
- **No PRD §36.2 request-time filters** — `RETR-04` (`src/filters/**`), also `blocked_by` this ticket.
  Tier eligibility at build time is not the §36.2 predicate and must not be described as such.
- **No dense retrieval, embeddings or semantic cache** — `RETR-05`. **No fusion or ranking beyond raw
  BM25 order** — `RETR-06`. **No rerank** — `RETR-07`. **No evidence assembly** — `RETR-08`.
- **No chunking** — `CRPS-03` owns `SearchChunk` boundaries; this ticket indexes chunks as stored.
- **No tier assignment** — `CRPS-04` owns the policy; this ticket reads `search_chunk.index_tier`.
- **No corpus schema or manifest change** — `CRPS-01`/`CRPS-02` (PRD §44.3 serial-owned). If the index
  needs a column that does not exist, that is a writeback, not a local `ALTER TABLE`.
- **No wire-contract change** — `RETR-01` owns `src/service/contract/**` (sub-PRD D8).
- **No ADR file for the offline builder** — `CRPS-06` owns `docs/adr/NNNN-offline-lexical-index-builder.md`
  under breakdown plan A9.
- **No production index build.** The builder binary is an offline/CI tool; the service process never
  writes an index (PRD §19.1, §18.4 *"Active data MUST never be rebuilt or mutated in place"*).

## File-scope (write-owns)

- `services/search-rs/src/lexical/**` — Tantivy schema, deterministic builder, builder binary entry
  (`src/lexical/bin/build_index.rs`), read-only reader, query planner and executor.
- `services/search-rs/tests/lexical_*.rs` — this ticket's Rust integration tests (sub-PRD D12).
- Module-shared, append-only (sub-PRD D12, breakdown plan §1.1): `services/search-rs/Cargo.toml` —
  the Tantivy dependency and one `[[bin]]` section
  (`name = "search-index"`, `path = "src/lexical/bin/build_index.rs"`); regenerate `Cargo.lock` as a
  build artifact, never hand-merge. `services/search-rs/src/lib.rs` — append exactly
  `pub mod lexical;`.

Does not touch:

- `services/search-rs/src/{main.rs,service}/**` — `RETR-01` (merged before this starts). `src/exact/**`
  — `RETR-03`; `src/filters/**` — `RETR-04`; `src/dense/**` — `RETR-05`; `src/ranking/**` — `RETR-06`;
  `src/localmodel/**` — `RETR-07`; `src/evidence/**` — `RETR-08`; `benches/**`, `src/bench/**` —
  `RETR-10`. `packages/retrieval-client/**` — `RETR-09`.
- `pipelines/corpus-builder/**`, `pipelines/embeddings/**`, `schemas/corpus-manifest/**` —
  `04-corpus-contract` (PRD §44.3 serial-owned corpus schema and release manifest; sole owner).
- `docs/adr/NNNN-offline-lexical-index-builder.md` — `CRPS-06` (breakdown plan A9).
- `packages/**`, `apps/**`, `infra/**`, `tests/**`, `evals/**` — other modules per breakdown plan §4.
  `docs/PRD.md` — frozen.

**Serial-safety analysis.** First decomposition: nothing merged, no in-flight contention (breakdown
plan §1 header). `src/lexical/**` is written by no other ticket in the plan. The concurrent wave-2
siblings are `RETR-05` (`src/dense/**`) and, at the earliest, `RETR-09`
(`packages/retrieval-client/**`) — disjoint trees. `RETR-01`, whose contract and reader this ticket
calls, is the declared blocker and is merged before this starts. The two shared files
(`Cargo.toml`, `src/lib.rs`) receive additive, non-overlapping lines only.

## Deliverables

1. **`src/lexical/schema.rs` — the Tantivy schema**, versioned by a `LEXICAL_INDEX_VERSION` constant
   published as the manifest's `versions.index` value. Fields, each with its basis:

   | Field | Type | Indexed for | Basis |
   |---|---|---|---|
   | `node_version_id`, `document_version_id`, `document_id`, `node_id` | STRING stored | identity of every hit | PRD §15.3 (citations target DocumentVersion + NodeVersion) |
   | `chunk_id`, `chunk_ordinal` | STRING/U64 stored, not returned to callers | internal diagnostics only | sub-PRD D15 |
   | `text` | TEXT, positions, BM25 | phrase and proximity queries | PRD §8.2 "exact phrases" |
   | `heading`, `display_label` | TEXT + STRING | pinpoint search ("s 94", "cl 12.3") | PRD §8.2 |
   | `title` | TEXT + STRING | award/agreement titles | PRD §8.2 |
   | `official_identifier`, `neutral_citation`, `award_code`, `agreement_id` | STRING (raw tokenizer, case-folded) | exact field match | PRD §8.2, §36.1 |
   | `employer_name` TEXT, `employer_abn` STRING | employer filters | PRD §8.2, `COV-003` |
   | `jurisdictions` (multi), `document_type`, `authority_id`, `authority_level`, `legal_status`, `source_group_id` | STRING facets | filter + sort | PRD §8.2, §9.1 |
   | `effective_from`, `effective_to` | DATE/i64, indexed | date-range restriction | PRD §36.2 conjunct 1 |
   | `licence_assessment` , `index_tier` | STRING | build-time eligibility, request-time diagnostics | PRD §11.1, §17.2 |
   | `published_at`, `parser_version` | DATE/STRING | PRD §36.3 feature 8 (freshness, parser quality) | PRD §36.3 |

   Stored fields are limited to identity, offsets and metadata; **the node text itself is stored in
   the index only to the extent Tantivy needs it for scoring/positions, and the text returned to a
   caller is always sliced from `corpus.sqlite` through `RETR-01`'s reader** (PRD §34.2, §8.2).
2. **`src/lexical/build.rs::build_index(corpus: &Path, out: &Path, opts) -> IndexBuildReport`** — the
   offline builder, with this ordering constraint:
   1. read `search_chunk` joined to `node_version` / `document_version` / `legal_document` /
      `licence_assessment`;
   2. **skip every chunk whose `index_tier` is not lexically eligible** (`EXCLUDED_LICENSING`,
      `QUARANTINED_QUALITY`) — `CRPS-04`'s `is_eligible_for_lexical` semantics, re-expressed in Rust
      over the stored tier value;
   3. iterate in deterministic order `(document_version_id, node_version_id, chunk_ordinal)`;
   4. commit with a fixed merge policy and a single writer thread by default, so segments are
      reproducible;
   5. write `INDEX_STATE.json = {"state": "BUILT", "index_version": LEXICAL_INDEX_VERSION,
      "chunk_count": n, "built_from_schema_version": "<corpus_meta.schema_version>"}` — the same file
      `CRPS-08` writes as `PLACEHOLDER`, so a consumer can tell the two apart from the file alone;
   6. return `IndexBuildReport { indexed_chunks, skipped_by_tier, bytes, elapsed_ms, peak_rss_bytes }`.
   Determinism is a hard requirement: two runs over the same corpus produce byte-identical segment
   files (PRD §20.3 reproducible CI; PRD §18.4 file hashes must be stable across a rebuild).
3. **`src/lexical/bin/build_index.rs`** — the second binary (sub-PRD D9):
   `search-index build --corpus <corpus.sqlite> --out <dir> [--threads N]`, exit code non-zero on any
   blocking condition, no network, no credentials. This is the process `CRPS-06` invokes to produce the
   bundle's `tantivy/` member (`04-corpus-contract` Q-CRPS-2). It prints the `IndexBuildReport` as JSON
   on stdout so a build pipeline can capture it.
4. **`src/lexical/reader.rs::LexicalReader::open(bundle: &ReleaseBundle) -> Result<LexicalReader>`** —
   opens `tantivy/` from a **verified** bundle in read-only, memory-mapped mode; refuses to open when
   `capabilities().lexical` is false (`RETR-01` deliverable 3), returning the typed unavailable state
   rather than an empty index. Records its resident footprint so `RETR-10` can attribute memory.
5. **`src/lexical/query.rs` — the query planner**, converting `RETR-01`'s frozen request into a Tantivy
   query:
   - free text → BM25 over `text` + `heading` + `title` with configured field boosts;
   - quoted spans → phrase queries (PRD §8.2 "exact phrases");
   - boolean operators `AND`/`OR`/`NOT` and grouping, parsed by a **deterministic** grammar that
     rejects malformed input with a named error rather than silently degrading to a bag of words
     (PRD §8.2 "Boolean expressions"; the five distinct no-results states are `FIND-04`'s UI concern,
     but the engine must distinguish "parse error" from "zero hits");
   - field/facet restrictions for jurisdiction, document type, authority, legal status and date range;
   - identifier fields matched exactly (case-folded, punctuation-normalised) when the caller supplies
     `exact_identifiers` — `RETR-03` supplies those values; this ticket executes the field match.
6. **`src/lexical/execute.rs::search(reader, request, profile) -> Vec<Candidate>`** — collects up to
   `profile.lexical_candidates` (v1 default **100**, hard ceiling **200**, PRD §36.2) candidates in
   BM25 order, deduplicated to **one candidate per `node_version_id`** (a node with three matching
   chunks is one legal result), carrying `MatchReason::Lexical` and/or `MatchReason::Field`, the BM25
   **rank** (not the raw score — sub-PRD D6, PRD §36.2 "no raw-score addition"), and the best matching
   character range for snippet selection. The raw score may be carried for diagnostics but must not be
   consumed by `RETR-06`.
7. **Snippet offsets, not snippet text.** The executor returns `[start, end)` **character** offsets
   into the node's NFC-normalised `canonical_text` (sub-PRD D13); `RETR-01`'s reader produces the text.
   A test asserts the returned range, when sliced, contains at least one query term for a term query.
8. **Zero-result and error taxonomy** — `LexicalOutcome::{Hits(Vec<Candidate>), NoHits,
   QueryParseError(detail), IndexUnavailable}`, surfaced in the response `warnings` so `FIND-04` can
   render PRD §32.1's distinct no-results states without guessing. Never conflate "index unavailable"
   with "no results".
9. **Bounded work.** Every query runs under the caller's deadline (`RETR-01` deliverable 8); the
   collector is bounded by `lexical_candidates`; there is no unbounded scan path and no query that can
   load the whole index into memory. Record per-query elapsed time in the stage timing block.
10. **`src/lexical/README.md`** — one page: the schema table, how to build an index from the fixture
    corpus in two commands, the determinism guarantee, and the statement that this index covers the
    complete *eligible* corpus while dense coverage is partial (PRD §17.2).

## Acceptance checklist (classified)

- [ ] `[fixture]` Building an index from the committed `CRPS-08` fixture corpus succeeds, and
      `INDEX_STATE.json` reports `BUILT` with a non-null `index_version` — distinguishable from the
      fixture's committed `PLACEHOLDER` state. (`CRPS-08` deliverable 3; sub-PRD D9)
- [ ] `[machine]` Determinism: two builder runs over the same corpus produce byte-identical files under
      `tantivy/`, compared by per-file SHA-256. (PRD §18.4 file hashes; §20.3)
- [ ] `[machine]` Coverage: the number of indexed chunks equals the number of chunks whose
      `index_tier` is lexically eligible, and `skipped_by_tier` accounts for the remainder exactly.
      (PRD §17.2 *"The complete eligible corpus receives metadata/lexical/field/citation discovery"*)
- [ ] `[fixture]` Licence and quarantine exclusion: a term that occurs **only** in the fixture's
      `PROHIBITED`-licensed document returns zero lexical hits, and no candidate ever carries an
      `EXCLUDED_LICENSING` or `QUARANTINED_QUALITY` tier. (PRD §11.1; §35.3; `CRPS-04`)
- [ ] `[fixture]` `SRCH-001`: with the local model runtime and dense stage disabled entirely, a
      natural-language query, a keyword query and a quoted phrase each return the expected fixture
      nodes. (PRD §30.2 `SRCH-001` *"Search works with model gateway disabled"*; §8.2)
- [ ] `[machine]` Field search: each of `official_identifier`, `neutral_citation`, award code,
      agreement id and `employer_abn` returns its exact fixture document when queried as a field, and
      does not match a near-miss value differing by one character. (PRD §8.2; `SRCH-004` groundwork —
      the precedence itself is `RETR-03`)
- [ ] `[machine]` Boolean and phrase: `A AND NOT B` excludes documents containing `B`; a quoted phrase
      does not match the same words out of order; a malformed expression returns `QueryParseError`,
      **not** an empty result set. (PRD §8.2; PRD §32.1 no-results taxonomy)
- [ ] `[machine]` Deduplication: a node whose text produces three matching chunks yields exactly one
      candidate identified by `node_version_id`, never by `chunk_id`. (Sub-PRD D15; PRD §15.3)
- [ ] `[machine]` Bounds: the executor never returns more than `profile.lexical_candidates`, and a
      profile requesting more than the PRD §36.2 hard ceiling of 200 is rejected at load by
      `RETR-01`'s profile loader (asserted here as a regression). (PRD §36.2)
- [ ] `[machine]` Ranks not scores: the candidate type exposes a rank ordinal; a test asserts no BM25
      raw score is required to reproduce the emitted ordering. (PRD §17.1, §36.2; sub-PRD D6)
- [ ] `[machine]` Snippet ranges: for every hit, slicing `canonical_text` at the returned character
      offsets yields text containing a query term, and the range is within bounds for the fixture's
      non-ASCII node. (PRD §34.2; `SRCH-003`; sub-PRD D13)
- [ ] `[machine]` Unavailability: opening a bundle whose `capabilities().lexical` is false yields
      `IndexUnavailable`, and the retrieval response is `degraded: true` with the stage named — never
      an empty `Hits`. (Sub-PRD D10; `RETR-01` deliverable 3)
- [ ] `[fixture]` **PRD §13.2 / §39.2 budgets, measured on the fixture index**: lexical stage p95
      ≤ **300 ms** at `lexical_candidates = 100` over 200 queries (the stage's contribution to the
      §13.2 search p95 ≤ 2 s composite, which `RETR-10` measures end to end), and the reader's
      resident footprint recorded and reported so it can be attributed inside the 768 MiB process limit.
      Numbers, method and machine are recorded in the PR. (PRD §13.2, §39.2)
- [ ] `[machine]` No production write path: the service binary contains no code path that opens the
      index for writing; index writing exists only in the `search-index` binary. (PRD §18.4, §19.1)
- [ ] `[machine]` `cargo test --workspace` green (Rust; PRD §45.3).
- [ ] `[machine]` `pnpm test` green (standing item, breakdown plan §1.1).
- [ ] `[machine]` PR states requirement IDs `SRCH-001`, `SRCH-002`; source/licence impact (tier-based
      exclusion of `EXCLUDED_LICENSING` material); memory/disk/latency impact (index bytes, reader
      footprint, stage p95); rollback path; known gaps including the offline-builder ownership
      question (sub-PRD Q-RETR-1 / `04-corpus-contract` Q-CRPS-2). (PRD §45.4)
- [ ] No `[human]` criteria — indexing and query behaviour are verified mechanically. The human-visible
      payoff (`UAT-SRCH-01`) is exercised by `14-search-product` at Gate 2.
- [ ] `uv run pytest` not applicable — this ticket touches no Python. (`CRPS-06`, the Python caller of
      the builder binary, carries that check.)

## Test plan

All steps run offline against the committed `CRPS-08` fixture bundle; no network.

1. `cargo test -p search-rs lexical` then `cargo test --workspace`. Integration tests live in
   `services/search-rs/tests/lexical_*.rs`. Construction pattern to copy: `tests/service_bundle.rs`
   from `RETR-01` — copy the committed fixture into `tempdir`, act, assert findings.
2. Build: `tests/lexical_build.rs` runs `build_index` over the fixture `corpus.sqlite` into `tmp_path`,
   asserts `IndexBuildReport` counts against explicit SQL counts taken from the same database, and
   asserts `INDEX_STATE.json` contents.
3. Determinism: build twice into two directories and compare per-file SHA-256; a difference fails the
   test with the differing file named.
4. Eligibility: construct the tier census with SQL, assert `indexed_chunks + skipped_by_tier` equals
   the total, and assert a term unique to the `PROHIBITED`-licensed fixture document returns zero hits.
5. Query matrix: `tests/lexical_query.rs` parametrised over term, phrase, boolean, field and
   date-restricted queries, each asserting the expected fixture `node_version_id` set — the expected
   sets are written from the `CRPS-08` fixture inventory, not from whatever the code returns.
6. Malformed input: assert `QueryParseError` for unbalanced quotes, dangling operators and an empty
   query, and assert each is distinguishable from `NoHits`.
7. Offsets: for every hit in the matrix, slice `canonical_text` through `RETR-01`'s reader at the
   returned range and assert it contains a query term; include the non-ASCII node.
8. Budget: `tests/lexical_budget.rs` measures stage p95 over 200 queries and prints the value plus the
   reader footprint for the PR.
9. Suite green: `cargo test --workspace` and `pnpm test` from the repository root.
10. Reviewer focus: confirm tier exclusion happens at **build** time and is not merely a request-time
    filter that could be bypassed; confirm the returned text is sliced from the corpus rather than from
    a stored index copy; confirm the builder is genuinely deterministic (single writer thread, fixed
    merge policy) rather than "usually identical"; confirm no write path to the index exists in the
    service binary; confirm raw BM25 scores are not exported into the candidate contract in a way
    `RETR-06` could add to a vector score.

## Feedback obligation

1. **General rule.** If implementation falsifies this ticket, update **this ticket** (docs PR →
   merge → `publish-tickets.mjs --sync`) and, where module context changes,
   `docs/prd/11-retrieval-engine/README.md` (version +0.1 with a changelog line) **before** changing
   code. Silent divergence is an incomplete ticket.
2. **Foreseeable frictions, each with its exact writeback target:**
   - *The corpus lacks a column the index needs* (for example a denormalised `authority_level` on the
     chunk join) → do **not** add a column or a view to `corpus.sqlite`: `pipelines/corpus-builder/schema/**`
     is PRD §44.3 serial-owned by `CRPS-01`. Raise a ticket change against `CRPS-01`, record the need in
     `docs/prd/11-retrieval-engine/README.md`, and take the resulting `blocked_by` edge in
     `docs/prd/breakdown-plan.md` §5.12 and §6.2 before writing code.
   - *`CRPS-06` cannot invoke the builder binary as a process* (sub-PRD **Q-RETR-1**) → the writeback is
     `docs/prd/11-retrieval-engine/README.md` D9 **and** a note for `CRPS-06`'s ADR
     (`docs/adr/NNNN-offline-lexical-index-builder.md`, which `CRPS-06` owns under breakdown plan A9).
     Never expose this crate as a library to Python and never let `04-corpus-contract` depend on
     `services/search-rs` in code — that is the module cycle breakdown plan R6 forbids.
   - *Tantivy cannot produce byte-identical segments* → record the exact non-determinism (thread count,
     merge policy, timestamps) in `docs/prd/11-retrieval-engine/README.md` and amend deliverable 2 to
     the strongest reproducible guarantee available (for example: identical document set and identical
     query results, with a content hash over the extracted postings instead of over segment files).
     PRD §18.4's file hashes must still verify, so a non-reproducible index must at least be stable
     within one build.
   - *The query grammar needs to change to satisfy `FIND-04`'s no-results taxonomy* → the taxonomy is
     PRD §32.1 and `FIND-04`'s to render; the engine only owes distinguishable outcomes. Extend
     deliverable 8's enum by amending **this ticket**, and note the wire impact for `RETR-01`'s frozen
     contract and `RETR-09`.
   - *Lexical p95 cannot meet its share of the PRD §13.2 budget without narrowing corpus coverage* →
     that is exactly the trade PRD §39.2 forbids: *"reduce always-hot vector coverage/cache before
     removing lexical corpus coverage"*. Breakdown plan §8 **Q3** already settles that policy — full
     lexical corpus coverage is kept and hot dense coverage is reduced first — and defers only the
     numbers to real-scale measurement. Record the measurement, route the capacity decision to
     `RETR-10` and `RLSE-11`, and write back to `docs/prd/11-retrieval-engine/README.md` — never
     quietly index less of the corpus.
3. **Falsified protocol.** If full-corpus lexical coverage turns out to be impossible inside the PRD
   §39.2 memory and disk budget on the real corpus, PRD §17.2's central claim (*"The complete eligible
   corpus receives metadata/lexical/field/citation discovery"*) is falsified and the product's
   "search works with the model gateway disabled" promise (`SRCH-001`, PRD §26) is at risk. Stop,
   escalate for re-review, and write back to `docs/prd/breakdown-plan.md` §8 (Q3) and this sub-PRD
   before reducing coverage. Never let a performance fix silently shrink what is searchable.
