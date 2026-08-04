---
id: LNCH-01
title: "Terms, Privacy, AUP, disclaimer drafts and `LEGAL_REVIEW_PENDING` register"
module: 24-launch
lane: 24-launch
size: M
agent: builder
status: draft
date: 2026-08-03
blocked_by: [FND-01]
blocks: [LNCH-02, LNCH-03]
---

# LNCH-01 — Terms, Privacy, AUP, disclaimer drafts and `LEGAL_REVIEW_PENDING` register

Implements PRD §11.2 (legal positioning), PRD §26 Security/privacy item 4 and PRD §27 (the "Founder
cannot fund legal review" mitigation row). No §30.2 requirement ID covers legal positioning — the PRD
§26 Definition-of-Done item is the register entry, and `LNCH-05` records its closure. **No ADR — the
decision is already made in PRD §11.2; this is build ticket 1 of 5 against it.**
Parent sub-PRD: [24-launch README](../README.md). Master spec: [PRD](../../../PRD.md).
Depends on: `FND-01` — monorepo bootstrap, pinned toolchains, workspace skeleton
([`00-foundation`](../../00-foundation/README.md)) — this ticket runs its checker on the toolchain
`FND-01` commits (Node.js `24.18.0`; breakdown-plan §8 **Q12**, confirmed) and needs the repository
skeleton to exist.
**Why `builder`:** a bounded change inside one module's declared file-scope (`docs/policies/**`)
against a contract PRD §11.2 already enumerates document by document — not a new subsystem decision.
The *content* decisions are explicitly excluded and routed to the Founder (Non-goals).

## Background + basis

**PRD §11.2 is the whole specification, and it is short enough to quote in full:**

> - The product provides information, evidence-grounded research and conditional guidance, not legal
>   representation.
> - It MUST include clear disclaimers in the Web app, widget and exports.
> - It MUST NOT state that a customer is definitely compliant.
> - Paid legal review is not a release blocker because the founder cannot fund it initially.
> - Terms of Service, Privacy Policy, Acceptable Use Policy and disclaimer copy MUST be drafted before
>   paid access.
> - `LEGAL_REVIEW_PENDING` MUST remain an explicit launch risk and be revisited when revenue permits.

**It is a Definition-of-Done item.** PRD §26, Security/privacy: "Terms, Privacy, AUP and disclaimer
drafts are published; `LEGAL_REVIEW_PENDING` remains disclosed internally." PRD §25.2 places
"policies/disclaimers" in week 8 alongside launch-gate closure.

**PRD §27 fixes the mitigation shape**, which is why this ticket ships drafts and a standing risk
rather than reviewed law:

> | Founder cannot fund legal review | Draft policies/disclaimers, conservative licensing, no
> legal-review launch blocker, retain `LEGAL_REVIEW_PENDING`, reinvest revenue |

**Who writes the words.** PRD §45.5 classifies any change to "customer behaviour, scope, promise,
price/limit, data use or release gate" as a **Product change** that "requires founder approval and PRD
update". Terms, liability, governing law, pricing and data-use promises are all of those. This ticket
therefore delivers the **structure, the machine-readable rules, the risk register and the checker**;
the substantive text is authored or approved by the **Founder** and lands as a later docs change into
the same files. Unfilled sections must be *machine-detectable*, not plausible-looking filler — a
convincing placeholder that reads like a real clause is worse than an empty one.

**Facts the Builder MAY transcribe** (they are product facts fixed by the PRD, not legal positions,
and each must cite its section in the document so the Founder can verify it):

- Retention periods — PRD §10.3: "Research Records and Answer Snapshots: until customer deletion or
  organisation closure. Ordinary application logs: 14 days. Security and audit events: 12 months.
  Deleted customer records: 30-day recoverable period, then primary deletion. Deleted data in backups:
  ages out within a further maximum of 30 days. Organisation closure: export followed by deletion
  within 30 days. API request/response bodies: not logged by default."
- Ephemeral retention — PRD §10.4: expiry "one hour after completion/failure/cancellation and no later
  than 24 hours after creation", excluded from Litestream, backups, exports and support tools.
- Customer-content use — PRD §10.2: "Customer queries and records MUST NOT be used for training,
  evaluation or manual product analysis by default. Anonymised improvement/shadow use requires
  explicit opt-in. Provider configurations MUST use no-training and zero or approved minimal
  retention. Subprocessors and transient cross-border processing MUST be disclosed."
- PII boundary — PRD §10.1: employee names, private contact/address data, TFNs, bank details,
  employee/payroll identifiers, precise birth dates and identifying combinations "MUST be blocked";
  "Customers MUST NOT bypass a positive employee-PII finding."
- Data region — PRD §19.2: "This split exists because R2 is cost-effective for public corpus/egress
  but its Oceania placement hint is not an Australian residency guarantee." The Privacy Policy must
  not upgrade that into a residency promise.
- Service position — PRD §13.2: "99.5% internal objective; no contractual SLA". PRD §13.3: "Target
  response within two business days", "Critical incidents: best effort same business day", "No phone
  or 24/7 support".
- Licensing limits — PRD §11.1: "Unclear rights default to metadata, limited quotation and official
  links. The product MUST NOT reproduce third-party commercial headnotes or imply government
  endorsement. Customer exports MUST apply the same restrictions."
- Capacity — PRD §13.4: the tested baseline "is a tested system baseline, not a single-customer
  entitlement or unlimited-capacity promise."

**Two consumers depend on this file set** (breakdown-plan §6.2: `LNCH-01 --> LNCH-02 & LNCH-03`):
`LNCH-02` compiles it into the in-product legal feature and `LNCH-03` into the public static site.
Sub-PRD decision **D2** makes this the single source: policy text exists here and nowhere else.

**Accepted caveats carried forward, documented not enforced here:**

- **`LEGAL_REVIEW_PENDING` is never resolved by this module** — PRD §11.2 requires it to remain. It is
  disclosed *internally* (PRD §26); it is **not** customer-facing copy and must not appear in any
  rendered string (Deliverable 5).
- **Paid-access timing is a Founder decision** — sub-PRD open question **QL3**. This ticket ships
  documents in a `DRAFT_*` status; nothing here decides when they become `PUBLISHED`.
- **The toolchain versions are settled** — breakdown-plan §8 **Q12** is **confirmed**: Node.js
  `24.18.0`, pnpm `11.4.0`, Rust `1.97.1`, Python `3.14.6`, committed by `FND-01` in `.node-version`,
  `package.json#packageManager`, `package.json#engines.node`, `rust-toolchain.toml`,
  `pyproject.toml#requires-python` and the corresponding lockfiles. This ticket **consumes** those
  pins — `check-policies.mjs` is a plain Node script run by the pinned Node — and pins, upgrades or
  restates no version of its own.

## Goal

Produce `docs/policies/**` as the single canonical, machine-checkable source of the four PRD §11.2
documents: a frontmatter schema, the four documents with their required sections present (each section
either Founder content or an explicit `FOUNDER_INPUT_REQUIRED` marker), the machine-readable
claim-language rules that implement "MUST NOT state that a customer is definitely compliant", the
standing `LEGAL_REVIEW_PENDING` register, and a dependency-free checker that fails on a missing
document, an invalid frontmatter, a missing required section, a prohibited claim, a missing register
row, or `LEGAL_REVIEW_PENDING` leaking into customer-facing copy. Completion is mechanically checkable:
`node docs/policies/tools/check-policies.mjs` exits 0 on the committed tree and exits 1 on each of the
seeded negative fixtures.

## Non-goals

- **No substantive legal text.** Governing law, liability, indemnity, warranty, pricing, contract
  term, dispute resolution and the final wording of every clause are the **Founder's** (PRD §45.5
  Product change; sub-PRD D1/QL1). The Builder writes structure and PRD-cited factual statements only,
  and marks everything else `FOUNDER_INPUT_REQUIRED`.
