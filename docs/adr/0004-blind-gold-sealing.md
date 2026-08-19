# ADR 0004 — Blind gold sealing, isolation and key custody

- **Status:** Accepted
- **Owner:** `21-evaluation-600` (`GOLD-01`)
- **Date:** 2026-08-19
- **Records:** breakdown plan `docs/prd/breakdown-plan.md` §8 **Q6** (status **CONFIRMED**,
  Founder-owned) and sub-PRD `docs/prd/21-evaluation-600/README.md` **D1**–**D3**, **D20**–**D22**.
  This ADR **records** that decision; it does not reopen it.
- **Basis:** PRD §14.1, §14.3, §20.2, §43.1, §43.2, §43.4, §45.1 item 6, §45.5; breakdown plan
  **R9**, **A9** (per-file ADR ownership by the creating ticket), §8 **Q6**.

> Number note: `0001` and `0002` were already taken — `0002` three times over, by tickets that ran
> concurrently — so this ADR takes the next free number. No other ADR file was renumbered.

## Context

One repository tree holds 480 visible and 120 blind evaluation cases, and wave B of this module
authors both (breakdown plan **R9**). PRD §14.3 requires blind gold answers to *"remain outside
ordinary coding-agent context"*; PRD §43.1 goes further and calls the blind case content and gold
data *"inaccessible to ordinary coding-agent context"* — inaccessible, not discouraged; and PRD §45.1
item 6 forbids exposing blind evaluation gold data to coding agents at all.

Nothing in the repository made that true. Worse, the obvious lever is unavailable: breakdown plan §4
freezes `.claude/**`, so an agent-side deny rule is not even writable from this module. Until a
mechanism existed, breakdown plan **R9** barred any ticket from referencing `evals/gold/**` blind
paths.

The requirement is also not merely about agents. `EVAL-001` (PRD §30.2) demands *"120 protected blind
cases"* be present and countable, and PRD §43.2 demands that *"past reports stay reproducible"*. So
the blind material has to be **in** the repository in some form, and **unreadable** in that form.

## Decision

1. **Authoring happens outside this repository.** Blind material is authored by dedicated
   `evaluation-author` agents working in an isolated session/workspace. They are not the ordinary
   implementation agents. They receive the evaluation schema, the stratification requirements,
   official source material and the case-authoring rubric — and never ordinary coding-agent context
   that would let the product implementation be tuned against the blind questions.
2. **Review is independent, and happens before encryption.** An independent `evaluation-reviewer`
   agent checks every blind case against official sources before it is sealed. No lawyer, tax
   specialist or employed employment-law/domain expert is engaged. The Founder performs a small
   risk-based spot check only — typically 12–20 of the 120 — and is neither the author nor the
   per-case reviewer.
3. **Plaintext never enters the repository.** Blind plaintext is created in an isolated private
   directory outside the repository. It is never committed to git, copied into ordinary fixtures,
   pasted into an implementation agent's session, or exposed to ordinary CI.
4. **Material is sealed with libsodium `SealedBox`** — X25519 + XSalsa20-Poly1305, i.e.
   `crypto_box_seal`.
5. **The public recipient key is committed.** Sealing requires only the public half, so an authorised
   `evaluation-author` agent can encrypt without ever holding the private key — and therefore no
   Builder, authoring or otherwise, ever needs it.
6. **Blind run output is content-free.** A blind run reports metrics, category summaries and case IDs
   only. Questions, answers, gold claims and source excerpts never reach a report or a log. If a
   blind run fails, implementation agents debug using development/validation cases and
   category-level blind metrics only; blind content is never revealed merely to make a fix
   convenient.

## Custody model

- The **Founder is the sole custodian of the private key.**
- It lives in the Founder's password manager or equivalent offline encrypted storage, with **one**
  encrypted recovery copy, and never in git, CI, ordinary environment configuration or any agent
  environment.
- **One key pair per blind-dataset major version.** Suspected compromise forces immediate rotation,
  and rotation replaces `evals/splits/blind-recipient.pub` through a new dataset version (sub-PRD
  **D8**).
- **Only the Founder may start a blind evaluation stage** that requires decrypting blind material.
- The local release-evaluation flow receives the private-key file path through the environment
  variable **`EVAL_BLIND_KEY_FILE`**: **no default path, no in-repository lookup and no keyring
  fallback.**

