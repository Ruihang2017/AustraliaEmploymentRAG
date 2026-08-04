---
id: ASSR-03
title: "PII no-leak suite with canaries"
module: 23-assurance
lane: 23-assurance
size: M
agent: builder
status: draft
date: 2026-08-03
blocked_by: [EVID-02, ASK-01]
blocks: []
---

# ASSR-03 — PII no-leak suite with canaries

Implements PRD §10.1, §37.2 and §37.3 — requirements **PII-001** and **PII-002**; epic `E19`;
acceptance scripts `UAT-PII-01` and `UAT-PII-02`.
No ADR — the decision is already made in PRD §10.1 (the server is the authoritative PII boundary
before logging, persistence or provider calls); this is build ticket 3 of 8 against it.
Parent sub-PRD: [23-assurance README](../README.md). Master spec: [PRD](../../../PRD.md).
Depends on: [EVID-02 — Local NER, public-entity context rules, combination risk](../../12-evidence-safety/tickets/EVID-02-local-ner-public-entity-context-rules-combination-risk.md), [ASK-01 — Answer job admission and transaction boundary](../../15-answer-product/tickets/ASK-01-answer-job-admission-and-transaction-boundary.md) (mirrors `blocked_by`)
**Why `builder`:** a bounded change inside one module's declared file-scope against a fixed contract —
PRD §10.1 and §37.3 already fix the three paths and the retention matrix; this makes them executable,
and decides no new subsystem.

## Background + basis

**PRD §10.1, quoted verbatim — the boundary and the three paths:**

> - Web/widget clients SHOULD provide immediate PII hints and one-click placeholders.
> - **The server MUST be the authoritative PII boundary before logging, persistence or provider
>   calls.**
> - Server detection MUST combine deterministic patterns/checksums, local entity recognition and
>   context-aware public-entity rules.
> - Actual employee names, private contact/address data, TFNs, bank details, employee/payroll
>   identifiers, precise birth dates and identifying combinations MUST be blocked.
> - Employer names, ABNs, public business information, public case parties and necessary
>   role/duty/location facts MAY be accepted.
> - **Customers MUST NOT bypass a positive employee-PII finding.**
> - **If authoritative detection is unavailable, public legal search MAY continue but free-text
>   Ask/Compare/Coverage MUST fail closed.**

**PRD §37.2, quoted verbatim — what a rejection may and may not contain:**

> **Detection response includes field, character range, category and suggested placeholder but never
> echoes the detected value. Blocked request bodies are held only in request memory and released after
> the response. Metrics record category/count/result, not content or reversible hash.**
>
> Public-entity exceptions must come from structured `employer`, `abn` or `public_case_party` fields,
> not a generic "ignore warning" button.

**PRD §37.3 content retention matrix, the decisive row:**

> | Blocked raw PII | **Never** | **Never** | **Never** | **Never** |

**Requirements.** `PII-001` (PRD §30.2): *"Deterministic patterns, local NER and contextual rules form
the server boundary … **Synthetic PII suite meets configured recall and zero raw logging**."*
`PII-002`: *"Search can continue if PII service is unavailable; free-text research fails closed …
**Dependency-failure test matches this split**."* `ANS-002`: *"Employee PII is blocked before
persistence, logs or provider calls … **Canary PII is absent from DB/log/provider fixture**."* PRD
§41.2 `UAT-PII-01`: *"Enter synthetic TFN/name/contact details in Ask → **Request blocked with
categories/offsets; canary absent from DB/log/provider stub**."* `UAT-PII-02`: *"Enter employer name,
valid ABN and public case party → **Allowed only through correct structured/public context**."*
PRD §34.9 fixes the rejection: `422 EMPLOYEE_PII_DETECTED`, *"Replace indicated spans with anonymous
placeholders"*.

