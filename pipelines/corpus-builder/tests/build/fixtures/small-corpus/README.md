# Committed small corpus fixture (CRPS-06)

The ticket's `[fixture]` acceptance item: *"End-to-end build over the committed small corpus fixture
produces a complete bundle whose manifest reproduces the recorded golden values (excluding timestamps
and paths), and a second run over the same input reproduces identical artifact hashes."*

`test_golden_small_corpus_build.py` is that test. It is deliberately **not** the same check as
`test_build_determinism.py`: that one compares two freshly generated candidates against each other,
which a regression in how *every* manifest is assembled would survive. This one compares against
values recorded on disk and reviewed by a human — the discipline
`../../../manifest/fixtures/golden/` uses for CRPS-02's manifest.

## What is here

| Path | What it is |
|---|---|
| `corpus.sqlite` | the corpus, committed **as bytes** |
| `embeddings/vectors.usearch` | CRPS-05's vector artifact — an opaque blob; nothing in this ticket parses it, and `usearch` is declared but not installed in this workspace (FND-01) |
| `embeddings/embedding-manifest.json` | CRPS-05's manifest, as the gates and `verify_bundle()` consume it |
| `embeddings/embedding-build-report.json` | CRPS-05's report, read by the completeness gate |
| `evaluation-report.json` | `21-evaluation-600`'s output, as the evaluation gate consumes it |
| `golden/release-manifest.json` | **the recorded expectation** |
| `regenerate.py` | rebuilds all of the above. A manual step |

The corpus is committed as bytes rather than rebuilt from SQL at test time because the SHA-256 of a
SQLite file depends on the local library's page layout — a rebuilt database has no stable hash to
record, and `artifacts.corpus_sqlite_sha256` is the most load-bearing value in the manifest.

No real instrument, case, party or ABN appears anywhere in it (PRD §40.8 item 4): the material is the
same invented Act and invented decision `candidate_fixtures.py` composes.

## What the golden comparison excludes

`build_started_at`, `build_finished_at`, `created_at`, the `signature` that covers them, and the
`manifest_sha256` digest taken over the same bytes. Everything else — every artifact hash, `files[]`
entry, count, coverage entry, model pin, runtime pin and version — is compared. The excluded members
must still be **present**; an omitted timestamp is a defect, not a permitted difference. There are no
absolute paths in a manifest: `files[].path` is bundle-relative and is compared like everything else.

The signature is a **development** one (`key_id` starts with `dev-`), from
`../../../manifest/fixtures/keys/`, referenced by path and never copied.

## Regenerating

```
uv run python pipelines/corpus-builder/tests/build/fixtures/small-corpus/regenerate.py
```

Run it **only** when a deliberate change to this ticket's contract, to CRPS-01's schema or to
CRPS-02's manifest is meant to change the recorded values, and then read the diff — that diff is the
review. A golden fixture that regenerates itself whenever it disagrees with the code proves nothing.

A committed whole **bundle** (with `tantivy/` and a signature over wall-clock timestamps) is
`CRPS-08`'s deliverable 5, not this ticket's; only the manifest is recorded here.