## Rejected alternatives

| Alternative | Why it was rejected |
|---|---|
| An ignore file, a `CODEOWNERS` rule, or agent instructions. | A convention, not a mechanism — and unwritable from here anyway, because breakdown plan §4 freezes `.claude/**`. PRD §43.1 says *inaccessible*. |
| Keep blind material entirely outside the repository, with no in-repo trace. | `EVAL-001`'s *"120 protected blind cases"* and PRD §43.2's *"past reports stay reproducible"* would both become unverifiable. |
| Symmetric encryption with a shared key. | Every authoring party would then hold the opening key, which is the property this decision exists to deny. |
| Engage a lawyer or an employed domain expert as author or reviewer. | Breakdown plan §8 **Q6** settles the authoring path without one. |
| A keyring or default-path key lookup. | It would make an accidental blind open possible in an ordinary session — precisely the accident the environment-variable contract prevents. |

## Consequences

- **No blind stage can run in ordinary CI or in any coding-agent session, by construction.** That is
  the intended consequence, not a limitation to be engineered around.
- **Blind failures are debugged from category-level metrics**, which is deliberately slower.
- **The Founder is a single point of custody**, mitigated only by the one encrypted recovery copy. A
  lost key makes that blind-dataset major version unopenable and forces a new key pair plus a
  re-sealed dataset version through **D8**'s versioned-correction path.
- **`GOLD-05` … `GOLD-14` can only ever verify blind *slots*** — count, seal, digest, sidecar
  allowlist and stratification — never content. Every check in `GOLD-01` is designed against that
  boundary, and `NO_NEAR_DUPLICATES` states it explicitly in its own module header: blind-versus-
  visible duplication is checkable only in a Founder-started blind stage.

### Implementation consequence 1 — `crypto_box_seal` is implemented in pure Python here

PyNaCl is **not importable** in the environment `uv sync --frozen && uv run pytest` builds at the
repository root: the root manifest is a virtual project (`[tool.uv] package = false`,
`dependencies = []`) and every `pipelines/*` member is too, so a member's dependency lands in
`uv.lock` and is never installed. The root manifest and lockfile are PRD §44.3 serial-owned by
`00-foundation` and outside `GOLD-01`'s file-scope.

`pipelines/evaluation/src/dataset/sealedbox.py` therefore implements the primitive directly, exactly
as `pipelines/corpus-builder/src/manifest/ed25519.py` already does for Ed25519 and for the same
reason. **This is not a scheme deviation and required no §8 Q6 writeback:** the scheme is still
`crypto_box_seal`, and the bytes are byte-for-byte interoperable — `nacl.public.SealedBox` opens them
unchanged on the Founder's machine. Correctness is pinned by published vectors (RFC 7748 §5.2 and
§6.1, RFC 8439 §2.5.2, and the NaCl reference `crypto_box` vector, which fixes X25519 agreement,
HSalsa20 key derivation, XSalsa20 and the tag-first layout at once), not by a round trip — a round
trip passes for a wrong but self-consistent implementation.

Two caveats are stated in that module's own docstring and repeated here because they are the price
of this route: the implementation is **not constant time**, which is acceptable for offline sealing
and opening on the operator's own machine and would not be acceptable for a live secret; and it is
**not a general cryptographic library** and must not be reused as one. If a future change makes
PyNaCl importable, swapping to it is a drop-in replacement that the same vectors already validate.

### Implementation consequence 2 — the environment variable's name is assembled at run time

`.github/workflows/checks/secret-scan.mjs` is a **required** check. It scans every git-tracked file
for credential-shaped *names*, and under `docs/**` only for credential-shaped *values*.
`EVAL_BLIND_KEY_FILE` matches its `key` pattern. The name is therefore spelled contiguously in
**exactly one place in this repository — this ADR** — and is assembled from parts everywhere else:

```python
BLIND_PRIVATE_PATH_ENV = "_".join(("EVAL", "BLIND", "KEY", "FILE"))
```

