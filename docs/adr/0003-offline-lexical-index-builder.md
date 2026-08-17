# ADR 0003 — Offline lexical index builder

- **Status:** Accepted
- **Owner:** `04-corpus-contract` (`CRPS-06`)
- **Date:** 2026-08-18
- **Resolves:** sub-PRD `docs/prd/04-corpus-contract/README.md` open question **Q-CRPS-2** — how the
  release bundle's `tantivy/` index is produced offline without importing `services/search-rs`.
- **Basis:** PRD §12.2, §18.4, §19.1, §19.3, §44.3, §45.5; breakdown plan **§6.1 risk R6** (module
  cycles), **A9** (per-file ADR ownership by the creating ticket), **§8 Q12** (pinned toolchain),
  **FND-01** (the uv virtual-member dependency gap)

## Context

PRD §18.4 fixes five entries in a release bundle, and `tantivy/` is one of them. PRD §19.3 places
"index build" in the **local** pipeline, and PRD §19.1 forbids production index builds outright. So
the index must be produced by the offline release build — this ticket — and nothing in the PRD names
the mechanism. That gap is **Q-CRPS-2**.

Four constraints bound the choice before any option is compared.

1. **Importing `services/search-rs` is not available.** `11-retrieval-engine` already depends on
   `04-corpus-contract` (it verifies and reads a bundle). An import in the other direction is a
   module cycle, which makes `dag-scan.mjs` exit 1 and `/start-all` refuse to run — breakdown plan
   §6.1 risk **R6**. This is a hard structural constraint, not a preference.
2. **A new Python dependency is not installable in this workspace today.** `pipelines/corpus-builder`
   is a `package = false` uv workspace member, and a dependency declared in its `pyproject.toml` is
   **not installed** into the environment `uv sync --frozen && uv run pytest` builds. That is the
   recorded **FND-01** gap; `pipelines/embeddings/pyproject.toml` documents the same problem for
   `usearch` and `numpy`, which are declared and unimportable. A dependency CI cannot install buys
   nothing and produces a red suite.
3. **The bundle's index contents are opaque to this module.** `CRPS-06` deliverable 3 states it:
   only the directory's presence, its `index_version` and its file hashes are `04`'s business. The
   release manifest hashes `tantivy/` as a directory digest and records `versions.index`; nothing in
   `04` reads a posting list.
4. **The index must be reproducible enough for the release to be checkable.** Two builds of one
   corpus must agree on `artifacts.lexical_index_sha256`, or the determinism acceptance item cannot
   hold.

## Options considered

### (a) A pinned, separately-built search binary invoked as an external command — **chosen**

`04` defines a CLI contract and calls a binary whose path the operator supplies. The binary is built
from `services/search-rs` by `11-retrieval-engine`'s own toolchain, at its own time, and shipped as
a release artifact. No Python dependency, no import, no module edge in the DAG.

- **For.** It is the only option that satisfies constraints 1 and 2 simultaneously. The producer of
  the index and the reader of the index are then literally the same codebase, which is the strongest
  possible answer to the `RETR-01`/`RETR-02` compatibility question below. The seam is a process
  boundary, which is exactly what a "no module edge" requirement means in practice.
- **Against.** The binary is an out-of-band artifact: a build machine without it cannot produce a
  promotable candidate. That is accepted and made explicit rather than hidden — see § CI
  reproducibility.

### (b) A Python Tantivy binding pinned in `pipelines/corpus-builder/pyproject.toml`

- **For.** Self-contained; no external artifact to distribute.
- **Against.** It violates constraint 2 outright: under FND-01 the dependency is declared and not
  installed, so the code path would be unreachable in CI and every test of it would have to be
  skipped. It also introduces a **second** implementation of the index format — the Python binding's
  and the Rust searcher's — whose version compatibility nobody owns. A retrieval engine that cannot
  open an index the release build wrote is a failure mode with no owner, and PRD §44.3 makes the
  corpus contract serial-owned precisely to avoid that class of split.

### (c) Defer index construction to an `11-retrieval-engine` ticket invoked by the release process

- **For.** Puts the index where the index format lives.
- **Against.** It adds a `04 → 11` scheduling edge that module `04` deliberately does not have
  (breakdown plan §5.5/§6.2 would both need a new row), and it does not actually remove the problem:
  whatever `11` writes still has to be invoked from here, which is option (a) with a ticket
  dependency attached. It also blocks `CRPS-06`, `CRPS-07` and `RLSE-11` behind a module that is
  scheduled later.

## Decision

**Option (a).** `src/build/indexes.py` defines the port

```python
class LexicalIndexBuilder(Protocol):
    builder_id: str
    def build(self, corpus_db: Path, out_dir: Path) -> IndexBuildResult: ...
```

and `ExternalLexicalIndexBuilder` implements it over this CLI contract:

```text
<command> --corpus <path to corpus.sqlite> --out <path to the tantivy/ directory>
```

