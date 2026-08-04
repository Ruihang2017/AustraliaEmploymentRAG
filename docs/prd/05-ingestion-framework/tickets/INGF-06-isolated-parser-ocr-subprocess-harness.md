---
id: INGF-06
title: Isolated parser/OCR subprocess harness
module: 05-ingestion-framework
lane: 05-ingestion-framework
size: L
agent: builder
status: draft
date: 2026-08-03
blocked_by: [INGF-02]
blocks: [INGF-09]
---

# INGF-06 — Isolated parser/OCR subprocess harness

Implements PRD §37.4 (source and parser isolation) and PRD §21.1 <SEC-002> — no ADR — the decision is
already made in PRD §37.4; this is build ticket 6 of 9 against it.
Parent sub-PRD: [05-ingestion-framework README](../README.md). Master spec: [PRD](../../../PRD.md).
Depends on: [INGF-02 — Safe fetcher](INGF-02-safe-fetcher-allowlist-dns-ip-denial-redirect-type-size-time.md)
**Why `builder`:** a bounded implementation of one port declared in `INGF-01`, against isolation
requirements PRD §37.4 states explicitly — not a new subsystem decision.

## Background + basis

**PRD §37.4 second paragraph is this ticket:**

> "HTML is parsed without script execution. PDF/OCR/archive work runs in a **resource-limited
> subprocess with no customer credentials or app database access**. Parser output is data; it does
> not execute macros, embedded files, external links or document instructions."

**PRD §21.1** lists "file/type/time/size/resource limits and **isolated parser/OCR processes**" among
the required controls, and **PRD §21** sets the trust model: "**official source content** … [is]
untrusted."

**Requirement SEC-002** (PRD §30.2) — "Source fetches enforce allowlist, DNS/IP/redirect/type/size/
time limits", minimum acceptance evidence *"SSRF and **decompression-bomb** suites pass"*. The
decompression-bomb half of that evidence is archive/document expansion, which is this ticket
(`INGF-02` covers the transport-encoding half).

**PRD §40.9** places `P[Parse/OCR in isolation]` between the licence gate and normalisation — so the
parser only ever sees bytes that a licence decision has already permitted, and it runs before any
identity or version reasoning.

**PRD §40.8 item 5** requires "parser/node hierarchy and exact-text round-trip tests" for every
adapter; that is only checkable if the parser emits offsets into a single canonical text — which is
why `INGF-01`'s `ParsedDocument`/`ParsedBlock` carry `text` plus `start_offset`/`end_offset`.
PRD §15.3: "Citations MUST target DocumentVersion + NodeVersion + **exact offsets** + source
snapshot".

**PRD §12.2** makes "Failed parsing … OCR defects … broken structure" quarantine classes;
`INGF-05` owns the sink and this ticket produces the codes.

**Carried caveat — platform.** PRD §19.1/§39.2 put production on Ubuntu LTS and PRD §19.3 puts the
full parse/OCR pipeline on the local workstation, which in this project is Windows. POSIX
`RLIMIT_AS`/`RLIMIT_CPU` do not exist on Windows. This ticket therefore ships two enforcement levels
(deliverable 4) and refuses to run in `FULL`-required mode when only `DEGRADED` is available —
documented, enforced, and not silently ignored.

## Goal

Implement the `ParserHost` port declared by `INGF-01` under
`pipelines/ingestion/src/<root>/parsing/**`: a parser registry keyed by content type, executing every
parse in a **separate OS process** with a scrubbed environment, no network, no credentials, no
database handle, bounded CPU/memory/wall-clock/output, and per-format hardening (no script execution,
no DTD/external-entity resolution, no PDF JavaScript or embedded-file extraction, archive
ratio/member/path guards, OCR confidence reporting) — with an offline malicious-document suite that
proves each defence fires and each failure maps to a stable quarantine code.

## Non-goals

- **No adapter-specific parsing.** Every group's node hierarchy, labels and document structure belong
  to its own adapter in modules `06`–`10`. This ticket produces `ParsedDocument`/`ParsedBlock`;
  `adapter.normalise()` turns them into `DocumentVersion + NodeVersions`.
