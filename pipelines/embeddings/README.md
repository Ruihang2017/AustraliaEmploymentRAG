# `pipelines/embeddings` — the offline embedding build (CRPS-05)

Takes the chunks eligible for dense indexing, embeds them with an explicitly pinned profile, writes
PRD §18.4's `vectors.usearch` plus `chunk_embedding` rows, and emits an `embedding-manifest.json`
that pins the profile, the model artefact, the tokenizer artefact, the model licence and the runtime
exactly enough to reproduce the run and to let a reader decide compatibility.

## This pipeline never runs in production

PRD §19.1: *"Production MUST NOT compile application code, build large indexes or generate mass
embeddings."* PRD §17.3 splits offline document embedding from online query embedding; the online
half is `RETR-05`/`RETR-07` and is not here. PRD §19.3 keeps the whole pipeline local, so there is
**no network access at build time** — no model hub is contacted, and a model is always a local file
path, never an id to be resolved. A session-scoped autouse fixture fails the test suite on any
outbound connection attempt, and a source scan rejects every hub client and hub-id call.

## Running it

```
PYTHONPATH=pipelines/embeddings/src uv run python -m embeddings build \
    --corpus <path/to/corpus.sqlite> \
    --profile <path/to/pinned-profile.json> \
    --runtime-pin <path/to/runtime-pin.json> \
    --out <bundle-dir> \
    --provider {local,stub} \
    [--model-artefact <path> --tokenizer <path>] \
    [--resume] \
    [--tiers TIER_1_FULL_SEMANTIC,TIER_2_LEXICAL_AND_SELECTIVE_SEMANTIC] \
    [--source-release-id <id>]
```

Exit code is non-zero on any blocking condition, with a typed error name on stderr.

> **`PYTHONPATH=` is a deviation from the ticket's literal command.** The root configuration puts
> only the repository root on `sys.path`, and adding this member's `src` to the root
> `pyproject.toml` is `FND-01`'s file-scope, not this ticket's. Recorded as a writeback candidate.

`--out` receives exactly PRD §18.4's three names — `vectors.usearch`, `embedding-manifest.json` and
`embedding-build-report.json` — and nothing else. The build's scratch/resume directory is a
**sibling** of `--out`, so `verify_bundle` cannot report it as an unlisted bundle file.

### `--provider` is required and has no default

There is no fallback anywhere in this package. A missing local model raises `ProviderUnavailable`;
it never degrades to the stub. A stub selected by accident would put unusable vectors into a signed
release, which is the worst failure this pipeline can produce, and `CRPS-06`'s candidate gate can
only reject what the manifest discloses.

* `--provider stub` — `DeterministicStubProvider`, seeded and hash-based. The manifest records
  `model_id: "stub:<seed>"` (which `manifest.is_stub()` recognises), a `runtime.family` prefixed
  `stub:`, and a `model_artifact.format` of `"stub"`. Use it for CI and for `CRPS-08`'s fixtures.
* `--provider local` — a pinned model artefact and `tokenizer.json` read from explicit local paths.
  Both files are hashed and compared with the declared pin **before** anything is loaded; a
  disagreement is `ArtefactPinMismatch` and is blocking. Model *execution* is out of scope for this
  ticket (`RETR-07` owns the runtime, `GOLD-15` owns the weights), so the provider takes an injected
  encoder; without one it raises rather than falling back.

Until `GOLD-15` promotes a model (breakdown plan §8 **Q2**), real builds are **stub-only**. That is
documented, not accidental.

## The `--profile` file

Our own format, not a PRD §44.3 contract — the *manifest* is the contract. Shape:

```json
{
  "profile": {
    "profile_id": "embed-v1",
    "model_id": "vendor/model",
    "model_revision": "<immutable revision, never a mutable tag>",
    "tokenizer_id": "vendor/tokenizer",
    "max_tokens": 512,
    "truncation": "head",
    "dimensions": 768,
    "quantisation": "none",
    "normalisation": "l2",
    "distance_metric": "cosine",
    "batch_size": 64,
    "seed": 20260803
  },
  "model_artifact": { "sha256": "<64 lowercase hex>", "byte_size": 0, "format": "onnx" },
  "licence": {
    "identifier": "<SPDX id or an explicit assessment>",
    "url": null,
    "attribution_required": false,
    "redistribution_permitted": false,
    "notes": null
  },
  "tokenizer_artifact_sha256": "<64 lowercase hex>"
}
```

`profile_fingerprint()` covers the **representation** members only — `profile_id`, `model_id`,
`model_revision`, `tokenizer_id`, `max_tokens`, `truncation`, `dimensions`, `quantisation`,
`normalisation`, `distance_metric`. `batch_size` and `seed` are excluded (neither changes what a
vector *means*), and so are the artefact hashes and the runtime: those are **recorded and verified,
not fingerprinted**, so a differently exported query-side artefact produces a clear
`ModelArtefactMismatch` rather than a confusing fingerprint mismatch.

The fingerprint is not a manifest member — `embedding-manifest.schema.json` is
`additionalProperties: false` and has no slot for it. `profile.fingerprint_of_manifest()`
recomputes it from the manifest instead, which is what keeps compatibility checkable.

## The `--runtime-pin` file, and where it comes from

