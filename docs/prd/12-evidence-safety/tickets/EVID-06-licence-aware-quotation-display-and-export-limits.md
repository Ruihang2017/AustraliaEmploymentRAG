---
id: EVID-06
title: "Licence-aware quotation, display and export limits"
module: 12-evidence-safety
lane: 12-evidence-safety
size: M
agent: builder
status: draft
date: 2026-08-03
blocked_by: [EVID-05]
blocks: [XPRT-02, XPRT-03]
---

# EVID-06 — Licence-aware quotation, display and export limits

Implements PRD §11.1, §36.6 (row 10) and §8.9 — contributes to requirements **ANS-005**, **SEC-003**
and **EXP-001**; epic `E21-ANSWER`.
No ADR — the decision is already made in PRD §11.1 (the six assessment states and the
unclear-rights default) and PRD §36.6 (*"Quote/display/export is licence-permitted → Trim/
metadata-link-only; never bypass"*); this is build ticket 6 of 10 against it.
Parent sub-PRD: [12-evidence-safety README](../README.md). Master spec: [PRD](../../../PRD.md).
Depends on: [EVID-05 — Deterministic claim/citation validator and bounded repair](EVID-05-deterministic-claim-citation-validator-and-bounded-repair.md) (mirrors `blocked_by`)
**Why `builder`:** a bounded change inside one module's declared file-scope against a fixed contract —
`EVID-05` froze the `LicenceLimitPort`; this fills it with PRD §11.1's state matrix so the same limit
applies in the UI and in an export.

## Background + basis

**PRD §11.1 licensing registry, quoted verbatim:**

> Every SourceArtifact MUST link to the LicenceSnapshot applicable when acquired. **LicenceAssessment
> MUST independently state commercial-use, storage, indexing, embedding, display, quotation, export,
> attribution and prohibited-use decisions.**
>
> Assessment states:
>
> - `PERMITTED`
> - `PERMITTED_WITH_ATTRIBUTION`
> - `METADATA_AND_LINK_ONLY`
> - `UNCLEAR_RESTRICTED`
> - `PROHIBITED`
> - `REVIEW_REQUIRED`
>
> **Unclear rights default to metadata, limited quotation and official links. The product MUST NOT
> reproduce third-party commercial headnotes or imply government endorsement. Customer exports MUST
> apply the same restrictions.**

**PRD §36.6, the row this ticket owns:**

| Check | Failure consequence |
|---|---|
| Quote/display/export is licence-permitted | **Trim/metadata-link-only; never bypass** |

**PRD §8.9 exports, quoted verbatim:**

> Exports MUST preserve legal date, corpus release, claims, citations, assumptions, limitations and
> correction status. They MUST NOT regenerate the answer using current law.
>
> **Licensing rules MUST restrict excerpt length. Hidden prompts/reasoning, secrets and internal
> licensing notes MUST be excluded.**

**PRD §36.4** puts the per-item limit in the evidence pack: `licence_quote_limit` — *"Maximum
display/export characters"*. `EVID-04` carries it onto every pack item and refuses to admit a
`PROHIBITED` item at all; `EVID-05`'s check 10 enforces the numeric limit with a strict built-in
default and declares the `LicenceLimitPort` this ticket implements.

**PRD §11.2 legal positioning** adds the display-side obligations this ticket must not undermine:
*"It MUST include clear disclaimers in the Web app, widget and exports"* and *"It MUST NOT state that a
customer is definitely compliant"* — the second is `FND-07`'s prohibited-language detector, not this
ticket's, but a trimming rule must never remove a disclaimer or an attribution.

**Requirement `EXP-001`** (PRD §30.2): *"Existing snapshots export to PDF, DOCX and versioned JSON
without regeneration | … | **Export hashes/citations match snapshot**"* — which is only true if the
excerpt the exporter emits is derived by the same rule as the excerpt the screen showed.

**Where the assessment comes from.** `05-ingestion-framework`/`INGF-04` owns the licence snapshot and
assessment registry and the permitted-use gate (*"Unclear rights default to metadata/link-only"*).
This ticket **consumes** an assessment; it never assesses a source, and it never overrides an
assessment.

**Sub-PRD decision carried forward: D12** — one limit function, used identically by display and export;
trimming is visible, never silent.

**Accepted caveats carried forward:**

- **The default quote limit when an assessment states none is not in the PRD.** PRD §11.1 says *"limited
  quotation"* without a number. This ticket ships a conservative default and records sub-PRD
  **Q-EVID-3** (owner: this ticket proposes, **Founder** approves the customer-visible default,
  `INGF-04` owns the field). The absent-limit case must never mean "unlimited".
- **`REVIEW_REQUIRED` is not a permission.** PRD §11.1 lists it as an assessment state, not an
  allowance; this ticket treats it exactly as `UNCLEAR_RESTRICTED` and says so.
- **Rendering and layout are not this ticket.** `EVID-10` sanitises and renders; `packages/ui`
  (`RUNT-06`) displays; `XPRT-02`/`XPRT-03` lay out PDF/DOCX. This ticket decides *what text may
  appear*, in characters, plus the attribution and link that must accompany it.

## Goal

Produce `packages/citations/src/licensing/**`: the PRD §11.1 assessment-state matrix as one versioned
permission table, a single `applyQuotationLimits(citation, assessment, surface)` function that yields
an identical result for `DISPLAY` and `EXPORT`, visible offset-consistent trimming, metadata-and-link
fallback, required attribution, and the `LicenceLimitPort` implementation `EVID-05` declared.
Completion is mechanically checkable: a matrix fixture covers all six states × both surfaces, a
property test proves display and export never diverge, and no path exists by which a limit is exceeded.

## Non-goals

- **No licence snapshot, assessment authoring, permitted-use registry or licence review console** —
  `05-ingestion-framework` (`INGF-04`) and `22-internal-admin` (`INTL-05`). This ticket consumes an
  assessment and never revises one.
- **No changes to the validator, its checks, its counters or its repair loop** — `EVID-05` (merged;
  this ticket's blocker). This ticket implements the port `EVID-05` declared; a port shape change is a
  docs PR amending both tickets.
- **No evidence-pack construction or `licence_quote_limit` sourcing** — `EVID-04`. The limit arrives on
  the pack item.
- **No Markdown/HTML sanitisation or URL allowlisting** — `EVID-10` (`src/render/**`). Trimming happens
  before rendering; the two are composed by the caller, not by each other.
- **No export job, artifact, S3 lifecycle, signed URL, PDF or DOCX layout** — `19-exports` (`XPRT-01`
  … `XPRT-05`). `XPRT-02`/`XPRT-03` are `blocked_by` this ticket.
- **No screen, component or copy** — `03-app-runtime` (`RUNT-06`) and `15-answer-product` (`ASK-07`).
- **No disclaimer text or legal policy copy** — `24-launch` (`LNCH-01`, `LNCH-02`). This ticket must not
  remove one; it does not author one.
- **No corpus-side embedding/indexing permission decisions** — those are `CRPS-04` (index tiering,
  `EXCLUDED_LICENSING`) and `INGF-04`. This ticket governs **display and export of quoted text only**.

## File-scope (write-owns)

Owned by this ticket:

- `packages/citations/src/licensing/**`
- `packages/citations/test/licensing/**` (sub-PRD **D21**)
- `packages/citations/package.json`, `packages/citations/src/index.ts` — **append-only**, own entries
  only

Does not touch:

- `packages/citations/src/pack/**` — `EVID-04`; `src/validator/**` — `EVID-05`; `src/render/**` —
  `EVID-10` (a wave-3 sibling — disjoint directory, no shared file).
- `packages/pii/**` — `EVID-01`…`EVID-03`; `packages/model-gateway/**` — `EVID-07`…`EVID-09`.
- `packages/contracts/**`, `packages/domain/**` — `00-foundation` (PRD §44.3 serial-owned; the
  `LicenceAssessmentState` enum is **consumed** from `FND-03`, never redeclared).
  `packages/database/**` — `01-app-data`. `packages/ui/**` — `03-app-runtime`.
  `pipelines/ingestion/**` — `05-ingestion-framework`.
- `apps/**`, `services/**`, `infra/**`, `tests/**`, `evals/**`, `docs/adr/**` — other modules per
  breakdown plan §4 and A9. `docs/PRD.md` — frozen.
- Root manifests and lockfiles — `FND-01`.

**Serial-safety analysis.** First decomposition: nothing merged, no in-flight contention (breakdown
plan §1 header). `packages/citations/src/licensing/**` is written by no other ticket in the plan (plan
§5.13). This is a wave-3 ticket. Its concurrent siblings are `EVID-10` (`src/render/**` — same package,
**different directory**, no shared file beyond the append-only manifest and barrel), `EVID-03`
(`packages/pii/**`) and `EVID-09` (`packages/model-gateway/**`). `EVID-04` and `EVID-05` are merged
before this ticket starts. Shared append-only files: `packages/citations/package.json` and
`src/index.ts`.

## Deliverables

1. **`src/licensing/matrix.ts` — the PRD §11.1 state matrix as versioned frozen data**
   (`LICENCE_PERMISSION_MATRIX_V1`, with a `version` field). One row per assessment state, each stating
   quotation, display, export, attribution and link behaviour, and each carrying the PRD sentence that
   justifies it:

   | State | Quotation | Display | Export | Attribution | Official link |
   |---|---|---|---|---|---|
   | `PERMITTED` | up to `licence_quote_limit` | yes | yes | optional | required |
   | `PERMITTED_WITH_ATTRIBUTION` | up to `licence_quote_limit` | yes | yes | **required, non-removable** | required |
   | `METADATA_AND_LINK_ONLY` | **none** | metadata only | metadata only | as stated | **required** |
   | `UNCLEAR_RESTRICTED` | up to the conservative default (Q-EVID-3) | limited | limited | required if stated | **required** |
   | `REVIEW_REQUIRED` | treated as `UNCLEAR_RESTRICTED` | limited | limited | required if stated | **required** |
   | `PROHIBITED` | **none** | **nothing** — the item never reaches here (`EVID-04`) | none | — | — |

   The `DISPLAY` and `EXPORT` columns are populated from **one** source value per row, so they cannot
   be edited apart (sub-PRD **D12**; PRD §11.1 *"Customer exports MUST apply the same restrictions"*).
2. **`src/licensing/apply.ts::applyQuotationLimits(citation, assessment, surface): LimitedCitation`** —
   the single entry point, where `surface: 'DISPLAY' | 'EXPORT'`. The result carries the permitted
   quote text, the applied limit, a `trimmed: boolean`, the attribution string when required, the
   code-generated official URL, and a `reason` naming the matrix row that decided it. A **property
   test** asserts `applyQuotationLimits(c, a, 'DISPLAY')` and `applyQuotationLimits(c, a, 'EXPORT')`
   produce the same permitted text for every generated input — the two surfaces may differ in
   presentation, never in permission.
3. **Effective limit resolution, with no unlimited path.** The applied limit is
   `min(item.licence_quote_limit ?? DEFAULT_LIMIT, matrixRow.maxQuoteChars)`. `DEFAULT_LIMIT` is a
   conservative constant recorded as sub-PRD **Q-EVID-3**; an absent, `null`, negative or non-integer
   limit resolves to `DEFAULT_LIMIT`, **never** to unlimited. A test enumerates every malformed limit
   value. Basis: PRD §11.1 (*"Unclear rights default to metadata, limited quotation and official
   links"*), §36.4, §36.6.
4. **Visible, offset-consistent trimming.** When a quote exceeds the effective limit it is truncated at
   a **word or sentence boundary at or below** the limit, an explicit ellipsis marker is appended, and
   the result records the retained character range so the citation's offsets still point at real source
   text (`EVID-05` check 2 depends on this). Trimming is never silent: `trimmed: true` and the applied
   limit are part of the result so `ASK-07` and `XPRT-02` can show "excerpt limited by licence" with the
   official link. Basis: PRD §36.6 (*"Trim/metadata-link-only"*), §36.4 `text_offset_base`, §15.3.
5. **Metadata-and-link fallback.** For `METADATA_AND_LINK_ONLY`, and for any case where the effective
   limit is zero, the result carries **no quote text at all** and instead the code-generated title,
   authority, pinpoint, legal status, effective interval and official URL. This is a first-class
   outcome, not an error. Basis: PRD §11.1; §36.6.
6. **Attribution that cannot be dropped.** For `PERMITTED_WITH_ATTRIBUTION`, and wherever the
   assessment states an attribution requirement, the result's attribution field is non-optional and a
   type-level test proves a consumer cannot construct a `LimitedCitation` without it. Basis: PRD §11.1
   (*"LicenceAssessment MUST independently state … attribution"*); PRD §8.10 (*"The disclaimer,
   citations and product-source indicator MUST NOT be removable by customer theming"*) — the same
   non-removability principle.
7. **Prohibited-content rules.** `assertNoProhibitedReproduction(citation, assessment)` flags (a) any
   attempt to reproduce a third-party commercial headnote — detected from the assessment's
   prohibited-use decisions and the item's `document_type`, not from prose analysis — and (b) any
   accompanying text implying government endorsement, checked against a small frozen phrase list
   (*"endorsed by"*, *"approved by the government"*, *"official position of"*) applied to
   **product-supplied** framing text only, never to source text. Basis: PRD §11.1 (*"MUST NOT reproduce
   third-party commercial headnotes or imply government endorsement"*).
8. **`src/licensing/exportSafety.ts` — the PRD §8.9 exclusion list**, exported as an assertion the
   exporters call: `assertExportSafe(payload)` fails if the payload contains a prompt, a reasoning
   field, a secret, a credential, an internal licensing note, an internal assessment comment or an
   operator-only field. It is a **deny-by-shape** check over the known internal field names plus a
   structural scan for the reasoning field names `EVID-05`/`EVID-07` reject. Basis: PRD §8.9 (*"Hidden
   prompts/reasoning, secrets and internal licensing notes MUST be excluded"*); §9.4; sub-PRD D14.
9. **`LicenceLimitPort` implementation** matching the signature `EVID-05` deliverable 8 declared, so
   the validator's check 10 uses this matrix instead of its strict built-in default. A test asserts the
   port implementation is **never more permissive** than `EVID-05`'s `STRICT_PORT_DEFAULTS` for any
   generated input where the assessment is absent or malformed. Basis: PRD §36.6 (*"never bypass"*);
   sub-PRD D8.
10. **Purity.** No network, no file, no database, no clock, no randomness, no `process.env`, no logger.
    Basis: PRD §39.1, §45.2.
11. **`test/licensing/fixtures/**` — the state × surface matrix** (synthetic per sub-PRD D22): all six
    assessment states × `DISPLAY`/`EXPORT` × {quote under the limit, quote at the limit, quote over the
    limit, absent limit, zero limit, malformed limit}, each with its expected permitted text, trimmed
    flag, attribution and link. Plus `prd-11-1-states.json` — the six states transcribed verbatim from
    PRD §11.1, asserted against the matrix so a missing or renamed state fails.
12. **`README.md` update in `packages/citations`** — append the matrix, the one-function rule, the
    absent-limit default and its Q-EVID-3 status, the visible-trimming contract, and the export
    exclusion list.

## Acceptance checklist (classified)

- [ ] `[fixture]` **All six PRD §11.1 states replay**: `prd-11-1-states.json` matches
      `LICENCE_PERMISSION_MATRIX_V1` state for state, and every state × surface × limit-case fixture
      returns the tabled result. (PRD §11.1; §36.6 row 10)
- [ ] `[machine]` **Display and export never diverge**: a property test (≥ 10,000 generated inputs)
      asserts identical permitted text for both surfaces. (PRD §11.1 *"Customer exports MUST apply the
      same restrictions"*; §8.9; sub-PRD D12)
- [ ] `[machine]` **No unlimited path**: absent, `null`, negative, non-integer and oversized limits all
      resolve to the conservative default; a test enumerates every malformed value. (PRD §11.1;
      Q-EVID-3)
- [ ] `[machine]` **Never bypass**: no argument, flag, surface value or assessment combination produces
      a quote longer than the effective limit — asserted by a property test over generated citations.
      (PRD §36.6 *"never bypass"*)
- [ ] `[machine]` **Trimming is visible and offset-consistent**: a trimmed result sets `trimmed: true`,
      records the retained range, ends at a word/sentence boundary at or below the limit, and the
      retained range still reproduces source text at the citation's offsets. (PRD §36.6; §36.4; §15.3)
- [ ] `[fixture]` **Metadata-and-link fallback**: `METADATA_AND_LINK_ONLY` and zero-limit cases return
      no quote text and a complete metadata+official-link payload. (PRD §11.1)
- [ ] `[machine]` **Attribution is non-optional where required**: a type-level test proves a
      `LimitedCitation` for `PERMITTED_WITH_ATTRIBUTION` cannot be constructed without attribution.
      (PRD §11.1; §8.10)
- [ ] `[machine]` **`REVIEW_REQUIRED` is not a permission**: it behaves exactly as
      `UNCLEAR_RESTRICTED`. (PRD §11.1)
- [ ] `[machine]` **Prohibited reproduction and endorsement**: a commercial-headnote item is flagged; an
      endorsement phrase in **product-supplied** framing is flagged; the same phrase inside **source
      text** is not (source text is quoted material, not a product claim). (PRD §11.1)
- [ ] `[machine]` **Export safety**: `assertExportSafe` rejects payloads containing a prompt, reasoning
      field, secret, credential or internal licensing note; a positive test proves a clean snapshot
      passes. (PRD §8.9; §9.4)
- [ ] `[machine]` **Port is never more permissive than the strict default** for absent/malformed
      assessments. (PRD §36.6; `EVID-05` deliverable 8)
- [ ] `[machine]` **Enum reuse**: `LicenceAssessmentState` comes from `packages/contracts` (`FND-03`) —
      no local string union — asserted by a type test. (PRD §35.1, §20.1; `DEV-001`)
- [ ] `[machine]` **Purity**: no network, file, database, clock, randomness or `process.env`; repeated
      application is deeply equal. (PRD §39.1, §45.2)
- [ ] `[machine]` `pnpm lint`, `pnpm typecheck` and `pnpm test` green (standing item, PRD §45.3).
- [ ] `[machine]` `pnpm generate && pnpm generated:check` clean. (PRD §20.1, §45.3)
- [ ] `[machine]` No Rust or Python surface — `cargo test --workspace` / `uv run pytest` unaffected;
      declared not applicable. (PRD §45.3)
- [ ] `[machine]` **Writeback item**: sub-PRD **Q-EVID-3** in `docs/prd/12-evidence-safety/README.md`
      records the chosen `DEFAULT_LIMIT`, its basis and its Founder-approval status. (Breakdown plan
      §1.1; CLAUDE.md issue #53)
- [ ] `[machine]` PR states the PRD §45.4 items: requirement/UAT IDs (contributes to **ANS-005**,
      **SEC-003**, **EXP-001**; `UAT-EXP-01` is run end to end by `19-exports`), user-visible change and
      non-goals, schema/API/event compatibility impact (`LimitedCitation` is consumed by `ASK-07`,
      `XPRT-02`, `XPRT-03`), tenant/PII/security impact (none — public source text only),
      **source/licence impact — the substance of this ticket**, cost/memory/latency impact (pure
      function; negligible), rollback path (revert; `XPRT-02`/`XPRT-03` consume it), known gaps
      (**Q-EVID-3**).

Absent classes: no `[human]` criteria — this is a permission matrix verified mechanically. Its
human-facing acceptance is `UAT-EXP-01` at Gate 2 through `19-exports`, and PRD §26's *"Terms, Privacy,
AUP and disclaimer drafts are published"* item belongs to `24-launch`. The `[fixture]` items are
PRD-table transcriptions and synthetic matrices authored here (sub-PRD D22) — the PRD §14/§43
evaluation replays are `21-evaluation-600`.

## Test plan

Every step runs offline: no network, no provider key, no S3, no PDF toolchain.

1. **Read the matrix against the PRD.** Compare `test/licensing/fixtures/prd-11-1-states.json` with
   `docs/PRD.md` §11.1's state list, and the matrix's export column with §11.1's *"Customer exports MUST
   apply the same restrictions"* and §8.9's *"Licensing rules MUST restrict excerpt length"*.
2. **Run the suite.** `pnpm --filter @<scope>/citations test`, then `pnpm test`, `pnpm typecheck`,
   `pnpm lint` and `pnpm generate && pnpm generated:check` from the repository root. Construction
   pattern to copy: `FND-09`'s `packages/domain/test/budget/prd-24-1-budget.json` — a PRD table as a
   committed fixture asserted against versioned frozen data.
3. **Surface-parity property test.** Generate citations and assessments; assert identical permitted text
   for `DISPLAY` and `EXPORT`. On a scratch branch make the export column an independent field and set
   it higher; assert the property test fails; discard.
4. **Malformed-limit table.** Enumerate absent, `null`, `-1`, `0`, `1.5`, `NaN`, `Infinity` and an
   over-large value; assert the conservative resolution in every case and that none yields unlimited.
5. **Trimming test.** Quote at limit−1, at limit, and at limit+1; assert boundary trimming, the ellipsis
   marker, `trimmed: true`, and that the retained range still reproduces source text at the citation's
   offsets (round-trip against an `EVID-04` `./testing` pack, including a non-ASCII item).
6. **Metadata fallback.** `METADATA_AND_LINK_ONLY` and zero-limit cases: assert no quote text and a
   complete metadata+link payload with the code-generated URL.
7. **Attribution type test.** Attempt to construct a `LimitedCitation` for
   `PERMITTED_WITH_ATTRIBUTION` without attribution; assert a compile error.
8. **Prohibited-content test.** One commercial-headnote fixture; one endorsement phrase in product
   framing (flagged); the same phrase inside quoted source text (not flagged).
9. **Export-safety test.** Feed a payload containing a prompt, a `reasoning` field, an API key and an
   internal licensing note; assert each is rejected by name; feed a clean snapshot and assert it passes.
10. **Port-monotonicity test.** For absent/malformed assessments assert this port's output is never
    longer than `EVID-05`'s `STRICT_PORT_DEFAULTS` would allow.
11. **Purity.** Grep `src/licensing/**` for `fetch(`, `fs`, `sqlite`, `Date.now`, `Math.random`,
    `process.env` — none.
12. **Append-only manifest.** `git diff packages/citations/package.json packages/citations/src/index.ts`
    shows additions only; confirm no file under `src/{pack,validator,render}/**` changed.
13. **Reviewer focus.** Confirm the display and export permissions genuinely derive from one value;
    confirm no code path yields an unlimited quote; confirm trimming preserves the offsets `EVID-05`
    validates; confirm `REVIEW_REQUIRED` is not treated as permission; confirm the endorsement check
    never fires on source text, which would corrupt legitimate quotations.

## Feedback obligation

1. **General rule.** If implementation falsifies this ticket, update **this ticket** (docs PR →
   merge → `publish-tickets.mjs --sync`) and, where module context changes,
   `docs/prd/12-evidence-safety/README.md` (version +0.1 with a changelog line) **before** changing
   code. Silent divergence is an incomplete ticket. PRD §45.4 requires the **source/licence impact**
   section on this PR specifically.
2. **Foreseeable frictions, each with its exact writeback target:**
   - *The conservative `DEFAULT_LIMIT` makes answers unusable for a major source* → this is sub-PRD
     **Q-EVID-3**. Record the source, the assessment and the measured effect in
     `docs/prd/12-evidence-safety/README.md` **first**, and route the number to the **Founder** (a
     customer-visible licensing decision, PRD §45.5). The correct fix is usually a better
     `LicenceAssessment` from `INGF-04`, not a bigger default here.
   - *An assessment field this matrix needs does not exist* (e.g. a per-surface limit) → that is
     `INGF-04`'s `LicenceAssessment`. Raise the ticket change there, record it in
     `docs/prd/12-evidence-safety/README.md`, and take the `blocked_by` edge in
     `docs/prd/breakdown-plan.md` §5.13/§6.2 if sequencing is required. Never infer a permission the
     assessment does not state — PRD §11.1 makes unclear rights default **down**, not up.
   - *`XPRT-02`/`XPRT-03` need a longer excerpt to make a readable export* → refuse; PRD §11.1 and §8.9
     both bind exports to the same restrictions. Record the pressure in
     `docs/prd/12-evidence-safety/README.md`; the supported answer is metadata plus the official link.
   - *A screen wants to show the full text "because the source is public"* → public is not the same as
     licensed (PRD §11.1 assesses commercial-use, storage, display, quotation and export
     independently). Refuse, and record it; changing an assessment is `INTL-05`'s reviewed workflow.
   - *`EVID-05`'s port shape does not fit the matrix* → change the **port in `EVID-05`** via one docs PR
     amending both tickets, then `--sync`; never write `src/validator/**` from here.
3. **Falsified protocol.** If licence limits cannot be applied identically to display and export — for
   example if the export renderer cannot express a trimmed excerpt with its marker — that contradicts
   PRD §11.1's *"Customer exports MUST apply the same restrictions"* and PRD §8.9, and it puts the
   product in breach of a source licence rather than merely producing an ugly PDF. Stop, escalate for
   re-review, and write back to `docs/prd/12-evidence-safety/README.md` **and**
   `docs/prd/breakdown-plan.md` before any code. Never resolve it by letting the export path compute its
   own limit — two limit implementations is how a licence breach ships unnoticed.
