# `chunking` — the SearchChunk builder (CRPS-03)

Requirement `SRCH-003`, epic `E07-CORPUS-SCHEMA`. Implements PRD §15.3, §17.2, §35.3.

**Read this before "improving" the chunker.** Chunk boundaries are release identity: `CHUNKER_VERSION`
is published as `versions.chunker` in the release manifest (PRD §18.4), and a rebuild that moves a
boundary invalidates every recorded chunk hash and every embedding.

## A citation NEVER references a SearchChunk

PRD §15.3: *"Citations MUST target DocumentVersion + NodeVersion + exact offsets + source snapshot,
never a SearchChunk."* A `SearchChunk` is a **rebuildable retrieval artifact** (PRD §15.1) and may be
deleted and rebuilt at any point. Do not add an identifier here that anything downstream could treat
as evidence identity, and do not make a chunk citable.

## Boundary rules, in precedence order

1. **A chunk never spans two `node_version` rows** unless they are consolidated under rule 3
   (PRD §15.3, §35.3). This is the load-bearing invariant; it is not relaxable inside this module.
2. **Within one node, split at the largest boundary that fits:** paragraph → sentence → hard
   character cut. A hard cut is permitted only when a single sentence still exceeds `max_chars`, and
   every such cut is counted in `ChunkDrafts.hard_split` so the build can report it.
3. **Consolidation** merges adjacent sibling nodes into one chunk only when *all* hold: same
   `document_version_id`; same `parent_node_version_id`; contiguous `ordinal` values; combined length
   ≤ `max_chars`; every participant shorter than `min_chars`. This is PRD §17.2's "structurally
   consolidated" chunk and PRD §36.2's "same logical provision" rule. Headings never consolidate with
   operative text.
4. A structural container with no `canonical_text` (a Part or Division heading with an empty body)
   produces **zero** chunks, not an empty chunk.
5. `start_offset` / `end_offset` are **character** offsets into the node's NFC-normalised
   `canonical_text`, half-open, `0 ≤ start < end ≤ len(text)`. With `overlap_chars = 0` the chunks of
   one node are non-overlapping and jointly cover the text apart from boundary whitespace.
6. `text_hash` is the lowercase hex SHA-256 of the UTF-8 bytes of `text[start:end]` — **the chunk's
   own text**, not the node's. (`node_version.text_hash` from CRPS-01 covers the whole node: same
   algorithm, different value.)

## What a consolidated chunk means (read this, CRPS-05)

A consolidated chunk still holds **one** `node_version_id` and **one** offset pair, both anchored to
the **first** participant, and its `text_hash` is the SHA-256 of that anchor's `text[start:end]`.
Nothing here concatenates several nodes' text: a `search_chunk` row physically holds one node
reference and one offset pair, and a hash over a concatenation would create exactly the cross-node
offset PRD §15.3 forbids.

`consolidated_node_version_ids` — anchor first, then the following participants in document order —
is what tells a consumer which sibling nodes belong to the same retrieval unit. **Joining their text
for embedding is the consumer's rule, not this module's**, and this module deliberately publishes no
helper for it: adding one is a ticket change against CRPS-03, not a silent addition.

Every non-anchor participant emits **no** chunk of its own. `search_chunk` is unique on
`(node_version_id, chunk_ordinal)`, and a second row would double-count the group's text.

### The heading rule without a `NodeKind` vocabulary

"Headings never consolidate with operative text" is implemented as *every participant shares the same
`node_kind` string*. `packages/contracts` publishes no `NodeKind` family yet
(`schema/corpus/002_enums.map.json` lists `document_node.node_kind` as `pending`, gap **Q-CRPS-4**),
and CRPS-01 forbids hand-copying enum values. The string-equality rule needs no vocabulary, is
strictly conservative — it can only refuse a merge a vocabulary-aware rule would allow, never permit
one it would refuse — and tightens by itself once `FND-03` publishes the family.

## The profile

`ChunkProfile` carries every knob that can move a boundary, and `profile_fingerprint()` hashes all of
them together with `CHUNKER_VERSION` and `SEGMENTER_VERSION`. Record the fingerprint alongside a
produced chunk set: a mismatch between chunks in a release and the profile that would rebuild them is
then detectable rather than silent.

`DEFAULT_PROFILE` — `target_chars = 1200`, `max_chars = 2000`, `min_chars = 200`, `overlap_chars = 0`,
`split_strategy = "sentence"`, `consolidate_within_provision = True`.

These are **documented initial defaults, not product rules.** PRD §1 marks chunk sizing
*benchmark-selected*; PRD §45.1 item 5 forbids silently turning a default into a rule. The numbers are
owned by sub-PRD open question **Q-CRPS-1**, with evidence to come from `RETR-10` / `GOLD-16`.
Changing one requires measured evidence (PRD §45.5), a `CHUNKER_VERSION` bump, and a writeback to
Q-CRPS-1 and to deliverable 4 of the CRPS-03 ticket — never a quiet retune. The rationale for the
starting values is in `profile.py`'s module docstring.

## Versioning rule

| Change | Consequence |
| --- | --- |
| Any change to boundary behaviour in `chunker.py` | bump `CHUNKER_VERSION` |
| Any change to boundary behaviour in `segment.py` | bump `SEGMENTER_VERSION` (and normally `CHUNKER_VERSION`) |
| Any change to a profile constant | new evidence + `CHUNKER_VERSION` bump + Q-CRPS-1 writeback |

All three change `profile_fingerprint(DEFAULT_PROFILE)`, and all three require regenerating
`tests/chunking/fixtures/expected_chunks.json` — a deliberate act, which is why the golden test also
asserts the recorded `chunker_version` and fingerprint.

## Determinism contract

`chunk_node_version` and `chunk_document_version` are pure functions of `(nodes, profile)`:

- no I/O — no file, no socket, no database, no subprocess;
- no module-level mutable state, **no cache** (a shared segmenter with an internal cache is the
  classic determinism and memory hazard under the parallel build — do not add `functools.lru_cache`
  here);
- no clock, no RNG, no UUID;
- no dict- or set-iteration-order dependence: the module's frozen sets are used for membership only;
- no locale dependence, and no floating point — every threshold comparison is integer;
- character offsets end to end. Nothing here encodes to bytes except `sha256_hex`, which is
  CRPS-01's and is defined over UTF-8 bytes by the contract.

`tests/chunking/test_chunk_purity.py` asserts most of this mechanically against the source, and
`test_chunk_determinism.py` re-runs the fixture in two subprocesses under **different**
`PYTHONHASHSEED` values.

## Out of scope, deliberately

- **No index tier.** `SearchChunkDraft` has no such member and this module never imports
  `src/tiering` — CRPS-04 owns tier assignment and runs concurrently. If the chunker ever appears to
  need a tier to decide a boundary, that is a plan change (a new dependency edge or moving the
  decision into CRPS-06), never a local import.
- **No embedding and no vector artifact** — CRPS-05.
- **No writing of `search_chunk` rows** — CRPS-06 persists them; this module produces values.
- **No schema change** — CRPS-01 owns the `search_chunk` DDL. A needed column is a writeback.
