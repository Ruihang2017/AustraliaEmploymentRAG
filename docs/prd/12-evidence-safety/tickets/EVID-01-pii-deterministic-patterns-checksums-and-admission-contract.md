---
id: EVID-01
title: "PII deterministic patterns/checksums and admission contract"
module: 12-evidence-safety
lane: 12-evidence-safety
size: L
agent: builder
status: draft
date: 2026-08-03
blocked_by: [FND-03]
blocks: [EVID-02, ASK-06]
---

# EVID-01 — PII deterministic patterns/checksums and admission contract

Implements PRD §10.1, §37.1 and §37.2 — requirement **PII-001** (contributes to **ANS-002**); epic
`E19-PII`.
No ADR — the decision is already made in PRD §10.1 (the server is the authoritative PII boundary) and
PRD §37.2 (the admission pipeline, stage by stage); this is build ticket 1 of 10 against it.
Parent sub-PRD: [12-evidence-safety README](../README.md). Master spec: [PRD](../../../PRD.md).
Depends on: [FND-03 — Canonical enums and opaque ID conventions](../../00-foundation/tickets/FND-03-canonical-enums-and-opaque-id-conventions.md) (mirrors `blocked_by`)
**Why `builder`:** a bounded change inside one module's declared file-scope against a fixed contract —
PRD §37.2 states the pipeline and PRD §37.1 states the allowed/blocked table; this makes stages 1–3
executable and fixes the contract the rest of the pipeline plugs into.

## Background + basis

**PRD §10.1, quoted verbatim** — the requirement this ticket exists to satisfy:

> - Web/widget clients SHOULD provide immediate PII hints and one-click placeholders.
> - **The server MUST be the authoritative PII boundary before logging, persistence or provider calls.**
> - Server detection MUST combine deterministic patterns/checksums, local entity recognition and
>   context-aware public-entity rules.
> - Actual employee names, private contact/address data, TFNs, bank details, employee/payroll
>   identifiers, precise birth dates and identifying combinations MUST be blocked.
> - Employer names, ABNs, public business information, public case parties and necessary
>   role/duty/location facts MAY be accepted.
> - **Customers MUST NOT bypass a positive employee-PII finding.**
> - If authoritative detection is unavailable, public legal search MAY continue but free-text
>   Ask/Compare/Coverage MUST fail closed.

**PRD §37.2 admission pipeline, quoted verbatim** — the ordering this ticket must not rearrange:

```text
browser hints (not trusted)
→ request byte/field limits
→ deterministic patterns and checksums
→ local entity recognition
→ contextual public-entity allow rules
→ combination/risk rules
→ accept sanitized payload OR reject with offsets/types/replacements
→ only then create logs, persistence, jobs or provider calls
```

> Detection response includes field, character range, category and suggested placeholder but **never
> echoes the detected value**. Blocked request bodies are held only in request memory and released
> after the response. **Metrics record category/count/result, not content or reversible hash.**
>
> Public-entity exceptions must come from structured `employer`, `abn` or `public_case_party` fields,
> **not a generic "ignore warning" button**. If users need to explain a false positive, they can
> report the detector category and request ID without the original text.

**PRD §37.1 input examples, transcribed verbatim** — the acceptance target for the category
vocabulary:

| Allowed | Blocked |
|---|---|
| Public employer name and ABN | Employee or private individual name |
| State/territory and non-precise work location | Home address or precise private location |
| Anonymous role, duties, qualifications and employment type | Personal email, phone or private social identifier |
| Public case party/citation | TFN, bank/card details, Medicare/passport/licence number |
| Age band where legally relevant | Exact date of birth unless public case material |
| "Employee A", "the worker", synthetic placeholders | Employee/payroll ID, payslip content or personnel-file extract |
| Approximate wage/rate facts without identity | Identifying combination of rare role + tiny workplace + personal event |

**PRD §37.3 content retention matrix** gives blocked PII the strictest row in the product: *"Blocked
raw PII | Never | Never | Never | Never"* across `SAVE`, `EPHEMERAL`, logs/support and backup.

**PRD §34.9** fixes the customer-facing failure: `422 EMPLOYEE_PII_DETECTED`, retry *"After edit"*,
user action *"Replace indicated spans with anonymous placeholders"*. `UAT-PII-01` (PRD §41.2):
*"Enter synthetic TFN/name/contact details in Ask → Request blocked with categories/offsets; canary
absent from DB/log/provider stub."*

