---
id: RLSE-01
title: "Immutable release archive: build, checksums, signature, SBOM"
module: 18-ops-release
lane: 18-ops-release
size: L
agent: builder
status: draft
date: 2026-08-03
blocked_by: [FND-02, RUNT-01, RUNT-04, RETR-01]
blocks: [RLSE-02, RLSE-04, ASSR-02]
---

# RLSE-01 — Immutable release archive: build, checksums, signature, SBOM

Implements PRD §20.3, §20.4, §21.1 and §39.7 — requirement family `OPS-002`, epic `E30-OBS-DR`.
**No ADR — the decision is already made in PRD §20.3 ("CI builds one immutable app artifact") and
§39.2 ("CI publishes an immutable versioned release archive with checksums/signature"); this is build
ticket 1 of 11 against it.**
Parent sub-PRD: [18-ops-release README](../README.md). Master spec: [PRD](../../../PRD.md).
Depends on: `FND-02` (CI gate pipeline, `00-foundation`), `RUNT-01` (Fastify skeleton,
`03-app-runtime`), `RUNT-04` (worker runtime, `03-app-runtime`), `RETR-01` (search-rs skeleton,
`11-retrieval-engine`) — mirrors `blocked_by`.
**Why `builder`:** a bounded change inside one module's declared file-scope producing the artifact
PRD §20.3 already enumerates content-by-content — not a new subsystem decision.

## Background + basis

**The archive contract is one sentence.** PRD §20.3, closing the CI-gates section:

> CI builds one immutable app artifact containing **Web/server/worker/search/migrations/OpenAPI/SBOM/
> manifests**. Production MUST verify and run it without floating installs or builds.

**Production may not build anything.** PRD §19.1: *"Production MUST NOT compile application code,
build large indexes or generate mass embeddings."* PRD §39.2: *"CI publishes an immutable versioned
release archive with checksums/signature; **no source build or floating package install occurs during
promotion**."*

**Signature and SBOM are security controls, not metadata.** PRD §21 opens with the trust rule:

> Trust **application/corpus artifacts only after signature/hash/compatibility verification**; trust a
> displayed answer only after deterministic validation.

and PRD §21.1 lists among required controls: *"Pinned dependencies/images, lockfiles, SBOM, scans,
signed manifests and no arbitrary runtime plugin/model/code download."*

**The archive is step 1 of the deployment sequence.** PRD §39.7:

> 1. CI produces a signed/checksummed release archive, OpenAPI, migrations, SBOM and compatibility
>    manifest; tests and scans pass.

**Compatibility ranges are declared, not inferred.** PRD §20.4: *"Application and corpus releases are
independently versioned and declare compatibility ranges."* PRD §18.4 requires the **corpus** manifest
to carry *"app/search compatibility"*; this ticket produces the matching declaration on the
application side, which `RLSE-07` compares before promoting a bundle and which `RUNT-08`'s readiness
check *"active corpus compatible"* (PRD §42.1) resolves against.

**The signing key is never on the host and never in the repository.** PRD §39.6: *"Offline signing and
destructive backup credentials are never present on the host."* PRD §20.2: *"Coding agents MUST NOT
receive production SSH, database, backup, signing or provider credentials by default."* Therefore
every `[machine]`/`[fixture]` check here uses a committed **development** keypair whose `key_id`
starts `dev-`, exactly as `CRPS-02` deliverable 8 does for the corpus manifest.

**Why these four blockers.** breakdown-plan §5.19 and §6.2: `FND-02 --> RLSE-01`,
`RUNT-01 --> RLSE-01`, `RUNT-04 --> RLSE-01`, `RETR-01 --> RLSE-01`. `FND-02` owns
`.github/workflows/**` and is the caller; `RUNT-01`, `RUNT-04` and `RETR-01` produce the three process
entry points (`apps/api`, `apps/worker`, `services/search-rs`) whose build outputs the archive
contains. `apps/web` is `RUNT-05` and is **not** a blocker — the web bundle is included by path
convention when it exists, and its absence is a recorded, non-fatal gap for a pre-`RUNT-05` build
(deliverable 3).

