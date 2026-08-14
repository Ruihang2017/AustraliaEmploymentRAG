---
id: CRPS-08
title: Signed synthetic corpus fixture release
module: 04-corpus-contract
lane: 04-corpus-contract
size: M
agent: builder
status: draft
date: 2026-08-03
amended: 2026-08-15
blocked_by: [CRPS-02]
blocks: [RETR-01]
---

# CRPS-08 — Signed synthetic corpus fixture release

Implements PRD §18.4, §20.3, §40.8 — requirement IDs `SRCH-003`, `SRCH-004` (fixture support),
`ADM-002` (fixture must be non-promotable), epic `E07-CORPUS-SCHEMA` (exit evidence: *"Immutable
fixture opens in search"*).
No ADR — the decision is already made in breakdown plan §2.1 **A4** (*"lets `RETR-01` start from a
synthetic signed fixture release (`CRPS-08`) long before 52 adapters land"*) and PRD §18.4 (the bundle
layout and signature verification); this is build ticket 8 of 8 against it.
Parent sub-PRD: [04-corpus-contract README](../README.md). Master spec: [PRD](../../../PRD.md).
Depends on: [CRPS-02 — CorpusRelease manifest schema, signing and verification](CRPS-02-corpusrelease-manifest-schema-signing-and-verification.md) (mirrors `blocked_by`).
**Why `builder`:** a bounded change inside one module's declared file-scope against a fixed contract
(the schema from `CRPS-01`, the manifest and signer from `CRPS-02`) — not a new subsystem decision.

## Background + basis

**This fixture exists to break a scheduling deadlock, and the plan says so.** Breakdown plan §2.1
decision **A4**: *"The corpus builder consumes the versioned intermediate normalised-record contract,
never adapter code; it is testable from contract fixtures alone. … Makes `04-corpus-contract` a
dependency *of* ingestion rather than mutual, and lets `RETR-01` start from a synthetic signed fixture
release (`CRPS-08`) long before 52 adapters land."* PRD §44.3's critical path
(*"official-source adapters + release bundle → search/retrieval"*) would otherwise stall
`11-retrieval-engine` behind 52 adapter tickets.

**The consumer's contract.** `RETR-01` (breakdown plan §5.11) is *"search-rs skeleton: read-only
bundle, release pinning, localhost API"* with the goal *"Search reads only a pinned corpus bundle; no
app DB path exists"* — it is `blocked_by` this ticket. PRD §18.3: *"`corpus.sqlite` is
release-specific, immutable and production read-only. Search can read only corpus files; it MUST NOT
read `app.sqlite`."* PRD §21: *"Trust application/corpus artifacts only after signature/hash/
compatibility verification"* — so the fixture must be genuinely signed, or `RETR-01` would have to
build a bypass path that must not exist.

**The bundle layout is fixed.** PRD §18.4: `corpus.sqlite`, `tantivy/`, `vectors.usearch`,
`embedding-manifest.json`, `release-manifest.json`, with a manifest carrying *"parent release,
schema/parser/chunker/embedding/index versions, artifact hashes, counts, coverage, quarantine
summary, evaluation results, file hashes/sizes, build time and app/search compatibility."*

**Fixtures carry no customer data and are the standard evidence form.** PRD §40.8 item 4:
*"representative HTML/XML/JSON/PDF fixtures without customer data"*; item 6: *"historical/effective/
status/event behaviour for at least three time points"*. PRD §20.3 requires CI gates including
*"Retrieval/evaluation smoke set"* — a committed fixture release is what makes that runnable without
network access.

**No production keys.** PRD §20.2: *"Coding agents MUST NOT receive production SSH, database, backup,
signing or provider credentials by default."* The fixture is signed with the **development** keypair
`CRPS-02` committed under its test fixtures (`key_id` prefixed `dev-`).

**A fixture must never be promotable.** PRD §12.2: *"Failed releases MUST NOT modify active production
data"*; requirement `ADM-002`: *"Promotion failure leaves active pointer unchanged."* `CRPS-02`
deliverable 4 defines `release_kind: SYNTHETIC_FIXTURE`, and `CRPS-07` refuses to publish one.

**Blind evaluation material stays out.** PRD §14.3: *"Blind gold answers MUST remain outside ordinary
coding-agent context"*; breakdown plan risk R9 and §4.2 keep `evals/gold/**` away from ordinary
fixtures. This fixture is generated, not derived from gold cases.

**Carried caveat (accepted for the MVP, documented not enforced):** the fixture's `tantivy/` and
`vectors.usearch` members are declared **placeholders** unless a real offline index builder exists
(sub-PRD open question **Q-CRPS-2**, resolved by `CRPS-06`, which is *not* a blocker of this ticket).
Declaring the state explicitly in the manifest is the requirement; silently shipping an empty
directory that looks like an index is the failure mode being prevented.

## Goal

Produce, in `pipelines/corpus-builder/fixtures/**`, a deterministic generator and the committed
artifact it produces: a small, signed, `SYNTHETIC_FIXTURE`-marked CorpusRelease bundle containing a
valid `corpus.sqlite` (schema from `CRPS-01`), all five PRD §18.4 bundle paths, and a manifest that
verifies with `CRPS-02`'s `verify_bundle()` against the committed development public key — covering at
least two jurisdictions, three time points, every PRD §6.7 legal status, one licence-excluded and one
quarantined item, and exact-identifier lookups. Completion is mechanically checkable:
`uv run pytest pipelines/corpus-builder/tests/fixtures` is green, re-running the generator reproduces
the committed bundle byte-for-byte (excluding the recorded build timestamp), and `verify_bundle()`
returns `ok` with `release_kind == "SYNTHETIC_FIXTURE"`.

## Non-goals

- **No real source data, no HTTP fetch, no adapter** — modules `06-sources-legislation` …
  `10-sources-future` own real sources; PRD §40.8's fixtures live with their adapters. This bundle is
  entirely synthetic, invented text about invented instruments.
- **No evaluation cases, no gold citations** — `21-evaluation-600`. PRD §14.3 and breakdown plan R9
  keep blind gold out of ordinary fixtures; `GOLD-01` owns `evals/splits/**`.
- **No search-side loading, index reading or query API** — `RETR-01`/`RETR-02` (`11-retrieval-engine`),
  which are `blocked_by` this ticket.
- **No build orchestration or gates** — `CRPS-06`. This ticket must not depend on `CRPS-06` (it is not
  a blocker per breakdown plan §5.5): the generator writes the bundle directly using `CRPS-01`'s
  schema API and `CRPS-02`'s manifest/signing API.
- **No publishing** — `CRPS-07` explicitly refuses `SYNTHETIC_FIXTURE`.
- **No manifest schema or signer changes** — `CRPS-02` owns `schemas/corpus-manifest/**` and
  `src/manifest/**` (PRD §44.3 serial-owned).
- **No production key material** — PRD §20.2; development keypair only.

## File-scope (write-owns)

- `pipelines/corpus-builder/fixtures/**` — the generator, its seed data and the committed bundle.
- `pipelines/corpus-builder/tests/fixtures/**` — tests over the generator and the committed bundle.
- Module-shared, append-only (breakdown plan §1.1): `pipelines/corpus-builder/pyproject.toml`
  (dependencies only; regenerate the root `uv.lock` as a build artifact, never hand-merge).

Does not touch:

- `pipelines/corpus-builder/schema/**`, `src/contracts/**` — `CRPS-01`; `schemas/corpus-manifest/**`,
  `src/manifest/**` — `CRPS-02`. These are the PRD §44.3 **serial-owned corpus schema and release
  manifest**: `04-corpus-contract` is their sole owner and **no other module may write them**; inside
  this module only `CRPS-01`/`CRPS-02` do. This ticket calls their APIs.
- `src/chunking/**` — `CRPS-03`. `src/tiering/**` — `CRPS-04`. `pipelines/embeddings/**` — `CRPS-05`.
  `src/{build,validation}/**` — `CRPS-06`. `src/publish/**` — `CRPS-07`.
- `evals/**`, `schemas/evaluation/**`, `pipelines/evaluation/**` — `21-evaluation-600` (blind-gold
  boundary, PRD §14.3, breakdown plan R9). `services/search-rs/**` — `11-retrieval-engine`.
  `tests/**` — `23-assurance`. `apps/**`, `packages/**`, `infra/**` — other modules per breakdown
  plan §4. `docs/PRD.md` — frozen.

**Serial-safety analysis.** First decomposition: nothing merged, no in-flight contention (breakdown
plan §1 header — `phase: 1`, `existingFiles: ['.gitkeep']`). `pipelines/corpus-builder/fixtures/**`
does not exist before this ticket and is claimed by no other ticket in any module. The concurrent
wave-3 sibling is `CRPS-05` (`pipelines/embeddings/**`) — a disjoint tree. `CRPS-01` and `CRPS-02`,
whose APIs this ticket calls, are merged before it starts (`CRPS-02` is the declared blocker, and it
in turn is blocked by `CRPS-01`).

## Deliverables

1. `fixtures/generator/synthetic_corpus.py::generate_corpus(db_path, *, seed: int = 20260803) ->
   CorpusStats` — deterministic, seeded generation of a small but structurally complete corpus using
   `CRPS-01`'s `create_corpus_database()`. Content requirements (each has a downstream consumer):

   | Content | Count (minimum) | Why |
   |---|---|---|
   | Source groups across **two jurisdictions** (one Commonwealth-like, one state-like) | 2 | PRD §6.2/§6.3 scope shape; `RETR-01` jurisdiction filters |
   | Authorities | 2 | PRD §35.2 `authority` |
   | Legal documents (an Act-like, a regulation-like, a case-like, a guidance-like) | 4 | PRD §35.2 `document_type` variety |
   | Document versions per Act-like document at **three time points** | 3 | PRD §40.8 item 6 "at least three time points"; `UAT-SRCH-03` |
   | Every PRD §6.7 legal status present across the corpus | 7 | `UAT-SRCH-02` current/future separation |
   | Node hierarchy ≥ 4 levels deep with ordinals and headings | 1 tree | PRD §35.2 hierarchy/ordinal indexes |
   | `legal_event` rows: commencement, amendment, repeal | 3 | PRD §15.2 "Legal status MUST be derived from evidenced LegalEvents" |
   | `node_relation` rows incl. one `MODEL_SUGGESTED` | 3 | PRD §35.2 "`MODEL_SUGGESTED` cannot support definitive status" |
   | Exact identifiers: a provision reference, a neutral citation, an award-like identifier, a synthetic ABN | 4 | `SRCH-004` "Exact provision/case/agreement/ABN matches outrank semantic similarity" |
   | One document with `licence_assessment` status `PROHIBITED` (→ `EXCLUDED_LICENSING`) | 1 | PRD §11.1; `CRPS-04` |
   | One open `quarantine_item` on a **non-included** artifact | 1 | PRD §35.3 "cannot enter promoted release while open" — the fixture demonstrates the state without including the item |
   | Non-ASCII text in at least one node | 1 | offset/NFC correctness (`CRPS-01` deliverable 12) |

   All text is invented (no real Act text, no real party names, no real ABN — use a checksum-valid
   ABN from a documented synthetic range). No customer data of any kind (PRD §40.8 item 4).
2. `fixtures/generator/build_fixture.py::build_fixture_release(out_dir, *, seed, key_path, key_id) ->
   Path` — assembles the full PRD §18.4 bundle:
   `corpus.sqlite` (deliverable 1), `tantivy/`, `vectors.usearch`, `embedding-manifest.json`,
   `release-manifest.json`; builds the manifest with `CRPS-02`'s `build_release_manifest`, sets
   `release_kind = "SYNTHETIC_FIXTURE"`, signs with the committed development key, and verifies its own
   output with `verify_bundle()` before returning (a generator that emits an unverifiable bundle must
   fail loudly).
3. **Index placeholders, declared not disguised.** Until sub-PRD Q-CRPS-2 is resolved by `CRPS-06`:
   - `tantivy/INDEX_STATE.json` = `{"state": "PLACEHOLDER", "reason": "synthetic fixture; see
     CRPS-06/Q-CRPS-2", "index_version": null}` and no other file in `tantivy/`;
   - `vectors.usearch` is either a real stub-provider index (if `CRPS-05` has landed and can be
     imported without new dependencies) or a zero-vector placeholder file accompanied by
     `embedding-manifest.json` whose `vector_file.count` is `0` and whose `model_id` starts with
     `stub:`;
   - both are recorded truthfully in the manifest's `files[]`, `artifacts.*` hashes and `versions`.
     `versions.index` carries the **sentinel string `"PLACEHOLDER_NO_INDEX"`** while the index is a
     placeholder. *(Amended 2026-08-15 — this clause originally read `index: null`. `CRPS-02`'s
     frozen contract makes `versions.index` **required** and `$ref`s
     `pins.schema.json#/$defs/version_string` = `{"type": "string", "minLength": 1}`, and
     `verify_bundle()` records `MANIFEST_SCHEMA_INVALID` at **BLOCKING** severity — so a `null` here
     would make the bundle fail its own verification and contradict this ticket's first acceptance
     item. Widening `CRPS-02`'s schema was rejected: it reopens a signed contract owned by another
     ticket and outside this file-scope. The sentinel is unmistakably not a version, and
     "declared, not disguised" is carried by three independent declarations regardless — see below.
     Sub-PRD `README.md` **D16**.)*
     A consumer must be able to tell from the manifest alone that
     there is no queryable index — `RETR-01` only needs bundle loading, pinning and verification.
4. **Determinism.** `generate_corpus` and `build_fixture_release` are pure functions of `(seed,
   key)`: fixed ids derived from the seed (no UUID4, no clock), fixed ordering of every insert, fixed
   `created_at`/`retrieved_at` values drawn from a constant base date, and `built_at` the only
   non-deterministic member (recorded, and excluded from the equality assertion). Basis: PRD §20.3
   requires reproducible CI, and a fixture that changes on every run cannot be a golden artifact.
5. **The committed artifact** — `fixtures/releases/corpus-release-fixture-v1/` containing the five
   PRD §18.4 members, committed to the repository so `RETR-01` and CI need no generation step. Hard
   constraints: total committed size **≤ 20 MiB**; no binary blob larger than 8 MiB; text files use LF
   endings. A `.gitattributes`-style note in the fixture README states these limits. If the bundle
   cannot fit, reduce the corpus, never the coverage requirements of deliverable 1 — and record the
   reduction (see Feedback obligation).
6. `fixtures/keys/README.md` — points at `CRPS-02`'s committed **development** public key used to
   verify this fixture, states that the private key is a development key only, and that any manifest
   whose `key_id` starts with `dev-` must never be accepted by production tooling. No private key is
   stored under `fixtures/**`.
7. `fixtures/README.md` — the cold-start page for consumers (`RETR-01`, CI, `23-assurance`): the
   bundle path, how to verify it in three lines, the fixture's content inventory (deliverable 1's
   table), the explicit placeholder statement from deliverable 3, and the regeneration command.