- **No chunking, tiering or embedding** — `CRPS-03`, `CRPS-04`, `CRPS-05`.
- **No fetching** — `INGF-02`. The harness receives an `ArtifactRef` and reads bytes through
  `INGF-03`'s store; it never opens a socket.
- **No quarantine writing** — `INGF-05`. This ticket returns a `ParseOutcome` carrying a
  `FailureCode`.
- **No OCR engine bundling decision for production hardware.** The harness invokes a pinned OCR
  binary through the same subprocess contract; selecting and pinning it for real sources is each
  adapter ticket's DoD item 12 evidence (measured parse time / memory) plus `RLSE-11`'s 2 GB
  benchmark. If no OCR binary is present, image parsing returns `OCR_UNAVAILABLE`, never a silent
  empty document.
- **No `tests/security/**` suite** — `23-assurance` / `ASSR-02`.
- **No customer data path.** PRD §37.4 "no customer credentials or app database access"; PRD §39.1
  "Python pipeline code never imports tenant/customer packages".

## File-scope (write-owns)

- `pipelines/ingestion/src/<root>/parsing/**` (plan §5.6 `src/parsing/**`), including the subprocess
  entry-point module and the per-format parser modules.
- `pipelines/ingestion/tests/parsing/**`, including the malicious-document fixtures and the generator
  script that produces them.
- `pipelines/ingestion/pyproject.toml` — **append-only** (HTML/XML/PDF/OCR parsing deps); conflicts
  resolve by re-running `uv lock` (plan §1.1).
- Does not touch: `pipelines/ingestion/src/<root>/{adapter,fetch,artifacts,licensing,quarantine,runs,registry,discovery,conformance}/**`
  — `INGF-01`…`INGF-05`, `INGF-07`…`INGF-09`.
- Does not touch: `pipelines/adapters/**` — modules `06`–`10`.
- Does not touch: `tests/security/**` — `23-assurance` (`ASSR-02`).
- Does not touch: `infra/**`, `packages/**`, `apps/**`, `services/**`.

