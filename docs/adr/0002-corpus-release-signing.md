# ADR 0002 — CorpusRelease manifest signing

- **Status:** Accepted
- **Owner:** `04-corpus-contract` (`CRPS-02`)
- **Date:** 2026-08-08
- **Resolves:** the *scheme* half of sub-PRD `docs/prd/04-corpus-contract/README.md` open question
  **Q-CRPS-3**. It does **not** resolve production key custody — see § Still open.
- **Basis:** PRD §18.4, §20.2, §21, §35.3, §39.6, §44.3, §45.4; breakdown plan **A9** (per-file ADR
  ownership by the creating ticket), **§8 Q11**

## Context

PRD §18.4 puts build, sign and upload **offline**, and requires production to verify *"signature,
compatibility, disk, hashes, read-only database/index integrity and smoke queries"* before a release
is promoted. PRD §21 states the trust rule plainly: *"Trust application/corpus artifacts only after
signature/hash/compatibility verification."* PRD §35.3 records the result in `corpus_release`
(`manifest_sha256`, `signature`) and makes the row *"immutable after signing"*.

What none of that fixes is **which** signature scheme, over **which** bytes, with keys in **which**
on-disk form. That gap is sub-PRD **Q-CRPS-3**. `CRPS-02`'s deliverable 8 names Ed25519 as the
default and requires the chosen scheme to be recorded here, because two other modules re-implement
the verifier against it: `RETR-01` (`11-retrieval-engine`, Rust) verifies a bundle before loading it,
and `RLSE-07` (`18-ops-release`) verifies it again on the production host before promotion. A change
to any decision below is a cross-module break, not a refactor.

Three constraints bound the choice before any option is compared.

1. **No third-party Python package is importable at test time.** A uv workspace member that is
   `package = false` contributes no dependency to the environment `uv sync --frozen && uv run pytest`
   builds. `jsonschema` is declared in `pipelines/corpus-builder/pyproject.toml` and present in
   `uv.lock`, and is still absent from the environment; `CRPS-01` recorded that as **E1** and shipped
   `contracts/jsonschema_min.py` because of it. A crypto library would be exactly as absent.
2. **The root lockfile is not ours to regenerate.** PRD §44.3 makes the root manifest and lockfile
   serial-owned by `00-foundation`, and CI enforces agreement with `uv lock --check`. Adding a
   dependency to make signing work would be an out-of-scope edit to a serial-owned artifact.
3. **A committed PEM private key fails CI.** `.github/workflows/checks/secret-scan.mjs` scans every
   git-tracked file for a private-key header, and `tools/tests/secret-scan.test.mjs` asserts that the
   excluded-path list holds exactly one entry (the pattern file itself). There is no way to
   allow-list a fixture key, and `tools/**` is `00-foundation`'s file-scope.

## Decision

### 1. Scheme: Ed25519 (RFC 8032), detached

Ed25519 as `CRPS-02` deliverable 8 specifies. Deterministic (no nonce to get wrong), small keys and
signatures, no parameter negotiation, and a mature Rust implementation (`ed25519-dalek`) for the
consumers that must verify without Python. The `signature` member records
`{algorithm, key_id, value (base64), signed_at}`; `algorithm` is `ED25519` and the schema's enum
admits nothing else today, so a future scheme is a visible contract change rather than a silent one.

### 2. Implementation: RFC 8032 in pure Python, offline use only

Because of constraints 1 and 2, `pipelines/corpus-builder/src/manifest/ed25519.py` implements RFC
8032 §6 directly (SHA-512 plus integer arithmetic in extended homogeneous coordinates). **This is
not a scheme deviation** — the bytes are Ed25519, byte-for-byte what `ed25519-dalek` produces and
accepts — so `CRPS-02`'s conditional acceptance item about deviating from Ed25519 is not triggered.
It is recorded here because deliverable 8 requires the chosen scheme to be recorded.

Rolling our own is a real risk, accepted with three mitigations:

- **Evidence, not inspection.** `tests/manifest/test_ed25519_vectors.py` runs the RFC 8032 §7.1 test
  vectors — the same vectors `ed25519-dalek` is tested against — plus flipped-byte, wrong-key,
  malformed-input and non-canonical-scalar (`s >= L`) cases. Interoperability rests on those vectors.
- **A bounded use.** Offline release signing on the release operator's own machine. The module
  docstring states that it is **not constant-time** and MUST NOT be used for an online secret,
  a session key, or anything an attacker can time. Verification is the only operation production
  performs, and it uses public data.
- **A single call site.** `signing.py` is the only importer; no other module may sign.

### 3. What the signature covers

`canonical_bytes(manifest)`: the manifest with the top-level members **`signature` and
`manifest_sha256` removed**, object keys sorted ascending by Unicode code point, no insignificant
whitespace, UTF-8. `manifest_sha256` is the lowercase-hex SHA-256 of exactly those bytes, and the
signature is over exactly those bytes.

The exclusions are what make verification non-circular — a digest cannot cover itself, and a
signature cannot cover the signature. **Consequence, stated because it is load-bearing:
`signature.signed_at` is OUTSIDE the signed bytes and is therefore unauthenticated metadata.** No
consumer may treat it as evidence of when anything happened. It is recorded in the schema
`description`, in `schemas/corpus-manifest/README.md` and here.