8. `fixtures/generator/cli.py` — `uv run python pipelines/corpus-builder/fixtures/generator/cli.py
   regenerate [--out <dir>] [--seed <n>]`, which rebuilds the committed bundle in place; running it on
   a clean tree must leave `git status` clean apart from `built_at`. *(Amended 2026-08-15 — this
   clause originally named `uv run python -m corpus_builder.fixtures regenerate`. No importable
   `corpus_builder` package exists or may be created: `pipelines/corpus-builder` is a uv member with
   `package = false` whose one package directory is `taxrag_pipeline_corpus_builder/`, and
   `tools/workspace-assertions.mjs::assertSkeleton()` asserts each uv member holds **exactly one**
   immediate child directory containing `__init__.py` — so adding `fixtures/__init__.py` fails
   `pnpm test` repository-wide, and adding a module under the existing package directory is outside
   this ticket's file-scope. The script-path form is the precedent this repository already uses for
   generator scripts, e.g. `pipelines/corpus-builder/tests/manifest/fixtures/golden/regenerate.py`.
   Sub-PRD `README.md` **D16**.)*
   `--out` is **guarded**: the CLI rewrites a directory only when it is absent, empty, or a
   recognisable `SYNTHETIC_FIXTURE` bundle, and it refuses any other target rather than deleting it.