**Why this cannot live in `packages/pii`.** `EVID-01`/`EVID-02` prove the detector fires and that its
findings carry no value. Neither can prove `ANS-002`'s evidence — *"Canary PII is absent from DB/log/
provider fixture"* — because that is an assertion about **artifacts produced by other modules**: the
log sink `apps/api` writes, the SQLite files `packages/database` owns, and the outbound payload
`packages/model-gateway` records. Sub-PRD **D9**: the assertion is a byte search over the produced
artifact; a detector that returned "blocked" proves nothing about what was written before it ran.

**What the `blocked_by` closure guarantees (sub-PRD D3).** Via `EVID-02` → `EVID-01`, `FND-03` (the
whole PRD §37.2 admission pipeline: byte/field limits, deterministic patterns and checksums, local
entity recognition, contextual public-entity rules, combination/risk rules, the accept-sanitized /
reject-with-offsets contract). Via `ASK-01` → `RUNT-02` (the admission middleware chain), `RUNT-03`
(SSE with persisted events), `DATA-06` (research and evidence tables) and transitively `DATA-01` …
`DATA-07`, `RUNT-01`, `AUTC-01`, `AUTC-04`, `FND-06`, `FND-09`, plus `EVID-03` (the availability
split) and `EVID-08` → `EVID-07` (the model gateway and its stub provider transport).

**Accepted caveats carried forward, each a row in `coverage-gaps.md`:**

- **`ASK-02` (the Quick worker workflow) is not in this closure.** The provider-call path is exercised
  through `EVID-07`'s gateway with its recorded transport directly, and through `ASK-01`'s admission
  transaction — not through a completed answer. End-to-end answer behaviour is `ASSR-04`.
- **`FIND-01` (`POST /v1/search`) is not in this closure.** `PII-002`'s "search continues" half is
  asserted at the operation-class boundary that `EVID-03` and `RUNT-02` implement, using fixture route
  areas registered inside this suite; the route-level assertion is a gap row.
- **`DATA-08` (`ephemeral.sqlite`) is not in this closure.** The persistence assertion therefore
  globs **every** `*.sqlite*` file in the stack's data directory rather than naming one, so it covers
  the ephemeral database whenever it exists without depending on that ticket.
- **The configured recall target is not set** — sub-PRD **M-Q6**, carried from `12-evidence-safety`
  **Q-EVID-2**, owner **Founder**. This suite measures and reports; zero leakage is what it gates on.

## Goal

Produce `tests/security/pii/**`: a synthetic canary corpus covering every PRD §37.1 blocked category,
a driver that submits each canary through the real admission path, and an artifact scanner that
proves the canary — and every reversible derivative of it — is absent from the HTTP response body,
every log line, every SQLite file's raw bytes, the recorded provider payload, the metric labels, the
audit rows and the persisted SSE events. Plus the PRD §10.1 availability split and the PRD §37.2
structured-field rule. Completion is mechanically checkable: every §37.1 blocked row has at least one
canary, the scanner asserts absence across a declared artifact list, and a deliberately-leaky fixture
sink proves the scanner detects a leak.

## Non-goals

- **No detector unit tests, recall tuning, gazetteer or NER-runtime work** — `12-evidence-safety`
  (`EVID-01`, `EVID-02`, `EVID-03`). Cited, never duplicated.
- **No PII hint UI, placeholder buttons or the Ask form** — `15-answer-product` (`ASK-06`) and
  `03-app-runtime` (`RUNT-06`). PRD §10.1 makes client hints advisory; they can never satisfy
  `PII-001`.
- **No answer workflow, snapshot, citation or refusal assertions** — `ASSR-04` and `15-answer-product`
  (`ASK-02`).
- **No SSRF/injection/XSS/supply-chain assertions** — `ASSR-02` (this suite's sibling in the same
  workspace member).
- **No tenant-isolation matrix** — `ASSR-01`.
- **No retention-window, deletion or backup-ageing assertions** (PRD §10.3, §23.1) — `ASSR-08`
  (`tests/integration/recovery/**`) and `01-app-data` (`DATA-08`).
- **No setting of the recall target** — **Founder** (sub-PRD **M-Q6**). This suite measures and
  reports it; it does not decide it.