- the command **path is an explicit build input** (`--index-command`), never resolved from `PATH`:
  a release must not silently pick up a different binary from a different machine;
- it is invoked with `shell=False` on a fixed argv, with a bounded timeout;
- a non-zero exit, a timeout, or an unrunnable command raises `IndexBuildFailed`, which the
  assembler converts into a **BLOCKING** gate finding — never a silent empty index;
- the binary prints **one line on stdout: the index version**. That string becomes
  `versions.index` in the release manifest. `04` never invents an index version;
- **the artifact is measured, not taken on trust.** A command that exits `0` and prints a plausible
  version while writing nothing into `--out` has not built an index: the builder raises
  `IndexBuildFailed` when the output directory holds no bytes, and gate 8 independently refuses a
  `CANDIDATE` whose `IndexBuildResult` reports a version with `file_count == 0` or `byte_size == 0`
  (`INDEX_ARTIFACT_EMPTY_ON_CANDIDATE`). The process's own account of itself is not evidence, and the
  port is an extension point — the guarantee has to hold for a builder this module has never seen.

Alongside it, `NullLexicalIndexBuilder` writes a **declared-absent** index —
`tantivy/INDEX_STATE.json` = `{"state": "ABSENT", "reason": …, "index_version": null}` — for
fixtures and development builds. A `CANDIDATE` built with it fails gate 8 with the dedicated
blocking code `INDEX_BUILDER_NULL_ON_CANDIDATE`, so a fixture-grade index can never masquerade as a
promotable release. The check keys on `index_version is None` **as well as** on the builder's
declared `builder_id`, so a future null-equivalent cannot slip through by renaming its class.

Because `release-manifest.schema.json` types `versions.index` as a **non-empty string**, a null index
version travels as the sentinel `"PLACEHOLDER_NO_INDEX"`. A literal `null` would make the bundle fail
its own verification with `MANIFEST_SCHEMA_INVALID`, which reads as corruption rather than as "no
index was built".

## Consequences

### For `RETR-01` / `RETR-02` — what guarantees the index is readable

The index is written by the **same codebase that reads it**, built from `services/search-rs`. That is
the guarantee, and it is stronger than any version-range negotiation between two independent
implementations would be.

The handshake is `versions.index`:

- the builder binary reports it, this module records it verbatim in the release manifest, and it is
  covered by `manifest_sha256` and the detached signature;
- `RETR-01` compares the `versions.index` it supports against the manifest's before opening the
  index, exactly as it already compares `versions.schema` against `corpus_meta.schema_version`. A
  mismatch is a refusal to load, not a best-effort open;
- `RETR-02` inherits the same value through the loaded release.

`artifacts.lexical_index_sha256` is a **directory digest** over `tantivy/` (`manifest/builder.py`),
so a byte-level change to the index is detected by the bundle verifier whether or not the version
string moved.

**Obligation this places on `11-retrieval-engine`:** the binary's CLI contract above, its
`index_version` string, and the set of `versions.index` values `RETR-01` accepts are now a published
interface between two modules. Changing any of them is a cross-module break requiring a ticket
change on both sides, not a refactor.

### For CI reproducibility — and what a CI build of a CANDIDATE does

CI **cannot** build a real lexical index today: the search binary is not built in this repository's
Python test job, and under FND-01 no Python indexing dependency is installable. This is stated rather
than worked around, and the consequences are made mechanical:

- CI, fixtures and development builds use `NullLexicalIndexBuilder`, which declares the index
  **ABSENT**. Nothing pretends an index exists.
- **A CI build of a `CANDIDATE` therefore fails, by design**, with
  `INDEX_BUILDER_NULL_ON_CANDIDATE`. That is the correct outcome: a candidate is a release intended
  for promotion, and one without a real index is not promotable. The whole gate suite still runs and
  reports, so a CI candidate build is a useful *check* while never being a publishable *artifact*.
- A promotable candidate is therefore produced on a machine that has the pinned binary, with
  `--index-command`. `CRPS-07` uploads what that build produces.
- Determinism: two builds of one corpus with one binary must produce byte-identical `tantivy/`
  contents, or `artifacts.lexical_index_sha256` differs between them. `RLSE-11`'s real-scale
  benchmark is the first run that exercises this at size; if the binary proves non-deterministic,
  that is a defect to raise against `11-retrieval-engine`, not a reason to relax the artifact hash.
- `cargo test --workspace` is **not** added to `CRPS-06`'s acceptance list: this ticket touches no
  Rust. The binary is `11-retrieval-engine`'s artifact and is covered by that module's Rust tests.

### Still open

- **The binary's distribution and pinning mechanism** — where the release machine gets it, and how
  its identity is recorded — belongs with `RETR-01`/`RLSE-07` and the release runbook. This ADR fixes
  the interface, not the supply chain.
- **FND-01.** If the uv virtual-member dependency gap is repaired, option (b) becomes *installable*
  but not thereby *preferable*: the two-implementations objection above is independent of it, and
  reopening this decision would need a new ADR.
