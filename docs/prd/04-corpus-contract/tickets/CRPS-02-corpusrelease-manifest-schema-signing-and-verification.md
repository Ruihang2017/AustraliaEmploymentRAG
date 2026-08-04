---
id: CRPS-02
title: CorpusRelease manifest schema, signing and verification
module: 04-corpus-contract
lane: 04-corpus-contract
size: M
agent: builder
status: draft
date: 2026-08-03
blocked_by: [CRPS-01]
blocks: [CRPS-06, CRPS-08, GOLD-01]
---

# CRPS-02 — CorpusRelease manifest schema, signing and verification

Implements PRD §18.4, §35.3, §44.3 — requirement ID `ADM-002`, epic `E07-CORPUS-SCHEMA`.
No ADR — the decision is already made in PRD §18.4 (the bundle layout and the manifest's required
fields) and §44.3 (the manifest is serial-owned); this is build ticket 2 of 8 against it. The
manifest's model/tokenizer/runtime pinning members are likewise already decided, by breakdown plan §8
**Q11** (confirmed architecture decision); this ticket implements the *fields*, never the values. The
one genuinely undecided sub-question — the signing scheme and key custody — is raised as sub-PRD open
question **Q-CRPS-3** and recorded by this ticket in an ADR, not invented in code.
Parent sub-PRD: [04-corpus-contract README](../README.md). Master spec: [PRD](../../../PRD.md).
Depends on: [CRPS-01 — corpus.sqlite schema + intermediate normalised-record contract](CRPS-01-corpus-sqlite-schema-and-intermediate-normalised-record-contract.md) (mirrors `blocked_by`).
**Why `builder`:** a bounded change inside one module's declared file-scope against a fixed contract
(PRD §18.4 enumerates the manifest's required fields, and breakdown plan §8 Q11 enumerates the pinning
fields) — not a new subsystem decision.

## Background + basis

**The bundle layout is fixed.** PRD §18.4:

```text
corpus-release-{id}/
├── corpus.sqlite
├── tantivy/
├── vectors.usearch
├── embedding-manifest.json
└── release-manifest.json
```

**The manifest's contents are fixed.** PRD §18.4: *"The manifest MUST include parent release,
schema/parser/chunker/embedding/index versions, artifact hashes, counts, coverage, quarantine
summary, evaluation results, file hashes/sizes, build time and app/search compatibility."*

