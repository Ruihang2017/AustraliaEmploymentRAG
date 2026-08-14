# Signed synthetic corpus fixture release (CRPS-08)

The cold-start page for anyone who needs a CorpusRelease bundle without building one: `RETR-01`, CI,
and `23-assurance`.

**The bundle:** `pipelines/corpus-builder/fixtures/releases/corpus-release-fixture-v1/`

It is a real, signed, verifiable PRD §18.4 release bundle marked `release_kind: SYNTHETIC_FIXTURE`.
It is **not promotable** and must never be accepted by staging or production tooling — `CRPS-07` /
`RLSE-07` refuse it on the `RELEASE_KIND_SYNTHETIC_FIXTURE` finding alone. If a downstream tool
refuses this bundle, **that tool is right**; never soften the marker to make something accept it.

## Verify it in three lines

```python
from manifest import public_keys_from, verify_bundle           # pipelines/corpus-builder/src
report = verify_bundle(BUNDLE_DIR, public_keys=public_keys_from(DEV_PUBLIC_KEYFILE))
assert report.ok and report.release_kind == "SYNTHETIC_FIXTURE"
```

`DEV_PUBLIC_KEYFILE` is CRPS-02's committed development **public** key — see
[`keys/README.md`](keys/README.md). Or, for the full consumer boundary (verify, open read-only, three
canonical queries, three time points):

```python
from consumer_checks import assert_fixture_loadable
assert_fixture_loadable()
```

## Provenance — read this before reusing any of it