- **No rendering.** In-product pages are `LNCH-02` (`apps/web/src/features/legal/**`); the public site
  is `LNCH-03` (`apps/web/public-site/**`). This ticket writes no React, no HTML and no CSS.
- **No resolution of `LEGAL_REVIEW_PENDING`.** PRD §11.2 requires it to remain; only the Founder, with
  a completed paid review, could ever close it, and that is out of MVP scope (PRD §27).
- **No pricing, plan or limit definition.** The paid-pilot limits are PRD §24.3 product facts; the
  onboarding pack that uses them is `LNCH-04`.
- **No licence-registry work.** Per-source licence snapshots and assessments are
  `05-ingestion-framework` (`INGF-04`) and the review console is `22-internal-admin` (`INTL-05`). This
  ticket only states the customer-facing consequences PRD §11.1 already fixes.
- **No generated-answer safety.** Refusal/status behaviour and "no unsupported definitive claim" are
  `FND-07`, `EVID-05` and `ASSR-04`. The claim-language rules here apply to **static policy and
  marketing copy**, not to model output.
- **No CI or root-script wiring.** `.github/workflows/**` is `FND-02` and root scripts are `FND-01`
  (breakdown-plan §4.1); see sub-PRD **QL9**.

## File-scope (write-owns)

- `docs/policies/**` — every file in this ticket, and no file outside it.