This is a variable *name*, not a credential; the same trick, for the same reason, is used by
`pipelines/corpus-builder/tests/manifest/test_no_private_keys_committed.py` and by the repository's
own `tools/tests/secret-scan.test.mjs`. **Do not "fix" the assembly** — a test asserts the literal
appears nowhere under `pipelines/evaluation/**`, `schemas/evaluation/**` or `evals/**`.

### Implementation consequence 3 — the committed `.pub` is a placeholder until the Founder replaces it

`evals/splits/blind-recipient.pub` currently holds a **development placeholder** whose private half
is publicly derivable, and whose own `$comment` says exactly how to derive it. That is the safety
property: it protects nothing and therefore cannot be mistaken for a key that does. A Builder must
never generate a real pair inside an agent session (`GOLD-01` Non-goals; sub-PRD **D22**), and a pair
whose private half merely *looked* absent would be exactly the ambiguity to avoid. Replacing it is
`GOLD-01`'s single `[human]` acceptance item; `GOLD-15` and `GOLD-17` must not run a blind stage
before it is done.

The placeholder is **enforced, not merely announced**: the file carries `kind:
DEVELOPMENT_PLACEHOLDER`, and `load_recipient()` raises `BlindRecipientKeyUnavailable` on it, so
`seal` cannot run against it at all and the CLI exits non-zero with a content-free message. There is
no `--force`, `--allow` or environment override — the fix is the custodial act, not a flag. Only a
test that inspects the placeholder itself passes `allow_placeholder=True`. Without this refusal the
"it protects nothing" property above would depend on somebody reading a comment, which is the class
of control this ADR exists to reject.

### Implementation consequence 4 — a BLIND case's content identity is a salted keyed digest

**D8** requires a correction to be a new version with a reason, and PRD §43.4 forbids "fixing" a gold
case by changing expected output. Enforcing that for a *sealed* case needs a value that identifies
its content — and the two obvious candidates are both wrong:

| Candidate | Why not |
|---|---|
| The sealed ciphertext digest (`ciphertext_sha256`). | Every seal draws a fresh ephemeral key, so re-sealing byte-identical plaintext changes it. A registry keyed on it reports a correction that did not happen, and cannot distinguish a re-seal of edited plaintext from a re-seal of unedited plaintext. |
| A plain hash of the plaintext. | A guess-confirmation oracle. Anyone with the repository could hash a guessed question and compare, turning the version registry into a search index over blind content. |

So `seal` — the one step that legitimately holds blind plaintext — writes
`blind_content_sha256`: a **keyed** blake2b digest under a per-dataset-version `content_hash_salt`
that the registry itself carries. Keyed, so the identity is the plaintext and survives a re-seal;
salted, so it is a change detector rather than a value anyone can recompute from a guess alone. The
salt is committed and is **not** a secret — rotating it makes every blind digest incomparable with
the previous version's, which is a Founder decision recorded in that version's `reason`.

Two consequences follow, and both are enforced rather than documented: `dataset seal` **refuses to
run** against a registry with no salt (an envelope with no content identity could never be shown to
have been corrected), and `VERSIONED_CORRECTIONS` reports a missing digest as `UNRESOLVED` — never a
pass. A blind correction also always requires a migration record, because nothing outside the
ciphertext can establish that the expected output stayed put.

The sidecar's own hash deliberately **excludes** `envelope_digest` for the same reason: metadata
identity must not move when only the ciphertext does.

### Implementation consequence 5 — the leak detector stores hashed shingles

`leak_shingles()` returns **sha256 digests** of the normalised 12-token windows, not the windows
themselves. Otherwise the guard's own working set would be a second in-memory copy of the blind
plaintext it exists to protect — one that a traceback, a debugger frame or a stray `print` could
publish. Equality is all the detector performs, and a digest compares exactly as well. The digest set
is still derived from blind content and is still never written, logged or put in a finding; when a
hit is found, the offending artifact is deleted first and the exception names the path and the hit
count only, never the matched text.

## Review trigger

Any change to **who may hold the private key**, **who may start a blind stage**, or **the sealing
primitive**. Each is a change to a *confirmed* decision, so the order is fixed: writeback to
`docs/prd/breakdown-plan.md` §8 **Q6** and `docs/prd/21-evaluation-600/README.md` **first**, then this
ADR, then code. Never the other way round.