9. **A consumer smoke helper** — `fixtures/consumer_checks.py::assert_fixture_loadable(bundle_dir)`
   performing exactly what `RETR-01` will do at its boundary: verify the manifest, open
   `corpus.sqlite` read-only, run three canonical queries (exact provision lookup, neutral-citation
   lookup, point-in-time node resolution at each of the three time points) and assert the expected
   rows. This is the executable definition of `E07`'s exit evidence *"Immutable fixture opens in
   search"* on the corpus side.

## Acceptance checklist (classified)

- [ ] `[fixture]` `verify_bundle()` on the committed bundle returns `ok`, with
      `release_kind == "SYNTHETIC_FIXTURE"` and a `dev-` key id. (PRD §18.4; §21; breakdown plan A4)
- [ ] `[fixture]` `assert_fixture_loadable()` passes: manifest verified, `corpus.sqlite` opens
      read-only, and all three canonical queries return the expected rows at each of the three time
      points. (`E07` exit evidence; `SRCH-003`; `SRCH-004`)
- [ ] `[machine]` Determinism: regenerating with the same seed reproduces every bundle file
      byte-for-byte, and the manifest matches apart from `built_at`. (Deliverable 4; PRD §20.3)
- [ ] `[machine]` Content inventory: the generated corpus satisfies every minimum in deliverable 1's
      table — asserted by explicit SQL count assertions, one per row of that table. (PRD §40.8 items
      4/6; §6.7)