Does not touch:

- `apps/web/src/features/legal/**` — `LNCH-02` (same module, wave 2).
- `apps/web/public-site/**` — `LNCH-03` (same module, wave 2).
- `docs/onboarding/**` — `LNCH-04`. `docs/release/**` — `LNCH-05`.
- `docs/runbooks/**` — `18-ops-release` (`RLSE-10`). `docs/api/**` — `20-developer-platform`.
- `docs/PRD.md`, `docs/discovery/**`, `docs/archive/**`, `templates/**`, `CLAUDE.md`, `.claude/**` —
  frozen (breakdown-plan §4).
- Root manifests, lockfiles, `.github/workflows/**` — `00-foundation` (`FND-01`, `FND-02`).
- `docs/adr/**` — no ADR is created by this ticket (the only ADR in this module is `LNCH-03`'s).

**Serial-safety analysis.** First decomposition (breakdown-plan §1: phase 1, `append: false`, nothing
merged, `existingFiles: ['.gitkeep']`), so no ticket has previously written `docs/policies/**` and no
in-flight ticket contends for it. `docs/policies/**` appears exactly once in breakdown-plan §4, under
`24-launch`. Within this module the four sibling scopes are disjoint trees
(`apps/web/src/features/legal/**`, `apps/web/public-site/**`, `docs/onboarding/**`,
`docs/release/**`), and this ticket is alone in wave 1 (breakdown-plan §7: 5 tickets, 4 waves, 2 peak
lanes), so nothing runs concurrently with it inside the lane.

## Deliverables

1. **`docs/policies/README.md`** — the index. States: (a) that this directory is the single source of
   policy text and that `LNCH-02`/`LNCH-03` compile it (sub-PRD D2); (b) the ownership rule — content
   is the Founder's, structure and checkers are the module's (sub-PRD D1); (c) the status lifecycle
   `DRAFT_PENDING_FOUNDER_CONTENT → DRAFT_FOUNDER_APPROVED → PUBLISHED`, with PRD §11.2's rule that
   the documents must be drafted **before paid access**; (d) the standing rule that
   `LEGAL_REVIEW_PENDING` is never closed here (PRD §11.2, §26); (e) the exact command to run the
   checker.
2. **`docs/policies/policy.schema.json`** — a JSON Schema (draft 2020-12) for the frontmatter of each
   policy document. Required keys: `id` (one of `terms-of-service`, `privacy-policy`,
   `acceptable-use-policy`, `disclaimer`), `title`, `version` (semver), `status` (the three lifecycle
   values), `effective_date` (ISO date or `null`), `owner` (fixed string `Founder`), `legal_review`
   (fixed string `LEGAL_REVIEW_PENDING`), `last_reviewed` (ISO date or `null`), `applies_to` (subset of
   `web-app`, `widget`, `exports`, `public-site`, `api`), `prd_basis` (array of PRD section refs).
   `disclaimer.md` additionally requires `short_form` and `export_form` string fields — the exact
   strings rendered in-product, in the widget and in exports (PRD §11.2, §8.10, §8.9).
3. **The four documents**, each with its required-section skeleton. A section is either Founder content
   or exactly one HTML comment `<!-- FOUNDER_INPUT_REQUIRED: <what is needed and why> -->` and no
   prose. Required sections (the checker enforces presence and order):
   - **`terms-of-service.md`** — Parties and definitions · What the service is *and is not*
     (PRD §11.2 sentence 1, quoted) · Eligibility and invite-only access (PRD §24.2, `AUTH-001`) ·
     Pilot scope and limits (reference to PRD §24.3; numbers live in `LNCH-04`) · Acceptable use
     (reference to the AUP) · Customer content, ownership and use (PRD §10.2) · Retention and deletion
     (PRD §10.3, §10.4) · Availability and support position — "99.5% internal objective; no
     contractual SLA" (PRD §13.2, §13.3) · Fees, invoicing and payment (manual pilot, PRD §41.4) ·
     `FOUNDER_INPUT_REQUIRED`: warranties, liability, indemnity · Suspension, kill switches and
     termination (PRD §12.4, §42.5) · `FOUNDER_INPUT_REQUIRED`: governing law and jurisdiction ·
     Changes to these terms · Contact.
   - **`privacy-policy.md`** — What we collect and why · The PII boundary and what customers must not
     submit (PRD §10.1) · Lawful basis / purpose · Customer content is not training or evaluation data
     by default, opt-in only (PRD §10.2) · Model providers, no-training and minimal-retention
     configuration (PRD §10.2) · Subprocessors and transient cross-border processing — an explicit
     list, marked `FOUNDER_INPUT_REQUIRED` for confirmation (PRD §10.2) · Data location, including the
     PRD §19.2 statement that the Oceania placement hint is **not** an Australian residency guarantee ·
     Retention schedule (PRD §10.3, §10.4 — transcribed with section citations) · Security summary at a
     level that discloses no topology (PRD §21.1, §22) · Access, correction, deletion and organisation
     closure (PRD §10.3, §41.4) · Breach notification (`FOUNDER_INPUT_REQUIRED`) · Contact.
   - **`acceptable-use-policy.md`** — No employee PII, and no attempt to bypass a positive PII finding
     (PRD §10.1) · No use as legal representation or as a substitute for advice (PRD §11.2) · No
     redistribution of licensed source material, no third-party headnotes, no implying government
     endorsement, export excerpt limits (PRD §11.1) · Credential handling: no long-lived browser
     secrets, scoped and expiring service accounts (PRD §38.4) · Sandbox is synthetic by default
     (`DEV-003`, PRD §20.2) · Rate, quota and concurrency limits (PRD §38.5, §24.4) · No security
     testing without written permission (`FOUNDER_INPUT_REQUIRED` for the disclosure address) ·
     Enforcement: scoped kill switches, suspension, incident handling (PRD §12.4, §42.5).
   - **`disclaimer.md`** — the four PRD §11.2 statements as the document body, plus frontmatter
     `short_form` (one to three sentences; the exact string every surface renders) and `export_form`
     (the longer string exports carry, PRD §8.9). Required body sections: What this product does
     (information, evidence-grounded research and conditional guidance) · What it does not do (legal
     representation; and it **does not state that a customer is definitely compliant**) · Point-in-time
     and legal-date limits (PRD §6.5, §6.6, §15.2) · Source freshness limits, including
     `FRESHNESS_LIMITED` (PRD §12.1) · Source licensing limits (PRD §11.1) · Coverage limits and the
     rule that a limited source category is shown as limited (PRD §44.4) · What to do if something
     looks wrong — issue reporting (PRD §12.3, `COR-001`).
4. **`docs/policies/claim-language/prohibited-claims.json`** — the machine-readable rule set every
   customer-facing surface in this module is checked against. Each entry:
   `{ id, pattern (JavaScript regex source, case-insensitive), rationale, prd_ref, severity: "error" }`.
   Minimum rule families, each traceable to a PRD sentence:
   - `definite-compliance` — assertions that the customer *is*/*will be*/*is guaranteed* compliant, or
     that the product "ensures compliance" (PRD §11.2 "It MUST NOT state that a customer is definitely
     compliant").
   - `legal-representation` — "legal advice", "your lawyer", "we represent you" and equivalents
     (PRD §11.2 sentence 1).
   - `government-endorsement` — "endorsed by", "official government product" and equivalents
     (PRD §11.1 "MUST NOT … imply government endorsement").
   - `sla-promise` — "guaranteed uptime", "SLA", "24/7 support" as a promise (PRD §13.2 "no contractual
     SLA"; PRD §13.3 "No phone or 24/7 support").
   - `unlimited-capacity` — "unlimited", "any volume" (PRD §13.4 "not a single-customer entitlement or
     unlimited-capacity promise").
   - `complete-coverage` — "all Australian law", "complete coverage", "every source" (PRD §44.4 "It is
     not permitted to silently call an unimplemented source category covered").
   Plus `allowed_negations`: an explicit list of phrasings that contain a pattern only in order to deny
   it (for example a sentence that begins "we do not state that"), so the required disclaimer text
   itself does not trip the checker. The file carries a `version` and a `schema_version`.
5. **`docs/policies/claim-language/required-strings.json`** — the inverse rule: the exact strings each
   surface MUST carry, keyed by surface (`web-app`, `widget`, `exports`, `public-site`). Values are
   references into `disclaimer.md` frontmatter (`short_form`, `export_form`) plus the
   product-source-indicator and citations-present requirements of PRD §8.10, expressed as
   `{ id, surface, source_field, must_be_visible: true, prd_ref }`. `LNCH-02` and `LNCH-03` consume
   this file; neither invents its own list.
6. **`docs/policies/legal-review-register.md` + `legal-review-register.json`** — the standing
   `LEGAL_REVIEW_PENDING` risk register (PRD §11.2, §26, §27). One row per policy document and one per
   PRD §11.2 surface (`web-app`, `widget`, `exports`), each with: `id`, `subject`, `risk` (the specific
   exposure of shipping unreviewed copy on that surface), `status` (fixed `OPEN`), `owner` (`Founder`),
   `review_trigger` ("when revenue permits", PRD §11.2), `disclosure` (`INTERNAL_ONLY`), `prd_ref`, and
   `first_recorded: 2026-08-03`. The Markdown file is the human view and the JSON file is the machine
   view consumed by `LNCH-05`'s closure record (`DOD-SEC-04`). Both state, in the document header, that
   **no ticket may set `status` to anything other than `OPEN`**; changing it is a Founder action
   recorded in `docs/policies/CHANGELOG.md`.
7. **`docs/policies/tools/check-policies.mjs`** — a dependency-free Node script (Node stdlib only, no
   npm dependency, no workspace membership; sub-PRD **D11**) exiting 0 or 1 and printing one line per
   violation with file, line and rule id. Checks:
   1. all four documents exist with the exact ids in the schema;
   2. frontmatter validates against `policy.schema.json` (implement the subset needed — the script must
      not require a JSON-Schema library);
   3. every required section heading is present, in order, exactly once;
   4. every section is either non-placeholder prose or exactly one `FOUNDER_INPUT_REQUIRED` marker —
      never both, never neither;
   5. `prohibited-claims.json` finds zero matches in any document body, in `short_form`/`export_form`,
      or in `required-strings.json`, after `allowed_negations` are excluded;
   6. `legal_review: LEGAL_REVIEW_PENDING` is present in all four frontmatters, the register has a row
      for each document and each PRD §11.2 surface, and every register row is `OPEN`;
   7. the literal string `LEGAL_REVIEW_PENDING` does **not** appear in any customer-facing field
      (`short_form`, `export_form`, or any document body) — it is an internal disclosure (PRD §26);
   8. `disclaimer.md` frontmatter carries a non-empty `short_form` and `export_form` (they may be
      Founder placeholders, in which case the document `status` must be
      `DRAFT_PENDING_FOUNDER_CONTENT`);
   9. every `prd_basis` entry matches a section that exists in `docs/PRD.md` (a read-only lookup — the
      script never writes the PRD);
   10. a `--report <path>` flag emits a machine-readable summary (per document: status, filled sections,
       outstanding `FOUNDER_INPUT_REQUIRED` count) for `LNCH-05` to reference.
8. **`docs/policies/tools/fixtures/**`** — negative fixtures the checker is tested against: a document
   missing a required section, a document with a prohibited claim
   (`"your organisation is fully compliant"`), a register row set to `RESOLVED`, a `short_form`
   containing `LEGAL_REVIEW_PENDING`, and a section that is both placeholder and prose. Each fixture is
   a complete miniature `policies/` tree so the checker can be pointed at it with `--root`.
9. **`docs/policies/tools/check-policies.test.mjs`** — assertions run by Node's built-in test runner
   (`node --test`): exit 0 on the real tree, exit 1 with the expected rule id on each negative fixture.
   No test framework dependency (sub-PRD D11).
10. **`docs/policies/CHANGELOG.md`** — `v0.1 — 2026-08-03 — initial structure; all documents
    `DRAFT_PENDING_FOUNDER_CONTENT`; `LEGAL_REVIEW_PENDING` opened for four documents and three
    surfaces.` Every later content change bumps the document `version` and adds a line here; `LNCH-02`
    and `LNCH-03` render the version and effective date, so a silent edit is visible downstream.

## Acceptance checklist (classified)

- [ ] `[machine]` `node docs/policies/tools/check-policies.mjs` exits 0 on the committed tree
      (PRD §11.2; sub-PRD D1)
- [ ] `[machine]` All four PRD §11.2 documents exist with schema-valid frontmatter and status
      `DRAFT_PENDING_FOUNDER_CONTENT` or `DRAFT_FOUNDER_APPROVED` (PRD §11.2, §26)
- [ ] `[machine]` Every required section is present exactly once and is either prose or exactly one
      `FOUNDER_INPUT_REQUIRED` marker — a section that is both fails (PRD §45.5; sub-PRD D1)
- [ ] `[machine]` The `prohibited-claims.json` scan reports zero matches across all four documents,
      `short_form`, `export_form` and `required-strings.json`, with `allowed_negations` applied
      (PRD §11.2 "MUST NOT state that a customer is definitely compliant"; PRD §11.1, §13.2, §13.4,
      §44.4)
- [ ] `[machine]` `legal_review: LEGAL_REVIEW_PENDING` is present in all four frontmatters; the
      register has an `OPEN` row for each document and for each of `web-app`, `widget`, `exports`; no
      row is in any other state (PRD §11.2, §26, §27)
- [ ] `[machine]` The literal `LEGAL_REVIEW_PENDING` appears in **no** customer-facing field or
      document body — internal disclosure only (PRD §26 "remains disclosed internally")
- [ ] `[machine]` `disclaimer.md` frontmatter exposes non-empty `short_form` and `export_form`, and
      `required-strings.json` references them by field name for `web-app`, `widget` and `exports`
      (PRD §11.2, §8.9, §8.10)
- [ ] `[machine]` Every `prd_basis` reference resolves to a section heading in `docs/PRD.md`
      (link/copy presence assertion; PRD §30.1)
- [ ] `[machine]` `node --test docs/policies/tools/` passes: exit 0 on the real tree, exit 1 with the
      expected rule id on each of the five negative fixtures (Deliverable 8)
- [ ] `[machine]` `pnpm lint`, `pnpm typecheck`, `pnpm test` green — the repository suite is unaffected
      by this docs-only ticket (PRD §20.3, §45.3)
- [ ] `[machine]` PR states the PRD §45.4 items, naming PRD §26 Security/privacy item 4, the
      known-gaps line listing every outstanding `FOUNDER_INPUT_REQUIRED` section, and the explicit
      statement that `LEGAL_REVIEW_PENDING` remains open
- [ ] `[human]` **Founder** authors or approves the substantive content of each of the four documents
      and sets `status` to `DRAFT_FOUNDER_APPROVED` (PRD §11.2 "MUST be drafted before paid access";
      §45.5 Product change; sub-PRD QL1). **Required before paid access; not required to merge this
      ticket** — the outstanding sections are carried as known gaps and re-checked by `LNCH-05`
      (`DOD-SEC-04`)
- [ ] `[human]` **Founder** confirms the subprocessor list and the data-region wording, specifically
      that the Privacy Policy does not upgrade PRD §19.2's "Oceania placement hint" into a residency
      guarantee (PRD §10.2, §19.2)
- [ ] `[human]` **Founder** confirms `LEGAL_REVIEW_PENDING` remains an open launch risk and is
      disclosed internally, and decides paid-access timing (PRD §11.2, §26; sub-PRD QL3)
- No `[fixture]` criteria — this ticket replays no recorded data. Its negative fixtures are
      hand-written inputs to a checker, exercised by the `[machine]` rows above (breakdown-plan §1.1)
- No `cargo test --workspace` / `uv run pytest` item — no Rust or Python touched (PRD §45.3)
- No `pnpm generate && pnpm generated:check` item — this ticket produces no generated bindings; the
      compiled policy module is `LNCH-02`'s (PRD §20.1)

## Test plan

Reviewer steps, offline, no network:

1. `corepack pnpm install --frozen-lockfile`; `pnpm lint && pnpm typecheck && pnpm test` — confirm the
   repository suite is green and untouched by this ticket.
2. `node docs/policies/tools/check-policies.mjs` → exit 0, no output beyond a one-line summary.
3. `node --test docs/policies/tools/` → all assertions pass. The construction pattern to copy is
   `FND-01`'s dependency-free tool tests under `tools/**` (same repository, the same pinned Node
   `24.18.0`, no test framework). Assert for each negative fixture in `docs/policies/tools/fixtures/`:
   `check-policies.mjs --root <fixture>` exits 1 **and** prints the expected rule id.
4. Negative check by hand, then revert: append the sentence `Your organisation is fully compliant with
   the Fair Work Act.` to `docs/policies/disclaimer.md`, re-run step 2, confirm exit 1 naming rule
   `definite-compliance`, then `git checkout -- docs/policies/disclaimer.md`.
5. Negative check by hand, then revert: set one row in `legal-review-register.json` to
   `"status": "RESOLVED"`, re-run step 2, confirm exit 1 naming the register rule, then revert.
6. Read `docs/policies/README.md` and confirm it states the ownership rule (content = Founder),
   the status lifecycle and the never-close rule for `LEGAL_REVIEW_PENDING`.
7. Confirm by inspection that no document contains invented legal clauses: every non-PRD-cited
   substantive statement is a `FOUNDER_INPUT_REQUIRED` marker. Spot-check the three
   `FOUNDER_INPUT_REQUIRED` sections named in Deliverable 3 (liability, governing law, breach
   notification).
8. Confirm `git status --porcelain` is clean after the test run — the checker writes nothing except
   when `--report` is given an explicit path.

## Feedback obligation

**1. General rule.** If implementation falsifies this ticket, update **this ticket file** first
(version note + changelog line in the PR), re-publish with `publish-tickets.mjs --sync`, then change
the files. Silent divergence is an incomplete ticket (CLAUDE.md, issue #53).

**2. Foreseeable frictions, each with its exact writeback target.**

- **A required section cannot be written without deciding a legal position** (the common case) → that
  is the expected outcome, not a failure: leave the `FOUNDER_INPUT_REQUIRED` marker, list it in the
  PR's known-gaps line (PRD §45.4) and add the row to `docs/policies/legal-review-register.md`. **Never
  invent the clause.** If the marker set grows beyond the sections named in Deliverable 3, record the
  additions in `docs/prd/24-launch/README.md` §6 under **QL1**.
- **PRD §11.2's six sentences appear to require something this file set cannot express** (for example a
  surface-specific disclaimer variant beyond `short_form`/`export_form`) → extend
  `policy.schema.json` and `required-strings.json` here, and record the new field in
  `docs/prd/24-launch/README.md` §4 as an amendment to **D2** *before* `LNCH-02`/`LNCH-03` consume it —
  both are `blocked_by` this ticket and must not discover a schema change by reading code.
- **A prohibited-claims rule produces false positives on legitimate required copy** → do **not** weaken
  or delete the rule. Add the precise phrasing to `allowed_negations` with a comment naming the PRD
  sentence that requires the wording. If the rule itself is wrong, that is a change to the
  claim-language contract two other tickets depend on: amend this ticket file and
  `docs/prd/24-launch/README.md` §4 **D1**, then `--sync`.
- **`LEGAL_REVIEW_PENDING` looks resolvable** (for example the Founder obtains a free review) → it is
  still not this ticket's call. PRD §11.2 says it "MUST remain an explicit launch risk and be revisited
  when revenue permits". The register row is closed only by a Founder-authored docs change recorded in
  `docs/policies/CHANGELOG.md`, and `LNCH-05`'s `DOD-SEC-04` must reflect whatever state it is actually
  in. A ticket that closes it is a PRD change (`docs/PRD.md` is frozen — escalate, do not edit).
- **The checker needs an npm dependency** (JSON Schema, YAML, Markdown parsing) → adding one changes
  the root lockfile, which is serial-owned by `FND-01` (breakdown-plan §4.1). Implement the needed
  subset in Node stdlib instead. If that is genuinely impossible, raise a `00-foundation` ticket and add
  the `blocked_by` edge in `docs/prd/breakdown-plan.md` §5.25/§6.2 **first** — do not edit
  `package.json` or `pnpm-lock.yaml`.
- **The checker must run in CI to be trusted** → `.github/workflows/**` is `FND-02`'s
  (breakdown-plan §4). Raise a `00-foundation` ticket, record it under **QL9** in
  `docs/prd/24-launch/README.md` §6, and keep the standalone command working meanwhile.

**3. Escalation.** PRD §11.2 is a product-level legal position and PRD §26 makes it a
Definition-of-Done item. If the required document set, the "MUST NOT state that a customer is
definitely compliant" rule, or the standing `LEGAL_REVIEW_PENDING` risk is outright falsified by
implementation, that overturns a founder-level decision recorded in a frozen document: escalate for
re-review before anything lands. Never resolve a legal position, and never delete a prohibited-claims
rule, inside this ticket.