Breakdown plan §8 **Q11** is a confirmed decision — Microsoft ONNX Runtime, CPU-only, via an exactly
pinned `ort` crate — and it belongs to **`RETR-07`**, which records the pin after its own
compatibility verification. `CRPS-06`'s `BuildRequest` carries it here.

```json
{
  "family": "onnxruntime",
  "version": "1.20.1",
  "execution_providers": ["CPUExecutionProvider"],
  "integration": { "crate": "ort", "version": "<exact patch pin>" },
  "tokenizer_library": { "crate": "tokenizers", "version": "<exact pin>" },
  "pinned_by": "RETR-07"
}
```

**This module never infers any of it.** Not from `os.environ`, not from `importlib.metadata`, not
from an installed package's version, and not from `Cargo.toml`, `Cargo.lock` or `uv.lock` — a source
scan asserts all of that statically. A missing or empty member is `MissingRuntimePin`, naming the
field. The single value this pipeline ever derives is the `stub:` prefix on `runtime.family` when
the provider is a stub, and that can only make a pin more obviously a stub.

## Resume

`--resume` skips a chunk that already has a `chunk_embedding` row for the same `profile_id` **and**
whose `search_chunk.text_hash` is unchanged. A changed hash deletes the stale row and re-embeds
exactly that chunk. A row with no recorded hash is re-embedded — the conservative direction, and the
only one available: `chunk_embedding` carries the PRD §35.3 five columns and may not gain a sixth
(sub-PRD D14), so the hash lives in the sibling work directory's resume state.

A resumed run publishes the **same** index an uninterrupted one would: vectors computed before the
interruption are staged in the work directory and fed to the index in canonical order at the end.

## What ends up where

| Fact | Where it lives | Why |
|---|---|---|
| `search_chunk_id`, `profile_id`, `vector_key`, `dimensions`, `quantisation` | `chunk_embedding` | PRD §35.3, exactly five columns |
| model artefact, licence, tokenizer artefact, runtime pins | `embedding-manifest.json` | sub-PRD D14 — pins never enter a corpus column |
| peak RSS, throughput, elapsed time, `resumed_from`, the fingerprint | `embedding-build-report.json` | measurements, and the manifest schema is `additionalProperties: false` |

`embedding-build-report.json` is **measurement**, feeding breakdown plan §8 **Q3** (`RLSE-11`'s
deferred hot-dense coverage) and **Q5** (`GOLD-16`'s deferred corpus statistics). It is never
written back into the PRD's planning hypotheses, and this pipeline never caps tier coverage on the
strength of it — a reduction decision is `RLSE-11`'s, under the settled Q3 policy.

`peak_rss_bytes` is always bytes; `peak_rss_source` names the mechanism
(`getrusage.ru_maxrss(kib|bytes)` on POSIX, `kernel32.PeakWorkingSetSize` on Windows, or a
`tracemalloc` fallback that is an undercount and says so).

## Which tiers are embedded

`CRPS-04`'s `is_eligible_for_dense()` is the single definition; this module never re-spells the
eligible set. The **default is Tier 1 only**, because PRD §17.2 makes Tier 2 *selective/on-demand* —
defaulting to everything eligible would embed the whole long tail. Requesting Tier 3,
`EXCLUDED_LICENSING` or `QUARANTINED_QUALITY` is refused with `IneligibleTierRequested`, so they are
unreachable by request as well as by default. A `search_chunk` with `index_tier IS NULL` raises
`UntieredChunk`: NULL means the tiering pass has not run, not "ineligible", and tiering fails closed.

## Known dependency gap — owned by `FND-01`/`FND-02`, not by this module

`usearch==2.26.0` and `numpy==2.5.2` are declared in this member's `pyproject.toml` and present in
the root `uv.lock`, but **`uv sync --frozen` installs neither**: the root project is a *virtual*
project (`[tool.uv] package = false`) with empty `dependencies`, and a virtual workspace member's
dependencies are installed only if something depends on the member. Nothing does. The fix is in the
root `pyproject.toml` / CI workflow, which are `FND-01`/`FND-02`'s file-scope.

Consequences, all deliberate:

* `usearch` and `numpy` are imported **lazily, inside `vectors.py` only**, behind the
  `VectorIndexWriter` port. Every other module is stdlib-only, with vectors carried as
  `array.array("f")` — IEEE-754 binary32, so byte-equality reasoning is unaffected.
* Absent backend → `VectorBackendUnavailable`, a typed blocking error naming `FND-01`. Never a
  silent degradation, and never a second vector format.
* The byte-level `vectors.usearch` assertions skip with a message naming `FND-01`. Everything they
  would otherwise hide is covered dependency-free by the `RecordingWriter` fake, so no acceptance
  criterion is unproven — only its final byte-level assertion is deferred.

`threads=1` at every USearch `add()` call site is a **correctness requirement**: multi-threaded HNSW
insertion is byte-non-deterministic, which would break reproducibility of a signed artifact. A
source scan asserts the literal unconditionally, including where the backend is absent.

## Tests

```
uv run pytest pipelines/embeddings/tests -q
```

Run the whole suite from the repository root at least once before believing it: pytest imports test
modules by bare basename here, so a collision only shows up in a full run.