- [ ] `[machine]` Every PRD §6.7 legal status appears at least once, and at least one document is
      `ENACTED_NOT_IN_FORCE` so `UAT-SRCH-02`-style current/future separation is testable downstream.
- [ ] `[machine]` The `PROHIBITED`-licensed document's chunks are tier `EXCLUDED_LICENSING` and appear
      in no vector artifact; the open `quarantine_item` refers to an artifact **not** included in the
      bundle. (PRD §11.1; §35.3)
- [ ] `[machine]` Offsets: every `search_chunk` in the fixture slices its node text exactly and
      reproduces `text_hash`, including for the non-ASCII node. (`SRCH-003`; `CRPS-01` deliverable 12)
- [ ] `[machine]` Index placeholders are declared: `tantivy/INDEX_STATE.json` states `PLACEHOLDER`,
      `versions.index` is the sentinel `"PLACEHOLDER_NO_INDEX"` (amended 2026-08-15 from `null`, which
      `CRPS-02`'s frozen schema rejects at BLOCKING severity — deliverable 3), and
      `embedding-manifest.json` reports `vector_file.count == 0` or a
      `stub:` model — asserted so a placeholder can never be mistaken for a real index.
      (Deliverable 3; sub-PRD Q-CRPS-2)
- [ ] `[machine]` The committed bundle is ≤ 20 MiB with no single file > 8 MiB. (Deliverable 5)
- [ ] `[machine]` No private key material and no real-world source text exists under
      `pipelines/corpus-builder/fixtures/**` — asserted by a scan test for PEM/PKCS8 headers and by a
      declared provenance note in `fixtures/README.md`. (PRD §20.2; §40.8 item 4)
- [ ] `[machine]` Nothing under `fixtures/**` reads `evals/**` or references blind gold paths.
      (PRD §14.3; breakdown plan R9)
- [ ] `[machine]` `CRPS-07`'s publisher refuses this bundle (cross-check test asserting the
      `SYNTHETIC_FIXTURE` refusal path exists) — **skipped with a message naming `CRPS-07`** if that
      module has not landed yet, never passed silently. (PRD §12.2; `ADM-002`)