**Serial safety.** First decomposition; nothing merged, nothing in flight. `INGF-01` and `INGF-02`
have landed. Concurrent siblings: **`INGF-03`** (`blocked_by INGF-02`, owns `artifacts/`) and, in a
live schedule, **`INGF-04`**/**`INGF-05`** — all disjoint from `parsing/`. The one shared path is
`pyproject.toml`, append-only by plan §1.1.

## Deliverables

1. **`<root>.parsing.host` — the `ParserHost` implementation.**
   `run(parser_key: str, ref: ArtifactRef, limits: ParserLimits) -> ParseOutcome` spawns
   `python -m <root>.parsing.worker` as a **child process** (never a thread, never `exec` in-process)
   with:
   - **environment scrubbed to an allowlist** — only `PATH`, `LANG`, `LC_ALL`, `TMPDIR`/`TEMP`,
     `PYTHONHASHSEED` and the harness's own `AER_PARSE_*` variables survive. Every other variable is
     dropped, so no credential can be inherited (PRD §37.4 "no customer credentials"; PRD §39.6
     secret groups);
   - **no database handle and no writable path** other than a per-invocation temp directory
     (`0o700`, deleted afterwards) and the read-only artifact file;
   - **stdin closed**, the artifact passed by path, the result returned as length-prefixed JSON on
     stdout, and stderr captured to a bounded buffer;
   - **no network**: the worker module imports no HTTP library (asserted by `INGF-02`'s architecture
     scan, which already covers all of `pipelines/ingestion/**` outside `fetch/`), and on Linux the
     harness additionally applies a socket-denying guard in the child (`preexec_fn` installing a
     seccomp-style deny or, at minimum, monkeypatching `socket.socket` to raise before the parser
     module is imported). A test asserts the child cannot open a socket.

2. **`ParserLimits`** with named defaults, each citing its basis:
   `cpu_seconds = 60`, `wall_seconds = 120`, `address_space_bytes = 512 * 1024**2`,
   `max_output_chars = 64 * 1024**2`, `max_pages = 5000`, `max_archive_members = 10_000`,
   `max_uncompressed_bytes = 250 * 1024**2` (PRD §37.4's "250 MiB safely decompressed limit"),
   `max_compression_ratio = 100`. Only `max_uncompressed_bytes` is fixed by the PRD; the rest are
   **initial defaults** whose docstrings say so (PRD §45.1 item 5) and which are overridable per
   invocation via `ParserLimits`, never via a global.

3. **`<root>.parsing.registry` — content-type → parser.** A closed mapping:
   `text/html`, `application/xhtml+xml` → `html`; `application/xml`, `text/xml`, `*+xml` → `xml`;
   `application/json` → `json`; `text/plain`, `text/csv` → `text`; `application/pdf` → `pdf`;
   `application/zip`, `application/x-zip-compressed` → `archive`;
   `image/png`, `image/jpeg`, `image/tiff` → `ocr`.
   `select_parser(content_type, sniffed_type) -> str` prefers the sniffed type on disagreement and
   returns `PARSER_UNSUPPORTED_TYPE` for anything unmapped — never a "best effort" fallback.

4. **Limit enforcement levels (platform caveat).**
   `LimitEnforcement.FULL` — POSIX: `resource.setrlimit(RLIMIT_CPU, RLIMIT_AS, RLIMIT_NOFILE,
   RLIMIT_FSIZE)` in `preexec_fn`, plus wall-clock kill and output cap in the parent.
   `LimitEnforcement.DEGRADED` — Windows: wall-clock kill, output cap, page/member caps and
   per-invocation temp isolation only; CPU and address-space rlimits are **not** available.
   `ParserHost(require_full_limits: bool)` raises `LimitEnforcementUnavailable` at construction when
   `FULL` is required and unavailable. CI (Linux, PRD §20.3) runs `FULL`; the rlimit assertions are
   `pytest.mark.skipif(not POSIX)` while every other assertion runs on both platforms.

5. **HTML parser** — parses with **scripting disabled**: no script/`on*` handler execution, no
   subresource fetching, no `<base>`-relative rewriting to an external host, no meta-refresh
   following. Emits `ParsedDocument.text` as the canonical extracted text plus `ParsedBlock`s whose
   offsets index into it, preserving heading hierarchy in `ParsedBlock.path`. Comments, `<script>`
   and `<style>` content are excluded from `text`. PRD §37.4: "HTML is parsed without script
   execution."

6. **XML parser — XXE hardening.** DTD processing **disabled**, external general and parameter
   entities **disabled**, entity expansion **disabled** (billion-laughs), XInclude **disabled**,
   network access for schema/DTD resolution **disabled**. Any document requiring them fails
   `PARSE_UNSAFE_CONSTRUCT` rather than being parsed with the construct ignored. PRD §37.4: "Parser
   output is data; it does not execute … external links or document instructions."

7. **PDF parser** — no JavaScript execution, no OpenAction/AA handling, no embedded-file extraction,
   no external stream or URI resolution, no font/exec plugin download. Encrypted PDFs are attempted
   only with the empty owner password and otherwise fail `PARSE_ENCRYPTED`. Page count capped. Text
   with per-page offsets; pages with no extractable text are marked for the OCR path rather than
   silently emitting empty text.

8. **Archive parser** — member count cap, per-member and total uncompressed caps, **compression-ratio
   guard**, and **path-traversal (zip-slip) rejection**: any member whose normalised path escapes the
   extraction root, is absolute, or contains a symlink entry fails `PARSE_ARCHIVE_UNSAFE_PATH`.
   Nested archives are not recursed by default (`max_archive_depth = 1`).

9. **OCR path** — invoked only for image artifacts and for PDF pages with no extractable text; runs
   in the same subprocess contract with the same limits; returns `ocr_confidence` on
   `ParsedDocument`. Below `OCR_MIN_CONFIDENCE = 0.60` (an initial default, documented as such) the
   outcome carries `OCR_DEFECT` so `INGF-05` can quarantine it (PRD §12.2 "OCR defects").
   With no OCR binary available the outcome is `OCR_UNAVAILABLE`.

10. **Exact-text round-trip guarantee.** Every parser must satisfy: for every emitted `ParsedBlock`,
    `document.text[block.start_offset:block.end_offset]` is exactly the block's content, blocks are
    ordered by `ordinal`, and no two sibling blocks overlap. A shared assertion helper
    `assert_roundtrip(document)` is **exported** for adapter tickets and used by `INGF-09` DoD item 5.
    PRD §40.8 item 5, PRD §15.3.

11. **Failure codes** registered with `register_failure_codes("parsing", …)`, each with an operator
    action: `PARSE_FAILED`, `PARSE_TIMEOUT`, `PARSE_MEMORY_LIMIT`, `PARSE_OUTPUT_LIMIT`,
    `PARSE_UNSAFE_CONSTRUCT`, `PARSE_ENCRYPTED`, `PARSE_ARCHIVE_RATIO`, `PARSE_ARCHIVE_MEMBERS`,
    `PARSE_ARCHIVE_UNSAFE_PATH`, `PARSER_UNSUPPORTED_TYPE`, `PARSE_WORKER_CRASHED`,
    `OCR_DEFECT`, `OCR_UNAVAILABLE`.

12. **Crash containment.** A worker that segfaults, is OOM-killed or exits non-zero yields
    `PARSE_WORKER_CRASHED` with the bounded stderr tail in `details`; the parent process never dies
    with it, and the run continues to the next descriptor (`INGF-05`'s runner behaviour).

## Acceptance checklist (classified)

- [ ] `[machine]` Every parse runs in a **child process**: a test asserts the reported worker PID
      differs from the test process PID and that the parser modules are not imported into the parent
      (PRD §37.4 "resource-limited subprocess").
- [ ] `[machine]` The child's environment contains only the allowlisted variables: a canary variable
      set in the parent (`AER_TEST_SECRET`) is absent in the child's `os.environ` echoed back
      (PRD §37.4 "no customer credentials"; PRD §39.6).
- [ ] `[machine]` The child cannot open a socket: a worker asked to parse a fixture that attempts a
      connection fails with `PARSE_UNSAFE_CONSTRUCT`/`PARSE_WORKER_CRASHED` and no connection is
      observed (PRD §37.4, §21.1; SEC-002).
- [ ] `[machine]` The child has no database handle and no writable path outside its temp dir: a
      worker attempting to write outside the temp root fails (PRD §37.4 "no … app database access").
- [ ] `[fixture]` **XXE**: recorded `xxe-external-entity.xml`, `xxe-parameter-entity.xml` and
      `billion-laughs.xml` each fail `PARSE_UNSAFE_CONSTRUCT`; neither the local file referenced by
      the external entity nor any network host is read; memory stays bounded (PRD §37.4; SEC-002).
- [ ] `[fixture]` **Zip bomb**: recorded `zip-bomb-ratio.zip` and `zip-bomb-total.zip` fail
      `PARSE_ARCHIVE_RATIO` / `PARSE_ARCHIVE_MEMBERS` before `max_uncompressed_bytes` is materialised
      (SEC-002 minimum acceptance evidence: "decompression-bomb suites pass"; PRD §37.4 "250 MiB
      safely decompressed limit").
- [ ] `[fixture]` **Zip slip**: recorded `zip-slip.zip` (member `../../evil.txt`) fails
      `PARSE_ARCHIVE_UNSAFE_PATH` and writes nothing outside the extraction root (PRD §21.1
      "file/type/… limits").
- [ ] `[fixture]` **PDF**: recorded `pdf-with-javascript.pdf` parses to text with the JavaScript
      **not** executed and no OpenAction followed; `pdf-with-embedded-file.pdf` does not extract the
      embedded payload; `pdf-encrypted.pdf` fails `PARSE_ENCRYPTED` (PRD §37.4 "does not execute
      macros, embedded files, external links or document instructions").
- [ ] `[fixture]` **HTML**: recorded `html-with-script.html` yields text with no script content and no
      subresource request; `html-meta-refresh.html` does not follow the refresh
      (PRD §37.4 "HTML is parsed without script execution").
- [ ] `[machine]` **Limits**: a fixture that spins past `wall_seconds` yields `PARSE_TIMEOUT` and the
      child is killed (asserted: the PID is gone); output beyond `max_output_chars` yields
      `PARSE_OUTPUT_LIMIT`; on POSIX, allocation beyond `address_space_bytes` yields
      `PARSE_MEMORY_LIMIT` (`skipif` on Windows, per deliverable 4) (PRD §21.1, §37.4).
- [ ] `[machine]` `ParserHost(require_full_limits=True)` raises `LimitEnforcementUnavailable` where
      `FULL` is not available, rather than silently degrading (platform caveat; PRD §45.1 item 5).
- [ ] `[machine]` `select_parser()` returns `PARSER_UNSUPPORTED_TYPE` for an unmapped type and prefers
      the sniffed type on disagreement — no best-effort fallback exists (PRD §37.4 "declared/observed
      type agreement").
- [ ] `[machine]` `assert_roundtrip()` passes for every fixture document and fails for a deliberately
      corrupted offset — the exported helper `INGF-09` DoD item 5 uses (PRD §40.8 item 5, §15.3).
- [ ] `[machine]` A worker crash yields `PARSE_WORKER_CRASHED` with a bounded stderr tail and the
      parent survives (deliverable 12).
- [ ] `[machine]` OCR: below-threshold confidence yields `OCR_DEFECT`; absent binary yields
      `OCR_UNAVAILABLE`, never an empty successful document (PRD §12.2 "OCR defects").
- [ ] `[machine]` Every failure code in deliverable 11 is registered with a non-empty operator action
      (ADM-001, PRD §40.8 item 10).
- [ ] `[machine]` The whole suite runs offline with no outbound network (session fixture asserts it).
- [ ] `[machine]` `uv run pytest` green.
- [ ] `[machine]` `pnpm test` green (unchanged — no TypeScript in this ticket).
- [ ] `[human]` PR body states the PRD §45.4 items: requirement ID **SEC-002** (decompression-bomb and
      parser-isolation half); UAT IDs — none directly (`UAT-ANS-04`, source-instruction injection, is
      `ASSR-02`/`EVID-04`'s; this ticket ensures the *parser* does not act on document instructions);
      schema/API/event compatibility (none); tenant/PII/security impact (this is the parser isolation
      boundary; no tenant data on the path); source/licence impact (parsing runs only after
      `INGF-04`'s gate); cost/memory/latency impact — **state the measured peak RSS and wall time per
      format from the fixture suite**, since PRD §39.2 budgets the whole host at 2 GiB; rollback path;
      known gaps (the Windows `DEGRADED` level).
- **No `[human]` acceptance criteria beyond the PR contract** — every isolation control is
  mechanically testable. Declared absent deliberately.

## Test plan

Harness: `uv run pytest pipelines/ingestion/tests/parsing -q`, fully offline. Fixtures under
`pipelines/ingestion/tests/parsing/fixtures/`, all generated by a committed script
(`fixtures/generate.py`) so they are small in git, reproducible, and obviously synthetic — **no real
customer or third-party document** (PRD §40.8 item 4: "representative … fixtures without customer
data").

1. `uv sync --frozen && uv run pytest pipelines/ingestion/tests/parsing -q`.
2. **`test_isolation.py`** — PID separation, environment scrub with the `AER_TEST_SECRET` canary,
   socket denial, write-outside-temp denial, crash containment.
3. **`test_limits.py`** — timeout, output cap, page cap, and (POSIX only) CPU and address-space
   rlimits; `LimitEnforcementUnavailable` behaviour.
4. **`test_xml_xxe.py`** `[fixture]` — the three XXE/expansion fixtures; asserts the referenced local
   canary file is never read (its content must not appear in the output) and no host is resolved.
5. **`test_archive.py`** `[fixture]` — ratio bomb, member-count bomb, total-size bomb, zip slip,
   symlink member, nested-archive depth.
6. **`test_pdf.py`** `[fixture]` — JavaScript, OpenAction, embedded file, encrypted, image-only page
   → OCR routing.
7. **`test_html.py`** `[fixture]` — script/style exclusion, meta refresh, `<base>` to external host,
   `on*` attributes.
8. **`test_roundtrip.py`** — `assert_roundtrip()` over every fixture plus a corrupted-offset negative
   control.
9. **`test_registry.py`** — the closed content-type table and the sniff-preference rule.
10. `uv run pytest` (whole repo) and `pnpm test` — green.

Reviewer focus (security-sensitive path): that the parser libraries are imported **only** inside the
worker module and never in the parent; that XXE hardening is applied at parser construction rather
than per-call; that the archive guards abort mid-extraction rather than after; that the wall-clock
kill actually reaps the child; and that no failure path returns a successful `ParsedDocument` with
partial content.

## Feedback obligation

**General rule.** If implementation falsifies this ticket, update **this ticket** first (docs PR/MR,
sub-PRD changelog line, then `publish-tickets.mjs --sync`), then change code.

**Foreseeable frictions and their exact writeback targets:**

1. **A chosen parsing library cannot be hardened as required** (e.g. it resolves external entities
   unconditionally, or executes PDF actions) → replace the library. If no library satisfies PRD
   §37.4, write `docs/adr/NNNN-ingestion-parser-libraries.md` (new file, owned by this ticket per
   plan §2.1 **A9**) recording the trade-off and the compensating control, and update
   `docs/prd/05-ingestion-framework/README.md` **before** relaxing a defence. Never disable a
   hardening flag to make a fixture pass.
2. **Subprocess isolation is too slow for real corpus volumes** (52 groups, ~300k documents,
   PRD §17.2) → the writeback target is this ticket's deliverable 1 plus
   `docs/prd/05-ingestion-framework/README.md`: an acceptable optimisation is a **pooled** worker that
   still runs as a separate process with the same scrubbed environment and per-artifact limits; an
   unacceptable one is in-process parsing. PRD §37.4 requires the process boundary, not a fresh
   process per document — say so explicitly in the ticket before changing the model.
3. **The Windows `DEGRADED` level blocks local development or hides a real regression** → record the
   consequence in `docs/prd/05-ingestion-framework/README.md` and consider requiring `FULL` in CI
   only (which is already the design). Do **not** delete the `require_full_limits` guard: a silent
   degradation on the workstation is exactly what PRD §45.1 item 5 forbids.
4. **OCR needs a binary that cannot be pinned or is unavailable offline** → keep `OCR_UNAVAILABLE` as
   a first-class outcome and record the limitation in
   `docs/prd/05-ingestion-framework/README.md`; the affected groups take a limited registry status
   (PRD §7) via `INGF-07`, reconciled by `GOLD-16`. PRD §21.1 forbids "arbitrary runtime plugin/model/
   code download", so an on-demand OCR download is not an option.
5. **`INGF-05` needs a parse failure code this ticket does not emit** → add it **here** with its
   operator action (this area owns `parsing` codes, sub-PRD D4) and let `INGF-05`'s dynamic totality
   test pick it up. `INGF-05` must not define a `PARSE_*` code, and this ticket must not edit
   `src/<root>/quarantine/**`.

**Escalation rule.** If PRD §37.4's process isolation, credential scrubbing or "does not execute
macros, embedded files, external links or document instructions" cannot be honoured, that overturns
SEC-002 — a release requirement with named acceptance evidence in PRD §30.2 and a Definition-of-Done
line in PRD §26. Stop and escalate for re-review; never weaken an isolation control inside this
ticket.
