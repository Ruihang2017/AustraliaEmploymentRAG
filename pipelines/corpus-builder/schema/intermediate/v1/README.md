# Intermediate normalised-record (INR) contract — v1

This is the complete contract between a **source adapter** and the **corpus builder**. If you are
writing an adapter (modules `06-sources-legislation` … `10-sources-future`), everything you need is
on this page and in the JSON Schemas beside it. You never need to read
`pipelines/corpus-builder/src/**` — that independence is the point (breakdown plan A4), and a test
(`tests/contracts/test_schema_only.py`) enforces it.

Basis: PRD §40.7 (the adapter emits versioned intermediate records and never writes corpus tables),
§15.2–15.3 (temporal vocabulary, citation targets), §35.1–35.3 (the corpus data dictionary).

## 1. The envelope

Every record is one JSON object with exactly these nine members — no more, no fewer
(`envelope.schema.json`, `additionalProperties: false`).

| Member | Type | Meaning |
|---|---|---|
| `contract_version` | semver string | the INR version you wrote against, e.g. `"1.0.0"` |
| `record_type` | enum string | one of the nine in §2 |
| `adapter_key` | string | your adapter; matches corpus `source.adapter_key` |
| `source_id` | string | the corpus `source.id` these records belong to |
| `ingestion_run_id` | string | the corpus `ingestion_run.id` for this batch |
| `emitted_at` | UTC ISO-8601 `…Z` | when you emitted it |
| `tool_versions` | object | `{adapter, framework, parser, ocr?}`, all strings |
| `provenance` | object | `{official_url, artifact_sha256, retrieved_at}` |
| `payload` | object | the record-type body, §2 |

`provenance` is required on **every** record type, including `validation_finding`. That is the
literal PRD §40.7 requirement ("source URL, artifact hash and tool version"): a record with no
traceable origin cannot become evidence.

`source_id` and `ingestion_run_id` are the **only** corpus identifiers anywhere in a record. See §3.

## 2. The nine record types

One schema file each; the payload members are named exactly as the corpus columns they feed, so the
mapping is inspectable without a lookup table. `?` marks an optional member.

| `record_type` | File | Payload members |
|---|---|---|
| `remote_descriptor` | `remote-descriptor.schema.json` | `descriptor_key`, `official_url`, `discovered_at`, `etag?`, `last_modified?`, `content_type?`, `document_hint?`, `cursor?` |
| `source_artifact` | `source-artifact.schema.json` | `artifact_key`, `official_url`, `retrieved_at`, `http_status`, `etag?`, `last_modified?`, `content_type`, `byte_length`, `sha256`, `r2_key?`, `licence_snapshot_key` |
| `document_identity` | `document-identity.schema.json` | `stable_source_key`, `document_type`, `canonical_title`, `jurisdiction`, `authority_key`, `official_identifier?`, `neutral_citation?`, `employer_abn?` |
| `document_version` | `document-version.schema.json` | `stable_source_key`, `version_label`, `publication_date?`, `effective_from`, `effective_to?`, `legal_status`, `retrieved_at`, `content_hash`, `official_url`, `artifact_key` |
| `document_node` | `document-node.schema.json` | `stable_source_key`, `stable_node_key`, `node_kind` |
| `node_version` | `node-version.schema.json` | `stable_source_key`, `version_label`, `stable_node_key`, `parent_stable_node_key?`, `display_label?`, `heading?`, `canonical_text`, `ordinal`, `effective_from`, `effective_to?`, `text_hash` |
| `legal_event` | `legal-event.schema.json` | `stable_source_key`, `event_type`, `event_date`, `effective_date?`, `evidence_ref?`, `target_version_label?`, `metadata_json?` |
| `node_relation` | `node-relation.schema.json` | `from_ref`, `to_ref`, `relation_type`, `evidence_ref?`, `evidence_start?`, `evidence_end?`, `derivation`, `parser_version`, `confidence_state` |
| `validation_finding` | `validation-finding.schema.json` | `finding_code`, `severity`, `subject_ref?`, `details_json?` |

The nine map one-to-one onto the eight PRD §40.7 adapter boundaries (`normalise()` produces two:
`document_version` and `node_version`).

Need a tenth? You cannot add one privately — this contract binds five source modules. Raise a
change to ticket `CRPS-01` deliverable 10, bump `contract_version` per §6, and record it in
`docs/prd/04-corpus-contract/README.md`.

## 3. Reference discipline — no corpus primary keys, ever

**A record never carries a corpus primary key.** You do not write corpus tables (PRD §40.7), so you
cannot know a corpus ID; the builder mints them and resolves your natural keys against PRD §35.2's
`(source_id, stable_source_key)` and `(document_id, stable_node_key)` uniqueness.

Cross-record references use two objects, defined once in `refs.schema.json` and `$ref`-ed
everywhere:

```json
NodeRef    = { "stable_source_key": "...", "version_label": "...", "stable_node_key": "..." }
VersionRef = { "stable_source_key": "...", "version_label": "..." }
```

Both are implicitly scoped by the envelope's `source_id`; you never repeat it inside a ref.

Every natural-key member is typed `refs.schema.json#/$defs/natural_key`, which **rejects** the
opaque-ID form `<prefix>_<uuidv7>` (`doc_0199…`, `nv_0199…`). A generic JSON-Schema validator
catches the misuse — not only the Python one. `validate_record()` additionally scans every string
leaf of the payload and reports `CORPUS_ID_IN_RECORD`.

If your source genuinely cannot be expressed without a corpus ID, that contradicts PRD §40.7 and
breakdown plan A4. Escalate; do not add an ID field.

## 4. Text and offsets — the rule every citation depends on

- `canonical_text` is **Unicode NFC**-normalised exactly once, at `normalise()`. Never re-normalise
  downstream; the stored code points are the citation target.
- `text_hash` is the **lowercase hex SHA-256 of the UTF-8 bytes** of the exact stored
  `canonical_text`.
- Every offset in this contract — `evidence_start`, `evidence_end`, and later
  `search_chunk.start_offset` / `end_offset` — is a **character (Unicode code point) offset** into
  that normalised `canonical_text`, **half-open `[start, end)`**.

Characters, not bytes and not UTF-16 code units. Python `len(str)` gives the right unit; a Rust
`&str` byte index and a JavaScript `String` index both do not. The conformance fixtures include
composed non-ASCII text and an astral-plane character precisely so a byte/UTF-16 confusion fails
loudly instead of mis-slicing a quotation. Requirement `SRCH-003` ("snippet offsets reproduce exact
NodeVersion text") has to hold across a Python builder, a Rust searcher and a TypeScript validator.

`evidence_start`, `evidence_end` and `evidence_ref` travel together: give all three or none.

## 5. Enumerated values

- `legal_status` (PRD §6.7) is a closed `enum` in `document-version.schema.json`, **generated** from
  the canonical `packages/contracts` export. Do not edit it by hand.
- `severity` on `validation_finding` is `BLOCKING | ANOMALY | INFO`. `BLOCKING` is reserved for the
  classes PRD §40.9 says block release: critical identity/time/citation and mandatory-source
  failures.
- `document_type`, `node_kind`, `relation_type`, `event_type` and `confidence_state` are currently
  **unconstrained strings**. `packages/contracts` does not publish those families yet (Q-CRPS-4,
  owned by `FND-03`). Use the PRD §15.1 vocabulary; when the families are published these become
  closed enums with no other change to this contract.
- `confidence_state` carries one rule that is enforced today, by `validate_record()`:
  **`MODEL_SUGGESTED` cannot support definitive status** (PRD §35.2).

## 6. Versioning

`contract_version` is semver.

| Change | Bump | Where |
|---|---|---|
| add an **optional** member | minor | in place, this directory |
| remove or rename a member, tighten a type, change a documented meaning | **major** | a new `schema/intermediate/v<N>/` directory |

A reader accepts the current major and the immediately previous major; anything further apart is
rejected with `CONTRACT_VERSION_UNSUPPORTED`. Any major bump is a writeback against `CRPS-01`,
because five source modules bind to this contract (PRD §45.4: changes to a public contract include
regenerated bindings and compatibility tests).

## 7. File layout on disk

One newline-delimited-JSON file per `record_type` per run:

```text
<out>/<source_id>/<ingestion_run_id>/<record_type>.jsonl
<out>/<source_id>/<ingestion_run_id>/records-manifest.json
```

Byte format, so that a diff of two runs is meaningful:

- UTF-8, **LF** endings, one record per line, a trailing newline after the last record.
- Object keys **sorted**, no spaces after `,` or `:` (`separators=(",", ":")`), no trailing
  whitespace, non-ASCII written literally (`ensure_ascii=false`).
- A `\r\n` line ending is a hard error on read, never silently stripped.

`records-manifest.json`:

```json
{
  "contract_version": "1.0.0",
  "files": [{ "record_type": "...", "path": "...jsonl", "sha256": "...", "count": 3 }]
}
```

`files` is sorted by `record_type`; `path` is POSIX and relative to the run directory. A reader
verifies every hash and count **before** yielding any record.

## 8. Conforming without reading builder code

Validate your output against these schemas with any Draft 2020-12 validator. All `$ref`s are
relative to this directory and resolve offline — nothing here fetches a URL. The committed
conformance fixtures under `pipelines/corpus-builder/tests/contracts/fixtures/` are the artifact to
test against: `valid/` is a complete coherent run covering all nine record types, and `invalid/`
pairs each broken record with the exact violation code it must produce.