**Accepted caveats carried forward, documented not enforced here:**

- **The CI workflow that calls this builder is `FND-02`'s** (`.github/workflows/**`,
  `00-foundation`). This ticket ships a builder with a stable CLI contract and documents the exact
  invocation; it never writes a workflow file. If the workflow does not yet call it, that is a
  `00-foundation` writeback, not a local fix.
- **Root manifests, lockfiles and tool-version files are `FND-01`'s.** This ticket **reads**
  `.node-version`, `rust-toolchain.toml`, `pyproject.toml`/`uv.lock`, `pnpm-lock.yaml` and
  `Cargo.lock` to record the toolchain pins in the manifest (PRD §45.3: *"Exact Node/pnpm/Python/Rust
  versions belong in committed tool-version files and lockfiles"*) and writes none of them.
- **Whether `pnpm-workspace.yaml` includes `infra/*`** is sub-PRD open question **Q-RLSE-9**. Tests
  here are runnable both through `pnpm test` and directly via `node --test infra/deploy/release/test`
  (sub-PRD **D21**), so the answer does not block this ticket.

## Goal

Produce `infra/deploy/release/**`: a deterministic builder that turns a clean checkout at a known
commit into exactly one immutable, checksummed, signed archive containing every artifact PRD §20.3
names, plus a verifier that a production host can run with no network access and no build toolchain.
Completion is mechanically checkable: building the same commit twice yields byte-identical archives;
the verifier rejects a single flipped byte in any member file, a wrong or missing signature, and a
manifest whose declared compatibility range does not parse; a content scan proves the archive
contains no source tree, no development dependency, no `.env` and no credential; and the whole
verification path runs offline against a committed `dev-` keypair.

## Non-goals

- **No CI workflow file.** `.github/workflows/**` is `FND-02` (`00-foundation`). This ticket ships
  the builder that the workflow invokes and documents the invocation.
- **No host installation, systemd unit, filesystem layout or unpacking onto a host.** `RLSE-02`
  (`infra/deploy/host/**`).
- **No deployment, migration execution, pointer switch or rollback.** `RLSE-06`
  (`infra/deploy/promote/**`).
- **No corpus bundle, corpus manifest or corpus signing.** `04-corpus-contract` (`CRPS-02`,
  `CRPS-06`, `CRPS-07`); `schemas/corpus-manifest/**` is PRD §44.3 serial-owned there. The two
  manifests are deliberately named differently (sub-PRD **D20**).
- **No application code.** `apps/api/**` is `RUNT-01`…`RUNT-03`/`RUNT-08`, `apps/worker/**` is
  `RUNT-04`, `apps/web/**` is `RUNT-05`, `services/search-rs/**` is `11-retrieval-engine`,
  `packages/database/migrations/**` is `DATA-01`. The builder consumes their build outputs.
- **No dependency/secret/container scanning implementation.** PRD §20.3's scan gate is `FND-02`'s CI
  job; this ticket **emits the SBOM those scanners read** and fails if the SBOM is incomplete.
- **No supply-chain attack suite.** `tests/security/supply-chain/**` is `23-assurance` (`ASSR-02`,
  `blocked_by` this ticket). This ticket exports the verifier API `ASSR-02` drives.
- **No production or real signing key.** PRD §20.2, §39.6. Committed key material is the `dev-`
  keypair only.
- **No `infra/compose/**`.** `RUNT-09` (`03-app-runtime`), breakdown-plan **A7**.

## File-scope (write-owns)

- `infra/deploy/release/**` — the builder, signer, verifier, manifest schema, CLI, its own
  `package.json` if the workspace member does not already exist, `test/**` and `fixtures/**`
  (including the `dev-` keypair).

Does not touch:

- `infra/deploy/{host,promote,corpus,monitoring,benchmark}/**` — `RLSE-02`, `RLSE-06`, `RLSE-07`,
  `RLSE-08`, `RLSE-11`. `infra/{cloudflare,aws,backup,recovery}/**` — `RLSE-03`, `RLSE-04`,
  `RLSE-05`, `RLSE-09`. `docs/runbooks/**` — `RLSE-10`.
- **`infra/compose/**` — `RUNT-09` (`03-app-runtime`), breakdown-plan A7.** Production is systemd and
  an immutable archive; Compose is a local/CI convenience only (PRD §39.2). This ticket must not read
  it, write it, or make any production procedure depend on it.
- `.github/workflows/**`, root `package.json`, `pnpm-workspace.yaml`, `pnpm-lock.yaml`, `Cargo.toml`,
  `Cargo.lock`, `rust-toolchain.toml`, `.node-version`, `pyproject.toml`, `uv.lock`, `tools/**`,
  root `README.md` — `00-foundation` (`FND-01`, `FND-02`), PRD §44.3 serial-owned.
- `apps/**`, `packages/**`, `services/**`, `pipelines/**`, `schemas/**`, `evals/**` — the modules that
  own them (breakdown-plan §4). `tests/**` — `23-assurance`. `docs/PRD.md`,
  `docs/prd/breakdown-plan.md` — frozen / not this ticket's to edit.

**Serial-safety analysis.** First decomposition (breakdown-plan §1 header: `phase: 1`, `append:
false`, `existingFiles: ['.gitkeep']`) — nothing is merged, no ticket has ever written
`infra/deploy/release/**`, and there is no in-flight contention. breakdown-plan §4 gives
`infra/deploy/**` to `18-ops-release` and §5.19 gives `infra/deploy/release/**` wholly to this ticket;
every sibling owns a different subtree (`host`, `promote`, `corpus`, `monitoring`, `benchmark`) or a
different top-level `infra/` directory, so sibling scopes are disjoint by construction. This ticket is
alone in the module's wave 1 (sub-PRD work-breakdown), so no sibling can run concurrently with it at
all. `infra/compose/**` belongs to `RUNT-09` and must not be touched here (breakdown-plan **A7**,
§4.1).

## Deliverables

1. **`infra/deploy/release/README.md`** — one page: what the archive is, the PRD §20.3 content list,
   the exact CI invocation for `FND-02`, the verification command a host runs, the `dev-` key
   convention, and the statement that production never builds (PRD §19.1, §39.2).
2. **`infra/deploy/release/lib/version.mjs`** — release identity (sub-PRD **D20**):
   `releaseVersion({ semver, gitSha })` → `<semver>+<git-short-sha>` (7 hex chars);
   `archiveName(version)` → `aer-app-<version>.tar.zst`; `MANIFEST_FILENAME = 'app-release-manifest.json'`.
   The manifest filename is deliberately **not** `release-manifest.json`, which PRD §18.4 reserves for
   the corpus bundle. A test asserts the two names differ.
3. **`infra/deploy/release/lib/collect.mjs`** — `collectMembers(repoRoot, opts) -> Member[]`, the
   PRD §20.3 content set, each member declared as `{ role, sourcePath, archivePath, required }`:

   | `role` | Source (build output) | Archive path | Required |
   |---|---|---|---|
   | `web` | `apps/web/dist/**` (`RUNT-05`) | `web/` | no — recorded as a gap until `RUNT-05` lands |
   | `admin` | `apps/admin/dist/**` (`22-internal-admin`) | `admin/` | no — recorded as a gap |
   | `widget` | `apps/widget/dist/**` (`20-developer-platform`) | `widget/` | no — recorded as a gap |
   | `server` | `apps/api` build output (`RUNT-01`) | `server/` | **yes** |
   | `worker` | `apps/worker` build output (`RUNT-04`) | `worker/` | **yes** |
   | `search` | `services/search-rs` release binary (`RETR-01`) | `search/` | **yes** |
   | `migrations` | `packages/database/migrations/**` (`DATA-01`) | `migrations/` | **yes** |
   | `openapi` | `schemas/openapi/openapi.yaml` (`FND-04`) | `openapi/openapi.yaml` | **yes** |
   | `sbom` | generated (deliverable 5) | `sbom/` | **yes** |
   | `manifests` | generated (deliverable 4) | `app-release-manifest.json` | **yes** |

   A missing **required** member aborts the build naming the role and its owning ticket. A missing
   optional member is recorded in the manifest's `gaps[]` array and printed — never silently omitted
   (PRD §44.4's principle: an unimplemented thing is never silently called present).
4. **`infra/deploy/release/lib/manifest.mjs`** — builds `app-release-manifest.json` with exactly these
   required members, and a JSON Schema (draft 2020-12, `additionalProperties: false`) at
   `infra/deploy/release/schema/app-release-manifest.schema.json` that validates it:
   `manifest_version` (semver), `release_id` (= `version`), `semver`, `git_commit` (full sha),
   `git_tree_clean` (boolean), `built_at` (UTC ISO-8601), `builder_version`,
   `toolchain` (`{node, pnpm, rust, python, uv}` read from the committed tool-version files and
   lockfile headers — PRD §45.3), `members` (`[{role, archive_path, sha256, byte_size, file_count}]`),
   `files` (`[{path, sha256, byte_size}]` for **every** file in the archive),
   `total_byte_size`, `compatibility` (`{corpus: {min, max}, search_protocol: {min, max},
   app_schema_migration_head}` — PRD §20.4, §18.4), `migrations` (`{head, count, checksums: {...}}`),
   `openapi_sha256`, `sbom` (`[{ecosystem, path, sha256, component_count}]`), `gaps` (`[{role,
   reason}]`), `signature` (`{algorithm, key_id, value, signed_at}` | null) and `manifest_sha256`.
   Each member carries a `description` quoting the PRD phrase it satisfies, so the schema alone
   explains itself.
5. **`infra/deploy/release/lib/sbom.mjs`** — one SBOM document per ecosystem (npm/pnpm, Cargo, Python)
   in CycloneDX JSON, produced **from the committed lockfiles**, not from a live registry query
   (PRD §21.1 "Pinned dependencies/images, lockfiles, SBOM"). Every component carries name, version,
   licence where declared, and a purl. The build fails if any ecosystem present in the repository has
   no SBOM, or if an SBOM's component count is zero.
6. **`infra/deploy/release/lib/archive.mjs`** — `buildArchive(members, outPath)`, **deterministic**:
   entries sorted by archive path; `mtime` fixed to the commit timestamp; `uid`/`gid` = 0, owner/group
   names empty; file mode normalised to `0644`/`0755` (executable bit preserved, nothing else);
   no per-run compression timestamp; zstd at a pinned level. Ordering constraint: hash and manifest
   generation happen over the **member files**, then the manifest is written, then the archive is
   created containing the manifest — so the manifest never has to hash itself.
7. **`infra/deploy/release/lib/canonical.mjs`** — `canonicalBytes(manifest)`: RFC 8785-style JSON
   canonicalisation (keys sorted by code point, no insignificant whitespace, shortest round-trip
   numbers), with `signature` and `manifest_sha256` **excluded**. `manifest_sha256` is the lowercase
   hex SHA-256 of those bytes; the signature covers the same bytes. This mirrors `CRPS-02`
   deliverable 6 exactly, so an operator learns one rule for both manifests. Ordering constraint:
   build → canonicalise → hash → sign → write; a manifest is never mutated after `manifest_sha256`
   is set.
8. **`infra/deploy/release/lib/signing.mjs`** —
   `signRelease(manifest, { privateKeyPath, keyId })` (detached **Ed25519** over `canonicalBytes`) and
   `verifySignature(manifest, { publicKeys })`. Keys are read from a filesystem path or environment
   variable **only**. The single committed keypair lives at
   `infra/deploy/release/fixtures/keys/` with `key_id` `dev-release-2026` — a `key_id` not starting
   `dev-` may never appear in a committed fixture, asserted by a test.
9. **`infra/deploy/release/verify-release.mjs`** — the command a production host runs, with **no
   network access, no build toolchain and no workspace resolution**:
   `node verify-release.mjs --archive <path> --public-key <path> [--expect-version <v>]
   [--expect-corpus <id>]`. It verifies, in this order and stopping at the first failure:
   (1) archive opens and extracts to a temporary directory; (2) `app-release-manifest.json` validates
   against the committed schema; (3) `manifest_sha256` matches `canonicalBytes`; (4) the signature
   verifies against a known `key_id`; (5) every `files[]` entry exists with the recorded sha256 and
   byte size, and **no extra file exists in the archive** (both directions); (6) every required member
   role is present; (7) `compatibility` ranges parse and, when `--expect-corpus` is supplied, the
   named corpus release falls inside them. Exit codes: `0` verified, `2` refused (any check above),
   `1` transport/internal error. It prints a one-line reason and never prints key material.
10. **`infra/deploy/release/lib/hygiene.mjs`** — `assertArtifactOnly(extractedDir)`, run at build time
    **and** available to the verifier: refuses an archive containing any of `node_modules/`, `.git/`,
    `src/` for a compiled member, `*.env`/`.env*`, a private-key header (`-----BEGIN … PRIVATE KEY`),
    an AWS/R2 access-key-shaped string, a Cloudflare tunnel token, `app.sqlite*`, `ephemeral.sqlite*`,
    a corpus bundle file, or any `evals/gold/**` path (PRD §14.3; breakdown-plan **R9**). Each
    rejection names the offending **path**, never the offending value.
11. **`infra/deploy/release/build-release.mjs`** — the CLI `FND-02` invokes:
    `node build-release.mjs --out <dir> [--semver <x.y.z>] [--sign --key <path> --key-id <id>]
    [--dry-run]`. `--dry-run` collects, hashes and prints the planned member list, total bytes and
    `gaps[]` without writing an archive. Without `--sign` the manifest's `signature` is `null` and the
    build prints that the artifact is **not promotable** (`RLSE-06` and `RLSE-07`-style refusal:
    unsigned artifacts are never promoted).
12. **`infra/deploy/release/lib/api.mjs`** — the small stable export surface `ASSR-02`
    (`23-assurance`, `blocked_by` this ticket) drives: `verifyArchive(path, opts) -> VerifyReport`,
    `readManifest(path)`, `listSbomComponents(path)`. `VerifyReport` is
    `{ ok, findings: [{check, code, severity, subject}] }` — findings are codes and subjects, never
    free text carrying file contents.
13. **`infra/deploy/release/lib/size-budget.mjs`** — records the archive's uncompressed and compressed
    size and fails the build above a configured ceiling (default: uncompressed ≤ 2 GiB), because
    PRD §39.3 gives the release directories a 60 GB system disk shared with `app.sqlite` and logs, and
    PRD §42.2 alerts on disk at 75%/85%. The measured numbers go in the manifest and in the PR's
    memory/disk line (PRD §45.4).

## Acceptance checklist (classified)

Cross-references: `OPS-002` (observable, verifiable release state), `ADM-002` (the promotion path this
artifact feeds), `OPS-003` (no unbudgeted dependency introduced), `OPS-001` (unaffected — no backup
surface here).

- [ ] `[machine]` Building the same commit twice produces **byte-identical** archives (same sha256),
      including under a different working directory, a different `TZ` and a different `umask`
      (PRD §20.3 "one immutable app artifact"; deliverable 6)
- [ ] `[machine]` The archive contains every **required** PRD §20.3 member role — server, worker,
      search, migrations, OpenAPI, SBOM, manifests — and a missing one aborts the build naming the
      role and its owning ticket (PRD §20.3; deliverable 3)
- [ ] `[machine]` A missing **optional** member (web/admin/widget before their modules land) is
      recorded in `gaps[]` and printed, never silently omitted (PRD §44.4 principle; deliverable 3)
- [ ] `[machine]` `verify-release.mjs` rejects a single flipped byte in any member file, a removed
      file, an **added** file not listed in `files[]`, a mutated manifest, a missing signature, a
      signature by an unknown `key_id`, and a `manifest_sha256` mismatch — one test per case, each
      asserting exit code `2` and a named check code (PRD §21 "Trust application/corpus artifacts only
      after signature/hash/compatibility verification")
- [ ] `[machine]` `verify-release.mjs` completes with **no network access** and without installing or
      compiling anything — asserted by running it with outbound network blocked in-test and by a
      source scan proving it imports nothing outside the Node standard library and this directory
      (PRD §19.1, §20.3 "without floating installs or builds", §39.2)
- [ ] `[machine]` `assertArtifactOnly` refuses an archive containing `node_modules/`, a `.env`, a
      private-key header, an AWS/R2-shaped access key, a Cloudflare tunnel token, `app.sqlite`,
      `ephemeral.sqlite`, a corpus bundle file, or an `evals/gold/**` path — one test per case,
      each asserting the offending **path** is named and the offending **value** appears in no output
      byte (seed each with a `secret-canary-<uuid>`) (PRD §21.1, §22, §14.3; breakdown-plan R9)
- [ ] `[machine]` The manifest validates against the committed JSON Schema and carries every member of
      deliverable 4, asserted against an explicit literal list (PRD §20.3, §20.4, §39.7 step 1)
- [ ] `[machine]` `compatibility.corpus.{min,max}` and `search_protocol.{min,max}` are present and
      parse; `--expect-corpus` outside the range exits `2` (PRD §20.4 "declare compatibility ranges";
      PRD §42.1 readiness "active corpus compatible")
- [ ] `[machine]` The manifest filename is `app-release-manifest.json` and differs from the corpus
      bundle's `release-manifest.json`; a test asserts the two constants are not equal (PRD §18.4;
      sub-PRD D20)
- [ ] `[machine]` An SBOM exists for every ecosystem present in the repository, each with a non-zero
      component count and every component carrying name, version and purl; a missing ecosystem fails
      the build (PRD §21.1 "lockfiles, SBOM, scans")
- [ ] `[machine]` SBOMs are generated from the committed lockfiles with **no network access**
      (PRD §21.1 "Pinned dependencies"; PRD §20.3)
- [ ] `[machine]` The toolchain block records the versions from the committed tool-version files and
      lockfiles, and the build fails if a tool-version file is absent (PRD §45.3)
- [ ] `[machine]` An unsigned build prints that the artifact is **not promotable** and sets
      `signature: null`; the verifier refuses it when a public key is supplied (PRD §21, §39.7 step 1)
- [ ] `[machine]` No committed fixture key has a `key_id` outside the `dev-` prefix, and no private
      key is read from a committed path at build time other than the fixture (PRD §39.6, §20.2;
      `CRPS-02` deliverable 8 convention)
- [ ] `[machine]` `--dry-run` writes no file and prints the member list, total bytes and `gaps[]`
      (deliverable 11)
- [ ] `[machine]` The archive size budget is enforced and the measured compressed/uncompressed sizes
      appear in the manifest (PRD §39.3 disk layout; PRD §42.2 disk thresholds)
- [ ] `[machine]` No file outside `infra/deploy/release/**` is modified — asserted by
      `git diff --name-only` against the base branch. In particular `infra/compose/**` is untouched
      (breakdown-plan **A7**; sub-PRD D2)
- [ ] `[machine]` `pnpm lint`, `pnpm typecheck`, `pnpm test` green (PRD §20.3, §45.3)
- [ ] `[machine]` PR states the PRD §45.4 items, naming `OPS-002`, the supply-chain/security impact
      (SBOM, signing, hygiene scan), the disk/size impact, the rollback path (a prior signed archive
      is always retained by `RLSE-06`) and the known gaps (`gaps[]`)
- [ ] `[fixture]` The committed golden archive fixture
      (`infra/deploy/release/fixtures/golden/`) re-verifies end to end and its manifest matches the
      recorded golden byte-for-byte except `built_at` — this is the replay that lets `RLSE-02`,
      `RLSE-06` and `ASSR-02` build against a real artifact before a real CI run exists
- [ ] `[human]` One real CI run through `FND-02`'s workflow produces a signed archive with the real
      offline key, and the founder verifies it on a clean machine using only
      `infra/deploy/release/README.md`. **Not required to merge** — PRD §20.2 forbids giving coding
      agents the signing key; the merge-time substitute is the `dev-` keypair, which exercises the
      identical code path and proves signature generation, verification and every refusal case
      (PRD §39.6, §20.2)
- No `[fixture]` items beyond the golden archive — this ticket replays no source-adapter or
      evaluation data (breakdown-plan §1.1)
- No `cargo test --workspace` / `uv run pytest` item — this ticket authors no Rust and no Python; it
      **consumes** their build outputs and lockfiles (PRD §45.3)

## Test plan

Reviewer steps. Everything except the single `[human]` row runs offline with no network, no paid
infrastructure and no production credentials (PRD §20.2):

1. `corepack pnpm install --frozen-lockfile`; `pnpm typecheck && pnpm lint`.
2. `pnpm test --filter @aer/infra-release`, **or** — if the workspace member is absent
   (open question **Q-RLSE-9**) — `node --test infra/deploy/release/test`. Both must pass; the
   ticket is not done if only one works.
3. Harness: `test/helpers/fakeRepo.mjs` builds a synthetic repository tree in a temporary directory
   containing stub build outputs for every member role, stub lockfiles and stub tool-version files.
   Copy its construction pattern from `docs/prd/04-corpus-contract/tickets/CRPS-07-*.md`'s
   `RecordingObjectStore`/`candidate_factory` approach: a factory that produces a *real* artifact, not
   a hand-written fake manifest.
4. **`determinism.test.mjs`** — build twice from the same fake repo with different `TZ`, `umask` and
   working directory; assert identical archive sha256 and identical `files[]`.
5. **`members.test.mjs`** — remove each required member in turn and assert the build aborts naming the
   role and its owning ticket; remove each optional member and assert a `gaps[]` entry plus a
   non-zero-length printed warning and a successful build.
6. **`verify.test.mjs`** — table-driven tamper matrix: flip one byte in each member role; delete a
   file; add an unlisted file; mutate one manifest field; strip the signature; sign with a second
   `dev-` key not in the trusted set; corrupt `manifest_sha256`. Each asserts exit `2` and the exact
   check code. Then run the verifier with outbound network blocked and assert success on the clean
   archive.
7. **`hygiene.test.mjs`** — one case per forbidden artifact class in deliverable 10, each seeded with
   a `secret-canary-<uuid>`; assert refusal, that the path is named, and that the canary appears in no
   emitted byte.
8. **`sbom.test.mjs`** — assert one document per ecosystem present in the fake repo, non-zero
   component counts, purls present, and that removing an ecosystem's SBOM fails the build. Assert no
   network call is attempted (stub `fetch`/`https` to throw).
9. **`manifest-schema.test.mjs`** — validate a produced manifest against the committed schema with the
   repository's JSON-Schema validator; assert every deliverable-4 member exists against a literal
   list; assert `MANIFEST_FILENAME !== 'release-manifest.json'`.
10. **`compatibility.test.mjs`** — `--expect-corpus` inside and outside the declared range; assert
    exit `0` and `2` respectively.
11. **`golden.test.mjs`** — the `[fixture]` row: verify the committed golden archive and diff its
    manifest against the recorded golden, ignoring `built_at`.
12. **Diff check** — `git diff --name-only` against the base branch lists only paths under
    `infra/deploy/release/`.
13. **Reviewer focus (security-sensitive):** confirm the verifier cannot be bypassed by a flag;
    confirm hashing is streamed (a member can be hundreds of MiB — no whole-file `readFileSync`);
    confirm no key material, environment variable value or file content reaches stdout, stderr or the
    manifest; confirm the "no extra file" direction of the hash check is actually asserted (a
    one-directional check lets an attacker add a payload); confirm `assertArtifactOnly` runs before
    the archive is written, not after.

## Feedback obligation

**1. General rule.** If implementation falsifies this ticket, update **this ticket file** first
(docs PR → merge → `publish-tickets.mjs --sync`) and, where module context changes,
`docs/prd/18-ops-release/README.md` (version +0.1 with a changelog line), **then** change code. Silent
divergence is an incomplete ticket (CLAUDE.md, issue #53).

**2. Foreseeable frictions, each with its exact writeback target.**

- **A required member cannot be produced because its module has no build output yet** (for example
  `services/search-rs` produces no release binary) → do **not** downgrade it to optional silently.
  Raise it against the owning ticket (`RETR-01`, `RUNT-01`, `RUNT-04`) as a docs PR, and record the
  interim state in `docs/prd/18-ops-release/README.md`'s open-questions table. PRD §20.3 names the
  member; removing it changes what "one immutable app artifact" means.
- **Byte-identical rebuilds prove impossible** (a toolchain embeds a timestamp or a path) → record the
  measured non-determinism and the mitigation in **this ticket's** deliverable 6 and in
  `docs/prd/18-ops-release/README.md` (Decisions), then implement. Falling back to "hashes of members
  are stable even if the archive is not" is acceptable **only** if written down first — PRD §21's
  trust rule depends on hashes, not on the archive envelope.
- **The SBOM cannot be generated offline for an ecosystem** → that conflicts with PRD §21.1's
  "Pinned dependencies/images, lockfiles, SBOM". Record the constraint in this ticket and raise the
  lockfile gap against `FND-01` (`00-foundation`, PRD §44.3 serial-owned lockfiles). Do **not** add a
  network fetch to the build.
- **`FND-02`'s workflow needs a different CLI contract** → the CLI is this ticket's contract. Change
  it here (docs PR → `--sync`) and notify `00-foundation`; do not write `.github/workflows/**`.
- **An archive size or memory ceiling is exceeded** → record the measured numbers in the PR's
  memory/disk line (PRD §45.4) and in `docs/prd/18-ops-release/README.md`. If the fix implies more
  disk than PRD §19.1's "60 GB system disk + 32 GB attached SSD", that is a **cost** change under
  PRD §24.1 and therefore a **Founder** decision (sub-PRD **D18**) — never an assumption inside this
  ticket.
- **Signing needs a scheme other than Ed25519, or a key-management service** → write
  `docs/adr/NNNN-application-release-signing.md` first (PRD §45.5 "Architecture decision";
  breakdown-plan **A9** gives per-file ADR ownership to the creating ticket), record the consequence
  for `RLSE-06`/`RLSE-07` verification, and only then implement. A managed KMS is a paid line and
  therefore also **D18**.

**3. Escalation.** *"Production MUST verify and run it without floating installs or builds"*
(PRD §20.3) and *"Trust application/corpus artifacts only after signature/hash/compatibility
verification"* (PRD §21) are the two sentences the entire deployment path rests on. If either is
outright falsified — if production genuinely cannot verify before running, or an artifact genuinely
cannot be signed — that overturns a team decision `RLSE-02`, `RLSE-06`, `RLSE-07` and `ASSR-02` all
depend on: stop, escalate for re-review, and write back to
`docs/prd/18-ops-release/README.md` and `docs/prd/breakdown-plan.md` before any code lands. Never
weaken the verification boundary inside this ticket.