- **No evaluation PII cases** — `21-evaluation-600` (`GOLD-14`), and no read of `evals/**` (plan
  **R9**).

## File-scope (write-owns)

Owned by this ticket:

- `tests/security/pii/**` — including `harness/**`, `canaries/**`, `suites/**` and
  `coverage-gaps.md`.
- `tests/security/package.json`, `tests/security/tsconfig.json` — **append-only**, own scripts and
  dependencies only (created by `FND-01`; sub-PRD **D16**). Shared with `ASSR-02`.

Does not touch:

- `tests/security/{ssrf,injection,xss,supply-chain}/**` — `ASSR-02` (concurrent sibling in the same
  member).
- `tests/tenant-isolation/**` — `ASSR-01`; `tests/integration/**` — `ASSR-04`, `ASSR-05`, `ASSR-08`;
  `tests/e2e/**` — `ASSR-06`, `ASSR-07`.
- **Any other module's package or app tree** — `packages/**`, `apps/**`, `services/**`,
  `pipelines/**`, `infra/**`, `schemas/**`, `evals/**`. Not even to make an assertion pass (sub-PRD
  **D1**).
- `.github/workflows/**`, root `package.json`, root lockfiles — `00-foundation`.
- `docs/PRD.md` — frozen. `docs/prd/breakdown-plan.md` — docs PR only.

**Serial-safety analysis.** First decomposition: nothing merged, no in-flight contention (plan §1
header). `tests/security/pii/**` is written by no other ticket in the plan (plan §5.24). This is a
wave-1 ticket. Its only file-level neighbour is `ASSR-02`, which owns the other four subtrees of the
same workspace member: the two share `tests/security/package.json` and `tsconfig.json` as
**append-only** files (plan §1.1) and nothing else. Both declared blockers land first by construction.

## Deliverables

1. **`harness/stack.ts` — in-process boot with every sink captured** (sub-PRD **D4**, **D5**).
   `startPiiStack()` returns `{ inject, logs, dataDir, providerTape, metrics, db, stop }`:
   - `mkdtemp` data directory; migrate `app.sqlite` to head with `DATA-01`'s runner;
   - API from `RUNT-01`'s `buildApp(config)`, driven by Fastify `inject()`;
   - **every log destination redirected into an in-memory buffer** — the process logger, stdout,
     stderr and any file sink — so "the logs" is an exhaustive artifact, not a sample;
   - `EVID-07`'s stub provider transport in **record** mode writing a `providerTape` of the exact
     outbound request bodies;
   - the metrics registry captured;
   - **no network, no provider key** (PRD §20.2).
2. **`canaries/corpus.ts` — the synthetic canary corpus** (sub-PRD **D6**). One or more entries per
   **blocked** row of PRD §37.1, each `{ id, category, text, canaryToken, expectedCategory }`:
   employee/individual name; home address and precise private location; personal email, phone and
   private social identifier; TFN (checksum-valid, invented), bank/card, Medicare/passport/licence
   number; exact date of birth; employee/payroll ID, payslip content, personnel-file extract;
   identifying combination (rare role + tiny workplace + personal event). Each entry embeds a
   **unique high-entropy `canaryToken`** so a leak is attributable to one entry. Every value is
   invented; a header comment states that no real personal data may ever enter this file (PRD §45.1
   item 6). A parallel **allowed** corpus covers PRD §37.1's allowed column: public employer name,
   ABN, public case party, state/territory, anonymous role/duties, age band, approximate wage facts,
   "Employee A"/"the worker".