- [ ] `[machine]` `uv run pytest` green (Python; PRD §45.3).
- [ ] `[machine]` `pnpm test` green (standing item, breakdown plan §1.1).
- [ ] `[machine]` PR states requirement IDs `SRCH-003`, `SRCH-004`, `ADM-002`; source/licence
      provenance impact ("wholly synthetic, no third-party text"); repository-size impact (committed
      bundle bytes); rollback path; known gaps including the index placeholder (Q-CRPS-2).
      (PRD §45.4)
- [ ] No `[human]` criteria — the fixture is generated and verified mechanically. Its human-visible
      payoff (`UAT-SRCH-01`/`UAT-SRCH-03` behaviour) is exercised by `14-search-product` at Gate 2.
- [ ] `cargo test --workspace` not applicable — this ticket touches no Rust. (`RETR-01`, the Rust
      consumer, is `blocked_by` this ticket and carries that check.)

## Test plan

All steps run offline; no network, no credentials beyond the committed development keypair.

1. `uv run pytest pipelines/corpus-builder/tests/fixtures -q`.
   Harness: pytest. Tests operate on **the committed bundle** (not a freshly generated one) for the
   verification and inventory assertions, so a stale committed artifact fails; a separate test
   regenerates into `tmp_path` and diffs against the committed copy.