**Requirement PII-001** (PRD §30.2): *"Deterministic patterns, local NER and contextual rules form
the server boundary | Request admission | internal PII module | **None on reject** | Synthetic PII
suite meets configured recall and zero raw logging"*. The "Data owner: None on reject" column is the
design constraint — a rejected request must leave nothing behind.

**Sub-PRD decisions carried forward:** **D1** (the server boundary is authoritative; client hints are
recomputed, never trusted), **D2** (no bypass exists as a type), **D3** (a finding never carries the
value and nothing derived from it is reversible), **D4** (public-entity exceptions are structural).

**Accepted caveats carried forward:**

- **The configured recall target is not in the PRD.** `PII-001` says *"meets **configured** recall"*.
  This ticket ships measurement and a conservative initial target; the number is sub-PRD open question
  **Q-EVID-2**, owner **Founder**. The *blocked-category list* above is absolute and is not a tuning
  parameter.
- **The category vocabulary's permanent home is unsettled.** `UAT-PII-01` puts categories in the
  customer-visible error detail, which points at `packages/contracts` — but `FND-03`'s enum families
  do not include a PII family and PRD §44.3 makes `packages/contracts` serial-owned by
  `00-foundation`. This ticket owns the vocabulary locally and records sub-PRD **Q-EVID-6**; promoting
  it is a docs PR against `FND-03`/`FND-04` plus a plan §5.13/§6.2 edge, never a hand-edit.
- **Stages 4–6 of the §37.2 pipeline are not this ticket.** Local entity recognition, contextual
  public-entity rules and combination/risk rules are `EVID-02`; the availability split is `EVID-03`.
  This ticket defines the stage ports they fill and ships a conservative default for each so the
  pipeline is runnable and testable from day one.

## Goal

Produce `packages/pii/src/{deterministic,contract}/**`: the admission contract (request, finding,
result and stage-port types) that the whole PII pipeline is expressed in, plus PRD §37.2 stages 1–3 —
request byte/field limits and the deterministic pattern/checksum detectors — wired into one ordered
pipeline entry point with ports for the later stages. Completion is mechanically checkable: a
type-level test proves no bypass field and no value-carrying field can exist; a synthetic corpus
replay reports per-category recall and precision; and a canary test proves no detected value or
reversible derivative reaches any sink.

## Non-goals

- **No local entity recognition, public-entity context rules or combination/risk rules** — `EVID-02`
  (`packages/pii/src/{entity,context}/**`), which is `blocked_by` this ticket. This ticket ships the
  ports and deny-nothing/allow-nothing defaults, not the recognisers.
- **No detector-availability decision, health probe or fail-closed routing** — `EVID-03`
  (`packages/pii/src/availability/**`).
- **No HTTP route, middleware, error mapping or status code emission** — `03-app-runtime` (`RUNT-02`
  admission chain) and `15-answer-product` (`ASK-01`). This ticket returns a typed decision; the
  translation to `422 EMPLOYEE_PII_DETECTED` is the API's.
- **No UI hints, placeholder buttons or Ask-form behaviour** — `15-answer-product` (`ASK-06`, which is
  `blocked_by` this ticket) and `03-app-runtime` (`RUNT-06`). PRD §10.1 makes client hints advisory;
  they never satisfy `PII-001`.
- **No persistence, encryption or ephemeral storage** — `01-app-data` (`DATA-03`, `DATA-08`). This
  module stores nothing; PRD §37.2 holds blocked bodies *"only in request memory"*.
- **No enum definitions in `packages/contracts`** — `FND-03`, PRD §44.3 serial-owned (see Q-EVID-6).
- **No logging implementation or metrics backend** — `03-app-runtime` (`RUNT-07`
  `packages/observability`). This ticket accepts an injected sink and constrains what may be passed
  to it.
- **No cross-boundary PII no-leak suite** — `23-assurance` (`ASSR-03`, `blocked_by EVID-02`).
  Unit/integration tests live in this package (breakdown plan §1.1).
- **No detection of PII inside *corpus* text.** Public official sources are public (PRD §37.3 last
  row); this boundary governs customer input only.

## File-scope (write-owns)

Owned by this ticket:

- `packages/pii/src/deterministic/**`
- `packages/pii/src/contract/**`
- `packages/pii/test/deterministic/**`, `packages/pii/test/contract/**` (sub-PRD **D21**)
- `packages/pii/package.json`, `packages/pii/tsconfig.json`, `packages/pii/src/index.ts` —
  **append-only**, own entries only (sub-PRD D21)