3. **`harness/scanner.ts` — the artifact scanner.** `assertCanaryAbsent(token, artifacts)` searches,
   as **bytes**, for the token and for its documented derivative forms: percent-encoded, HTML-entity,
   base64 and base64url, hex, UTF-16LE, NFC and NFD normalisations, whitespace-stripped, and the
   SHA-256, SHA-1 and MD5 hex digests (PRD §37.2 *"not content or **reversible hash**"*). The artifact
   list is a literal in this file so widening it is a visible diff:

   | Artifact | Source |
   |---|---|
   | HTTP response body and headers | `inject()` result |
   | All captured log output | `harness/stack.ts` buffers |
   | Every `*.sqlite`, `*.sqlite-wal`, `*.sqlite-shm` under the data directory | filesystem glob (covers `ephemeral.sqlite` when present) |
   | Recorded outbound provider request bodies | `providerTape` |
   | Metric names, label keys and label values | metrics registry |
   | `audit_event` rows (`DATA-07`) | database |
   | Persisted SSE/job-event rows (`DATA-05`, `RUNT-03`) | database |
   | Any file written under the data directory | filesystem walk |
4. **`suites/blocked-canaries.test.ts` — `UAT-PII-01`.** For every blocked canary, submit
   `POST /v1/answers` (`ASK-01`) with the canary in the free-text question and again in the facts
   field, in both `SAVE` and `EPHEMERAL` retention modes, and assert:
   - the response is `422 EMPLOYEE_PII_DETECTED` (PRD §34.9);
   - the body names **field, character range, category and suggested placeholder** and does **not**
     contain the detected value (PRD §37.2);
   - `assertCanaryAbsent` passes over **every** artifact in deliverable 3;
   - **no job, no turn, no snapshot and no ephemeral row was created** — row counts across all tables
     are unchanged (PRD §37.2 *"only then create logs, persistence, jobs or provider calls"*);
   - the provider tape is **empty** for that request (PRD §10.1 *"before … provider calls"*);
   - the metric increment records category, count and result only.
5. **`suites/no-bypass.test.ts`.** Assert PRD §10.1's *"Customers MUST NOT bypass a positive
   employee-PII finding"* structurally: attempt every plausible bypass — an `override`/`confirm`/
   `acknowledge` field, a query parameter, a header, an elevated role (Owner), a service-account
   credential, a retry with the same idempotency key, and a re-submission with the finding echoed back
   — and assert each returns the same `422` and leaves the same zero-artifact state.
