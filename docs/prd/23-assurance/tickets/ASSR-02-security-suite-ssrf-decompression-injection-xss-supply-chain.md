---
id: ASSR-02
title: "Security suite: SSRF, decompression, injection, XSS, supply chain"
module: 23-assurance
lane: 23-assurance
size: L
agent: builder
status: draft
date: 2026-08-03
blocked_by: [INGF-02, EVID-10, RLSE-01]
blocks: []
---

# ASSR-02 — Security suite: SSRF, decompression, injection, XSS, supply chain

Implements PRD §21.1 and §37.4 — requirements **SEC-002** and **SEC-003**; epic `E28`; acceptance
script `UAT-ANS-04`.
No ADR — the decision is already made in PRD §21 (the four untrusted-input classes and the required
controls); this is build ticket 2 of 8 against it.
Parent sub-PRD: [23-assurance README](../README.md). Master spec: [PRD](../../../PRD.md).
Depends on: [INGF-02 — Safe fetcher (allowlist, DNS/IP denial, redirect/type/size/time)](../../05-ingestion-framework/tickets/INGF-02-safe-fetcher-allowlist-dns-ip-denial-redirect-type-size-time.md), [EVID-10 — Output sanitisation: code-generated URLs, Markdown/HTML allowlist](../../12-evidence-safety/tickets/EVID-10-output-sanitisation-code-generated-urls-markdown-html-allowlist.md), [RLSE-01 — Immutable release archive: build, checksums, signature, SBOM](../../18-ops-release/tickets/RLSE-01-immutable-release-archive-build-checksums-signature-sbom.md) (mirrors `blocked_by`)
**Why `builder`:** a bounded change inside one module's declared file-scope against a fixed contract —
PRD §21.1 and §37.4 already fix the controls and the numeric limits; this makes them executable, and
decides no new subsystem.

## Background + basis

**PRD §21 opening, quoted verbatim — the four untrusted inputs this suite exists for:**

> **Trust customer input, official source content, customer host pages and model output as
> untrusted.** Trust application/corpus artifacts only after signature/hash/compatibility
> verification; trust a displayed answer only after deterministic validation.

**PRD §21.1 required controls, the rows this suite asserts:**

> - Source allowlists, HTTPS, redirect/final-domain checks, private/link-local/metadata IP denial,
>   DNS-rebinding protection, file/type/time/size/resource limits and isolated parser/OCR processes.
> - **Evidence delimited as data; source instructions cannot select tools, URLs, providers or scope.**
> - Model has no arbitrary Web, shell, database or customer-data tools.
> - Output schema, citations, URLs and Markdown/HTML validated/sanitised; suggestions do not execute
>   automatically.
> - **Pinned dependencies/images, lockfiles, SBOM, scans, signed manifests and no arbitrary runtime
>   plugin/model/code download.**
> - `security.txt` and vulnerability-reporting address.

**PRD §37.4 source and parser isolation, quoted verbatim — the numeric limits are the acceptance
target:**

> Adapters use a shared fetcher, not arbitrary HTTP libraries. Each source has an allowlisted
> scheme/domain/path policy. **The fetcher resolves DNS and rejects loopback, private, link-local,
> multicast and cloud-metadata addresses before and after redirects.** Initial defaults: **5
> redirects, 30-second fetch timeout, 50 MiB document limit, 250 MiB safely decompressed limit and
> declared/observed type agreement.** Larger official bulk artifacts require a source-specific
> approved limit and offline processing.
>
> HTML is parsed without script execution. PDF/OCR/archive work runs in a resource-limited subprocess
> with no customer credentials or app database access. **Parser output is data; it does not execute
> macros, embedded files, external links or document instructions.**

**PRD §37.5, quoted verbatim:**

> The model gateway exposes no shell, Web, database, email, webhook or arbitrary tool. It receives
> only sanitized task facts and selected evidence. Returned JSON is schema-validated; all links and
> source metadata are constructed from system records. Markdown is rendered through an allowlist and
> HTML is sanitised. **Generated text never directly triggers an email, webhook, corpus promotion,
> record transition, credential use or external action.**