2. Determinism: `build_fixture_release(tmp_path, seed=20260803, ...)` twice, and against the committed
   copy; compare file hashes, ignoring `built_at`.
3. Inventory: one assertion per row of deliverable 1's table, written as explicit SQL counts in
   `tests/fixtures/test_inventory.py` — the table is the specification.
4. Loadability: `assert_fixture_loadable()` against the committed bundle; assert each canonical query's
   expected row ids, and assert the point-in-time query returns a **different** node version at each of
   the three dates (a fixture where all three dates return the same version would silently pass a
   temporal test downstream).
5. Safety scans: PEM/PKCS8 header scan; a `git ls-files` size check for the 20 MiB / 8 MiB limits; a
   grep-based test asserting no path under `fixtures/**` mentions `evals/gold`.
6. Cross-check: import `CRPS-07`'s publisher and assert it refuses the fixture manifest; skip with a
   named message if the module is absent.
7. Suite green: `uv run pytest` and `pnpm test` from the repository root.
8. Reviewer focus: confirm the fixture is genuinely signed and that verification is not stubbed;
   confirm the `dev-` key id convention is present so production tooling can reject it; confirm the
   placeholder index cannot be read as a real index (check the manifest, not just the directory);
   confirm no real legislative text or real personal data was pasted in; confirm ids are seed-derived
   rather than random.

## Feedback obligation

1. **General rule.** If implementation falsifies this ticket, update **this ticket** (docs PR →
   merge → `publish-tickets.mjs --sync`) and, where module context changes,
   `docs/prd/04-corpus-contract/README.md` (version +0.1 with a changelog line) **before** changing
   code. Silent divergence is an incomplete ticket.
2. **Foreseeable frictions, each with its exact writeback target:**
   - *`RETR-01` needs more from the fixture than deliverable 1 provides* (for example a real lexical
     index to open) → do not widen the fixture ad hoc and do not import `services/search-rs`. Record
     the requirement in `docs/prd/04-corpus-contract/README.md` and, if a new edge is needed
     (`CRPS-08 blocked_by CRPS-06`, or a second fixture ticket), put it in
     `docs/prd/breakdown-plan.md` §5.5 **and** §6.2 first — `RETR-01` is `blocked_by` this ticket, so a
     late edge here reshapes the critical path.
   - *The bundle cannot stay under 20 MiB while meeting the content inventory* → reduce document
     count and text length, never the coverage rows of deliverable 1; if a row must go, amend **this
     ticket** and note the reduced downstream coverage in
     `docs/prd/04-corpus-contract/README.md`. Consider Git LFS only as an explicit, recorded decision
     — it changes clone requirements for every agent and would need a note in
     `docs/prd/breakdown-plan.md` §1.1.
   - *The index placeholder convention (deliverable 3) conflicts with what `CRPS-06`'s
     `NullLexicalIndexBuilder` writes* → converge on `CRPS-06`'s form (it is the build-side owner) and
     amend **this ticket** in the same docs PR; record the shared convention in
     `docs/prd/04-corpus-contract/README.md` (Decisions).
   - *A `SYNTHETIC_FIXTURE` bundle is found in a staging or production path* → that is a safety
     defect, not a fixture defect: file it against `CRPS-07`/`RLSE-07` and record the missing refusal
     in `docs/prd/04-corpus-contract/README.md`. Never soften the marker to make a downstream tool
     accept the fixture.
   - *Signing the fixture requires a key that cannot be committed* → the development keypair is
     `CRPS-02`'s; if `CRPS-02`'s scheme changes, update this ticket's deliverable 6 and regenerate the
     fixture in the same docs PR. Never commit a production key (PRD §20.2).
3. **Falsified protocol.** If a *signed* synthetic release turns out not to unblock `RETR-01` — for
   instance because search cannot load any bundle without a real index — then breakdown plan decision
   **A4** is falsified and the module DAG's `CRPS-08 → RETR-01` edge is worthless. Stop, escalate for
   re-review, and write back to `docs/prd/breakdown-plan.md` §2.1 (A4), §5.5 and §6.2 plus this
   sub-PRD before improvising a substitute. Never let `11-retrieval-engine` start against an artifact
   that is not what its ticket says it is.