**Wholly synthetic.** Every instrument, party, citation, identifier and sentence in this fixture is
invented. There is **no third-party or real legislative text**, no real case, no real party name, and
**no customer data of any kind** (PRD §40.8 item 4). The instruments named ("Synthetic Levy
Administration Act 2019", "Farrow v Commissioner of Synthetic Revenue" and so on) do not exist. The
ABN is **checksum-valid but invented and registered to no entity** — it is checksum-valid so that
exact-identifier retrieval (`SRCH-004`) is genuinely exercised, and no reserved synthetic ABN range
exists to draw from.

Nothing under `fixtures/**` reads, imports or references `evals/**` (PRD §14.3 blind-gold boundary,
breakdown plan R9), and no private key material is stored here (PRD §20.2).

## Content inventory (deliverable 1)

`tests/fixtures/test_fixture_inventory.py` asserts one row of this table per test, against the
committed bundle — a stale artifact fails.

| Content | In the fixture |
|---|---|
| Source groups across two jurisdictions | `syn-cth-primary` (`AU-CTH`), `syn-nsw-primary` (`AU-NSW`) |
| Authorities | a parliament-like one (no court level) and a court-like one (`APPELLATE`) |
| Legal documents | 5: Act-like, regulation-like, case-like, guidance-like, award-like |
| Document versions at three time points | the Act-like document at `2019-07-01`, `2022-07-01`, `2025-07-01`, each with its own node versions and different text |
| Every PRD §6.7 legal status | all 7, including an `ENACTED_NOT_IN_FORCE` regulation effective `2027-01-01` |
| Node hierarchy ≥ 4 levels | `PART → DIVISION → SECTION → SUBSECTION`, with ordinals and headings |
| Legal events | `COMMENCEMENT`, `AMENDMENT`, `REPEAL` — each with evidence and a target version (PRD §15.2) |
| Node relations | 3, including one `MODEL_SUGGESTED` that is evidence for no event (PRD §35.2) |
| Exact identifiers | `SYN2026A00001` (provision), `[2026] SYNFC 7` (neutral citation), `SYNMA000001` (award), and an `employer_abn` |
| `PROHIBITED` licence | the award-like document's source; its chunks are `EXCLUDED_LICENSING` with no vectors |
| Open quarantine item | one, on a `source_artifact` that **no** document version references (PRD §35.3) |
| Non-ASCII text | the `SUBSECTION` node (section sign, em dashes, an accented word), NFC-normalised |

Counts: 4 sources · 5 documents · 9 document versions · 8 nodes · 18 node versions · 3 relations ·
3 events · 36 chunks · **0 embeddings**.

## The placeholders — declared, not disguised

There is **no queryable index in this bundle**. `tantivy/` is not a lexical index and
`vectors.usearch` is not a vector index; both are self-describing placeholder files, and
`vectors.usearch` is deliberately *not* a parseable usearch index so a consumer that tries to open it
fails loudly rather than silently returning no neighbours. Three independent declarations say so, and
a consumer reading the manifest **alone** can tell:

1. `tantivy/INDEX_STATE.json` = `{"state": "PLACEHOLDER", "reason": "synthetic fixture; see
   CRPS-06/Q-CRPS-2", "index_version": null}`, and nothing else lives in that directory;
2. `release-manifest.json` → `versions.index` = `"PLACEHOLDER_NO_INDEX"`;
3. `embedding-manifest.json` → `vector_file.count` = `0`, `model_id` = `"stub:synthetic-fixture"`,
   `runtime.family` = `"stub:runtime"`, `tier_selection.embedded_count` = `0`. `verify_bundle()`
   reports these as `PIN_STUB` findings at `INFO` (that downgrade is what a `SYNTHETIC_FIXTURE`
   release buys — `verify.py:679`).

This is the carried caveat of sub-PRD open question **Q-CRPS-2**, which `CRPS-06` resolves. When
`CRPS-06`'s null lexical-index builder lands with a different placeholder shape, this fixture
converges on **CRPS-06's** form (it is the build-side owner) and CRPS-08 is amended in the same docs
PR.

### Two ticket amendments, raised and landed in the ticket (2026-08-15)

Both are `[machine]`-checkable facts about the merged CRPS-02 contract and this repository's own
guards, not preferences. **Both were written back into the ticket itself before the code was allowed
to differ from it** — `docs/prd/04-corpus-contract/tickets/CRPS-08-signed-synthetic-corpus-fixture-release.md`
(deliverable 3, deliverable 8, and the matching acceptance item, each carrying an
*Amended 2026-08-15* note) and `docs/prd/04-corpus-contract/README.md` **D16** (module version v0.3).
This is CRPS-08's Feedback obligation §1 and CLAUDE.md's rule that the ticket, not the code and not
the plan, is where spec changes: the sentinel below is now what the ticket **says**, not a deviation
from it. What still remains after this branch merges is the mechanical
`publish-tickets.mjs --sync` that re-renders the tracker issue from the amended ticket file — a
tracker write no agent in this pipeline may perform.

1. **`versions.index` cannot be `null`.** The ticket's deliverable 3 and its acceptance item asked
   for `null` before the amendment. `schemas/corpus-manifest/v1/release-manifest.schema.json` makes `versions.index`
   **required** and `$ref`s `pins.schema.json#/$defs/version_string` =
   `{"type": "string", "minLength": 1}`; `verify_bundle()` records a `MANIFEST_SCHEMA_INVALID`
   finding at **BLOCKING** severity, which makes `report.ok` false. The ticket's first acceptance
   item (`verify_bundle()` returns `ok`) and its `versions.index is null` item cannot both hold. The
   sentinel `"PLACEHOLDER_NO_INDEX"` is used instead — unmistakably not a version — and the ticket
   and sub-PRD **D16** now say so. Widening CRPS-02's signed contract was the rejected alternative:
   it reopens a PRD §44.3 serial-owned signed schema to accommodate a fixture.
2. **The deliverable 8 command could not exist as originally written.** `uv run python -m
   corpus_builder.fixtures regenerate` needs an importable `corpus_builder` package. There is none:
   this uv member declares `package = false`, its one package directory is
   `taxrag_pipeline_corpus_builder/`, and `tools/workspace-assertions.mjs::assertSkeleton()` asserts
   each member holds exactly one immediate child directory containing `__init__.py` — so adding
   `fixtures/__init__.py` fails `pnpm test` repository-wide. The script-path form below is used
   instead, matching the precedent at `tests/manifest/fixtures/golden/regenerate.py`, and the
   ticket's deliverable 8 now names that form.

## Regenerating

```bash
uv run python pipelines/corpus-builder/fixtures/generator/cli.py regenerate [--out DIR] [--seed N] [--now]
```

Running this on a clean tree leaves `git status` clean: the bundle is a pure function of
`(seed, key, built_at)`, and without `--now` the build timestamp already recorded in the target's
manifest is reused. That reuse is necessary rather than cosmetic — the signed manifest covers
`build_started_at`, `build_finished_at` and `created_at`, so a fresh clock read changes
`manifest_sha256` and the signature too. `signature.signed_at` is pinned to the same value; that
member is outside the signed canonical bytes by construction (`src/manifest/canonical.py`), so
pinning it makes no claim a verifier checks.

Determinism rests on: seed-derived ids (BLAKE2b, shaped into FND-03's UUIDv7 form — no `uuid4`, no
`random`, no clock), constant timestamps, a fixed insert order, an `UPDATE` that re-pins
`corpus_meta`'s wall-clock stamps, and a closing `VACUUM`. WAL is never enabled — it would change
the file header and leave `-wal`/`-shm` files that `verify_bundle()` reports as
`BUNDLE_FILE_UNLISTED`.

**Recorded build environment:** CPython **3.14.6**, SQLite **3.53.1**, Windows. SQLite's page layout
is what makes the database byte-stable; if a different SQLite build ever produces different bytes,
the determinism test prints both sides' `sqlite3.sqlite_version` and `sys.version`, and the response
is a **ticket writeback**, never a weakened assertion.

## Size and line endings

| File | Bytes |
|---|---|
| `corpus.sqlite` | 286,720 |
| `release-manifest.json` | 5,626 |
| `embedding-manifest.json` | 1,752 |
| `vectors.usearch` | 135 |
| `tantivy/INDEX_STATE.json` | 109 |
| **total** | **294,342** |

Limits (deliverable 5): **≤ 20 MiB total, no single file > 8 MiB**, enforced by
`tests/fixtures/test_fixture_size_limits.py` over `git ls-files` so an untracked local file cannot
mask a violation. If the bundle ever cannot fit, reduce document count and text length — **never**
the coverage rows of deliverable 1 — and amend the ticket.

Text files are LF. `fixtures/.gitattributes` additionally marks `corpus.sqlite` and
`vectors.usearch` as `binary`: their bytes are hashed inside a **signed** manifest, and without that
mark a Windows clone would receive line-ending-rewritten files and every hash would stop matching on
a clean checkout — a failure that does not reproduce on the machine that built the bundle.

## Two things that look like omissions and are not

* **No `corpus_release` row exists in `corpus.sqlite`.** Writing one after signing would change the
  database's bytes and invalidate every hash the manifest recorded; writing it before signing is
  impossible because the row carries the signature. The release identity travels in
  `corpus_meta.release_id` and in the manifest. Do not "fix" this by calling `insert_release_row()`.
* **`chunk_embedding` has no rows.** No embedding pass exists (`CRPS-05` has not landed), and a
  table full of zero vectors would misrepresent the bundle as embedded — which is exactly what
  deliverable 3 exists to prevent.

## Where the model, tokenizer and runtime pins come from

Nowhere real. They are stub pins whose `stub:` markers are the signal; where the contract demands a
64-character hex digest for an artefact that does not exist (`model_artifact.sha256`,
`tokenizer.artifact_sha256`), the fixture records the digest of **empty input**
(`e3b0c442…7852b855`). Do not read those as artefact identities.