**The manifest is also where the local model, tokenizer and runtime are pinned.** Breakdown plan §8
**Q11** is a *confirmed architecture decision* and states, as rules rather than preferences:
*"Models, tokenizers and runtime metadata are pinned in the corpus/retrieval manifest"* and *"Model
artefacts must carry an immutable revision identifier, hash, dimensions, normalisation, truncation and
licence information"*, with *"Rust integration through the `ort` crate at an exact pinned,
compatibility-verified version"* and *"Tokenization through the Hugging Face `tokenizers` Rust crate
at an exact pinned version, with a local `tokenizer.json` pinned by the release."* `RETR-07`
(`11-retrieval-engine`) is the confirmed owner of the runtime, and its loader may only **consume and
verify** those values — it is explicitly forbidden to invent a local default for anything the release
is supposed to pin. The manifest is `schemas/corpus-manifest/**`, which is PRD §44.3 serial-owned
**here**. Therefore this ticket carries the members that make Q11's pinning requirement satisfiable
(deliverables 1, 2, 12, 13), and sub-PRD decisions **D14**/**D15** record the boundary: the manifest
pins artefact *identity*, it does not add model weight files to PRD §18.4's fixed bundle layout.

**Signing and verification are fixed in shape, not in algorithm.** PRD §18.4: *"Build/sign/upload
occurs offline. Production verifies signature, compatibility, disk, hashes, read-only database/index
integrity and smoke queries. Promotion uses a shadow process where memory permits, then an atomic
active-pointer switch. Active data MUST never be rebuilt or mutated in place. Old releases cannot be
removed while jobs remain pinned."* PRD §21 adds the trust rule: *"Trust application/corpus artifacts
only after signature/hash/compatibility verification."*

**Immutability after signing is a data-dictionary constraint.** PRD §35.3, `corpus_release`:
required columns *"`id`, `parent_id`, `status`, `created_at`, `manifest_sha256`, `signature`,
`schema_version`, `parser_version`, `embedding_profile`, counts/coverage/evaluation JSON"* with the
constraint *"only one active pointer outside bundle; immutable after signing."*

**Serial ownership.** PRD §44.3: *"Serial owners are required for root lockfiles, canonical enums,
OpenAPI root, app migration order, corpus schema/manifest, active release/promotion files and
production Compose/deployment configuration."* Breakdown plan §4.1 names `CRPS-01` + `CRPS-02` as the
owners of "Corpus schema + release manifest" (`pipelines/corpus-builder/schema/**`,
`schemas/corpus-manifest/**`), and §4.2 records that the manifest schema was pulled into module `04`
rather than shared with `11-retrieval-engine` and `18-ops-release` (the promotion verifier), which
read it.

**No production signing key reaches a coding agent.** PRD §20.2: *"Coding agents MUST NOT receive
production SSH, database, backup, signing or provider credentials by default."* PRD §39.6 puts
runtime secrets in configuration, not the repository. Therefore this ticket ships a **development**
keypair as a test fixture and loads any real key from an explicit path/environment variable.

**Downstream consumers (why the field list is load-bearing).** `CRPS-06` populates the manifest and
gates on it; `CRPS-08` signs a synthetic fixture with it; `RETR-01` (`11-retrieval-engine`) verifies
it before loading a bundle; `RETR-05`/`RETR-07` read the embedding profile and the model/tokenizer/
runtime pins out of it and refuse on any mismatch; `RLSE-07` (`18-ops-release`) verifies it again on
the production host before promotion; `GOLD-01` (`21-evaluation-600`) pins evaluation cases to the
release and schema versions it declares. This ticket is `blocks: [CRPS-06, CRPS-08, GOLD-01]`.

**Carried caveat (accepted for the MVP):** the *values* of `embedding_profile`, of the model and
tokenizer pins, and of the evaluation thresholds are benchmark-selected (PRD §1, §14.4; plan §8
**Q2**, status **benchmark-selected**, evidenced by `CRPS-05` + `RETR-10` and frozen by `GOLD-15`).
The *runtime* values are supplied to the build as explicit inputs recorded by `RETR-07` under the
confirmed **Q11** decision. **Q11 does not settle Q2** — Q11 fixes what executes a model, Q2 selects
which model executes. This ticket fixes the fields and their validation, and never writes a chosen
model, dimension, tokenizer setting or version number of its own.

## Goal

Produce the versioned JSON contract root for the CorpusRelease bundle under
`schemas/corpus-manifest/**` — a `release-manifest.schema.json` carrying every PRD §18.4 field plus
the breakdown plan §8 Q11 pinning members, plus an `embedding-manifest.schema.json` for the bundle's
second manifest — together with a Python manifest builder, a deterministic canonical serialiser, a
detached signer and a `verify_bundle()` function that returns structured findings for signature, hash,
size, compatibility, pinning-completeness and schema checks. Completion is mechanically checkable:
`uv run pytest pipelines/corpus-builder/tests/manifest` is green, a manifest missing any PRD §18.4 or
Q11 field fails schema validation, a one-byte mutation anywhere in the bundle or the manifest makes
`verify_bundle()` fail, and canonicalisation is byte-stable across two runs and across dict insertion
orders.

## Non-goals

- **No bundle assembly, no index build, no validation gates** — `CRPS-06`
  (`src/{build,validation}/**`). This ticket provides the manifest *type* and the verifier; `CRPS-06`
  is the only caller that fills it from a real build.
- **No upload** — `CRPS-07` (`src/publish/**`).
- **No production verification, shadow process, active-pointer switch or rollback** — `RLSE-07`
  (`18-ops-release`, `infra/deploy/corpus/**`). PRD §18.4 places those on the production host.
- **No embedding computation and no embedding-manifest *instance*** — `CRPS-05`
  (`pipelines/embeddings/**`). This ticket owns the embedding manifest's **schema** only, because
  `schemas/corpus-manifest/**` is serial-owned here and `CRPS-05` is not `blocked_by` this ticket
  (breakdown plan §5.5) — the two are reconciled in `CRPS-06`, which is blocked by both.
- **No model, tokenizer or runtime selection, loading, execution or version choice** — the models are
  plan §8 **Q2** (benchmark-selected, `GOLD-15`), and the runtime is plan §8 **Q11** (confirmed,
  `RETR-07`, which records the exact `ort` patch pin after its own compatibility smoke test). This
  ticket defines the members that record those values and the checks that they are present, internally
  consistent and not a stub on a candidate. It writes no value.
- **No corpus DDL change** — `CRPS-01` owns `pipelines/corpus-builder/schema/**`. The
  `corpus_release` table already exists from `CRPS-01`; this ticket writes rows into it through the
  builder API, it does not alter it. In particular the Q11 pins live here, never in a corpus column
  (sub-PRD D14).
- **No canonical enum definitions** — `FND-03` (`00-foundation`). PRD §35.1 applies to SQLite checked
  text values; manifest-only vocabularies (see deliverable 4) are defined in the manifest schema
  itself unless `packages/contracts` already publishes them, in which case the contracts value wins.
- **No production key material, no key-management service integration** — PRD §20.2. Key custody is
  the Founder's decision (sub-PRD Q-CRPS-3). **This key is not the breakdown plan §8 Q6 blind-gold
  key**: Q6's confirmed `SealedBox` custody rules govern `evals/gold/**` and `EVAL_BLIND_KEY_FILE` and
  answer nothing about release signing. Never reuse one key for the other purpose.

## File-scope (write-owns)

- `schemas/corpus-manifest/**` — the versioned JSON contract root (schemas + a `README.md`).
- `pipelines/corpus-builder/src/manifest/**` — builder, canonicaliser, signer, verifier.
- `pipelines/corpus-builder/tests/manifest/**` — tests plus the development keypair fixture.
- Module-shared, append-only (breakdown plan §1.1): `pipelines/corpus-builder/pyproject.toml`
  (dependencies only; regenerate the root `uv.lock` as a build artifact, never hand-merge).
- Conditionally, per breakdown plan A9 (`docs/adr/**` is shared-additive with per-file ownership,
  claimed by the creating ticket): `docs/adr/NNNN-corpus-release-signing.md`, if and only if this
  ticket records the signing decision as an ADR (see deliverable 8).

Does not touch:

- `pipelines/corpus-builder/schema/**`, `src/contracts/**` — `CRPS-01`.
- `src/chunking/**` — `CRPS-03`. `src/tiering/**` — `CRPS-04`. `pipelines/embeddings/**` — `CRPS-05`.
  `src/{build,validation}/**` — `CRPS-06`. `src/publish/**` — `CRPS-07`. `fixtures/**` — `CRPS-08`.
- `schemas/{openapi,events}/**`, `packages/contracts/**` — `00-foundation`.
  `schemas/evaluation/**`, `evals/**` — `21-evaluation-600`.
- `infra/deploy/**` (including `infra/deploy/corpus/**`) — `18-ops-release`.
  `services/search-rs/**` — `11-retrieval-engine`. `tests/**` — `23-assurance`.
  `docs/PRD.md` — frozen (breakdown plan §4).

**Serial-safety analysis.** First decomposition: nothing merged, no in-flight contention
(breakdown plan §1 header). `schemas/corpus-manifest/**` does not exist yet; `FND-01` creates only
the workspace-member skeleton. Concurrent siblings in this module's wave 2 are `CRPS-03`
(`src/chunking/**`) and `CRPS-04` (`src/tiering/**`) — disjoint from `src/manifest/**` and from
`schemas/**`. `CRPS-01` (this ticket's blocker) owns `pipelines/corpus-builder/schema/**`, a
different tree from the repository-root `schemas/corpus-manifest/**`.

**PRD §44.3 serial-owned artifact.** `schemas/corpus-manifest/**` is the "release manifest" half of
the serial-owned "corpus schema/manifest" pair (breakdown plan §4.1). **`04-corpus-contract` is the
sole owner; no other module may write it** — `11-retrieval-engine` and `18-ops-release` read it and
take `blocked_by` edges (`CRPS-08 → RETR-01`, `CRPS-07 → RLSE-07`). A module that needs a member here
— including any value the confirmed Q11 loader must verify — raises a ticket change against **this**
ticket rather than writing the schema or inventing a local default.

## Deliverables

1. `schemas/corpus-manifest/v1/release-manifest.schema.json` — JSON Schema (draft 2020-12),
   `additionalProperties: false`, `$id` ending `/v1/release-manifest.schema.json`, with these required
   members (every PRD §18.4 item mapped explicitly, plus the breakdown plan §8 Q11 pinning members):

   | Member | Type | PRD §18.4 phrase (or register entry) it satisfies |
   |---|---|---|
   | `manifest_version` | semver string | contract versioning (PRD §45.4) |
   | `release_id` | string | bundle identity (`corpus_release.id`, §35.3) |
   | `release_kind` | enum `CANDIDATE \| PUBLISHED \| SYNTHETIC_FIXTURE` | see deliverable 4 |
   | `parent_release_id` | string \| null | "parent release" |
   | `created_at`, `build_started_at`, `build_finished_at` | UTC ISO-8601 | "build time" |
   | `versions` | object `{schema, parser, chunker, embedding, index, builder, contract}` | "schema/parser/chunker/embedding/index versions" |
   | `compatibility` | object `{app: {min, max}, search: {min, max}, corpus_schema: string}` | "app/search compatibility" |
   | `files` | array of `{path, sha256, byte_size}` covering every file in the bundle | "file hashes/sizes" |
   | `artifacts` | object `{corpus_sqlite_sha256, lexical_index_sha256, vector_index_sha256, embedding_manifest_sha256}` | "artifact hashes" |
   | `counts` | object `{sources, documents, document_versions, nodes, node_versions, relations, events, chunks, embeddings}` | "counts" |
   | `coverage` | array of `{source_group_id, coverage_status, freshness_status, document_count, earliest_effective_from, latest_effective_from, last_ingestion_at}` | "coverage" |
   | `quarantine` | object `{open_count, resolved_count, by_reason_code: {…}}` | "quarantine summary" |
   | `evaluation` | object `{status, report_id \| null, ran_at \| null, metrics: {…}, gates: [{name, threshold, observed, passed}]}` | "evaluation results" |
   | `embedding_profile` | object `{profile_id, model_id, dimensions, quantisation}` | `corpus_release.embedding_profile` (§35.3) |
   | `local_models` | array of the **model pin** object in deliverable 12, one entry per role the release pins | breakdown plan §8 **Q11**: "Models, tokenizers and runtime metadata are pinned in the corpus/retrieval manifest"; "Model artefacts must carry an immutable revision identifier, hash, dimensions, normalisation, truncation and licence information" |
   | `runtime` | the **runtime pin** object in deliverable 12 | breakdown plan §8 **Q11**: runtime family and version, CPU-only execution providers, the exact pinned `ort` crate version, the exact pinned `tokenizers` crate version |
   | `signature` | object `{algorithm, key_id, value, signed_at}` \| null | "Production verifies signature" |
   | `manifest_sha256` | string | `corpus_release.manifest_sha256` (§35.3) |

   The schema carries a `description` on each member quoting the PRD phrase or register entry above,
   so a reader of the schema alone knows why the field exists.
2. `schemas/corpus-manifest/v1/embedding-manifest.schema.json` — the bundle's second manifest
   (PRD §18.4 lists `embedding-manifest.json`). Required members: `manifest_version`, `profile_id`,
   `model_id`, `model_revision`, `model_artifact` (`{sha256, byte_size, format}`),
   `licence` (`{identifier, url, attribution_required, redistribution_permitted, notes}`),
   `tokenizer` (`{id, artifact_sha256, max_tokens, truncation}`), `dimensions`,
   `quantisation`, `normalisation`, `distance_metric`, `runtime` (the deliverable 12 runtime pin),
   `built_at`, `builder_version`, `input_contract_version`, `tier_selection` (`{tiers: [...],
   chunk_count, embedded_count, skipped_count}`), `vector_file` (`{path, sha256, byte_size, count}`),
   `determinism` (`{seed, deterministic: bool}`), `source_release_id \| null`. Basis: PRD §17.2 tiers,
   §17.3 "Offline/local: document embeddings", §35.3 `chunk_embedding` columns
   (`profile_id`, `dimensions`, `quantisation`), §14.4 "Embedding changes require a dual index,
   retrieval recall/resource comparison and pointer rollback", and breakdown plan §8 **Q11** for
   `model_revision`, `model_artifact`, `licence`, the tokenizer artefact identity and `runtime`.
   `CRPS-05` emits the instance; this member list and `CRPS-05`'s deliverable 4 list must remain
   identical — on divergence the schema wins and the divergence is a writeback (see Feedback
   obligation). Consumers that transcribe this list (`RETR-05` deliverable 1, `RETR-07`) update their
   transcription through their own module's ticket; they never edit this schema.
3. `schemas/corpus-manifest/README.md` — how to validate a bundle manifest with a generic JSON-Schema
   validator, and the versioning rule of deliverable 9. One page; assumes no corpus-builder code.
4. `release_kind` (manifest-only vocabulary, defined in the schema): `CANDIDATE` — built by `CRPS-06`,
   not yet published; `PUBLISHED` — staged to R2 by `CRPS-07`; `SYNTHETIC_FIXTURE` — generated test
   data (`CRPS-08`). Rationale: PRD §12.2 requires failed/candidate material to be unable to touch
   active data, and breakdown plan A4 requires a *signed* synthetic release for `RETR-01`; without an
   explicit marker a fixture bundle is byte-indistinguishable from a promotable release. `verify_bundle()`
   returns the kind so that promotion tooling (`RLSE-07`) can refuse `SYNTHETIC_FIXTURE`. This is a
   manifest field, not a `corpus_release.status` enum value — the SQLite enum stays `FND-03`'s.
5. `src/manifest/model.py` — `ReleaseManifest` and `EmbeddingManifest` dataclasses mirroring the two
   schemas, with `from_dict`/`to_dict`, and `MANIFEST_VERSION: str`.
6. `src/manifest/canonical.py::canonical_bytes(manifest: Mapping) -> bytes` — deterministic
   serialisation used for hashing and signing: UTF-8, RFC 8785-style JSON canonicalisation (keys
   sorted lexicographically by code point, no insignificant whitespace, shortest round-trip number
   form), with the `signature` and `manifest_sha256` members **excluded** from the canonical form.
   `manifest_sha256` is the lowercase hex SHA-256 of `canonical_bytes(...)`, and the signature is
   computed over the same bytes. Ordering constraint: build → canonicalise → hash → sign → write; a
   manifest is never mutated after `manifest_sha256` is set.
7. `src/manifest/builder.py::build_release_manifest(...) -> ReleaseManifest` — assembles a manifest
   from explicit inputs (bundle directory, counts, coverage rows, quarantine summary, evaluation
   report or `None`, version strings, compatibility ranges, the model pins and runtime pin of
   deliverable 12); computes `files[]` by walking the bundle directory in sorted order and hashing each
   file in streaming 1 MiB blocks; refuses to build if any PRD §18.4 or deliverable 12 required input
   is missing (raising `ManifestIncomplete` naming the missing field). Every pin is an **explicit
   argument**: nothing is read from the environment, inferred from an installed package, or defaulted.
8. `src/manifest/signing.py`:
   - `sign_manifest(manifest, *, private_key_path: Path, key_id: str) -> ReleaseManifest` — detached
     signature over `canonical_bytes`; default scheme **Ed25519**; writes
     `signature = {algorithm, key_id, value (base64), signed_at}`.
   - `verify_signature(manifest, *, public_keys: Mapping[str, bytes]) -> Finding[]`.
   - Keys are loaded from a filesystem path or environment variable only — never from a committed
     file except the development fixture keypair under `tests/manifest/fixtures/keys/**`, whose
     `key_id` MUST start with `dev-` so a development key is identifiable in any manifest.
   - **The chosen scheme is recorded in `docs/adr/NNNN-corpus-release-signing.md`** (sub-PRD Q-CRPS-3;
     breakdown plan A9 gives per-file ADR ownership to the creating ticket). Any deviation from
     Ed25519 must be recorded there *before* implementation, with the reason and the compatibility
     consequence for `RETR-01`/`RLSE-07`.
9. **Versioning rule.** `manifest_version` is semver; the schema directory is `v<major>`. Adding an
   optional member is a minor bump in place; removing/renaming a member or tightening a type is a
   major bump into a new `schemas/corpus-manifest/v<N>/` directory, and the verifier accepts the
   current and immediately previous major. Basis: PRD §45.4 "Changes to an immutable/public contract
   include regenerated bindings and compatibility tests."
10. `src/manifest/verify.py::verify_bundle(bundle_dir: Path, *, public_keys, expected: Compatibility |
    None = None) -> VerificationReport` — the single entry point used by `CRPS-06`, `CRPS-08`, and
    read by `RETR-01`/`RLSE-07`. It performs, in this order, and **collects all findings rather than
    stopping at the first** (so an operator sees the whole picture):
    1. manifest present, parses, validates against the schema for its `manifest_version`;
    2. `manifest_sha256` matches `canonical_bytes`;
    3. signature verifies against a known `key_id`;
    4. every PRD §18.4 bundle path exists and appears in `files[]`, and `files[]` contains no path
       missing from the bundle (both directions);
    5. every file's sha256 and byte_size match;
    6. `artifacts.*` hashes agree with the corresponding `files[]` entries;
    7. `versions.schema` equals the `corpus_meta.schema_version` inside `corpus.sqlite` (via
       `CRPS-01`'s `open_corpus_database(read_only=True)`);
    8. compatibility ranges satisfy `expected` when supplied;
    9. **pinning checks (deliverable 13)**: `runtime` and `local_models[]` are present and complete for
       the manifest's `release_kind`; every `local_models[]` entry carries every deliverable 12 member;
       the `DOCUMENT_EMBEDDING` entry agrees member-for-member with `embedding-manifest.json`'s
       profile, artefact, tokenizer, licence and `runtime` values; and where a `QUERY_EMBEDDING` entry
       exists, its representation members (`dimensions`, `normalisation`, `truncation`, `max_tokens`
       and tokenizer identity) equal the `DOCUMENT_EMBEDDING` entry's — a query vector that cannot
       match the indexed vectors is a release defect, not a runtime surprise (PRD §14.4;
       `CRPS-05` deliverable 6).
    Each finding is `{code, severity: BLOCKING|WARNING, message, subject}`; `report.ok` is true only
    when there is no `BLOCKING` finding. `verify_bundle()` never writes to the bundle.
11. `src/manifest/persist.py::insert_release_row(conn, manifest) -> None` — writes the
    `corpus_release` row defined by `CRPS-01` (`id`, `parent_id`, `status`, `created_at`,
    `manifest_sha256`, `signature`, `schema_version`, `parser_version`, `embedding_profile`, counts/
    coverage/evaluation JSON). Refuses to write a row whose `signature` is null when
    `release_kind != CANDIDATE`, and never updates an existing signed row (the `CRPS-01` trigger also
    enforces this — the check exists to fail with a readable error before hitting the trigger).
12. **The model pin and runtime pin objects** (`src/manifest/model.py` dataclasses + JSON Schema
    definitions shared by both manifests via `$ref`). These exist because breakdown plan §8 **Q11**
    requires the release to pin them and `RETR-07` to verify them; every member below is a **field**,
    and this ticket fixes no value for any of them.
    - `ModelPin`:

      | Member | Type | Why it exists |
      |---|---|---|
      | `role` | enum `DOCUMENT_EMBEDDING \| QUERY_EMBEDDING \| RERANK` | Q11 puts query embedding and local cross-encoder rerank behind the same controlled local-model boundary; one entry per role the release pins |
      | `model_id` | string | identity of the model (value is Q2) |
      | `model_revision` | string | Q11 "immutable revision identifier" — a mutable tag is not acceptable |
      | `model_artifact` | object `{sha256, byte_size, format}` | Q11 "hash"; `format` records the artefact encoding so a loader can refuse an artefact it cannot execute |
      | `dimensions` | integer \| null | Q11 "dimensions"; `null` only for a role with no vector output (`RERANK`) |
      | `normalisation` | string | Q11 "normalisation" |
      | `truncation` | string | Q11 "truncation" |
      | `max_tokens` | integer | the truncation policy is meaningless without the limit it applies at |
      | `tokenizer` | object `{id, artifact_sha256, max_tokens, truncation}` | Q11 "Tokenization through the Hugging Face `tokenizers` Rust crate … with a local `tokenizer.json` pinned by the release" — the artefact hash is what makes "pinned by the release" checkable |
      | `licence` | object `{identifier, url \| null, attribution_required, redistribution_permitted, notes \| null}` | Q11 "licence information"; PRD §11.1's conservative default applies to weights as it does to sources |
      | `bundle_path` | string \| null | set **only** when the artefact is genuinely a file inside the bundle (and therefore also in `files[]`); `null` when it is delivered to the host by configured local path. Sub-PRD **D15**: the manifest pins identity, and adding a model file to PRD §18.4's fixed layout is a plan/PRD writeback, not a ticket change |

    - `RuntimePin`:

      | Member | Type | Why it exists |
      |---|---|---|
      | `family` | string | Q11 "Runtime family" — recorded, never inferred from what happens to be installed |
      | `version` | string | the exact runtime version the release was verified against |
      | `execution_providers` | array of string | Q11 "CPU-only"; a manifest that pins a GPU provider is visibly wrong on a PRD §19.1 host |
      | `integration` | object `{crate, version}` | Q11 "Rust integration through the `ort` crate at an exact pinned, compatibility-verified version" — `RETR-07` records the patch version it verified, and this is where the release states it |
      | `tokenizer_library` | object `{crate, version}` | Q11 "Tokenization through the Hugging Face `tokenizers` Rust crate at an exact pinned version" |
      | `pinned_by` | string | provenance of the pin itself — the identifier of the verification record the values came from, so a reader can trace a pin to the compatibility test that produced it |

    **Values are inputs, never inference.** `build_release_manifest()` receives both objects from its
    caller (`CRPS-06`'s `BuildRequest`). This ticket must not read an installed runtime, resolve a
    crate version from a lockfile, or default any member; a missing input is `ManifestIncomplete`.
13. **Pinning completeness is `release_kind`-sensitive, and a stub is never silently promotable.** The
    schema requires the members for every kind, so a manifest is always self-describing; the *verifier*
    applies the severity:
    - `release_kind: CANDIDATE` or `PUBLISHED` — a missing member, a member whose value is marked as a
      stub or placeholder (the `stub:` `model_id` convention of `CRPS-05` deliverable 2, or a
      `runtime.family` recorded as a stub), or a `DOCUMENT_EMBEDDING`/embedding-manifest disagreement
      is **BLOCKING**. Basis: PRD §12.2 (a candidate must pass its checks), PRD §14.4 (the actual model
      must be recorded), and the same "a fixture may never masquerade as a promotable release" rule
      `CRPS-06` deliverable 3 applies to the null lexical index builder.
    - `release_kind: SYNTHETIC_FIXTURE` — stub pins are permitted and reported as an `INFO` finding
      naming the stub, so a consumer can tell from the manifest alone (breakdown plan A4; `CRPS-08`
      deliverable 3).

## Acceptance checklist (classified)

- [ ] `[machine]` A manifest missing any one of the PRD §18.4 required members fails schema
      validation, asserted by a parametrised test that deletes each required member in turn.
      (PRD §18.4; `ADM-002`)
- [ ] `[machine]` A manifest missing `runtime` or `local_models`, and a `local_models[]` entry missing
      any one of `model_revision`, `model_artifact.sha256`, `dimensions`, `normalisation`,
      `truncation`, `tokenizer.artifact_sha256` or `licence`, fail schema validation — one case per
      member. (Breakdown plan §8 **Q11**; deliverable 12)
- [ ] `[machine]` `canonical_bytes()` is byte-identical for two dicts with different key insertion
      order and for two consecutive runs in separate processes; `manifest_sha256` is stable across
      both. (Deliverable 6)
- [ ] `[machine]` A one-byte change to `corpus.sqlite`, to any bundle file, or to any manifest member
      makes `verify_bundle()` return a `BLOCKING` finding — one test per mutation site.
      (PRD §18.4 "Production verifies signature, compatibility, disk, hashes"; `ADM-002`)
- [ ] `[machine]` A manifest signed with a key whose `key_id` is unknown to the verifier fails with a
      distinct finding code from a *tampered* signature. (PRD §21 trust rule)
- [ ] `[machine]` `verify_bundle()` reports **all** findings for a bundle with three independent
      defects, not just the first. (Deliverable 10)
- [ ] `[machine]` A bundle whose `files[]` omits a file present on disk, and a bundle whose `files[]`
      lists a file absent from disk, both fail. (Deliverable 10 step 4)
- [ ] `[machine]` `versions.schema` mismatch against `corpus_meta.schema_version` fails.
      (PRD §42.1 "Readiness fails during incompatible app/corpus/schema state")
- [ ] `[machine]` Pinning agreement: a `DOCUMENT_EMBEDDING` pin that disagrees with
      `embedding-manifest.json` on any of model id, revision, artefact hash, tokenizer identity,
      dimensions, normalisation, truncation, licence or `runtime` is BLOCKING; and a `QUERY_EMBEDDING`
      pin whose representation members differ from `DOCUMENT_EMBEDDING`'s is BLOCKING — one test per
      differing member. (Deliverable 10 step 9; PRD §14.4)
- [ ] `[machine]` `release_kind` sensitivity: a stub-marked model or runtime pin is BLOCKING for
      `CANDIDATE`/`PUBLISHED` and an `INFO` finding for `SYNTHETIC_FIXTURE`, asserted both ways.
      (Deliverable 13)
- [ ] `[machine]` `build_release_manifest()` raises `ManifestIncomplete` naming the field when a pin
      input is absent, and no code path reads a runtime or crate version from the environment, an
      installed package or a lockfile — asserted by a source scan over `src/manifest/**`.
      (Deliverable 12; breakdown plan §8 Q11 "never a locally invented default")
- [ ] `[machine]` `insert_release_row()` cannot update an existing signed `corpus_release` row (the
      attempt raises), and refuses a null signature for a non-`CANDIDATE` kind.
      (PRD §35.3 "immutable after signing"; §35.8 invariant 8)
- [ ] `[machine]` `verify_bundle()` surfaces `release_kind`, and a `SYNTHETIC_FIXTURE` manifest is
      distinguishable from a `PUBLISHED` one without parsing prose. (Deliverable 4; breakdown plan A4)
- [ ] `[machine]` The committed development keypair's `key_id` starts with `dev-`, and no private key
      material exists anywhere outside `tests/manifest/fixtures/keys/**` — asserted by a repository
      scan test over the module's file-scope. (PRD §20.2)
- [ ] `[machine]` No model weight file is added to the bundle by this ticket: a test asserts the PRD
      §18.4 path set is exactly the five documented entries and that a `ModelPin.bundle_path` of `null`
      is accepted. (Sub-PRD D15; PRD §18.4)
- [ ] `[fixture]` A hand-written golden manifest fixture (`tests/manifest/fixtures/golden/`)
      validates, verifies and reproduces its recorded `manifest_sha256` — this fixture is the
      cross-module reference `RETR-01` and `RLSE-07` can copy. (Breakdown plan §4.2)
- [ ] `[machine]` `uv run pytest` green (Python; PRD §45.3).
- [ ] `[machine]` `pnpm test` green (standing item, breakdown plan §1.1).
- [ ] `[machine]` If the signing scheme deviates from Ed25519, `docs/adr/NNNN-corpus-release-signing.md`
      exists and is referenced from this ticket — the writeback is itself an acceptance item.
      (Sub-PRD Q-CRPS-3)
- [ ] `[machine]` PR states requirement ID `ADM-002`; schema/API/event compatibility impact ("new
      contract root `schemas/corpus-manifest/v1`, no prior version"); security impact (signing key
      handling); rollback path; known gaps. (PRD §45.4)
- [ ] No `[human]` criteria — verification is deterministic and fully offline. The human-facing
      promotion acceptance is `UAT-OPS-01`, exercised by `CRPS-06` (corpus side) and `RLSE-07`
      (production side).
- [ ] `cargo test --workspace` not applicable — this ticket touches no Rust.

## Test plan

All steps run offline, with no network, no cloud credentials and no production keys.

1. `uv run pytest pipelines/corpus-builder/tests/manifest -q`.
   Harness: pytest; a `bundle_factory` fixture builds a minimal bundle in `tmp_path` — a corpus
   database from `CRPS-01`'s `create_corpus_database()`, an empty `tantivy/` directory, a small
   `vectors.usearch` placeholder file, a valid `embedding-manifest.json`, then
   `build_release_manifest()` + `sign_manifest()` with the development key. The factory takes the
   deliverable 12 pins as explicit parameters so every pinning test varies exactly one member.
2. Schema completeness: parametrised over the PRD §18.4 required member list **and** the deliverable
   12 member list (both kept in the test as explicit literal lists, so a schema edit cannot silently
   relax them) — delete each, assert validation failure naming that member.
3. Tamper matrix: for each of `corpus.sqlite`, `vectors.usearch`, `embedding-manifest.json`,
   `release-manifest.json`, flip one byte and assert a `BLOCKING` finding with the expected code.
   Copy the construction pattern into `RETR-01`/`RLSE-07` later — this is the reference suite.
4. Pinning matrix: build a manifest whose `DOCUMENT_EMBEDDING` pin disagrees with the embedding
   manifest on one member at a time; repeat for `QUERY_EMBEDDING` vs `DOCUMENT_EMBEDDING`
   representation members; repeat for a stub pin under each `release_kind`. Assert the expected
   severity and code each time.
5. Canonicalisation determinism: build the same manifest from two differently-ordered dicts in two
   subprocesses (`uv run python -c ...`) and compare `manifest_sha256`.
6. Key handling: `test_no_private_keys_committed.py` walks
   `pipelines/corpus-builder/**` + `schemas/corpus-manifest/**` and fails on any PEM/PKCS8 private-key
   header outside `tests/manifest/fixtures/keys/**`.
7. Suite green: `uv run pytest` and `pnpm test` from the repository root.
8. Reviewer focus: signature is over the canonical bytes **excluding** `signature`/`manifest_sha256`
   (otherwise verification is circular); `verify_bundle()` opens the corpus database read-only and
   never writes to the bundle directory; hashing streams rather than loading whole files (a release
   bundle is large per PRD §17.2's planning hypothesis); no finding is downgraded to a warning that
   PRD §18.4 or breakdown plan §8 Q11 requires to block; and no pin is ever defaulted, inferred or
   read from the environment.

## Feedback obligation

1. **General rule.** If implementation falsifies this ticket, update **this ticket** (docs PR →
   merge → `publish-tickets.mjs --sync`) and, where module context changes,
   `docs/prd/04-corpus-contract/README.md` (version +0.1 with a changelog line) **before** changing
   code. Silent divergence is an incomplete ticket.
2. **Foreseeable frictions, each with its exact writeback target:**
   - *Ed25519 is unavailable in the pinned Python toolchain, or the Founder requires a different
     custody model* → record the decision in `docs/adr/NNNN-corpus-release-signing.md` (this ticket
     claims the file per breakdown plan A9) and update deliverable 8 in **this ticket** and Q-CRPS-3
     in `docs/prd/04-corpus-contract/README.md` — before writing signing code. Do not borrow the
     breakdown plan §8 Q6 blind-gold key or its custody model: different key, different purpose.
   - *`RETR-07` (or `RLSE-07`) must verify a model, tokenizer or runtime value that deliverable 12 has
     no member for* → breakdown plan §8 **Q11** requires the release to pin it, and
     `schemas/corpus-manifest/**` is serial-owned here. The consumer records the gap in its own
     sub-PRD and raises a ticket change against **this ticket**; this ticket adds the member (a minor
     `manifest_version` bump per deliverable 9) and `CRPS-05`/`CRPS-06` follow in the same docs PR.
     Never let the consumer invent a local default, and never let another module write the schema.
   - *The build has no way to obtain the runtime pin* (the `ort`/`tokenizers` versions live in
     `services/search-rs/Cargo.toml`, which this module does not own and must not read as a source of
     truth) → the pin stays an **explicit input** to `build_release_manifest()`, supplied through
     `CRPS-06`'s `BuildRequest` from the release process. If no such input path can exist, that is a
     ticket change against **`CRPS-06`** (the caller) recorded here and in
     `docs/prd/04-corpus-contract/README.md` — never a lockfile read, an environment lookup or a
     default.
   - *Model weight bytes are required to travel inside the release bundle* → that adds a path to PRD
     §18.4's fixed five-entry layout, which is a **plan/PRD-level change**, not a ticket change (sub-PRD
     **D15**). Stop and write back to `docs/prd/breakdown-plan.md` §2.1/§4.1 and
     `docs/prd/04-corpus-contract/README.md` first; `ModelPin.bundle_path` exists so the manifest can
     express either outcome once it is decided elsewhere.
   - *A PRD §18.4 manifest field turns out to be unfillable at build time* (for example evaluation
     results, which `21-evaluation-600` produces) → the field stays required with an explicit
     "not-run" shape (`evaluation.status`), and the gating rule lives in `CRPS-06`. If that is not
     workable, update **this ticket** and `CRPS-06`'s ticket together, and record the coupling in
     `docs/prd/04-corpus-contract/README.md`.
   - *`CRPS-05`'s embedding-manifest instance and deliverable 2's member list disagree* → the schema
     wins; fix the instance in `CRPS-05` and, if the schema was wrong, amend **both tickets** in one
     docs PR. If the disagreement proves that `CRPS-05` genuinely needs a `blocked_by CRPS-02` edge,
     that edge goes into `docs/prd/breakdown-plan.md` §5.5 **and** §6.2 first — inventing an edge only
     in a ticket file breaks `dag-scan.mjs`'s agreement with the plan.
   - *`release_kind` duplicates something `packages/contracts` already publishes* → drop the local
     enum, consume the contracts value, and note the change in
     `docs/prd/04-corpus-contract/README.md` (Decisions). Never define a second vocabulary for the
     same concept.
   - *Another module asks to write `schemas/corpus-manifest/**`* → refuse. PRD §44.3 makes this
     serial-owned; add a ticket here and a `blocked_by` edge in `docs/prd/breakdown-plan.md` §5.5/§6.2.
3. **Falsified protocol.** If PRD §18.4's "Build/sign/upload occurs offline … Production verifies
   signature" cannot hold — for example if verification is only feasible inside the search process —
   that overturns the trust boundary in PRD §21 and the `04`/`11`/`18` split. Stop, escalate for
   re-review, and write back to `docs/prd/breakdown-plan.md` §4.1/§4.2 and this sub-PRD before
   changing the verifier's location. Never move a trust check silently.