Ordering constraint: **build → canonicalise → hash → sign → write.** Every manifest dataclass is
frozen, so a post-hash mutation is impossible by construction, and `sign_manifest()` re-asserts the
recorded digest before signing.

### 4. The canonicalisation profile, including the no-floats rule

RFC 8785 canonicalises doubles with ECMAScript `Number::toString`. Python's `repr` does not reproduce
it (`1e16` is `"10000000000000000"` in JavaScript and `"1e+16"` in Python; `1e-7` is `"1e-7"` and
`"1e-07"`). Since the signed bytes must be re-derivable in Rust, **no float may appear in a manifest
at all**: `canonical_bytes()` raises `NonCanonicalValue` on one. Every numeric member the contract
names is an integer, and fractional values — `evaluation.metrics.*`, `evaluation.gates[].threshold`
and `.observed` — are **decimal strings** matching `^-?(0|[1-9][0-9]*)(\.[0-9]+)?$`.

Similarly, the ticket says keys are sorted "by code point" while strict RFC 8785 sorts by UTF-16 code
unit; the two differ outside the BMP. Rather than pick one and hope, `canonical_bytes()` **rejects
any non-ASCII object key**, which makes the two orderings provably identical for every manifest this
schema can express.

If `CRPS-06` or `GOLD-01` require native JSON numbers for the evaluation members, that is a ticket
change against `CRPS-02` plus an amendment here — not a local edit.

### 5. The `tantivy/` directory digest

`artifacts.lexical_index_sha256` names a **directory**, not a file, so it cannot be a file hash. It is
SHA-256 over the UTF-8 encoding of `"<bundle-relative path>\x1f<file sha256>\n"` for every file
beneath `tantivy/`, in sorted path order; an empty directory digests the empty string. The style
mirrors `contracts.schema.schema_fingerprint()`. `RETR-01` and `RLSE-07` re-implement this exactly.

Related, and equally re-implemented: `files[]` **excludes `release-manifest.json`** — a manifest
cannot carry its own hash. Its integrity is `manifest_sha256` plus the signature.

### 6. Key files are JSON, never PEM

    {"key_id": "...", "algorithm": "ED25519", "kind": "DEVELOPMENT_ONLY",
     "seed_b64": "<base64 of the 32-byte seed>", "warning": "..."}

and the public counterpart with `public_key_b64`. Two reasons: constraint 3 makes a committed PEM
private key a hard CI failure with no allow-list available, and raw base64 of the 32-byte key is the
friendliest form for the Rust verifier. `load_private_key()` / `load_public_key()` accept **only**
this form and raise `UnsupportedKeyFormat` naming Q-CRPS-3 on anything else, including PEM.

A private key is loaded from an explicit path, or from the path named by the
`CORPUS_SIGNING_KEYFILE` environment variable — the variable carries a **path**, never key bytes
(PRD §39.6 puts runtime secrets in configuration, not the repository). No key material ever reaches
a message, a finding, a log line or an exception.

### 7. Development keys are identifiable from the manifest alone

The one committed keypair lives under `pipelines/corpus-builder/tests/manifest/fixtures/keys/**` and
its `key_id` starts with `dev-`, so any manifest it signed is recognisable without out-of-band
knowledge. `verify_signature()` emits `SIGNATURE_SIGNER_DEVELOPMENT` — a `WARNING` for a
`CANDIDATE`/`PUBLISHED` release, `INFO` for a `SYNTHETIC_FIXTURE`. **Refusing** a development
signature on a production promotion is `RLSE-07`'s call; this contract only makes it visible.

This is **not** the breakdown plan §8 **Q6** blind-gold key. Q6's `SealedBox` custody governs
`evals/gold/**`; different key, different purpose, never reused for the other.

## Consequences

- `RETR-01` (Rust) and `RLSE-07` implement §3, §4 and §5 exactly. The cross-language reference is
  `pipelines/corpus-builder/tests/manifest/fixtures/golden/release-manifest.json`: reproduce its
  recorded `manifest_sha256` from its own bytes and accept its signature, and you agree with this
  contract.
- No Python dependency is added, and the root `uv.lock` is untouched.
- A future scheme change means a new `algorithm` enum member, a `manifest_version` bump under
  deliverable 9's rule, and an amendment here — visible in three places.
- The verifier's finding vocabulary distinguishes an **unknown signer** from an **invalid
  signature**, because the operator's response differs (`CRPS-02` acceptance item 5).

## Still open

**Production key custody and the production on-disk key format remain Q-CRPS-3, the Founder's
decision** (PRD §20.2: coding agents MUST NOT receive production signing credentials by default;
PRD §39.6). This ADR resolves the *scheme*, not the *custody*. When custody is decided, only
`load_private_key()`'s accepted format changes — `sign_manifest()`'s signature, the canonical bytes
and the on-manifest `signature` shape all stay as they are.

## Revisiting this decision

Revisit if: a crypto library becomes genuinely available in the pinned environment (then replace
`ed25519.py`'s internals, keeping the vectors as the acceptance test); the Founder's custody decision
requires a hardware or KMS signer (then `load_private_key` gains a second backend); or a consumer
demonstrates that RFC 8785 compliance in full — floats included — is required by something outside
this repository. The first two are drop-in; the third is a `manifest_version` major bump.
