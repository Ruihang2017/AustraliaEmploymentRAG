---
id: LNCH-05
title: "Definition-of-Done closure and release evidence assembly"
module: 24-launch
lane: 24-launch
size: M
agent: builder
status: draft
date: 2026-08-03
blocked_by: [GOLD-17, ASSR-01, ASSR-05, ASSR-07, ASSR-08, RLSE-11, LNCH-04]
blocks: []
---

# LNCH-05 — Definition-of-Done closure and release evidence assembly

Implements PRD §26 (Definition of Done, all 22 items), PRD §43.5 (release evidence pack) and PRD §44.4
(schedule truth — the two permitted launch outcomes), and — under breakdown-plan §8 **Q10**, the
**confirmed** limited-state launch policy — **verifies that the final launch statement discloses every
limitation accurately**. It **records** `EVAL-002` ("Release is blocked
unless every numeric and zero-tolerance gate passes", enforced by `GOLD-03`/`GOLD-17`) and `OPS-001` /
`OPS-002` / `OPS-003` results rather than implementing them. **No ADR — the decision is already made in
PRD §26 and §44.4; this is build ticket 5 of 5 against it.**
Parent sub-PRD: [24-launch README](../README.md). Master spec: [PRD](../../../PRD.md).
Depends on: `GOLD-17` — release-candidate full-600 run, blind review, gate closure
([`21-evaluation-600`](../../21-evaluation-600/README.md)); `ASSR-01` — tenant-isolation attack suite,
`ASSR-05` — integration suite (idempotency, SSE resume, cancel, charge invariants), `ASSR-07` —
accessibility and responsive suite, `ASSR-08` — restore/DR and backup-exclusion assertions
([`23-assurance`](../../23-assurance/README.md)); `RLSE-11` — real-scale 2 GB benchmark and
hot-dense-coverage decision ([`18-ops-release`](../../18-ops-release/README.md));
[`LNCH-04`](LNCH-04-paid-pilot-onboarding-pack-and-eight-minute-demo-script.md) — the onboarding pack
whose known-gap template this ticket fills.
**Why `builder`:** a bounded change inside one module's declared file-scope (`docs/release/**`) against
a fixed contract — PRD §26 enumerates the items and PRD §43.5 the evidence-pack contents — not a new
subsystem decision. The judgement calls it cannot make (the §44.4 launch decision, founder approval,
commercial validation) are routed to the Founder as `[human]` items.

## Background + basis

**PRD §26 is the contract, and it is closed by evidence, not by assertion.** Its six groups contain 22
items; the two that govern this ticket's shape are the Security/privacy row "Terms, Privacy, AUP and
disclaimer drafts are published; `LEGAL_REVIEW_PENDING` remains disclosed internally" and the
Commercial-validation row "A real B2B organisation voluntarily pays to use the product. This is the
primary MVP commercial success signal; usage growth is secondary."

**PRD §43.5 fixes what the evidence pack contains:**

> Promotion UI links one immutable release report containing application/corpus versions, source
> coverage and gaps, all 600 metrics, per-category breakdown, critical-error list, changed cases,
> security/tenant/PII results, performance and memory benchmark, provider/profile cost forecast,
> backup/restore result, accessibility result, known risks and founder approval/reason.

That report itself is `GOLD-03`/`GOLD-17`'s artifact under `evals/reports/**` (breakdown-plan §5.22).
This ticket does **not** rebuild it; sub-PRD **D8** makes `docs/release/**` an index that references
evidence by path, content hash and run id.

**PRD §44.4 is the anti-narrowing rule and must be quoted in full, because it is the single most
important constraint on this ticket:**

> Eight weeks is an aggressive coordination plan, not a promise that scope can ignore quality. If the
> full roster cannot pass by Week 8, the only permitted launch outcomes are:
> 1. continue work and delay production access; or
> 2. launch with an explicit source group in a technically/licensing-limited state only where the PRD
>    already permits that state, the limitation is visible and relevant answers safely warn/refuse.
>
> **It is not permitted to silently call an unimplemented source category covered.**

PRD §25.2 says the same for the schedule: "If a source category cannot meet the registry, licensing,
freshness or evaluation gate by launch, it MUST be marked limited and MUST cause relevant answer
warnings; it cannot be silently omitted."

**The limited-state launch policy is confirmed — breakdown-plan §8 Q10, transcribed as sub-PRD D12.**
It is settled product policy. Neither this ticket nor Gate 2 reopens it, and an implementing agent may
not substitute its own judgement for it:

1. No mandatory source group is pre-selected for omission or reduced implementation.
2. Every Commonwealth, state and territory mandatory source group in the approved MVP scope must be
   attempted in full.
3. Arbitrary scope reduction to make a release date easier is not permitted.
4. A source group may launch in a customer-visible limited state **only** where measured evidence
   shows a genuine limitation prevents `ACTIVE`: official capability limits, the official body not
   publishing the material, licensing restriction, historical material unavailable, freshness
   limitation, or another real official-source constraint.
5. The permitted states are the ones the PRD already defines: `METADATA_AND_LINK_ACTIVE`,
   `FRESHNESS_LIMITED`, `LICENSING_RESTRICTED`, `SOURCE_UNAVAILABLE`.
6. A limited state must record the evidence, the affected dates or collections, the customer-visible
   warning, and why full coverage is unavailable.
7. Silent omission is prohibited, and no unofficial source or commercial headnote may substitute for
   unavailable official material.
8. `GOLD-16` produces the measured evidence and the proposed registry state.
9. **This ticket verifies that the final launch statement discloses those limitations accurately** —
   Deliverable 4, checker rule 9 in Deliverable 7, and the acceptance rows below.
10. Gate 2 is the verification and sign-off step under this policy, not an opportunity to cut mandatory
    scope.

Which groups, if any, end up limited is the one part still open, and it is a **Gate 2 output derived
from `GOLD-16`'s measured evidence** (**QL6**) — an evidence output, never a preference and never a
schedule concession. The anti-narrowing rule below is not weakened by Q10; it is reinforced by it.

**Closing an item by narrowing what it means is therefore prohibited**, and the prohibition is
mechanised: the closure record stores each item's PRD text verbatim in a `prd_quote` field and the
checker re-extracts PRD §26 from `docs/PRD.md` and fails on any drift (sub-PRD **D7**). A rewritten
item is a failed build, not a judgement call.

**Founder review is the human half.** PRD §43.4 fixes the review order (cross-tenant/PII/security
first, then unsupported claims and legal-date/jurisdiction failures, then changed evaluation cases, …)
and requires every reviewed failure to be classified `CODE`, `CORPUS`, `GOLD_DATA`, `PROMPT`,
`MODEL_PROFILE`, `PRODUCT_AMBIGUITY` or `SOURCE_LIMITATION` with "an owner, requirement ID and
reproducible fixture".

**Why these seven blockers, and what they leave open.** breakdown-plan §5.25 gives this ticket
`GOLD-17` (quality gates), `ASSR-01` (tenant isolation), `ASSR-05` (integration/charge invariants),
`ASSR-07` (accessibility), `ASSR-08` (restore/DR), `RLSE-11` (2 GB benchmark) and `LNCH-04`
(onboarding). PRD §26 also needs results from `ASSR-02` (SSRF/injection/XSS/supply chain), `ASSR-03`
(PII no-leak), `ASSR-04` (citation/refusal) and `ASSR-06` (UAT automation), which are **not** blockers
in the plan. That is sub-PRD open question **QL7**: this ticket does not invent the edges — it
references those artifacts if they exist and records the item `NOT_SATISFIED` with an escalation if
they do not. Inventing a `blocked_by` edge locally would fail `dag-scan.mjs`; narrowing the item to
what happens to be available is exactly what PRD §44.4 forbids.

**Accepted caveats carried forward, documented not enforced here:**

- **`DOD-COMM-01` cannot be produced by any ticket.** A paying customer is a Founder event
  (sub-PRD **D10**, **QL8**). It carries the dedicated status `PENDING_FOUNDER_EVENT` and may only
  become `SATISFIED` with a dated payment reference.
- **`LEGAL_REVIEW_PENDING` stays open.** PRD §11.2 requires it; `DOD-SEC-04` is satisfiable with the
  drafts published *and* the risk disclosed internally — never by closing the risk (`LNCH-01`).
- **PRD §26's runbook item names seven topics; PRD §42.7 names ten files.** "Migration" has no
  dedicated §42.7 file. The closure record must state the mapping explicitly and, where a topic has no
  file, record it as a gap rather than assume a neighbouring runbook covers it (`RLSE-10`).

## Goal

Produce `docs/release/**` as the mechanical Definition-of-Done closure: `definition-of-done.yaml` with
one entry per PRD §26 item carrying a verbatim `prd_quote`, a status, and either a resolvable
hash-matched evidence reference or a fully specified customer-visible limitation;
`release-evidence-index.yaml` mapping every PRD §43.5 pack element to its producing artifact;
`launch-limitations.md` naming the chosen PRD §44.4 outcome; the filled known-gap list for `LNCH-04`'s
acceptance template; and two dependency-free checkers that make all of it falsifiable. Completion is
mechanically checkable: `node docs/release/tools/check-dod.mjs` exits 0 only when every one of the 22
items is present exactly once, its quote matches `docs/PRD.md` §26 character for character, and it is
either evidenced or explicitly limited; `node docs/release/tools/check-evidence.mjs` exits 0 only when
every referenced artifact exists with a matching content hash.

## Non-goals

- **No re-running and no re-implementation of any gate.** The 600-case run and thresholds are
  `GOLD-17`; the suites are `23-assurance`; the benchmark is `RLSE-11`; promotion is `RLSE-06`/`RLSE-07`
  and `INTL-04`. This ticket reads their outputs.
- **No copying of results.** Evidence is referenced by path + hash + run id (sub-PRD **D8**); a pasted
  metric that later diverges from `evals/reports/**` is a defect.
- **No launch decision.** Choosing between PRD §44.4's two permitted outcomes is the **Founder's**,
  verified and signed off at Gate 2 under the confirmed limited-state launch policy (breakdown-plan §8
  **Q10**; sub-PRD **D10**, **D12**, **QL6**). This ticket makes the choice explicit, records it and
  verifies that the resulting statement is accurate; it does not make it.
- **No scope reduction, and no pre-selection of a group for omission.** Under §8 **Q10** every mandatory
  Commonwealth, state and territory source group must be attempted in full, and arbitrary reduction to
  make a release date easier is not permitted. This ticket has no input by which a mandatory group can
  be dropped, reduced or quietly left out of the record: an unmet group is `LIMITED` with the full
  evidence block, or `NOT_SATISFIED` with an escalation — never absent.
- **No commercial validation.** `DOD-COMM-01` is a Founder event (QL8).
- **No product, infrastructure or test code.** `docs/release/**` only.
- **No policy, onboarding or public-site content.** `LNCH-01`, `LNCH-04`, `LNCH-03` respectively.
- **No promotion UI.** PRD §43.5's "Promotion UI links one immutable release report" is `INTL-04`/
  `INTL-06` (`22-internal-admin`) linking `GOLD-03`'s report; this ticket produces the DoD closure that
  sits beside it, and states the link.

## File-scope (write-owns)

- `docs/release/**` — the closure record, the evidence index, the limitations statement, the known-gap
  list, the founder-approval record, the checkers, their fixtures and tests.

Does not touch:

- `docs/policies/**` — `LNCH-01`. `docs/onboarding/**` — `LNCH-04` (this ticket **fills** its template
  by writing the gap list here and linking it; it does not edit the template).
  `apps/web/src/features/legal/**` — `LNCH-02`. `apps/web/public-site/**` — `LNCH-03`.
- `evals/**`, `pipelines/evaluation/**` — `21-evaluation-600`; read-only, and **no path under
  `evals/gold/**` blind material is read or referenced** (PRD §45.1 item 6; breakdown-plan §9 R9).
- `tests/**` — `23-assurance`. `infra/**`, `docs/runbooks/**` — `18-ops-release`.
- `apps/**`, `packages/**`, `services/**`, `pipelines/**` — other modules.
- `docs/PRD.md` — frozen (breakdown-plan §4). It is **read** by the checker and never written.
- `docs/adr/**` — no ADR is created by this ticket.
- Root manifests, lockfiles, `.github/workflows/**` — `00-foundation`.

**Serial-safety analysis.** First decomposition (breakdown-plan §1: phase 1, nothing merged), so no
ticket has previously written `docs/release/**` and nothing contends for it. `docs/release/**` appears
exactly once in breakdown-plan §4, under `24-launch`, and is disjoint from every sibling scope in this
module. This ticket is alone in wave 4 — the last wave of the last module (breakdown-plan §7) — so
nothing runs concurrently with it inside the lane, and it blocks nothing (this module is terminal). It
claims no `docs/adr/` file, so breakdown-plan **A9** does not apply.

## Deliverables

1. **`docs/release/README.md`** — what this directory is and the three standing rules: (a) evidence is
   **referenced**, never copied (sub-PRD D8); (b) a PRD §26 item is closed only by evidence or by an
   explicit, customer-visible limitation — **never by rewording the item** (PRD §44.4, sub-PRD D7);
   (c) the two permitted PRD §44.4 outcomes, quoted. Plus the two checker commands.
2. **`docs/release/definition-of-done.yaml`** — the closure record. Header:
   `{ schema_version, application_version, corpus_release_id, generated_on, launch_ready: bool,
   launch_outcome: 'DELAYED' | 'LAUNCH_WITH_VISIBLE_LIMITS' | 'UNDECIDED', founder_approval_ref }`.
   Then one entry per PRD §26 item, keyed by a stable id, with:
   - `prd_group` (`Product` | `Corpus` | `Quality` | `Security/privacy` | `Operations` |
     `Commercial validation`);
   - `prd_quote` — the item's sentence(s) **verbatim** from `docs/PRD.md` §26;
   - `status` — `SATISFIED` | `LIMITED` | `NOT_SATISFIED` | `PENDING_FOUNDER_EVENT`;
   - `evidence[]` — `{ kind, path, sha256, run_id?, produced_by_ticket, observed_value? }` (required
     when `SATISFIED`; `observed_value` is read from the artifact, never typed by hand);
   - `limitation` — required when `LIMITED`, and the mechanical form of §8 **Q10** item 6:
     `{ what_is_limited, prd_clause_permitting_it, permitted_state, evidence_ref,
     affected_dates_or_collections, why_full_coverage_unavailable, customer_visible_where,
     answer_behaviour, tracking_id, owner }`. For a source group, `permitted_state` is one of
     `METADATA_AND_LINK_ACTIVE`, `FRESHNESS_LIMITED`, `LICENSING_RESTRICTED`, `SOURCE_UNAVAILABLE`, and
     `evidence_ref` resolves into `GOLD-16`'s coverage-reconciliation report — a limited state asserted
     without that measured evidence is not representable (sub-PRD **D12**);
   - `blocking_reason` + `escalation_ref` — required when `NOT_SATISFIED`;
   - `verified_on`, `owner`.

   The 22 required ids, with the artifact each is expected to reference (the Builder confirms the exact
   paths at execution time; the mapping below is the contract for *which module's* evidence counts):

   | id | PRD §26 item (abbreviated) | Expected evidence source |
   |---|---|---|
   | `DOD-PROD-01` | All required product surfaces deployed and authenticated | deployed release manifest (`RLSE-06`), per-surface UAT results (`ASSR-06`), public surface (`LNCH-03`) |
   | `DOD-PROD-02` | At least one paid-pilot path operational through manual onboarding/invoice | `docs/onboarding/**` + the founder walkthrough record (`LNCH-04`) |
   | `DOD-PROD-03` | Search available independently of hosted-generation budget | `UAT-SRCH-01`, `UAT-ANS-08`, budget breaker tests (`EVID-08`, `ASSR-05`) |
   | `DOD-PROD-04` | English UI, accessibility and responsive requirements pass release review | `ASSR-07` report + `LNCH-02`/`LNCH-03` results + founder review |
   | `DOD-CORP-01` | All five source waves active or explicitly limited | `GOLD-16` roster reconciliation (via `GOLD-17`) |
   | `DOD-CORP-02` | Current FY plus preceding two FYs validated | `GOLD-16` / corpus validation gates (`CRPS-06`) |
   | `DOD-CORP-03` | Raw evidence/provenance/licensing and immutable CorpusRelease workflows operate | `INGF-03`/`INGF-04`, `CRPS-02`/`CRPS-06`/`CRPS-07` |
   | `DOD-CORP-04` | Freshness, quarantine and safe promotion/rollback demonstrated | `INGF-05`/`INGF-08`, `RLSE-07`, `UAT-OPS-01` |
   | `DOD-QUAL-01` | All launch thresholds pass on the release candidate | `GOLD-17` release report |
   | `DOD-QUAL-02` | No critical time/jurisdiction errors or unsupported definitive claims remain | `GOLD-17` critical-error list; `ASSR-04` |
   | `DOD-QUAL-03` | Claim-level citation validator and refusal/status behaviour pass | `ASSR-04` (**QL7** — not a blocker) |
   | `DOD-QUAL-04` | Model profiles, fallback status and actual versions recorded | `GOLD-15` promotion report; `ANS-004` snapshot fields |
   | `DOD-SEC-01` | Tenant isolation, auth/MFA/SSO/service-account, PII, SSRF, injection, XSS, secret/supply-chain tests pass | `ASSR-01` (blocker), `ASSR-02`, `ASSR-03` (**QL7**) |
   | `DOD-SEC-02` | Customer content excluded from R2 and logs | `ASSR-03`, `RUNT-07` bounded-log assertions, `INGF-03`/R2 boundary |
   | `DOD-SEC-03` | S3 Sydney backup/export lifecycle and access boundaries pass | `RLSE-04`, `ASSR-08`, `UAT-EXP-02` |
   | `DOD-SEC-04` | Terms/Privacy/AUP/disclaimer drafts published; `LEGAL_REVIEW_PENDING` disclosed internally | `LNCH-01` checker report + `legal-review-register.json`, `LNCH-02` `legal-surface-conformance.json`, `LNCH-03` built bundle |
   | `DOD-OPS-01` | 2 GB benchmark passes or hot dense coverage safely reduced | `RLSE-11` benchmark report |
   | `DOD-OPS-02` | Cost forecast and hard circuit breakers fit A$50 | `EVID-08`/`INTL-07` forecast, `UAT-OPS-03` |
   | `DOD-OPS-03` | Backup lag, monthly restore, app rollback and CorpusRelease rollback demonstrated | `RLSE-05`/`RLSE-06`/`RLSE-07`/`RLSE-09`, `ASSR-08`, `UAT-OPS-02` |
   | `DOD-OPS-04` | External health/status, alerts, incident workflow and kill switches operate | `RLSE-08` drill records, `LNCH-03` status page, `INTL-09` |
   | `DOD-OPS-05` | Runbooks exist for deploy, migration, restore, source failure, provider failure, security incident and correction | `RLSE-10` — with the explicit §26-topic → §42.7-file mapping, and a gap row for any topic with no file |
   | `DOD-COMM-01` | A real B2B organisation voluntarily pays | **Founder** — `PENDING_FOUNDER_EVENT` until a dated payment reference exists |

3. **`docs/release/release-evidence-index.yaml`** — the PRD §43.5 pack mapped element by element:
   application/corpus versions · source coverage and gaps · all 600 metrics · per-category breakdown ·
   critical-error list · changed cases · security/tenant/PII results · performance and memory
   benchmark · provider/profile cost forecast · backup/restore result · accessibility result · known
   risks · founder approval/reason. Each element: `{ element, path, sha256, run_id, produced_by_ticket,
   present: bool }`. Where the pack element is `GOLD-03`'s immutable report, the entry points at it and
   states that the promotion UI (`INTL-04`/`INTL-06`) links the same file — one report, two readers
   (sub-PRD D8).
4. **`docs/release/launch-limitations.md`** — the PRD §44.4 statement. Quotes §44.4's two permitted
   outcomes, names the chosen one, and lists every `LIMITED` item from `definition-of-done.yaml` with:
   what is limited, the PRD clause that permits that limited state, **where the customer sees it**
   (exact surface and text — for a source group, the registry status plus the answer warning), what
   relevant answers do (warn or refuse — PRD §25.2, §12.1 `FRESHNESS_LIMITED`), and the tracking id.
   It must contain the source-category coverage statement derived from `GOLD-16`, and a stated
   invariant: **no source category appears as covered anywhere in the product, the onboarding pack or
   the public site unless the registry reports it `ACTIVE`** (PRD §44.4). If the chosen outcome is
   `DELAYED`, the file states what is being waited on and who decides resumption.

   **Disclosure verification (§8 Q10 item 9 — this ticket's obligation, not a restatement of
   `GOLD-16`'s).** The file carries a `disclosure_verification` section reconciled against `GOLD-16`'s
   coverage-reconciliation report, asserting four things and naming the report's path, hash and run id:
   (a) **completeness** — every non-`ACTIVE` group in `GOLD-16`'s gap list is disclosed here with its
   permitted state, evidence reference, affected dates or collections, customer-visible warning and why
   full coverage is unavailable; (b) **no invention** — no group is disclosed as limited that `GOLD-16`'s
   gap list does not carry, and no permitted state differs from the one `GOLD-16` proposes;
   (c) **no omission** — every mandatory group in `GOLD-16`'s roster is either `ACTIVE` there or
   disclosed here, so no group can vanish from both; (d) **no reduction** — no group is recorded as
   omitted, deferred, descoped or reduced for schedule reasons, a state §8 **Q10** items 1–3 forbid and
   this record does not represent. Verification is mechanical (Deliverable 7 rule 9) and its result is
   the evidence for the `[human]` Gate 2 sign-off; a failure holds `launch_ready` at `false`.
5. **`docs/release/known-gaps.md`** — the customer-facing gap list that fills `LNCH-04`'s
   `known-gap-acceptance-template.md`: one row per `LIMITED` or `NOT_SATISFIED` item, in
   customer-comprehensible language, with what not to rely on and the tracking id. Generated from
   `definition-of-done.yaml` by Deliverable 8 so the two cannot diverge; a gap known to the team but
   absent here violates PRD §41.4's Acceptance exit condition, "No critical defect/gap hidden".
6. **`docs/release/founder-approval.md`** — the PRD §43.5 "founder approval/reason" record and the PRD
   §43.4 review evidence: date, application and corpus versions, the review order actually followed,
   every reviewed failure with its classification (`CODE`, `CORPUS`, `GOLD_DATA`, `PROMPT`,
   `MODEL_PROFILE`, `PRODUCT_AMBIGUITY`, `SOURCE_LIMITATION`), owner, requirement ID and fixture
   reference, and the explicit approval or refusal with reason. Template plus the completed instance.
7. **`docs/release/tools/check-dod.mjs`** — the closure checker (Node stdlib only, exit 0/1, one line
   per violation; sub-PRD D11):
   1. the YAML parses (a minimal in-repo parser or a strict subset — no npm dependency) and validates
      against the header/entry shape;
   2. **all 22 ids are present exactly once**, with no extra ids;
   3. **`prd_quote` matches `docs/PRD.md` §26 verbatim** — the checker extracts §26's bullets itself and
      compares character for character after whitespace normalisation. This is the mechanical
      anti-narrowing rule (sub-PRD D7): a reworded item fails;
   4. `SATISFIED` requires at least one `evidence` entry; `LIMITED` requires a complete `limitation`
      block with every field of Deliverable 2 present and non-empty — including `permitted_state`,
      `evidence_ref`, `affected_dates_or_collections` and `why_full_coverage_unavailable`, which are
      §8 **Q10** item 6; `NOT_SATISFIED` requires `blocking_reason` and `escalation_ref`;
   5. `PENDING_FOUNDER_EVENT` is permitted **only** for `DOD-COMM-01`, and `DOD-COMM-01` may be
      `SATISFIED` only with an evidence entry of kind `payment` carrying a date;
   6. `launch_ready: true` is rejected if any item is `NOT_SATISFIED`, if `launch_outcome` is
      `UNDECIDED`, or if any `LIMITED` item lacks `customer_visible_where`;
   7. every `LIMITED` item's `prd_clause_permitting_it` resolves to a real section of `docs/PRD.md`
      (PRD §44.4 outcome 2: "only where the PRD already permits that state");
   8. `known-gaps.md` contains exactly one row per `LIMITED`/`NOT_SATISFIED` item (no more, no fewer);
   9. **launch-statement disclosure verification (§8 Q10 item 9)** — the four assertions of
      Deliverable 4 are computed, not transcribed, against `GOLD-16`'s coverage-reconciliation report:
      completeness, no invention, no omission, no reduction. Any divergence between the report and
      `launch-limitations.md` exits 1 naming the group and the failing assertion; a missing or
      unhashable report is a failure, never a pass;
   10. `--report <path>` emits the machine-readable summary the PR quotes.
8. **`docs/release/tools/check-evidence.mjs`** — the evidence checker: every `path` in
   `definition-of-done.yaml` and `release-evidence-index.yaml` exists in the working tree, its
   `sha256` matches, its `produced_by_ticket` is an id that exists under `docs/prd/**`, and no path is
   under `evals/gold/**` (blind-material rule; PRD §45.1 item 6, breakdown-plan §9 R9). It also
   regenerates `known-gaps.md` from `definition-of-done.yaml` and fails on any diff (Deliverable 5).
9. **`docs/release/tools/fixtures/**` + `check-*.test.mjs`** — `node --test` assertions with twelve
   negative fixtures: a missing item, a duplicated item, a **reworded** `prd_quote`, a `SATISFIED` item
   with no evidence, a `LIMITED` item with no `customer_visible_where`, a `launch_ready: true` with a
   `NOT_SATISFIED` item, a `PENDING_FOUNDER_EVENT` on a non-commercial item, an evidence path with a
   stale hash, an evidence path under `evals/gold/`, a `LIMITED` item whose `limitation` block omits
   `evidence_ref` or `why_full_coverage_unavailable` (§8 **Q10** item 6), a group disclosed in
   `launch-limitations.md` that `GOLD-16`'s gap list does not carry, and a `GOLD-16` gap-list group
   missing from `launch-limitations.md`. Each must exit 1 with the expected rule id.
10. **`docs/release/CHANGELOG.md`** — one line per closure revision (a closure record is re-generated
    for each release candidate; the history is what makes a late status change visible).

## Acceptance checklist (classified)

- [ ] `[machine]` `node docs/release/tools/check-dod.mjs` exits 0 on the committed closure record
      (PRD §26, §44.4)
- [ ] `[machine]` All 22 PRD §26 items are present exactly once, with no extra and no missing id
      (PRD §26)
- [ ] `[machine]` Every `prd_quote` matches `docs/PRD.md` §26 character for character after whitespace
      normalisation — a reworded item fails the build (PRD §44.4; sub-PRD D7)
- [ ] `[machine]` Every `SATISFIED` item carries at least one evidence reference; every `LIMITED` item
      carries a complete limitation block — `permitted_state`, `evidence_ref`,
      `affected_dates_or_collections`, `why_full_coverage_unavailable`, `customer_visible_where` and
      `answer_behaviour` included; every `NOT_SATISFIED` item carries a blocking reason and an
      escalation reference (PRD §26, §44.4 outcome 2, §25.2; breakdown-plan §8 **Q10** item 6)
- [ ] `[machine]` `node docs/release/tools/check-evidence.mjs` exits 0: every referenced artifact
      exists, its `sha256` matches, its producing ticket id exists under `docs/prd/**`, and no path is
      under `evals/gold/**` (PRD §43.5, §45.1 item 6; breakdown-plan §9 R9)
- [ ] `[machine]` `launch_ready: true` is rejected while any item is `NOT_SATISFIED`, while
      `launch_outcome` is `UNDECIDED`, or while any `LIMITED` item lacks a customer-visible surface
      (PRD §44.4)
- [ ] `[machine]` `PENDING_FOUNDER_EVENT` is accepted only for `DOD-COMM-01`, and `DOD-COMM-01` becomes
      `SATISFIED` only with a dated payment evidence entry (PRD §26 Commercial validation; sub-PRD D10)
- [ ] `[machine]` `release-evidence-index.yaml` has an entry for **every** PRD §43.5 pack element, each
      marked `present` with a resolvable hashed path or explicitly absent with a reason (PRD §43.5)
- [ ] `[machine]` `known-gaps.md` regenerates from `definition-of-done.yaml` with no diff, and contains
      exactly one row per `LIMITED`/`NOT_SATISFIED` item (PRD §41.4 "No critical defect/gap hidden")
- [ ] `[machine]` `launch-limitations.md` contains the source-category coverage statement derived from
      `GOLD-16` and no category is described as covered unless the registry reports it `ACTIVE`
      (PRD §44.4 "It is not permitted to silently call an unimplemented source category covered")
- [ ] `[machine]` **The launch statement discloses every limitation accurately** — checker rule 9,
      computed against `GOLD-16`'s coverage-reconciliation report: **completeness** (every non-`ACTIVE`
      group is disclosed with its permitted state, evidence reference, affected dates or collections,
      customer-visible warning and why full coverage is unavailable), **no invention** (nothing is
      disclosed that `GOLD-16` does not evidence, and no state differs from the one it proposes),
      **no omission** (no mandatory group is absent from both sides) and **no reduction** (no group is
      recorded as omitted, deferred, descoped or reduced for schedule reasons)
      (breakdown-plan §8 **Q10** items 1–9; PRD §7, §25.2, §44.4)
- [ ] `[machine]` `DOD-OPS-05` states the PRD §26-topic → PRD §42.7-file mapping explicitly, with a gap
      row for any of the seven named topics that has no runbook file (PRD §26, §42.7)
- [ ] `[machine]` `node --test docs/release/tools/` passes, including exit 1 on each of the twelve
      negative fixtures — in particular the **reworded-quote** fixture and the two disclosure-divergence
      fixtures (Deliverable 9)
- [ ] `[machine]` `pnpm lint`, `pnpm typecheck`, `pnpm test` green — the repository suite is unaffected
      by this docs-only ticket (PRD §20.3, §45.3)
- [ ] `[machine]` PR states the PRD §45.4 items, naming every `LIMITED` and `NOT_SATISFIED` item, the
      chosen PRD §44.4 outcome, and any unresolved **QL7** evidence gap
- [ ] `[fixture]` Replaying the referenced artifacts — `GOLD-17`'s release report, `ASSR-01`,
      `ASSR-05`, `ASSR-07`, `ASSR-08` outputs and `RLSE-11`'s benchmark — reproduces every
      `observed_value` recorded in the closure: the numbers are read from the artifacts, never typed
      (PRD §43.5; sub-PRD D8)
- [ ] `[human]` **Founder review** in the PRD §43.4 order, with every reviewed failure classified
      (`CODE` … `SOURCE_LIMITATION`) and given an owner, requirement ID and reproducible fixture,
      recorded in `founder-approval.md` (PRD §43.4, §43.5)
- [ ] `[human]` **Founder** makes the PRD §44.4 launch decision — delay production access, or launch
      with an explicitly visible limited state — and records it as `launch_outcome` with a reason.
      **Gate 2 is verification and sign-off under the confirmed limited-state launch policy
      (breakdown-plan §8 Q10; sub-PRD D12), not an opportunity to cut mandatory scope**: the permitted
      inputs are `GOLD-16`'s measured evidence and this record, and no mandatory source group may be
      dropped, reduced or pre-selected for omission at this step (PRD §7, §44.4; sub-PRD QL6)
- [ ] `[human]` **Founder** confirms `DOD-SEC-04`: the four policy drafts are published in-product and
      on the public site, and `LEGAL_REVIEW_PENDING` remains open and internally disclosed
      (PRD §11.2, §26)
- [ ] `[human]` Every PRD §41.2 `UAT-*` row **not** automated by `ASSR-06` is executed and its result
      recorded as evidence (PRD §41.2, §43.4)
- [ ] `[human]` **Gate 2 smoke test** of the delivered phase against the closure record: each
      `SATISFIED` item spot-checked on the deployed release, each `LIMITED` item visibly limited
      (CLAUDE.md Gate 2; PRD §26)
- [ ] `[human]` `DOD-COMM-01` — a real B2B organisation voluntarily pays (PRD §26 Commercial
      validation; sub-PRD QL8). **Not required to merge**; it is a Founder event and stays
      `PENDING_FOUNDER_EVENT` until it happens
- No `cargo test --workspace` / `uv run pytest` item — no Rust or Python touched (PRD §45.3)
- No `pnpm generate && pnpm generated:check` item — no generated bindings (PRD §20.1)

## Test plan

Reviewer steps, offline, no network:

1. `corepack pnpm install --frozen-lockfile`; `pnpm lint && pnpm typecheck && pnpm test` — confirm the
   repository suite is green and untouched.
2. `node docs/release/tools/check-dod.mjs` → exit 0 with a one-line summary. The construction pattern to
   copy is `LNCH-01`'s `docs/policies/tools/check-policies.mjs` (same module, same dependency-free
   discipline, same one-line-per-violation output).
3. `node docs/release/tools/check-evidence.mjs` → exit 0; every path resolves and every hash matches.
4. `node --test docs/release/tools/` → all assertions pass, including exit 1 with the expected rule id
   on each of the twelve negative fixtures.
5. **The anti-narrowing check, by hand, then revert:** edit one `prd_quote` in
   `definition-of-done.yaml` — for example soften "All five source waves have active or explicitly
   limited registry status" to "The main source waves are available" — re-run step 2 and confirm exit 1
   naming the quote-drift rule (PRD §44.4). Then `git checkout -- docs/release/definition-of-done.yaml`.
6. Negative check by hand, then revert: set an item to `SATISFIED` with an empty `evidence` list; expect
   exit 1. Then set `launch_ready: true` with one item `NOT_SATISFIED`; expect exit 1. Then remove one
   group's row from `launch-limitations.md` while it remains in `GOLD-16`'s gap list, and separately add
   a group to `launch-limitations.md` that `GOLD-16` does not carry; expect exit 1 in both cases naming
   the disclosure-verification rule (checker rule 9; breakdown-plan §8 **Q10** item 9).
7. Negative check by hand, then revert: change one referenced artifact's bytes (copy it, append a
   newline in a temp tree) and re-run `check-evidence.mjs`; expect exit 1 naming the hash rule.
