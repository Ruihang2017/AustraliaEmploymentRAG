# Golden manifest fixture (CRPS-02)

`release-manifest.json` here is the **cross-module reference** that `RETR-01` (Rust) and `RLSE-07`
copy: a hand-written release manifest, its recorded `manifest_sha256`, and a detached Ed25519
signature made with the development key in `../keys/`. A verifier written in another language is
correct on this ticket's contract when, and only when, it reproduces the same digest from the same
bytes and accepts the same signature.

What is here, and why it is not a whole bundle:

- `release-manifest.json` — the golden artifact. `manifest_sha256` is the SHA-256 of
  `canonical_bytes(...)`: the manifest with `signature` and `manifest_sha256` removed, keys sorted by
  code point, no insignificant whitespace, UTF-8. See `schemas/corpus-manifest/README.md`.
- `embedding-manifest.json` — its companion, so a re-implementer can check the pinning rules too.
- `regenerate.py` — re-hashes and re-signs after a deliberate hand edit. Run it from anywhere:
  `uv run python pipelines/corpus-builder/tests/manifest/fixtures/golden/regenerate.py`.

A committed **end-to-end bundle** (with a binary `corpus.sqlite`) is `CRPS-08`'s deliverable 5, not
this ticket's — `fixtures/**` is outside CRPS-02's file-scope. The whole-bundle path is exercised
here through `conftest.py`'s `bundle_factory`, which is the construction pattern the downstream
suites copy.

The signature is a **development** one: its `key_id` starts with `dev-`, so any consumer can tell
this manifest apart from a promotable release without parsing prose.
