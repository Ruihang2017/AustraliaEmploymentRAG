# Which key signs this fixture (CRPS-08 deliverable 6)

**No key material of any kind lives in this directory, or anywhere else under `fixtures/**`.** This
file is a pointer and a warning; that is all it will ever be.

## The verifying key

The committed **development public key** is CRPS-02's:

```
pipelines/corpus-builder/tests/manifest/fixtures/keys/dev-corpus-signing-001.public.json
```

Build the verifier's trust map from it, and from nothing else:

```python
from manifest import public_keys_from, verify_bundle
report = verify_bundle(BUNDLE_DIR, public_keys=public_keys_from(PUBLIC_KEYFILE_PATH))
```

Identity `dev-corpus-signing-001`; algorithm `ED25519` (RFC 8032), in the JSON on-disk form recorded
in `docs/adr/0002-corpus-release-signing.md` — never PEM.

## The signing key

The private half is a **development key only**. It lives solely in CRPS-02's test fixtures, it is
referenced by path by `fixtures/generator/_paths.py`, and it is never copied, printed, logged, read
from an environment variable, or embedded in an error message (PRD §20.2: *"Coding agents MUST NOT
receive production SSH, database, backup, signing or provider credentials by default"*).

## The rule that makes this safe

**A manifest whose `key_id` starts with `dev-` must never be accepted by production tooling.** The
prefix exists so a development signature is identifiable in any manifest that carries one.
`verify_bundle()` makes it visible — `SIGNATURE_SIGNER_DEVELOPMENT`, at `INFO` for a
`SYNTHETIC_FIXTURE` and `WARNING` for anything else — and refusing it is the promotion tool's call
(`RLSE-07`, `CRPS-07`), not the verifier's.

If CRPS-02's signing scheme ever changes, this fixture is regenerated in the same docs PR that
amends CRPS-08's deliverable 6. A production key is never committed, to this directory or any other.
