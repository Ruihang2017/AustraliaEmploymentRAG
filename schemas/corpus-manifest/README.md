# CorpusRelease manifest contract

The versioned JSON contract for the CorpusRelease bundle (PRD §18.4). This directory is PRD §44.3
**serial-owned** by module `04-corpus-contract`: `11-retrieval-engine` and `18-ops-release` read it
and take `blocked_by` edges; **no other module writes it.** A module that needs a member here raises
a ticket change against `CRPS-02` rather than inventing a local default.

This page assumes no corpus-builder code. Everything below is reproducible with a generic JSON-Schema
validator and a SHA-256/Ed25519 implementation in any language.

## The bundle

PRD §18.4 fixes the layout at exactly five entries:

```text
corpus-release-{id}/
├── corpus.sqlite
├── tantivy/
├── vectors.usearch
├── embedding-manifest.json
└── release-manifest.json
```

## The schemas

| File | What it describes |
|---|---|
| `v1/release-manifest.schema.json` | `release-manifest.json` — every PRD §18.4 member plus the breakdown plan §8 **Q11** model/tokenizer/runtime pins |
| `v1/embedding-manifest.schema.json` | `embedding-manifest.json` — the bundle's second manifest (`CRPS-05` emits the instance) |
| `v1/pins.schema.json` | shared `$defs`: scalars, the **model pin** and the **runtime pin**, `$ref`-ed by both |

Draft 2020-12, `additionalProperties: false` everywhere, every member required. Each member carries a
`description` quoting the PRD phrase or register entry it satisfies, so the schema alone explains why
a field exists.

### Validating a manifest

```bash
# Node
npx ajv-cli validate -c ajv-formats \
  -s v1/release-manifest.schema.json -r v1/pins.schema.json \
  -d path/to/release-manifest.json

# Python
pipx run check-jsonschema \
  --schemafile v1/release-manifest.schema.json path/to/release-manifest.json
```

`$ref`s resolve **by `$id`**, are relative, and never leave this directory. Load `pins.schema.json`
alongside the manifest schema and no network access is needed — or possible.

### Versioning (deliverable 9)

`manifest_version` is semver and the schema directory is `v<major>`.

- Adding an **optional** member — minor bump, **in place**.
- Removing or renaming a member, or tightening a type — **major** bump into a new
  `schemas/corpus-manifest/v<N>/` directory.
- A verifier accepts the **current** major and the **immediately previous** major, and treats
  anything else as a blocking failure. It does not silently pass a version it cannot check.

Basis: PRD §45.4 — *"Changes to an immutable/public contract include regenerated bindings and
compatibility tests."*

## Canonicalisation — the bytes that are hashed and signed

A re-implementation must reproduce these bytes exactly. See
`docs/adr/0002-corpus-release-signing.md`.

1. Remove the top-level members **`signature`** and **`manifest_sha256`**. Nothing else is removed,
   at any depth.
2. Sort every object's keys ascending by Unicode code point.
3. Emit with no insignificant whitespace: `,` and `:` separate, nothing else.
4. UTF-8. Escape only what JSON requires (`"`, `\`, and control characters below `U+0020`); do not
   `\u`-escape ordinary non-ASCII text.
5. **No float may appear anywhere.** RFC 8785 number canonicalisation depends on ECMAScript
   `Number::toString`, which is not reproducible across languages without care. Every numeric member
   in this contract is an **integer**; fractional values (`evaluation.metrics.*`,
   `evaluation.gates[].threshold`, `.observed`) are **decimal strings** matching
   `^-?(0|[1-9][0-9]*)(\.[0-9]+)?$`.
6. **No non-ASCII object key.** The ticket says "sorted by code point"; strict RFC 8785 sorts by
   UTF-16 code unit, and the two differ outside the BMP. Restricting keys to ASCII makes the two
   orderings provably identical for every manifest this schema can express.

`manifest_sha256` is the lowercase-hex SHA-256 of those bytes. The signature is over the same bytes.

Ordering: **build → canonicalise → hash → sign → write.** A manifest is never mutated after
`manifest_sha256` is set.

> **`signature.signed_at` is UNAUTHENTICATED.** The whole `signature` member is excluded from the
> signed bytes — otherwise verification would be circular — so the signing time is metadata, not
> evidence. Do not build any check on it.

## Hashing rules a verifier must reproduce

- **`files[]`** covers every file in the bundle **except `release-manifest.json`**: a manifest cannot
  carry its own hash, and its integrity is `manifest_sha256` plus the signature. Paths are
  bundle-root-relative, `/`-separated, sorted ascending. Symlinks and other non-regular files are
  refused, never followed.
- **Path safety.** Validate every `files[].path` *before* opening it: relative, no `..` segment, no
  drive letter, no leading separator, and the resolved path inside the bundle. A verifier must
  collect all findings, which means it reads paths named by a manifest whose signature may not have
  verified yet.
- **`artifacts.corpus_sqlite_sha256`, `vector_index_sha256`, `embedding_manifest_sha256`** equal the
  `files[]` hash of `corpus.sqlite`, `vectors.usearch` and `embedding-manifest.json`.
- **`artifacts.lexical_index_sha256` is a DIRECTORY digest**, because `tantivy/` is a directory:
  SHA-256 over the UTF-8 encoding of

  ```text
  <bundle-relative path>\x1f<file sha256>\n
  ```

  for every file beneath `tantivy/`, in sorted path order. An empty directory digests the empty
  string (`e3b0c442…`).

## Signatures

Ed25519 (RFC 8032), detached, over the canonical bytes. `signature` is
`{algorithm, key_id, value (base64), signed_at}` or `null` for an unsigned candidate.

Key files are **JSON, never PEM**:

```json
{"key_id": "…", "algorithm": "ED25519", "public_key_b64": "…32 bytes, base64…"}
```

A **development** key's `key_id` starts with `dev-`, so a development signature is identifiable from
the manifest alone. Production key custody and format are sub-PRD open question **Q-CRPS-3** and are
not decided here.

## `release_kind`

`CANDIDATE` (built, not published) · `PUBLISHED` (staged) · `SYNTHETIC_FIXTURE` (generated test
data). Without the marker a fixture bundle is byte-indistinguishable from a promotable release, which
PRD §12.2 forbids. It is a **manifest** field, not a `corpus_release.status` enum value.

A `SYNTHETIC_FIXTURE` may carry **stub** pins (`model_id` of `stub` or `stub:<seed>`, a
`runtime.family` recorded as a stub); the verifier reports them as `INFO`. On a `CANDIDATE` or
`PUBLISHED` release the same stub is **blocking**.

## A worked reference

`pipelines/corpus-builder/tests/manifest/fixtures/golden/` holds a hand-written manifest, its
embedding manifest, and a `regenerate.py`. Reproduce its recorded `manifest_sha256` from its own
bytes and verify its signature with `../keys/dev-corpus-signing-001.public.json`, and your
implementation agrees with this contract.