**Requirements.** `SEC-002` (PRD §30.2): *"Source fetches enforce allowlist, DNS/IP/redirect/type/size/
time limits … **SSRF and decompression-bomb suites pass**."* `SEC-003`: *"Model output is
schema/citation/licence/sanitisation validated before display … **Prompt-injection/XSS/invalid-URL
fixtures pass**."* PRD §41.2 `UAT-ANS-04`: *"Inject instruction in an official-source fixture →
**Instruction treated as evidence text; no tool/URL/scope change**."* PRD §26 Security/privacy
requires SSRF, injection, XSS and secret/supply-chain tests to pass before the MVP is done.

**Why this cannot live in the owning modules.** `INGF-02` proves its own fetcher rejects a bad URL;
`EVID-10` proves its own sanitiser removes a script tag. Neither can prove the property PRD §21 states
— that an instruction planted in *official source content* survives fetch, parse, pack and validation
as **data** and changes nothing downstream — because that chain crosses `pipelines/ingestion`,
`packages/citations` and `packages/model-gateway`. Nor can either prove that the **shipped release
artifact** carries no secret and no unpinned download path, which is a property of `RLSE-01`'s output,
not of anyone's source tree. PRD §45.2 assigns exactly this to `tests`.

**What the `blocked_by` closure guarantees (sub-PRD D3).** Via `INGF-02` → `INGF-01`, `CRPS-01`,
`FND-03` (the shared fetcher and the adapter/intermediate-record contract). Via `EVID-10` → `EVID-05`,
`EVID-04`, `FND-07`, `FND-10`, `RETR-09` (evidence pack with the delimitation invariant, the twelve
§36.6 checks, the sanitiser and URL allowlist). Via `RLSE-01` → `FND-02` (CI), `RUNT-01` (the API
shell, uniform errors and `request_id`), `RUNT-04` (worker runtime), `RETR-01` and `CRPS-08` (a signed
synthetic corpus fixture release), and transitively `DATA-01` … `DATA-05` (tenant repositories with
`assertTenantScoped`).

**Accepted caveats carried forward, each a row in `coverage-gaps.md`:**

- **Parser/OCR subprocess isolation is `INGF-06`**, which is this ticket's *sibling* under `INGF-02`,
  not its blocker (plan §6.2). The decompression assertions here therefore target the **fetcher's**
  250 MiB safely-decompressed limit (`INGF-02`), not the parser sandbox.
