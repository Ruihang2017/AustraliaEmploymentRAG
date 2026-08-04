---
id: CRPS-03
title: Chunker and SearchChunk node-boundary rules
module: 04-corpus-contract
lane: 04-corpus-contract
size: M
agent: builder
status: draft
date: 2026-08-03
blocked_by: [CRPS-01]
blocks: [CRPS-05]
---

# CRPS-03 — Chunker and SearchChunk node-boundary rules

Implements PRD §15.3, §17.2, §35.3 — requirement ID `SRCH-003`, epic `E07-CORPUS-SCHEMA`.
No ADR — the decision is already made in PRD §15.3 ("SearchChunks MUST NOT cross independent legal
nodes merely for convenience") and §35.3 (`search_chunk` "cannot cross unrelated nodes; rebuildable");
this is build ticket 3 of 8 against it. The chunk-size constants are **benchmark-selected**
configuration (PRD §1, §45.5), raised as sub-PRD open question Q-CRPS-1, not decided here.
Parent sub-PRD: [04-corpus-contract README](../README.md). Master spec: [PRD](../../../PRD.md).
Depends on: [CRPS-01 — corpus.sqlite schema + intermediate normalised-record contract](CRPS-01-corpus-sqlite-schema-and-intermediate-normalised-record-contract.md) (mirrors `blocked_by`).
**Why `builder`:** a bounded change inside one module's declared file-scope against a fixed contract
(the `search_chunk` table and the node-boundary invariant already exist in the PRD) — not a new
subsystem decision.

## Background + basis

**Chunks are a rebuildable retrieval artifact, never an evidence identity.** PRD §15.1 defines
`SearchChunk` as a *"Rebuildable text retrieval artifact tied to one NodeVersion"*. PRD §15.3 fixes
the invariants:

> - Provision labels are version-specific display values, not permanent IDs.
> - Node lineage supports renumber/replacement/split/merge.
> - SearchChunks MUST NOT cross independent legal nodes merely for convenience.
> - SearchChunks and embeddings may be deleted/rebuilt.
> - Citations MUST target DocumentVersion + NodeVersion + exact offsets + source snapshot, never a
>   SearchChunk.

**The table is already specified.** PRD §35.3, `search_chunk`: required columns *"`id`,
`node_version_id`, `chunk_ordinal`, `start_offset`, `end_offset`, `text_hash`, `index_tier`"* with
constraint *"cannot cross unrelated nodes; rebuildable"*. The DDL for it is `CRPS-01`'s; this ticket
produces the values.

**Consolidation is permitted only inside a provision.** PRD §36.2's evidence-pack row states
*"Consolidate adjacent nodes only within same logical provision"* (for evidence nodes) — the same
principle applies to chunk construction and is the only permitted form of node merging.

**Offsets must reproduce exact source text.** Requirement `SRCH-003` (PRD §30.2): *"Results expose
source text, pinpoint, status, effective interval and official link"*, minimum acceptance evidence
*"Snippet offsets reproduce exact NodeVersion text"*. `CRPS-01` fixed the unit: character offsets,
half-open `[start, end)`, into the NFC-normalised `node_version.canonical_text`, with `text_hash` the
SHA-256 of that text's UTF-8 bytes.

**The chunker version is published in the manifest.** PRD §18.4: the manifest *"MUST include parent
release, schema/parser/**chunker**/embedding/index versions …"*. A chunker change therefore changes
release identity, which is why the profile must be versioned rather than tuned in place.

**Chunk sizing is deliberately not fixed by the PRD.** PRD §1: *"**Benchmark-selected** parameters
are intentionally not fixed until representative corpus and evaluation results exist."* PRD §45.5
classifies *"ranking/model/chunk/concurrency/token or resource value"* as benchmark-selected
configuration requiring *"measured eval/cost evidence and versioned config"*. PRD §17.2's planning
baseline of *"approximately 600,000–1,000,000 structurally consolidated online search chunks"* over
*"approximately 300,000 documents"* is a capacity hypothesis that *"MUST be replaced by measured
corpus statistics"* — it bounds the order of magnitude, it does not set the chunk size.

**Carried caveat (accepted for the pilot, documented not enforced):** the initial profile constants in
deliverable 4 are defaults, not product rules. Turning a default into a rule without measured
evidence is exactly what PRD §45.1 item 5 forbids (*"do not silently turn an initial default into a
new product rule"*).

**Downstream.** `CRPS-05` (embedding build) is `blocked_by` this ticket and `CRPS-04`: it embeds the
chunks this ticket produces, for the tiers `CRPS-04` assigns.

## Goal

Produce a deterministic, versioned chunker in `pipelines/corpus-builder/src/chunking/**` that turns
`node_version` rows (or `node_version` INR records) into `SearchChunkDraft` values carrying
`node_version_id`, `chunk_ordinal`, `start_offset`, `end_offset` and `text_hash`, such that no chunk
spans two independent legal nodes, every chunk's offsets slice the exact stored `canonical_text`, and
re-running the chunker with the same profile over the same input reproduces byte-identical results.
Completion is mechanically checkable: `uv run pytest pipelines/corpus-builder/tests/chunking` is
green, including a property test asserting the offset/round-trip invariant over generated node text
and a determinism test comparing two runs.

## Non-goals

- **No `index_tier` value** — `CRPS-04` owns tier assignment (`src/tiering/**`). `SearchChunkDraft`
  deliberately has **no** `index_tier` member; the two tickets run concurrently and meet in `CRPS-05`
  and `CRPS-06`.
- **No embedding, no vector artifact** — `CRPS-05` (`pipelines/embeddings/**`).
- **No writing of `search_chunk` rows into a release database** — `CRPS-06` (`src/build/**`) persists
  them. This ticket produces values and a pure function.
- **No lexical index construction and no query-time snippet rendering** — `11-retrieval-engine`
  (`RETR-02`, `RETR-08`). PRD §35.2 marks `node_version` as the FTS source; the index is a bundle
  artifact built in `CRPS-06`.
- **No schema change** — `CRPS-01` owns `pipelines/corpus-builder/schema/**` and the `search_chunk`
  DDL. A needed column is a writeback, not a local `ALTER`.
- **No parser, no node-hierarchy construction** — that is adapter/framework work
  (`05-ingestion-framework`, modules 06–10, PRD §40.7 `parse` and `normalise`). This ticket consumes
  already-normalised nodes.
- **No decision on the production chunk size** — benchmark-selected (PRD §1, §45.5); sub-PRD
  Q-CRPS-1, evidence from `RETR-10` and `GOLD-16`.

## File-scope (write-owns)

- `pipelines/corpus-builder/src/chunking/**`
- `pipelines/corpus-builder/tests/chunking/**`
- Module-shared, append-only (breakdown plan §1.1): `pipelines/corpus-builder/pyproject.toml`
  (dependencies only; regenerate the root `uv.lock` as a build artifact, never hand-merge).

Does not touch:

- `pipelines/corpus-builder/schema/**`, `src/contracts/**` — `CRPS-01` (and PRD §44.3 serial-owned:
  **this module is the sole owner of the corpus schema and the release manifest; no other module may
  write them** — within the module, only `CRPS-01`/`CRPS-02` do).
- `schemas/corpus-manifest/**`, `src/manifest/**` — `CRPS-02`. `src/tiering/**` — `CRPS-04`.
  `pipelines/embeddings/**` — `CRPS-05`. `src/{build,validation}/**` — `CRPS-06`.
  `src/publish/**` — `CRPS-07`. `fixtures/**` — `CRPS-08`.
- `packages/**`, `schemas/{openapi,events,evaluation}/**`, `pipelines/{ingestion,adapters,evaluation}/**`,
  `services/search-rs/**`, `apps/**`, `infra/**`, `evals/**`, `tests/**` — other modules per breakdown
  plan §4. `docs/PRD.md` — frozen.

**Serial-safety analysis.** First decomposition: nothing merged, no in-flight contention (breakdown
plan §1 header — `phase: 1`). `src/chunking/**` does not exist before this ticket. The concurrent
wave-2 siblings are `CRPS-02` (`schemas/corpus-manifest/**` + `src/manifest/**`) and `CRPS-04`
(`src/tiering/**`); all three write disjoint sub-trees of `pipelines/corpus-builder/`, and all three
are gated behind `CRPS-01`, which is the only writer of the shared `schema/**` and `src/contracts/**`
trees they read.

## Deliverables

1. `src/chunking/profile.py` — the versioned chunk profile:
   - `CHUNKER_VERSION: str` (semver) — published as `versions.chunker` in the release manifest
     (PRD §18.4). Any change to boundary behaviour bumps it.
   - `@dataclass(frozen=True) class ChunkProfile` with `profile_id: str`, `target_chars: int`,
     `max_chars: int`, `min_chars: int`, `overlap_chars: int`, `consolidate_within_provision: bool`,
     `split_strategy: Literal["sentence", "paragraph", "hard"]`.
   - `DEFAULT_PROFILE: ChunkProfile` — the documented initial defaults of deliverable 4.
   - `profile_fingerprint(profile) -> str` — stable hash, recorded alongside chunks so a mismatch is
     detectable.
2. `src/chunking/chunker.py::chunk_node_version(node: NodeVersionInput, profile: ChunkProfile) ->
   list[SearchChunkDraft]` — the single-node entry point, and
   `chunk_document_version(nodes: Sequence[NodeVersionInput], profile) -> list[SearchChunkDraft]` —
   the document-level entry point that may consolidate **only** sibling nodes belonging to the same
   logical provision (deliverable 5). Both are pure functions: no I/O, no database, no globals.
3. `@dataclass(frozen=True) class SearchChunkDraft` with exactly: `node_version_id: str`,
   `chunk_ordinal: int` (0-based, contiguous, ascending within a node version),
   `start_offset: int`, `end_offset: int`, `text_hash: str`, `char_count: int`,
   `consolidated_node_version_ids: tuple[str, ...]` (empty unless deliverable 5 applied),
   `profile_id: str`. **No `index_tier`** — that is `CRPS-04`'s.
4. Initial default profile (documented defaults, not product rules — PRD §45.1 item 5):
   `target_chars = 1200`, `max_chars = 2000`, `min_chars = 200`, `overlap_chars = 0`,
   `split_strategy = "sentence"`, `consolidate_within_provision = True`. Rationale to record in the
   module docstring: PRD §17.2's ~600k–1M chunks over ~300k documents, and PRD §36.2's Quick evidence
   budget of "12 evidence nodes" / "32,000 characters for one hosted call". `overlap_chars = 0` is
   deliberate: overlapping chunks would produce duplicate evidence spans, and PRD §36.2 requires
   deduplicated evidence. Any change to these numbers requires measured evidence per PRD §45.5 and is
   a writeback (see Feedback obligation).
5. **Boundary rules (load-bearing).** In precedence order:
   1. A chunk NEVER spans two `node_version` rows unless they are consolidated under rule 3.
      (PRD §15.3, §35.3)
   2. Within one node, split at the largest boundary that fits: paragraph → sentence → hard character
      cut. A hard cut is permitted only when a single sentence exceeds `max_chars`; it must be
      recorded in a `hard_split` counter returned by `chunk_document_version` so the build can report
      it.
   3. **Consolidation** merges adjacent sibling nodes into one chunk only when *all* hold: same
      `document_version_id`; same `parent_node_version_id`; contiguous `ordinal` values; combined
      length ≤ `max_chars`; and each participating node is shorter than `min_chars`. This is the
      "structurally consolidated" chunk of PRD §17.2 and the "same logical provision" rule of §36.2.
      A consolidated chunk records every participating id in `consolidated_node_version_ids` and
      anchors `node_version_id`/offsets to the **first** participant. Headings never consolidate with
      operative text.
   4. Nodes whose `node_kind` is a pure structural container with no `canonical_text` (for example a
      part/division heading with an empty body) produce **zero** chunks, not an empty chunk.
   5. `start_offset`/`end_offset` are character offsets into the node's NFC-normalised
      `canonical_text` (the `CRPS-01` rule), half-open, with `0 ≤ start < end ≤ len(text)`; chunks of
      one node are contiguous and non-overlapping when `overlap_chars = 0`, and their union is the
      whole text minus leading/trailing whitespace trimmed at boundaries.
   6. `text_hash` is the lowercase hex SHA-256 of the UTF-8 bytes of `text[start:end]` — the chunk's
      own text, not the node's. (`CRPS-01` defines `node_version.text_hash` over the whole node; the
      two hashes are different values with the same algorithm.)
6. **Determinism (load-bearing).** `chunk_document_version` is a pure function of
   `(nodes, profile)`: no clock, no randomness, no dict-iteration-order dependence, no locale-
   dependent segmentation. If a sentence segmenter is used it must be a pinned dependency with a
   version recorded in the module and included in `profile_fingerprint`. Basis: PRD §15.3 chunks are
   rebuildable — a rebuild that produces different boundaries invalidates every recorded chunk hash
   and every embedding.
7. `src/chunking/validate.py::validate_chunks(node, chunks, profile) -> list[ChunkViolation]` —
   re-checks rules 1–6 over produced chunks; used by the build's completeness gate (`CRPS-06`) and by
   the tests. Codes: `CHUNK_CROSSES_NODES`, `CHUNK_OFFSET_OUT_OF_RANGE`, `CHUNK_OVERLAP`,
   `CHUNK_GAP`, `CHUNK_HASH_MISMATCH`, `CHUNK_EMPTY`, `CHUNK_ORDINAL_NONCONTIGUOUS`,
   `CHUNK_EXCEEDS_MAX`, `CHUNK_ILLEGAL_CONSOLIDATION`.
8. `src/chunking/README.md` — one page: the boundary rules, the profile, the versioning rule, and the
   explicit statement that citations never reference a chunk (PRD §15.3), so a future reader does not
   "improve" the chunker into a citation target.

## Acceptance checklist (classified)

- [ ] `[machine]` No produced chunk spans two node versions unless it is a legal consolidation under
      rule 3 — asserted over both the hand-written cases and a property test with generated node
      trees. (PRD §15.3; §35.3)
- [ ] `[machine]` Offset round-trip: for every produced chunk, `text[start:end]` hashes to
      `text_hash`, and re-slicing after a NFC re-normalisation of the source text is unchanged.
      (`SRCH-003` "Snippet offsets reproduce exact NodeVersion text")
- [ ] `[machine]` Coverage and non-overlap: with `overlap_chars = 0`, the chunks of one node are
      contiguous, non-overlapping, ordinal-contiguous from 0, and jointly cover the node's text apart
      from boundary whitespace. (Rule 5)
- [ ] `[machine]` Determinism: two runs in separate processes over the same fixture produce identical
      `SearchChunkDraft` tuples, including ordinals and hashes. (Rule 6; PRD §15.3 rebuildable)
- [ ] `[machine]` A node whose single sentence exceeds `max_chars` is hard-split, every part is
      ≤ `max_chars`, and `hard_split` is counted. (Rule 5.2)
- [ ] `[machine]` Consolidation happens only when all five conditions hold — one negative test per
      condition (different parent, non-contiguous ordinals, over `max_chars`, a participant longer
      than `min_chars`, heading + operative text). (Rule 5.3; PRD §36.2)
- [ ] `[machine]` A structural container node with empty `canonical_text` produces zero chunks.
      (Rule 5.4)
- [ ] `[machine]` `validate_chunks()` returns the exact expected violation code for one deliberately
      corrupted chunk per code in deliverable 7. (Deliverable 7)
- [ ] `[machine]` `SearchChunkDraft` has no `index_tier` member — asserted by a field-set test, so the
      `CRPS-03`/`CRPS-04` boundary cannot erode. (Non-goals; `CRPS-04`)
- [ ] `[machine]` `CHUNKER_VERSION` and `profile_fingerprint(DEFAULT_PROFILE)` are exported and
      stable; changing any profile constant changes the fingerprint. (PRD §18.4 `versions.chunker`)
- [ ] `[fixture]` The multi-node legislative fixture in `tests/chunking/fixtures/` (a Part → Division
      → section → subsection tree with one very long subsection, one two-word subsection, one heading
      and one node containing non-ASCII text) chunks to the recorded golden output, byte-for-byte.
      (PRD §40.8 item 5 "parser/node hierarchy and exact-text round-trip tests" — same discipline)
- [ ] `[machine]` `uv run pytest` green (Python; PRD §45.3).
- [ ] `[machine]` `pnpm test` green (standing item, breakdown plan §1.1).
- [ ] `[machine]` PR states requirement ID `SRCH-003`; schema compatibility impact ("none — no DDL
      change"); memory/latency impact of chunking (measured on the fixture); rollback path; known gaps
      including the benchmark-selected profile constants (Q-CRPS-1). (PRD §45.4)
- [ ] No `[human]` criteria — this is pure, deterministic text processing with no user-visible
      surface. The human-visible consequence (snippet fidelity) is covered by `UAT-SRCH-03` in
      `14-search-product`.
- [ ] `cargo test --workspace` not applicable — this ticket touches no Rust.

## Test plan

All steps run offline; no network, no credentials, no database beyond `tmp_path` SQLite.

1. `uv run pytest pipelines/corpus-builder/tests/chunking -q`.
   Harness: pytest plus Hypothesis for the property tests (add the dependency to
   `pipelines/corpus-builder/pyproject.toml` and regenerate `uv.lock`). Node inputs are built with a
   `node_tree()` factory in `tests/chunking/conftest.py` that mirrors `CRPS-01`'s `node_version` INR
   payload — import the record model from `src/contracts`, do not re-declare it.
2. Property test: generate node texts (mixed ASCII/non-ASCII, mixed paragraph/sentence structure,
   lengths 0–20,000 chars) and assert, for every produced chunk set: node containment, offset range
   validity, hash agreement, ordinal contiguity, `char_count == end - start`, and
   `max(len) <= max_chars`.
3. Golden fixture: `tests/chunking/fixtures/legislative_tree.json` → `expected_chunks.json`; the test
   compares the full serialised draft list. Regenerating the golden file is a deliberate act that must
   accompany a `CHUNKER_VERSION` bump — assert that the recorded `chunker_version` in the golden file
   equals `CHUNKER_VERSION`, so a silent boundary change fails.
4. Determinism: run the golden case twice via `uv run python -c ...` in separate processes and diff
   the JSON output.
5. Negative consolidation matrix: five cases, one per condition in rule 5.3.
6. Suite green: `uv run pytest` and `pnpm test` from the repository root.
7. Reviewer focus: confirm the chunker performs no I/O and holds no global state (a shared segmenter
   instance with internal caches is a determinism hazard under the parallel build); confirm offsets
   are character-based everywhere (search for `encode(` / `bytes(` in the module); confirm nothing in
   this module writes `index_tier`; confirm the fixture contains no real customer data (PRD §40.8
   item 4).

## Feedback obligation

1. **General rule.** If implementation falsifies this ticket, update **this ticket** (docs PR →
   merge → `publish-tickets.mjs --sync`) and, where module context changes,
   `docs/prd/04-corpus-contract/README.md` (version +0.1 with a changelog line) **before** changing
   code. Silent divergence is an incomplete ticket.
2. **Foreseeable frictions, each with its exact writeback target:**
   - *Measured retrieval quality shows the default profile constants are wrong* → this is
     benchmark-selected configuration (PRD §45.5), not a free code edit: bump `CHUNKER_VERSION`,
     record the measured evidence, and update Q-CRPS-1 in
     `docs/prd/04-corpus-contract/README.md` plus deliverable 4 in **this ticket**. Note that the
     evidence comes from `RETR-10`/`GOLD-16`, which are not blocked by this ticket — so the change
     lands as a follow-up ticket in this module, not as a silent retune.
   - *A source's node structure cannot be chunked without crossing nodes* (for example a table split
     across sibling nodes) → PRD §15.3 forbids crossing "merely for convenience"; the permitted route
     is to extend the consolidation rule 5.3 with a precisely stated additional condition, recorded in
     **this ticket** and in `docs/prd/04-corpus-contract/README.md` (Decisions), before code. Never
     add an ad-hoc exception inside an adapter or the build.
   - *A deterministic, offline sentence segmenter is not available in the pinned Python toolchain* →
     fall back to `split_strategy = "paragraph"` plus hard cuts, record the change in deliverable 4
     of **this ticket**, and note the retrieval-quality consequence in
     `docs/prd/04-corpus-contract/README.md`. A network-downloading model at build time is not
     acceptable (PRD §19.3 keeps the pipeline local; PRD §20.3 requires reproducible CI).
   - *The chunker needs the index tier to decide boundaries* → that would couple `CRPS-03` and
     `CRPS-04`, which run concurrently. Do not import `src/tiering`. Raise it: the fix is either a
     new `blocked_by` edge in `docs/prd/breakdown-plan.md` §5.5 **and** §6.2, or moving the decision
     into `CRPS-06`. Both are plan changes.
3. **Falsified protocol.** If "SearchChunks MUST NOT cross independent legal nodes" (PRD §15.3) proves
   unworkable at corpus scale, that overturns a stated product safety invariant and the citation model
   in PRD §15.3/§36.4. Stop, escalate for re-review, and write back to
   `docs/prd/04-corpus-contract/README.md` and `docs/prd/breakdown-plan.md` §2.1 before writing any
   chunker that crosses nodes. Never relax an invariant inside the ticket.