Does not touch:

- `packages/pii/src/{entity,context}/**` — `EVID-02`; `packages/pii/src/availability/**` — `EVID-03`.
- `packages/citations/**` — `EVID-04`, `EVID-05`, `EVID-06`, `EVID-10`;
  `packages/model-gateway/**` — `EVID-07`, `EVID-08`, `EVID-09`.
- `packages/contracts/**`, `packages/domain/**`, `schemas/**` — `00-foundation` (PRD §44.3
  serial-owned); consumed, never written.
- `packages/database/**`, `packages/jobs/**` — `01-app-data`. `packages/ui/**`,
  `packages/observability/**` — `03-app-runtime`. `packages/retrieval-client/**`,
  `services/search-rs/**` — `11-retrieval-engine`.
- `apps/**` — `03-app-runtime` and the product modules. `pipelines/**` — `04-corpus-contract` and the
  source modules. `infra/**`, `tests/**`, `evals/**` — other modules per breakdown plan §4.
  `docs/PRD.md` — frozen.
- Root `package.json`, `pnpm-lock.yaml`, `tsconfig.base.json` — `FND-01` (PRD §44.3 serial-owned root
  lockfiles). A new dependency regenerates `pnpm-lock.yaml` as a build artifact; conflicts resolve by
  re-running the package manager, never by hand-merge (breakdown plan §1.1).

**Serial-safety analysis.** First decomposition: nothing merged, no in-flight contention (breakdown
plan §1 header). `packages/pii/src/{deterministic,contract}/**` is written by no other ticket in the
plan (plan §5.13). This is one of three wave-1 tickets in the module; its two concurrent siblings are
`EVID-04` (`packages/citations/src/pack/**`) and `EVID-07`
(`packages/model-gateway/src/{profiles,providers,schema}/**`) — different packages, different trees,
no shared file and no import edge between the three packages. Within `packages/pii`, `EVID-02` and
`EVID-03` are `blocked_by` this ticket and therefore never concurrent with it. The only shared files
are this package's manifest, `tsconfig.json` and `src/index.ts`, all append-only (sub-PRD D21). The
sole declared blocker, `FND-03`, is `00-foundation` wave 2 and lands first.

## Deliverables

1. **`src/contract/request.ts` — the admission request type.** `PiiAdmissionRequest` is `readonly`,
   closed (no index signature, no `unknown` passthrough) and has exactly two kinds of member:
   - `freeText: readonly { field: string; value: string }[]` — the fields to be scanned, named so a
     finding can point at one (PRD §37.2 *"Detection response includes field…"*);
   - `structured?: { employer?: string; abn?: string; publicCaseParty?: string }` — the **only**
     channel through which a public entity may be accepted (sub-PRD **D4**, PRD §37.2).

   There is **no** `override`, `force`, `acknowledge`, `ignoreWarnings`, `bypass`, `skipPii`,
   `trustedClient` or `clientHints` field, and no role/permission parameter. Client hints are not an
   input at all: PRD §37.2 lists them as untrusted, and D1 recomputes server-side. A **type-level
   test** asserts that adding any such property fails to compile. Basis: PRD §10.1, §37.2; sub-PRD
   D1/D2.