8. Cross-read `definition-of-done.yaml` against `docs/PRD.md` §26 manually for all six groups and
   confirm the item count is 22 and the group assignment matches.
9. Read `launch-limitations.md` and confirm: PRD §44.4's two outcomes are quoted; one is chosen; every
   `LIMITED` item names the customer-visible surface and the answer behaviour; each limited group also
   carries its permitted state, evidence reference, affected dates or collections and why full coverage
   is unavailable (§8 **Q10** item 6); the `disclosure_verification` section names the `GOLD-16` report
   by path, hash and run id and passes all four assertions; and the coverage statement matches
   `GOLD-16`'s reconciliation output rather than a summary of it.
10. Confirm `known-gaps.md` regenerates with no diff, and that its rows correspond one-to-one to the
    `LIMITED`/`NOT_SATISFIED` items.
11. Confirm no path anywhere under `docs/release/**` references `evals/gold/**`.
12. Confirm `git status --porcelain` is clean after the run (the checkers write only with `--report`).
13. The five `[human]` rows are executed by the Founder against the deployed release candidate and
    recorded in `founder-approval.md` and the PR.

## Feedback obligation

**1. General rule.** If implementation falsifies this ticket, update **this ticket file** first
(version note + changelog line in the PR), re-publish with `publish-tickets.mjs --sync`, then change
the files. Silent divergence is an incomplete ticket (CLAUDE.md, issue #53).

**2. Foreseeable frictions, each with its exact writeback target.**

- **A PRD §26 item cannot be satisfied.** PRD §44.4 permits exactly two responses: *delay production
  access*, or *launch with an explicitly visible limited state where the PRD already permits it*.
  **Closing the item by narrowing what it means is prohibited and must be escalated.** Concretely: set
  `status: NOT_SATISFIED` (or `LIMITED` with the full limitation block), record the escalation in
  `docs/release/launch-limitations.md`, carry the row into `docs/release/known-gaps.md` and thus into
  `LNCH-04`'s acceptance template, add the unmet row to `docs/prd/24-launch/README.md` §8, and raise it
  to the Founder as the launch decision (**QL6**). Never edit `prd_quote` — the checker exists to make
  that attempt fail.
- **Someone proposes dropping, deferring or reducing a mandatory source group to make the date** →
  prohibited by breakdown-plan §8 **Q10** items 1–3 (confirmed policy) and PRD §44.4, and there is no
  representable state for it in this record. Record the group `LIMITED` with the full evidence block if
  `GOLD-16` measured a genuine official-source limitation, or `NOT_SATISFIED` with `blocking_reason` and
  `escalation_ref` if it did not; escalate to the Founder as the PRD §44.4 launch decision; hold
  `launch_ready` at `false`. Never pre-select a group for omission, and never let a mandatory group
  disappear from both `GOLD-16`'s roster reconciliation and this record.
- **`GOLD-16` proposes a limited state this record cannot evidence, or the launch statement and the
  reconciliation report disagree** → do **not** reword the statement to match and do **not** accept an
  unevidenced limited state. Record the divergence, raise a docs change against `GOLD-16`
  (`21-evaluation-600`), `publish-tickets.mjs --sync`, and leave checker rule 9 failing until the two
  agree. Accurate disclosure is this ticket's §8 **Q10** item 9 obligation, and it can never be
  satisfied by adjusting the disclosure to fit.
- **Evidence from `ASSR-02`, `ASSR-03`, `ASSR-04` or `ASSR-06` does not exist** because the plan gives
  this ticket no edge to them (**QL7**) → do **not** invent a `blocked_by` edge locally (a dangling or
  cyclic edge fails `dag-scan.mjs`) and do **not** mark `DOD-SEC-01`/`DOD-QUAL-03` satisfied from
  adjacent evidence. Record `NOT_SATISFIED` with the escalation, then add the edges in
  `docs/prd/breakdown-plan.md` §5.25 **and** their inverses in §6.2, amend this ticket file, re-run
  `dag-scan.mjs`, and `publish-tickets.mjs --sync`.
- **A referenced artifact has no stable path or hash** (a report is regenerated on every run, or lives
  only in CI) → the fix is on the producing side: raise a docs change against that module's ticket
  requiring a committed, hashed artifact, `--sync`. Do **not** copy the numbers into
  `docs/release/**` — sub-PRD **D8** exists because a copy cannot be falsified.
- **PRD §26's runbook topics do not map onto PRD §42.7's files** (the "migration" case) → record the
  mapping and the gap explicitly in `DOD-OPS-05`; raise a docs change against `RLSE-10`
  (`18-ops-release`) if a file is genuinely missing. Never assume a neighbouring runbook covers a named
  topic.
- **The closure record needs a YAML library** → adding a dependency changes the root lockfile, which
  `FND-01` serial-owns (breakdown-plan §4.1). Use a strict, documented YAML subset parsed with Node
  stdlib, or store the record as JSON with a Markdown view. If neither works, raise a
  `00-foundation` ticket and add the edge in `docs/prd/breakdown-plan.md` §5.25/§6.2 first.
- **A `LIMITED` source category is described as covered somewhere else** (marketing copy on
  `LNCH-03`'s site, the onboarding pack, an answer) → PRD §44.4's final sentence is absolute. Record the
  contradiction, raise the docs change against the owning ticket (`LNCH-03` / `LNCH-04` / the answering
  module), `--sync`, and hold `launch_ready` at `false` until it is resolved.
- **The checkers must run in CI to be trusted** → `.github/workflows/**` is `FND-02`'s. Raise a
  `00-foundation` ticket, record it under **QL9** in `docs/prd/24-launch/README.md` §6, and keep the
  standalone commands working meanwhile.

**3. Escalation.** PRD §26 is the project's Definition of Done and PRD §44.4 is the rule that keeps it
honest under schedule pressure. If the closure cannot be completed — because an item is unsatisfiable,
because required evidence does not exist, or because the only way to make the record green would be to
reinterpret an item — that overturns a founder-level commitment recorded in a frozen document:
**escalate for re-review before the launch decision is made**. Never soften a `prd_quote`, never mark an
item satisfied from adjacent evidence, and never let a known gap reach a customer through a shortened
`known-gaps.md`. Breakdown-plan §8 **Q10** adds the mirror rule for source coverage: the limited-state
policy is satisfied by **disclosing what was measured**, never by narrowing what was attempted.