6. **`suites/structured-fields.test.ts` — `UAT-PII-02`.** For each allowed entity (employer name,
   validated ABN, public case party): assert acceptance when supplied in the dedicated structured
   field, and assert the **same string in free text** is handled by the ordinary rules, not
   auto-allowed (PRD §37.2 *"Public-entity exceptions must come from structured `employer`, `abn` or
   `public_case_party` fields, not a generic 'ignore warning' button"*). Include an invalid-checksum
   ABN and assert `400 INVALID_ABN` with no search or quota event (PRD §34.9; `UAT-SRCH-04`'s
   API half).
7. **`suites/availability-split.test.ts` — `PII-002`.** With `EVID-03`'s detector forced unavailable
   through its injected port: assert a research-class operation (`POST /v1/answers`) returns
   `503 GENERATION_UNAVAILABLE` (PRD §34.9) and creates nothing; assert a search-class operation is
   admitted; assert **no partially-detected payload is ever accepted** — a payload whose detection was
   interrupted mid-pipeline is rejected, not passed through. Because `FIND-01` is outside this closure,
   the search-class arm runs against a fixture route area declared search-class and registered inside
   this suite; the route-level assertion is a `coverage-gaps.md` row naming `FIND-01`.
8. **`suites/retention-matrix.test.ts` — PRD §37.3.** For an **accepted** (non-PII) request, assert
   the matrix row by row for sanitized question/facts, evidence excerpts, final answer, operational
   IDs and provider raw payload: what may appear in `app.sqlite` (encrypted), in the ephemeral
   database, in logs (nothing of the first three) and what would be replicated. Assert operational
   rows carry IDs, status, timing and cost only.
9. **`suites/recall-report.test.ts` — measurement, not a gate** (sub-PRD **M-Q6**). Run the full
   blocked and allowed corpora and emit `tests/security/pii/recall-report.json` with per-category
   detection rate and false-positive rate on the allowed corpus. The test **gates on zero leakage**
   (deliverable 4) and **reports** recall; it fails on a recall regression against a committed
   baseline, and the absolute target remains the Founder's (M-Q6).
10. **`suites/negative-control.test.ts` — proof the scanner works.** A fixture sink inside this suite
    deliberately writes a canary to a log line and to a scratch SQLite file; assert the scanner
    detects both. Without this, a green suite is unfalsifiable.
11. **`coverage-gaps.md`** (sub-PRD **D3**) — seeded with: `POST /v1/search` route-level `PII-002` arm
    (`FIND-01`); the completed-answer path (`ASK-02`, covered by `ASSR-04`); the ephemeral store's own
    guarantees (`DATA-08`, covered by `ASSR-08`); browser/widget client hints (`ASK-06`, `PLTF-05`);
    the configured recall target (**M-Q6**, Founder). Each row names the owning ticket and the exact
    plan §5.24/§6.2 edge that would close it.
12. **`package.json` script wiring** (sub-PRD **D10**): this suite runs under the member's `test`
    script — PRD §20.3 lists *"PII and citation validation suites"* as a **per-PR** gate.
13. **`README.md` in `tests/security/pii/`** — the canary rules (synthetic only, unique token per
    entry, never real data), the artifact list, how to add a category, the measured recall baseline,
    and the rule that a failure is the owning module's defect (sub-PRD **D1**).

## Acceptance checklist (classified)

- [ ] `[fixture]` **`UAT-PII-01`** — every blocked canary returns `422 EMPLOYEE_PII_DETECTED` naming
      field, character range, category and placeholder, and never echoing the value. (PRD §41.2
      `UAT-PII-01`; §34.9; §37.2)
- [ ] `[machine]` **Zero leakage on all three PRD §10.1 paths** — the canary and every documented
      reversible derivative are absent from the response, every captured log line, every `*.sqlite*`
      file's raw bytes, the recorded provider payload, metric labels, audit rows and persisted SSE
      events. (**PII-001**, **ANS-002** *"Canary PII is absent from DB/log/provider fixture"*; §37.3)
- [ ] `[machine]` **Nothing is created before admission** — no job, turn, snapshot, ephemeral row or
      provider call exists after a blocked request; row counts are unchanged. (PRD §37.2; §18.5 step 1)
- [ ] `[machine]` **No bypass exists** — override field, header, query parameter, Owner role, service
      credential, idempotent retry and echoed-finding resubmission all return the same `422` with the
      same zero-artifact state. (PRD §10.1 *"Customers MUST NOT bypass a positive employee-PII
      finding"*; §37.2)
- [ ] `[fixture]` **`UAT-PII-02`** — employer name, validated ABN and public case party are accepted
      only through the structured fields; the same strings in free text follow the ordinary rules; an
      invalid ABN returns `400 INVALID_ABN` with no search or quota event. (PRD §41.2 `UAT-PII-02`;
      §37.2; §34.9)
- [ ] `[machine]` **`PII-002` split holds** — with detection unavailable, research-class admission
      returns `503 GENERATION_UNAVAILABLE` and creates nothing, search-class admission continues, and
      no partially-detected payload is accepted. (**PII-002**; PRD §10.1; §34.9)
- [ ] `[machine]` **PRD §37.3 retention matrix holds for accepted requests** — sanitized content is
      encrypted in the app database and absent from logs; operational rows carry IDs, status, timing
      and cost only. (PRD §37.3; §22)
- [ ] `[fixture]` **Recall is measured and non-regressing** — `recall-report.json` is produced with
      per-category detection and false-positive rates, and a regression against the committed baseline
      fails. The absolute target stays with the Founder. (**PII-001** *"meets **configured** recall"*;
      sub-PRD **M-Q6**)
- [ ] `[machine]` **Negative control detects a planted leak** in both a log line and a scratch
      database file. A suite that cannot fail proves nothing. (Sub-PRD **D3**)
- [ ] `[machine]` **Every PRD §37.1 blocked row has at least one canary**, asserted against a frozen
      transcription of the §37.1 table. (PRD §37.1)
- [ ] `[machine]` **No real personal data in the corpus** — a check asserts every canary entry is
      marked synthetic and carries a unique token; the file header states the rule. (PRD §45.1 item 6;
      §10.2)
- [ ] `[machine]` **Nothing outside `tests/security/pii/**` is modified**, and
      `tests/security/{ssrf,injection,xss,supply-chain}/**` is untouched. (Sub-PRD **D1**; plan §5.24)
- [ ] `[machine]` **Offline and credential-free** — network denied, no provider key, no `evals/**`
      read. (PRD §20.2; §45.1 item 6; plan **R9**)
- [ ] `[machine]` **No skipped or conditional assertion**; every exclusion is a `coverage-gaps.md`
      row with an owning ticket and a concrete plan edge. (Sub-PRD **D3**)
- [ ] `[machine]` `pnpm lint`, `pnpm typecheck` and `pnpm test` green (standing item, PRD §45.3), with
      this suite in the per-PR set. (PRD §20.3; sub-PRD **D10**)
- [ ] `[machine]` No Rust or Python surface — `cargo test --workspace` / `uv run pytest` unaffected;
      declared not applicable. (PRD §45.3)
- [ ] `[machine]` **Writeback item**: `docs/prd/23-assurance/README.md` **M-Q6** is updated with the
      measured per-category recall so the Founder can set the target against real numbers. (Plan §1.1;
      CLAUDE.md issue #53)
- [ ] `[machine]` PR states the PRD §45.4 items: requirement/UAT IDs (**PII-001**, **PII-002**,
      contributing to **ANS-002**; `UAT-PII-01`, `UAT-PII-02`), user-visible change (none — tests
      only) and non-goals, schema/API/event compatibility impact (none), **tenant/PII/security and
      retention impact** (the corpus is synthetic; the suite asserts the PRD §37.3 matrix), source and
      licence impact (none), cost/memory/latency impact (per-PR CI runtime), rollback path, known gaps
      (`coverage-gaps.md`, **M-Q6**).

Absent classes: **no `[human]` criteria.** `PII-001`'s and `ANS-002`'s acceptance evidence is a
synthetic suite and a canary search, both mechanical; PRD §43.4 item 1 puts PII failures first in the
founder review queue, which presumes machine detection. The Gate 2 human re-run of `UAT-PII-01`/`-02`
belongs to `24-launch`/`LNCH-05`. The `[fixture]` items are replays of this suite's own recorded
canary corpus and recall baseline (sub-PRD **D6**); the PRD §14/§43 evaluation PII cases are
`21-evaluation-600` (`GOLD-14`).

## Test plan

Every step runs offline: network denied, no provider key, no `evals/**` access.

1. **Run the suite.** `pnpm --filter <tests-security> test -- pii`. Confirm it prints the canary count
   and the artifact count scanned per case.
2. **Read the corpus against the PRD.** Open `canaries/corpus.ts` beside PRD §37.1 and confirm every
   **blocked** row has at least one entry and every **allowed** row has one in the allowed corpus.
3. **Scanner sharpness.** Run `suites/negative-control.test.ts`; confirm it detects the planted canary
   in both the log buffer and the scratch database. Then base64-encode a canary into a scratch log
   line and confirm the derivative search catches it too.
4. **Artifact completeness.** Temporarily add a second log destination in the harness; confirm the
   harness captures it (or fails loudly). The point of the assertion is exhaustiveness — a sink the
   harness does not capture is a hole.
5. **Zero-creation.** After a blocked request, dump all table row counts and compare with the
   pre-request snapshot; confirm equality including `job`, `job_event`, `usage_ledger` and any
   ephemeral table.
6. **Provider tape.** Confirm the tape is empty for blocked requests and non-empty for an accepted
   one — otherwise the "no provider call" assertion is vacuous.
7. **Bypass matrix.** Walk `suites/no-bypass.test.ts` and confirm each attempt is a genuinely
   different mechanism, not the same request repeated.
8. **Availability split.** Force the detector unavailable; confirm the research-class arm is `503` and
   creates nothing, the search-class arm is admitted, and that a mid-pipeline interruption rejects.
9. **Recall report.** Confirm `recall-report.json` is written, has per-category numbers, and that the
   baseline comparison fails when a category is deliberately removed from the detector's fixture
   configuration. Discard the change.
10. **Isolation of the suite.** `git diff --name-only` shows only `tests/security/pii/**` plus the
    shared member manifest (append-only) and the lockfile.
11. **Construction pattern to copy.** `EVID-02`'s own `packages/pii/test/{entity,context}/**` for
    category shapes and the never-echo rule, `ASK-01`'s admission tests for the request builder, and
    `EVID-05`'s `test/validator/fixtures/prd-36-6-checks.json` for the "PRD table transcribed as data"
    device applied here to PRD §37.1.
12. **Reviewer focus.** Confirm the scanner searches **bytes of artifacts**, not the detector's return
    value (sub-PRD **D9**); confirm derivative forms including hashes are covered (PRD §37.2);
    confirm the blocked path creates nothing at all; confirm no bypass is accepted; confirm the recall
    number is reported and not silently used as a gate; confirm no canary in the repository is real
    data.

## Feedback obligation

1. **General rule.** If implementation falsifies this ticket, update **this ticket** (docs PR → merge
   → `publish-tickets.mjs --sync`) and, where module context changes,
   `docs/prd/23-assurance/README.md` (version +0.1 with a changelog line) **before** changing code.
   Silent divergence is an incomplete ticket.
2. **Foreseeable frictions, each with its exact writeback target:**
   - *A canary leaks into a log, a database file or the provider tape* → **that is a defect in the
     module that wrote it** (`apps/api`/`RUNT-01`, `packages/database`/`DATA-*`,
     `packages/model-gateway`/`EVID-07`, or `packages/pii`/`EVID-01`–`EVID-02`). File it against the
     owning ticket as a docs PR. Do **not** narrow the artifact list, remove a derivative form, or
     edit the owning module from `tests/**` (sub-PRD **D1**). PRD §37.3 marks blocked raw PII "Never"
     in all four columns; there is no acceptable leak.
   - *The detector's recall is lower than expected on a category* → that is `EVID-02`'s work and
     **M-Q6**'s decision. Record the measured number in `docs/prd/23-assurance/README.md` **M-Q6**,
     notify `12-evidence-safety` (`EVID-02`) by docs PR, and do not remove the category from the
     corpus to make the report look better.
   - *A category in PRD §37.1 cannot be detected deterministically at all* → record it in
     `coverage-gaps.md` **and** in `docs/prd/23-assurance/README.md` **M-Q6**, and raise it with
     `12-evidence-safety`. Do not delete the canary.
   - *A surface this suite should cover is outside the closure* (`/v1/search`, the completed answer,
     the ephemeral store) → `coverage-gaps.md` row **plus** the exact plan §5.24/§6.2 edge proposed by
     docs PR. Never add a `blocked_by` edge locally (plan §6.2).
   - *A test needs a real PII example to be realistic* → refuse. PRD §45.1 item 6 and §10.2 forbid it
     absolutely; realism comes from shape and checksum validity, never from provenance.
3. **Falsified protocol.** **If the server cannot be the authoritative PII boundary before logging,
   persistence or provider calls** — for example because a framework logs the request body before
   admission runs — that overturns PRD §10.1 and `PII-001`, not this suite's expectations. Stop. Do
   not add a redaction pass downstream and call it equivalent: PRD §37.2 requires blocked bodies to be
   *"held only in request memory and released after the response"*, which a redaction filter does not
   satisfy. Escalate for re-review, raise an ADR under `docs/adr/`, and write back to
   `docs/prd/23-assurance/README.md` **and** `docs/prd/breakdown-plan.md` before any code changes.