2. **`src/contract/finding.ts` — the finding type that cannot carry a value.**
   `PiiFinding = { readonly field: string; readonly start: number; readonly end: number;
   readonly category: PiiCategory; readonly severity: 'BLOCKING' | 'ADVISORY';
   readonly suggestedPlaceholder: string }`, with half-open `[start, end)` character offsets over the
   NFC-normalised field value. There is **no** `value`, `text`, `match`, `sample`, `hash`,
   `fingerprint`, `redactedValue` or `context` field, and no method that returns one. A type-level
   test asserts it. Basis: PRD §37.2 (*"never echoes the detected value"*, *"not content or reversible
   hash"*); sub-PRD **D3**.
3. **`src/contract/category.ts` — the PRD §37.1 blocked-category vocabulary** as a frozen
   `PII_CATEGORY_VALUES` tuple with a runtime guard, shaped exactly like a `FND-03` enum family so it
   can be promoted without a rename (Q-EVID-6): `EMPLOYEE_OR_PRIVATE_INDIVIDUAL_NAME`,
   `PRIVATE_CONTACT_EMAIL`, `PRIVATE_CONTACT_PHONE`, `PRIVATE_SOCIAL_IDENTIFIER`,
   `HOME_ADDRESS_OR_PRECISE_LOCATION`, `TAX_FILE_NUMBER`, `BANK_OR_CARD_DETAIL`, `MEDICARE_NUMBER`,
   `PASSPORT_NUMBER`, `DRIVER_LICENCE_NUMBER`, `EMPLOYEE_OR_PAYROLL_IDENTIFIER`,
   `PAYSLIP_OR_PERSONNEL_EXTRACT`, `EXACT_DATE_OF_BIRTH`, `IDENTIFYING_COMBINATION`, plus exactly one
   member that is **not** a §37.1 row: `REQUEST_LIMIT_EXCEEDED`. Each §37.1-derived member carries a
   doc comment quoting the row it comes from. A test asserts every §37.1 "Blocked" row maps to at
   least one member **and** that every member other than `REQUEST_LIMIT_EXCEEDED` cites a row.

   **Amendment (2026-08-08, `EVID-01` implementation).** `REQUEST_LIMIT_EXCEEDED` was added because
   deliverable 6 makes exceeding a limit *"a `REJECT` with a limit finding"*, deliverable 2 fixes
   `PiiFinding.category` as a `PiiCategory`, and deliverable 4 fixes the result shape as
   `{ decision, findings }` with no other channel — so a limit rejection was otherwise
   unrepresentable. The alternatives (a second finding type, a third result variant) were rejected
   because they change the deliverable-4 result shape, which is this ticket's most load-bearing type.
   The member names no PII category, says nothing about the content of a request, and is excluded
   from the §37.1 recall table. Recorded in `docs/prd/12-evidence-safety/README.md` **Q-EVID-6** so
   the promotion of this vocabulary into `packages/contracts` inherits the decision.
4. **`src/contract/result.ts` — a result with no third state.**
   `PiiAdmissionResult = { decision: 'ACCEPT'; sanitizedPayload: SanitizedPayload; findings: readonly PiiFinding[] }
   | { decision: 'REJECT'; findings: readonly PiiFinding[] }`. A `REJECT` carries **no** payload, and
   there is no `ACCEPT_WITH_BLOCKING_FINDINGS` variant: if any finding has severity `BLOCKING`, the
   result is `REJECT` — asserted by an invariant test over generated finding sets. `SanitizedPayload`
   is a distinct branded type that only this module can construct, so a caller cannot forward an
   unadmitted payload to a provider by structural typing. Basis: PRD §10.1 (*"MUST NOT bypass"*);
   sub-PRD D2.
5. **`src/contract/pipeline.ts` — the PRD §37.2 pipeline as ordered, named stages with ports.**
   `admit(request, stages): PiiAdmissionResult` executes, in this exact order and with no parameter
   that skips a stage:
   1. `enforceLimits` (deliverable 6) — request byte/field limits;
   2. `detectDeterministic` (deliverable 7) — patterns and checksums;
   3. `stages.recogniseEntities` — **port**, implemented by `EVID-02`;
   4. `stages.applyPublicEntityRules` — **port**, implemented by `EVID-02`;
   5. `stages.applyCombinationRules` — **port**, implemented by `EVID-02`;
   6. `decide` — accept sanitized payload or reject with offsets/types/replacements.

   Each port has a shipped conservative default so the pipeline is complete before `EVID-02` lands:
   `recogniseEntities` returns no findings, `applyPublicEntityRules` allows **only** exact matches of
   the structured `employer`/`abn`/`publicCaseParty` values, and `applyCombinationRules` returns no
   findings. The defaults are exported as `CONSERVATIVE_STAGE_DEFAULTS` and are documented as
   placeholders, never as the shipped detector. Basis: PRD §37.2 (the pipeline is the spec);
   sub-PRD D1.
6. **`src/deterministic/limits.ts` — request byte/field limits.** Per-field maximum characters,
   total request bytes and maximum field count, applied **before** any scanning so a hostile payload
   cannot exhaust the detector. Exceeding a limit is a `REJECT` with a limit finding, not a
   truncation. Values are exported as versioned frozen data with a `version` field. Basis: PRD §37.2
   line 2; §21.1 (*"file/type/time/size/resource limits"*).
7. **`src/deterministic/detectors/**` — one module per detector, each exporting
   `(fieldName, value) => PiiFinding[]`**, all offset-exact, all NFC-normalising before matching, and
   all resistant to the obvious evasions (embedded whitespace, punctuation separators, full-width
   digits, zero-width characters). Required detectors and their checksums:

   | Detector | Rule | Basis |
   |---|---|---|
   | `tfn` | 9-digit Australian TFN with the **mod-11 weighted checksum**; a number that fails the checksum is still reported when it appears in an explicit TFN context | §37.1 "TFN" |
   | `abn` | 11-digit ABN with the **mod-89 checksum** (subtract 1 from the first digit, weighted sum ≡ 0 mod 89) — used to *validate* the structured `abn` field and to distinguish an ABN from a TFN-shaped number, **not** to block | §37.1 allowed column; §34.9 `INVALID_ABN`; `UAT-SRCH-04` |
   | `medicare` | 10/11-digit Medicare number with its check digit | §37.1 "Medicare" |
   | `bankOrCard` | Luhn-valid card numbers; BSB (`NNN-NNN`) adjacent to an account number | §37.1 "bank/card details" |
   | `email` | RFC-shaped addresses | §37.1 "Personal email" |
   | `phone` | Australian mobile/landline formats including `+61` and spaced/parenthesised forms | §37.1 "phone" |
   | `passport` | Australian passport formats | §37.1 "passport" |
   | `driverLicence` | The state/territory licence formats, each named | §37.1 "licence number" |
   | `dateOfBirth` | An exact date in a birth context (`born`, `DOB`, `date of birth`); an **age band** is not a finding | §37.1 "Exact date of birth"; allowed column "Age band" |
   | `employeeOrPayrollId` | Labelled identifiers (`employee no`, `payroll id`, `staff number`) | §37.1 "Employee/payroll ID" |
   | `payslipOrPersonnelExtract` | Structural markers of a pasted payslip/personnel record (a co-occurring block of `gross`/`net`/`YTD`/`super`/`tax withheld` with an identifier) | §37.1 "payslip content or personnel-file extract" |

   Each detector ships an `EVASIONS.md`-style doc comment listing the normalisation it applies, so a
   Reviewer can see what it does **not** cover.
8. **`src/deterministic/placeholders.ts` — the suggested replacements** PRD §37.2 requires the
   response to carry, drawn from PRD §37.1's allowed column: `Employee A`, `the worker`,
   `[EMAIL REMOVED]`, `[PHONE REMOVED]`, `[TFN REMOVED]`, `[DATE OF BIRTH REMOVED]`, a
   state/territory-level location for a precise address, an age band for an exact birth date. One
   placeholder per category, frozen, with a test asserting total coverage of `PII_CATEGORY_VALUES`.
9. **`src/deterministic/sanitize.ts` — sanitisation for the ACCEPT path only.** Advisory findings
   (e.g. a formatting normalisation) are applied to produce the `SanitizedPayload`; a `BLOCKING`
   finding never produces a "cleaned" payload, because PRD §10.1 requires the customer — not the
   system — to replace the spans (`UAT-PII-01`, §34.9 *"Replace indicated spans with anonymous
   placeholders"*). Sanitisation is offset-stable: the returned payload records the transformations
   so a caller can map back without holding the original.
10. **Nothing is stored, logged or echoed.** The module declares no logger, opens no file, no socket
    and no database. The only observability surface is an injected
    `PiiMetricsSink { record(event: { category: PiiCategory; count: number; result: 'ACCEPT' | 'REJECT'; requestId: string }): void }` —
    a closed type with no free-form payload, so a caller cannot pass content through it. A test injects
    a capturing sink, submits a canary value and asserts the canary appears in **no** sink call, no
    thrown error message, no stack trace and no returned finding. Basis: PRD §37.2, §37.3, §22
    (*"Logs MUST exclude … PII text"*); sub-PRD D3.
11. **`test/deterministic/corpora/**` — the synthetic PII corpus.** Every value is invented and
    documented as synthetic (PRD §45.1 item 6). Structure: per category, at least 20 positive cases
    (including evasion variants) and at least 20 near-miss negative cases drawn from PRD §37.1's
    allowed column (employer names, ABNs, public case parties, age bands, approximate wage facts,
    state-level locations, "Employee A"). Each case carries expected offsets and category. Distinct
    **canary tokens** are embedded for the leak assertions and are listed in one manifest file so
    `ASSR-03` can reuse them.
12. **`src/deterministic/report.ts` + a committed measurement report** — per-category recall and
    precision over deliverable 11, written to `packages/pii/test/deterministic/recall-report.json`
    and reproduced by the test run. The report is the input to sub-PRD **Q-EVID-2** (the configured
    target, owner **Founder**); this ticket sets an initial minimum of **100% for checksum-verifiable
    categories** (TFN, Medicare, bank/card) and records the measured value for the rest without
    silently lowering any bar.
13. **`README.md` in `packages/pii`** — one page: the §37.2 stage order, the no-bypass rule, the
    "findings never carry values" rule, how to inject the metrics sink, and the explicit statement
    that browser hints are advisory and never satisfy `PII-001`.

## Acceptance checklist (classified)

- [ ] `[machine]` **No bypass exists as a type**: a type-level test proves `PiiAdmissionRequest`
      cannot express `override`, `force`, `acknowledge`, `ignoreWarnings`, `bypass`, `skipPii`,
      `trustedClient` or `clientHints`, and that `admit` has no stage-skipping parameter.
      (PRD §10.1, §37.2; `PII-001`; sub-PRD D2)
- [ ] `[machine]` **A finding cannot carry a value**: a type-level test proves `PiiFinding` has no
      `value`/`text`/`match`/`hash`/`fingerprint`/`context` member and no accessor returning one.
      (PRD §37.2; sub-PRD D3)
- [ ] `[machine]` **Blocking implies reject**: a property test over generated finding sets asserts
      that any `BLOCKING` finding yields `decision: 'REJECT'` with **no** payload, and that
      `SanitizedPayload` is constructible only inside this module. (PRD §10.1; `PII-001`)
- [ ] `[fixture]` **Synthetic corpus replay**: the corpus in deliverable 11 replays with per-category
      recall/precision recorded in `recall-report.json`; checksum-verifiable categories are at 100%
      recall; every §37.1 "Blocked" row has at least one passing positive case — **except**
      `IDENTIFYING_COMBINATION`, whose positive cases are authored here, replayed as `deferred` with
      an owner and a reason, and reported at **0%** until `EVID-02` implements the combination stage.
      (PRD §37.1; `PII-001` *"Synthetic PII suite meets configured recall"*; Q-EVID-2)

      **Amendment (2026-08-08, `EVID-01` implementation).** §37.1 blocked row 7 (*"Identifying
      combination of rare role + tiny workplace + personal event"*) is out of reach of stages 1-3: it
      **is** the combination/risk rule PRD §37.2 places after entity recognition, which this ticket's
      Non-goals assign to `EVID-02`. Deleting the row's cases, or demoting a case the detectors miss,
      would hide the gap; `deferred` reports it on every run instead. Rows 1 and 2 and the
      social-identifier third of row 3 ARE reachable deterministically and are shipped here
      (`labelled-name.ts`, `address.ts`, `social-identifier.ts`) — pattern-plus-context detectors, not
      entity recognition, since deliverable 7's table is a stated minimum ("Required detectors").
- [ ] `[fixture]` **Allowed inputs are not blocked**: every PRD §37.1 "Allowed" row replays as
      `ACCEPT` — public employer name, valid ABN, state-level location, anonymous role/duties, public
      case party, age band, "Employee A", approximate wage facts. (PRD §37.1; `UAT-PII-02`)
- [ ] `[machine]` **Zero raw logging**: with a capturing metrics sink injected, a canary value appears
      in no sink call, no error message, no stack trace and no returned finding; the module contains no
      logger, file, socket or database import — asserted by an import-graph test.
      (PRD §37.2, §37.3, §22; `PII-001` *"zero raw logging"*)
- [ ] `[machine]` **No reversible derivative**: a test asserts no finding, metric or error carries a
      hash, encoding or truncation of the detected value. (PRD §37.2 *"not content or reversible
      hash"*)
- [ ] `[machine]` **Stage order is the PRD's**: a test observes the ordered stage invocations and
      asserts the exact PRD §37.2 sequence, that limits run before any scanning, and that a stage
      cannot be omitted. (PRD §37.2)
- [ ] `[machine]` **Checksums are real**: TFN mod-11, ABN mod-89, Medicare check digit and card Luhn
      each accept a known-valid synthetic value and reject a single-digit mutation of it. (PRD §37.2
      *"deterministic patterns and checksums"*; §34.9 `INVALID_ABN`)
- [ ] `[machine]` **Offsets are exact and half-open**: for every positive corpus case, slicing the NFC
      field value at `[start, end)` reproduces the detected span's length and position; a non-ASCII
      case is included. (PRD §37.2 *"character range"*)
- [ ] `[machine]` **Evasion resistance**: spaced, punctuated, full-width and zero-width variants of a
      TFN and an email are detected; the documented non-coverage list in each detector is present.
      (PRD §37.2)
- [ ] `[machine]` **Public-entity acceptance is structural**: the same employer string in `freeText`
      is treated by the ordinary rules, while the `structured.employer` field is accepted — a test per
      channel. (PRD §37.2; sub-PRD D4)
- [ ] `[machine]` **Placeholders cover every category**: `PII_CATEGORY_VALUES` and the placeholder map
      have identical key sets. (PRD §37.2 *"suggested placeholder"*)
- [ ] `[machine]` **Purity**: no clock, no randomness, no `process.env`, no I/O; the same request
      always yields the same result — asserted by a repeat-invocation test. (PRD §39.1, §45.2)
- [ ] `[machine]` `pnpm lint`, `pnpm typecheck` and `pnpm test` green (standing item, PRD §45.3).
- [ ] `[machine]` `pnpm generate && pnpm generated:check` clean — this ticket writes no generated
      binding and must not cause a generated diff. (PRD §20.1, §45.3)
- [ ] `[machine]` No Rust or Python surface — `cargo test --workspace` / `uv run pytest` unaffected;
      declared not applicable. (PRD §45.3)
- [ ] `[machine]` **Writeback item**: `recall-report.json` is committed and sub-PRD **Q-EVID-2** and
      **Q-EVID-6** are updated in `docs/prd/12-evidence-safety/README.md` with the measured numbers and
      the category vocabulary's status. (Breakdown plan §1.1; CLAUDE.md issue #53)
- [ ] `[machine]` PR states the PRD §45.4 items: requirement/UAT IDs (**PII-001**, contributes to
      `ANS-002`; `UAT-PII-01`/`UAT-PII-02` are exercised end to end by `15-answer-product` and
      `23-assurance`), user-visible change and non-goals, schema/API/event compatibility impact (the
      local category vocabulary and its Q-EVID-6 status), **tenant/PII/security and retention impact**
      (nothing is stored; blocked bodies live only in request memory — PRD §37.2/§37.3), source/licence
      impact (none), cost/memory/latency impact (admission runs in `apps/api`'s 320 MiB budget — report
      p95 for a maximum-size request), rollback path (revert; only `EVID-02` and `ASK-06` consume it),
      known gaps (**Q-EVID-2** recall target, **Q-EVID-6** vocabulary home, stages 4–6 are `EVID-02`).

Absent classes: no `[human]` criteria — this is a server-side detector verified mechanically. Its
human-visible acceptance is `UAT-PII-01`/`UAT-PII-02`, run at Gate 2 against the Ask form
(`15-answer-product`/`ASK-06`) with the cross-boundary assertions in `23-assurance`/`ASSR-03`. The
`[fixture]` items here are synthetic-corpus replays authored in this package (sub-PRD D22); the PRD
§14/§43 evaluation replays belong to `21-evaluation-600`/`GOLD-14`.

## Test plan

Every step runs offline: no network, no provider key, no database, no model.

1. **Read the corpus against the PRD.** Open `packages/pii/test/deterministic/corpora/**` beside
   `docs/PRD.md` §37.1 and confirm every "Blocked" row has positive cases and every "Allowed" row has
   negative cases. Confirm every value is obviously synthetic and that the canary manifest lists the
   tokens.
2. **Run the suite.** `pnpm --filter @<scope>/pii test`, then `pnpm test`, `pnpm typecheck`,
   `pnpm lint` and `pnpm generate && pnpm generated:check` from the repository root. Harness: the test
   runner `FND-01` registered, plus the property-testing library used by `packages/domain`
   (`FND-06`/`FND-07` set the pattern). Construction pattern to copy: `FND-10`'s
   `packages/domain/test/legal/**` — assert against a committed fixture, not against the
   implementation.
3. **Type-level tests.** `test/contract/types.test-d.ts` (or the repository equivalent): the absent
   bypass fields, the absent value-carrying fields, the two-variant result, and the branded
   `SanitizedPayload`.
4. **No-bypass negative test.** On a scratch branch add an `override?: boolean` to
   `PiiAdmissionRequest` and make `admit` honour it; assert the type-level test fails; discard.
5. **Canary leak test.** `test/deterministic/leak.test.ts` injects a capturing metrics sink and a
   capturing error handler, submits each canary token, and asserts the token appears in **nothing** the
   module emits — including `JSON.stringify` of the result.
6. **Stage-order test.** Inject instrumented stage ports; assert the recorded call order equals PRD
   §37.2 and that limits precede detection. On a scratch branch reorder two stages and assert the test
   fails; discard.
7. **Checksum tests.** For TFN, ABN, Medicare and card: one valid synthetic value each, then each
   single-digit mutation, asserting rejection.
8. **Offset test.** For every positive case assert `value.normalize('NFC').slice(start, end)` has the
   expected length and that the non-ASCII case's offsets are character offsets, not byte offsets.
9. **Determinism.** Call `admit` twice on the same request and assert deep equality; grep
   `src/{deterministic,contract}/**` for `Date.now`, `Math.random`, `process.env` — none.
10. **Append-only manifest.** `git diff packages/pii/package.json packages/pii/src/index.ts` shows
    additions only.
11. **Reviewer focus.** Confirm there is genuinely no path — parameter, optional field, role check,
    environment variable or test hook — by which a `BLOCKING` finding produces an accepted payload;
    confirm the metrics sink type cannot carry content; confirm the conservative stage defaults are
    documented as placeholders and cannot be mistaken for the shipped detector; confirm the recall
    report is generated by the test run rather than hand-written.

## Feedback obligation

1. **General rule.** If implementation falsifies this ticket, update **this ticket** (docs PR →
   merge → `publish-tickets.mjs --sync`) and, where module context changes,
   `docs/prd/12-evidence-safety/README.md` (version +0.1 with a changelog line) **before** changing
   code. Silent divergence is an incomplete ticket.
2. **Foreseeable frictions, each with its exact writeback target:**
   - *The category vocabulary must appear in the OpenAPI `EMPLOYEE_PII_DETECTED` error detail* →
     that is `packages/contracts`, which is `00-foundation`'s and PRD §44.3 serial-owned. Record it in
     `docs/prd/12-evidence-safety/README.md` **Q-EVID-6**, raise a docs PR against `FND-03`/`FND-04`,
     and take the `blocked_by` edge in `docs/prd/breakdown-plan.md` §5.13 **and** §6.2. Never
     hand-write an enum into `packages/contracts` (PRD §20.1).
   - *The ABN checksum is also needed by `14-search-product` (`UAT-SRCH-04`, `INVALID_ABN`)* → do not
     let a second copy appear. Record the shared need in `docs/prd/12-evidence-safety/README.md` and
     raise it on `docs/prd/breakdown-plan.md` §4.2 as a contested primitive; the resolution is one
     owner plus an edge, not two implementations.
   - *A detector's recall is below the configured target* → this is **Q-EVID-2**, owner **Founder**.
     Update `docs/prd/12-evidence-safety/README.md` Q-EVID-2 with the measured number **first**.
     Lowering a target is a risk decision (PRD §45.5 product change); widening a pattern is ordinary
     work. Never delete a blocked category from PRD §37.1's list.
   - *A false positive blocks a legitimate legal question* → the remedy PRD §37.2 names is a
     **structured field** or a category-and-request-ID report *"without the original text"* — not an
     override. Add the case to the negative corpus, narrow the pattern, and record it in
     `docs/prd/12-evidence-safety/README.md`. If the only workable remedy is an override, stop: see
     item 3.
   - *A caller wants the detected value for support/debugging* → refuse. PRD §37.2 and §37.3 forbid it
     in all four columns. The supported path is the request ID plus the category. If a genuine
     operational need appears, it is a writeback to `docs/prd/12-evidence-safety/README.md` **D3** and
     a PRD §45.5 product change, before any code.
   - *`EVID-02`'s stages need a port shape this contract cannot express* → change the **port type in
     this ticket** (docs PR amending `EVID-01` and `EVID-02` together, then `--sync`), never by having
     `EVID-02` write `src/contract/**`.
3. **Falsified protocol.** If a server-side authoritative boundary proves unworkable — for example if
   the only way to keep the product usable is a customer override of a positive employee-PII finding —
   that directly overturns PRD §10.1 (*"Customers MUST NOT bypass"*) and `PII-001`, and it is the
   product's stated privacy promise (PRD §2, §10). **Stop. Do not add the override.** Escalate for
   re-review, raise an ADR under `docs/adr/` and write back to
   `docs/prd/12-evidence-safety/README.md` and `docs/prd/breakdown-plan.md` before any code change. A
   bypass added quietly inside this ticket is indistinguishable, at review time, from no PII boundary
   at all.