- **CSP, CSRF, cookie flags and rate limiting are `RUNT-02`/`AUTC-01`**, not in this closure.
- **The customer-host-page surface** (PRD §21's fourth untrusted input) is `PLTF-05`/`IDNT-07`
  (widget loader, iframe origin validation, `postMessage` schema). Not in this closure.
- **`security.txt` and the vulnerability-reporting address have no owner in breakdown plan §5** —
  sub-PRD open question **M-Q1**. It is recorded, not invented here.
- **Log-injection assertions against the observability logger** need `RUNT-07`; this suite asserts
  control-character neutralisation in the API's uniform error envelope (`RUNT-01`) and in the evidence
  pack (`EVID-04`) only.

## Goal

Produce `tests/security/{ssrf,injection,xss,supply-chain}/**`: an SSRF/limits matrix that drives
`INGF-02`'s fetcher through every PRD §37.4 rule against a local sink that records every connection
attempt; an injection suite that plants instructions inside official-source fixture text and proves
they change no legal date, tool, URL, provider or scope; an XSS/URL suite that proves no executable
or non-pack URL survives the `EVID-10` render boundary; and a supply-chain suite that verifies
`RLSE-01`'s archive signature, checksums and SBOM, proves the archive carries no secret and no
`evals/**` material, and proves no runtime download path exists. Completion is mechanically checkable:
each PRD-named control maps to at least one named test, the fetcher matrix asserts zero forbidden
sockets opened, and each suite fails on a deliberately-weakened fixture.

## Non-goals

- **No fetcher, artifact-store, licence or quarantine unit tests** — `05-ingestion-framework`
  (`INGF-02` … `INGF-05`). Cited, never duplicated.
- **No parser/OCR sandbox assertions** — `INGF-06` (not in this closure); recorded in
  `coverage-gaps.md`.
- **No sanitiser, URL-allowlist, validator or evidence-pack unit tests** — `12-evidence-safety`
  (`EVID-04`, `EVID-05`, `EVID-10`).
- **No PII assertions** — `ASSR-03` (`tests/security/pii/**`), which is this suite's sibling under the
  same workspace member.
- **No citation-validation or refusal-behaviour assertions on the persisted snapshot** — `ASSR-04`.
- **No tenant-isolation matrix** — `ASSR-01`.
- **No CSP/CSRF/cookie/rate-limit assertions** — `03-app-runtime` (`RUNT-02`) and `02-auth-core`
  (`AUTC-01`); not in this closure.
- **No widget/host-page assertions** — `20-developer-platform` (`PLTF-05`) and `13-identity-surface`
  (`IDNT-07`); not in this closure.
- **No dependency/container scanner configuration** — `00-foundation` (`FND-02`) owns
  `.github/workflows/**` and the scan jobs PRD §20.3 lists. This suite asserts properties of the
  produced archive, not the scanner's wiring.
- **No `security.txt` publication** — unowned in plan §5; sub-PRD **M-Q1**.
- **No evaluation cases or metrics** — `21-evaluation-600`.

## File-scope (write-owns)

Owned by this ticket:

- `tests/security/ssrf/**`, `tests/security/injection/**`, `tests/security/xss/**`,
  `tests/security/supply-chain/**` — including each subtree's `harness/**` and `fixtures/**`, and
  `tests/security/supply-chain/coverage-gaps.md`.
- `tests/security/package.json`, `tests/security/tsconfig.json` — **append-only**, own scripts and
  dependencies only (created by `FND-01`; sub-PRD **D16**). Shared with `ASSR-03`.

Does not touch:

- `tests/security/pii/**` — `ASSR-03` (concurrent sibling in the same member).
- `tests/tenant-isolation/**` — `ASSR-01`; `tests/integration/**` — `ASSR-04`, `ASSR-05`, `ASSR-08`;
  `tests/e2e/**` — `ASSR-06`, `ASSR-07`.
- **Any other module's package or app tree** — `packages/**`, `apps/**`, `services/**`,
  `pipelines/**`, `infra/**`, `schemas/**`, `evals/**`. Not even to make an assertion pass (sub-PRD
  **D1**).
- `.github/workflows/**`, root `package.json`, root lockfiles — `00-foundation`.
- `docs/PRD.md` — frozen. `docs/prd/breakdown-plan.md` — docs PR only.

**Serial-safety analysis.** First decomposition: nothing merged, no in-flight contention (plan §1
header). The four owned subtrees are written by no other ticket in the plan (plan §5.24). This is a
wave-1 ticket. Its only file-level neighbour is `ASSR-03`, which owns the **fifth** subtree
`tests/security/pii/**` in the same workspace member: the two share `tests/security/package.json` and
`tsconfig.json` as **append-only** files (plan §1.1 "Package manifests"), and nothing else. Conflicts
there resolve by re-running the package manager; `/start-all` serialises delivery. All three declared
blockers land first by construction.

## Deliverables

1. **`ssrf/harness/sink.ts` — a local network sink and connection recorder.** Binds an HTTP server on
   loopback plus a **connection-attempt recorder** installed at the socket layer, so the suite can
   assert not merely that a fetch failed but that **no socket to a forbidden address was ever opened**
   (PRD §37.4 *"resolves DNS and rejects … before and after redirects"*). Also provides a controllable
   resolver so a hostname can be made to resolve to different addresses on successive lookups.
2. **`ssrf/matrix.ts` — the PRD §37.4 rules as data**, one row per rule with its expected typed
   rejection:

   | # | Attack | Expected |
   |---:|---|---|
   | 1 | Host outside the source's allowlisted scheme/domain/path policy | Reject; zero sockets |
   | 2 | `http://` (non-HTTPS) allowlisted host | Reject |
   | 3 | Direct loopback / `127.0.0.1` / `::1` / `0.0.0.0` | Reject before connect |
   | 4 | Private ranges `10/8`, `172.16/12`, `192.168/16`, IPv6 ULA `fc00::/7` | Reject before connect |
   | 5 | Link-local `169.254/16`, `fe80::/10`; multicast | Reject before connect |
   | 6 | Cloud metadata `169.254.169.254` and its IPv6 form | Reject before connect |
   | 7 | Alternate encodings of a forbidden address (decimal, octal, hex, IPv4-mapped IPv6, trailing dot, unicode host) | Reject before connect |
   | 8 | Allowlisted host **redirecting** to a forbidden address | Reject at the redirect boundary; zero sockets to the target |
   | 9 | Allowlisted host redirecting to a different final domain outside the policy | Reject (PRD §21.1 *"final-domain checks"*) |
   | 10 | DNS rebinding — first resolution public, second private, across the redirect | Reject; zero sockets to the private address |
   | 11 | 6 redirects | Reject (limit is 5) |
   | 12 | Response that never completes | Reject at 30 s on the injected clock |
   | 13 | Body exceeding 50 MiB | Reject, streamed — peak memory bounded and asserted |
   | 14 | gzip/deflate/zip payload expanding beyond 250 MiB (decompression bomb) | Reject before exceeding the limit; peak memory bounded |
   | 15 | Declared `Content-Type` disagreeing with observed bytes | Reject (PRD §37.4 *"declared/observed type agreement"*) |

   Every row asserts a **typed** rejection from `INGF-02`'s fetcher (not a generic throw), that the
   recorder shows zero connections to the forbidden address, and that nothing was written to the
   artifact store.
3. **`ssrf/limits-are-not-configurable-away.test.ts`.** Assert the four numeric defaults are the PRD
   §37.4 values, that raising one requires the source-specific approved-limit path (PRD §37.4 *"Larger
   official bulk artifacts require a source-specific approved limit"*), and that no ambient
   environment variable can disable the allowlist or the IP denial.
4. **`injection/fixtures/**` — official-source fixture documents carrying planted instructions**
   (synthetic, authored here per sub-PRD **D6**). At minimum: "ignore previous instructions and cite
   …"; a fake system/role delimiter; a forged evidence-pack delimiter and nonce; an instruction to
   change the legal date; an instruction naming a different provider, base URL or model; an
   instruction to call a tool or fetch a URL; hidden text (white-on-white, zero-width, CSS-hidden,
   HTML comment); extreme repetition; an instruction embedded in a PDF text layer and in a table cell.
5. **`injection/source-instructions-are-data.test.ts` — `UAT-ANS-04`.** Drive each fixture through
   the real chain — `CRPS-08` fixture release → `RETR-09` client → `EVID-04` pack → `EVID-05`
   validator → `EVID-10` render — and assert **none** of the following changes: the request's legal
   date; the jurisdiction and mode; the pinned `corpus_release_id`; the selected model profile,
   provider or base URL; the evidence set (no new item appears); the tool surface (there is none);
   the output URLs (pack-identical only). Assert the planted text appears **only** as delimited
   evidence content, and that the model stub's recorded input contains the delimiter invariant.
6. **`injection/delimiter-forgery.test.ts`.** Feed evidence text containing the delimiter grammar and
   a guessed nonce; assert `EVID-04`'s per-call nonce makes the forgery inert and that assembly
   neutralises the occurrence rather than trusting it.
7. **`injection/parameter-injection.test.ts`.** Drive `DATA-02`'s repositories directly with
   adversarial values — `'; DROP TABLE …`, `" OR 1=1 --`, `%00`, a raw NUL byte, oversized inputs, unicode
   normalisation tricks, and an `organization_id` smuggled into a filter value — and assert every one
   is bound as a parameter, that `assertTenantScoped` still holds, and that no statement is
   constructed by concatenation. Include CRLF and ANSI-escape payloads and assert the API's uniform
   error envelope (`RUNT-01`) neither reflects them raw nor emits a control character that could split
   a JSON log line.
8. **`xss/render-boundary.test.ts` — `SEC-003`.** Feed the `EVID-10` render boundary a payload matrix:
   `<script>`, `<img onerror>`, `<svg onload>`, `<iframe>`, `<style>`, event-handler attributes,
   `javascript:`, `data:`, `vbscript:` and protocol-relative URLs, percent-encoded and
   unicode-confusable official domains, an HTML-entity-smuggled tag, a Markdown link and image with a
   scripting href, nested/malformed markup, and a model-authored URL not present in the pack. Assert:
   every one is removed or escaped, the removal is **counted**, no output URL differs from a pack
   `officialUrl`, and **nothing is rewritten into a plausible-looking corrected URL** (PRD §36.6 row
   11; `12-evidence-safety` **D20**).
9. **`xss/no-automatic-action.test.ts`.** Assert PRD §37.5's closing sentence structurally: a rendered
   answer containing text that looks like an email address, a webhook URL, a promotion command or a
   record transition triggers **no** outbound call in the harness's email/webhook sinks and no state
   change in the database.
10. **`supply-chain/archive.test.ts` — `RLSE-01`'s output.** Build (or consume the committed fixture
    build of) the release archive and assert: every checksum verifies; the signature verifies against
    the expected public key and **fails** when one byte of one member file is flipped; the SBOM exists
    and lists every workspace member and every third-party dependency in the lockfiles; the archive
    contains Web, server, worker, search, migrations, OpenAPI and manifests as PRD §20.3 requires.
11. **`supply-chain/no-secrets-no-gold.test.ts`.** Scan the archive and the repository tree for: any
    `.env`, private key, AWS/Cloudflare/provider credential pattern, or high-entropy string matching a
    documented secret-shape list; **any file under `evals/**`** (PRD §45.1 item 6, plan **R9**); and
    any customer-content fixture. Each hit fails with the offending path.
12. **`supply-chain/pinning.test.ts`.** Assert `pnpm-lock.yaml`, `Cargo.lock` and `uv.lock` exist and
    that a frozen install is clean; assert every container/base image reference (where any exists) is
    digest-pinned; assert **no runtime download path** — a source scan proving nothing in `apps/**`,
    `services/**` or `packages/**` fetches a plugin, model or code artifact from a URL at runtime
    (PRD §21.1 *"no arbitrary runtime plugin/model/code download"*).
13. **`supply-chain/control-coverage.test.ts`.** A frozen transcription of PRD §21.1's control list,
    asserted against a registry that maps each control to the test(s) covering it or to a
    `coverage-gaps.md` row. A control with neither fails. This is what stops a control from silently
    disappearing.
14. **`tests/security/supply-chain/coverage-gaps.md`** (sub-PRD **D3**) — seeded with: parser/OCR
    isolation (`INGF-06`); CSP/CSRF/cookie/rate limits (`RUNT-02`, `AUTC-01`); widget host page,
    iframe origin and `postMessage` schema (`PLTF-05`, `IDNT-07`); observability log injection
    (`RUNT-07`); rendered-answer XSS in the browser (`ASK-07`, covered by `ASSR-06`/`ASSR-07`);
    `security.txt` and the vulnerability-reporting address (**M-Q1**, no owner in plan §5). Each row
    names the owning ticket and the exact plan §5.24/§6.2 edge that would close it.
15. **`package.json` script wiring** (sub-PRD **D10**): the four subtrees run under this member's
    `test` script — PRD §20.3 makes dependency/secret/artifact scanning and the `SEC-002`/`SEC-003`
    suites per-PR gates. The archive-verification test uses a committed fixture archive when a full
    `RLSE-01` build is unavailable in the sandbox, and asserts on the real archive when it is.
16. **`README.md` in each owned subtree** — what it proves, the PRD control it maps to, how to add a
    row, and the rule that a failure is the owning module's defect (sub-PRD **D1**).

## Acceptance checklist (classified)

- [ ] `[machine]` **All fifteen PRD §37.4 SSRF/limit rows pass**, each with a typed rejection and
      **zero recorded sockets** to the forbidden address, including redirect-boundary and DNS-rebinding
      rows. (PRD §37.4; **SEC-002** *"SSRF and decompression-bomb suites pass"*)
- [ ] `[machine]` **Decompression bomb is stopped before the 250 MiB limit**, with peak memory
      asserted bounded; a 50 MiB+ body is rejected streamed, not buffered. (PRD §37.4; **SEC-002**)
- [ ] `[machine]` **The four numeric defaults are the PRD values** and no environment variable can
      disable the allowlist or IP denial. (PRD §37.4; §21.1)
- [ ] `[fixture]` **`UAT-ANS-04`** — every planted-instruction fixture is treated as evidence text:
      no legal date, jurisdiction, release, tool, URL, provider or scope changes, and no evidence item
      appears that the code did not select. (PRD §41.2 `UAT-ANS-04`; §21.1; §36.4)
- [ ] `[machine]` **Delimiter forgery is inert** — evidence text containing the delimiter grammar or a
      guessed nonce cannot escape the evidence region. (PRD §36.4; §21.1)
- [ ] `[machine]` **Parameter injection is impossible at the repository boundary** — every adversarial
      value is bound, tenant scoping still holds, and no statement is concatenated; CRLF/ANSI payloads
      neither reflect raw nor split a log line. (PRD §21.1; §16.5)
- [ ] `[machine]` **No executable output and no non-pack URL survives rendering** — every XSS/URL
      payload is removed or escaped and counted, and no URL is rewritten into a corrected form.
      (**SEC-003** *"Prompt-injection/XSS/invalid-URL fixtures pass"*; PRD §36.6 rows 11–12; §37.5)
- [ ] `[machine]` **Generated text triggers no action** — no email, webhook, promotion, transition or
      credential use occurs from rendered content. (PRD §37.5)
- [ ] `[machine]` **Release archive integrity** — checksums and signature verify, a single flipped
      byte fails verification, and the SBOM lists every workspace member and third-party dependency.
      (PRD §20.3; §21.1; §39.7)
- [ ] `[machine]` **Archive and tree carry no secret and no `evals/**` file.** (PRD §21.1; §45.1
      item 6; plan **R9**)
- [ ] `[machine]` **Pinning holds and no runtime download path exists** — frozen installs are clean,
      image references are digest-pinned, and a source scan finds no runtime plugin/model/code fetch.
      (PRD §21.1)
- [ ] `[machine]` **PRD §21.1's control list is fully accounted for** — every control maps to a test
      or to a `coverage-gaps.md` row with an owning ticket and a concrete plan edge; a control with
      neither fails the suite. (PRD §21.1; sub-PRD **D3**, **M-Q1**)
- [ ] `[machine]` **Each subtree fails on a weakened fixture** — a deliberately permissive local
      fixture (allowlist bypass, sanitiser passthrough, unsigned archive) is detected. A suite that
      cannot fail proves nothing. (Sub-PRD **D3**)
- [ ] `[machine]` **Nothing outside this ticket's file-scope is modified**, and `tests/security/pii/**`
      is untouched. (Sub-PRD **D1**; plan §5.24)
- [ ] `[machine]` **Offline and credential-free** — network denied, no cloud/provider credential, no
      `evals/**` read; the local sink is the only reachable endpoint. (PRD §20.2; §45.1 item 6)
- [ ] `[machine]` **No skipped or conditional assertion**; every exclusion is a `coverage-gaps.md`
      row. (Sub-PRD **D3**)
- [ ] `[machine]` `pnpm lint`, `pnpm typecheck` and `pnpm test` green (standing item, PRD §45.3).
- [ ] `[machine]` No Rust or Python surface written here — `cargo test --workspace` / `uv run pytest`
      unaffected; declared not applicable. (PRD §45.3)
- [ ] `[machine]` **Writeback item**: `docs/prd/23-assurance/README.md` **M-Q1** records the outcome of
      raising `security.txt` ownership (which ticket the plan docs PR proposes). (Plan §1.1; CLAUDE.md
      issue #53)
- [ ] `[machine]` PR states the PRD §45.4 items: requirement/UAT IDs (**SEC-002**, **SEC-003**;
      `UAT-ANS-04`), user-visible change (none — tests only) and non-goals, schema/API/event
      compatibility impact (none), **tenant/PII/security impact** (the suite handles no real
      credential and no customer content), **source/licence impact** (fixtures are synthetic, not
      fetched from official sources), cost/memory/latency impact (per-PR CI runtime, and the bounded
      peak memory the decompression rows assert), rollback path, known gaps (`coverage-gaps.md`).

Absent classes: **no `[human]` criteria.** PRD §26 and §20.3 make these automated gates, and PRD §43.4
item 1 reviews their failures rather than their passes. The `[fixture]` item is the recorded
official-source injection corpus authored here (sub-PRD **D6**) — the PRD §14/§43 evaluation replays,
including the prompt-injection evaluation cases, belong to `21-evaluation-600` (`GOLD-14`).

## Test plan

Every step runs offline: network denied except the suite's own loopback sink, no cloud or provider
credential, no `evals/**` access.

1. **Run each subtree separately.** `pnpm --filter <tests-security> test -- ssrf`, then `injection`,
   `xss`, `supply-chain`. Confirm each prints its row count.
2. **Read the SSRF matrix against the PRD.** Compare `ssrf/matrix.ts` with PRD §37.4 line by line:
   five redirects, 30 seconds, 50 MiB, 250 MiB, declared/observed type agreement, and the five address
   classes before *and* after redirects. A merged or missing row silently deletes a control.
3. **Socket recorder sharpness.** Point one matrix row at an allowed host and confirm the recorder
   *does* record a connection — otherwise the "zero sockets" assertions are vacuous.
4. **Rebinding.** Step the controllable resolver manually; confirm the second resolution is what the
   fetcher acts on and that the private address is never connected.
5. **Memory bound.** Run rows 13 and 14 with a heap sampler; confirm peak memory stays bounded and
   the process does not buffer the whole body.
6. **Injection.** For each fixture, diff the request context before and after the run: legal date,
   jurisdiction, mode, `corpus_release_id`, profile, provider, evidence-id set, URL set. All must be
   identical. Confirm the model stub's recorded input carries the delimiter invariant and that the
   planted text appears only inside the evidence region.
7. **XSS matrix.** Confirm every payload is removed **and** counted; confirm no output URL differs
   from a pack `officialUrl`; confirm no payload is "corrected".
8. **Supply chain.** Flip one byte in one archive member and confirm signature verification fails;
   remove one SBOM entry and confirm the test fails; plant a fake `.env` in a scratch copy and confirm
   the secret scan finds it. Discard all three.
9. **Control coverage.** Open `supply-chain/control-coverage.test.ts` beside PRD §21.1 and confirm
   every bullet is either mapped to a test or present in `coverage-gaps.md` with an owning ticket.
10. **Isolation of the suite.** `git diff --name-only` shows only this ticket's file-scope (plus the
    lockfile) and never `tests/security/pii/**`.
11. **Construction pattern to copy.** `INGF-02`'s own fetcher tests for the request/rejection shapes,
    `EVID-05`'s `test/validator/fixtures/**` for the "PRD table transcribed as data" device, and
    `EVID-04`'s pack builder from its `./testing` export.
12. **Reviewer focus.** Confirm every SSRF row asserts *zero sockets*, not merely a rejection; confirm
    the injection suite asserts *absence of change* across the whole request context rather than
    string-matching the output; confirm the XSS suite rejects rather than rewrites; confirm the
    supply-chain suite fails on a tampered archive; confirm no assertion was weakened to accommodate
    an owning module.

## Feedback obligation

1. **General rule.** If implementation falsifies this ticket, update **this ticket** (docs PR → merge
   → `publish-tickets.mjs --sync`) and, where module context changes,
   `docs/prd/23-assurance/README.md` (version +0.1 with a changelog line) **before** changing code.
   Silent divergence is an incomplete ticket.
2. **Foreseeable frictions, each with its exact writeback target:**
   - *A row fails because `INGF-02`'s fetcher or `EVID-10`'s sanitiser is wrong* → **that module has
     the defect.** File it against `INGF-02` / `EVID-10` as a docs PR amending that ticket, and leave
     this assertion at full strength. Do not relax the matrix, add an allowance, or edit
     `pipelines/**` or `packages/**` from `tests/**` (sub-PRD **D1**).
   - *A PRD §37.4 numeric default is genuinely unworkable for an official bulk artifact* → PRD §37.4
     already provides the route (*"a source-specific approved limit and offline processing"*). Assert
     that route exists; changing the **default** is a PRD §45.5 product change, recorded in
     `docs/prd/23-assurance/README.md` and escalated — never a quiet edit to the matrix.
   - *A PRD §21.1 control has no owner* (today: `security.txt`) → add it to
     `tests/security/supply-chain/coverage-gaps.md`, record it in
     `docs/prd/23-assurance/README.md` **M-Q1**, and raise the owning ticket in
     `docs/prd/breakdown-plan.md` §5 by docs PR. Do not create the artifact from `tests/**`.
   - *A surface this suite should cover is outside the closure* (parser sandbox, CSP/CSRF, widget host
     page) → `coverage-gaps.md` row **plus** the exact plan §5.24/§6.2 edge proposed by docs PR. Never
     add a `blocked_by` edge locally — `dag-scan.mjs` compares against the plan (plan §6.2).
   - *The archive test needs a signing key* → it must not. Use the fixture key pair generated inside
     the suite; PRD §20.2 forbids production signing credentials in agent context. If real-key
     verification is genuinely required for a release gate, that is `FND-02`/`RLSE-01` CI work,
     recorded in `docs/prd/23-assurance/README.md` **M-Q7**.
3. **Falsified protocol.** **If source-planted instructions can change the legal date, the tool
   surface, the URL set, the provider or the scope**, PRD §21.1's *"Evidence delimited as data"* and
   PRD §9.4's evidence-first sequence are falsified — that is a SEV-1-class product security failure,
   not a test adjustment. Stop. Do not narrow the fixture set, do not accept a partial pass, and do
   not "handle" it inside `tests/**`. Escalate for re-review, raise an ADR under `docs/adr/`, and
   write back to `docs/prd/23-assurance/README.md` **and** `docs/prd/breakdown-plan.md` before any
   code changes.
