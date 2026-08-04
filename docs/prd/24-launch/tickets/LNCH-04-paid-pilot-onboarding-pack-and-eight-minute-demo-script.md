---
id: LNCH-04
title: "Paid-pilot onboarding pack and eight-minute demo script"
module: 24-launch
lane: 24-launch
size: M
agent: builder
status: draft
date: 2026-08-03
blocked_by: [GOLD-17, RLSE-10, LNCH-02]
blocks: [LNCH-05]
---

# LNCH-04 — Paid-pilot onboarding pack and eight-minute demo script

Implements PRD §41.3 (eight-minute executive demonstration), PRD §41.4 (first paid-pilot onboarding),
PRD §24.3 (default paid pilot limits) and PRD §26 Product item 2 — "At least one paid-pilot path is
operational through manual onboarding/invoice" — plus the Commercial-validation item. No §30.2
requirement ID covers onboarding; the PRD §26 Definition-of-Done items are the register entry and
`LNCH-05` records their closure. **No ADR — the decision is already made in PRD §41.3 and §41.4; this
is build ticket 4 of 5 against it.**
Parent sub-PRD: [24-launch README](../README.md). Master spec: [PRD](../../../PRD.md).
Depends on: `GOLD-17` — release-candidate full-600 run, blind review, gate closure
([`21-evaluation-600`](../../21-evaluation-600/README.md)), so the demo is scripted against the actual
release candidate; `RLSE-10` — the ten runbook files
([`18-ops-release`](../../18-ops-release/README.md)), which the onboarding pack links rather than
duplicates;
[`LNCH-02`](LNCH-02-in-product-legal-and-disclaimer-surfaces-web-widget-exports.md) — the in-product
legal surfaces the contract/invoice stage shows the customer.
**Why `builder`:** a bounded change inside one module's declared file-scope (`docs/onboarding/**`)
against two tables PRD §41.3 and §41.4 already enumerate step by step — not a new subsystem decision.
Commercial terms and pricing are excluded and routed to the Founder (Non-goals).

## Background + basis

**PRD §41.3 fixes the demonstration, beat by beat:**

> The first customer/boss demonstration follows a repeatable script:
> 1. **One minute — coverage:** open Source Coverage Registry; show all jurisdictions, active/limited
>    groups, date ranges and freshness.
> 2. **One minute — search:** find an exact provision and switch its legal date to show version history
>    without AI.
> 3. **Two minutes — answer:** run a prepared anonymous Quick scenario; show PII boundary, progress,
>    status, claim-level citations and an unresolved fact.
> 4. **One minute — evidence:** open exact cited text and official source; show effect date, status and
>    authority role.
> 5. **One minute — workflow:** save to a Research Record, assign a reviewer and show immutable
>    versions/comments.
> 6. **One minute — change:** open a prepared source-change alert and affected record; rerun under
>    current law without altering the original.
> 7. **One minute — platform:** show API request, widget sandbox, usage limit and security/retention
>    settings.
>
> The demo must include one legitimate refusal/insufficient-evidence case. A demo that shows only
> fluent positive answers misrepresents the product's safety value.

That last paragraph is the ticket's centre of gravity: the refusal case is **mandatory**, not optional
colour.

**PRD §41.4 fixes the onboarding as an eight-stage table** with, for each stage, a founder action, a
customer deliverable/decision and an exit condition: Qualify · Contract/invoice · Workspace · Identity ·
Integration · Acceptance · Go live · Review. Two rows are load-bearing for this module:

> | Contract/invoice | Provide manual pilot terms, privacy/AUP/disclaimer, limits, support and no-SLA
> position | Voluntary payment/invoice acceptance | Commercial success criterion achieved on payment |
> | Acceptance | Run customer-selected anonymous scenarios and source-coverage review | Written
> known-gap acceptance and issue list | No critical defect/gap hidden |

**PRD §26 makes both a Definition-of-Done item**: Product — "At least one paid-pilot path is
operational through manual onboarding/invoice"; Commercial validation — "A real B2B organisation
voluntarily pays to use the product. This is the primary MVP commercial success signal."

**PRD §24.3 fixes the default paid pilot** (product facts this ticket transcribes, not decides):
25 users; five service accounts; 5,000 Search/month; 250 Quick/month; 25 Deep/month; 25 advanced
Compare/Coverage tasks/month; 100 watchlists; 10,000 API calls/month; "all agreed
Web/API/SDK/widget/export/SSO/alert surfaces". "The first customer contract MAY adjust these manually.
Public self-service pricing is deferred." PRD §24.4 adds the funding rule: "Customer variable cost MUST
be prepaid or BYOK; the system MUST NOT create unsecured founder liability."

**Why this ticket is `blocked_by GOLD-17`.** breakdown-plan §5.22: `GOLD-17` is the
"Release-candidate full-600 run, blind review, gate closure" whose goal is "The §14.2 thresholds pass on
the actual candidate". A demo scripted against a build that has not passed its gates is a rehearsal for
a misrepresentation; the scenarios named here must be ones the release candidate actually answers as
described — including the refusal case.

**Why `blocked_by RLSE-10`.** PRD §42.7 lists ten runbook files with a "Required before" column that
includes "Paid access" (`server-rebuild.md`) and "First customer onboarding"
(`tenant-closure-deletion.md`). The onboarding pack **links** those files; it never restates their
content (single owner, breakdown-plan §4).

**Why `blocked_by LNCH-02`.** PRD §41.4's Contract/invoice stage requires showing "privacy/AUP/
disclaimer" — the in-product legal surfaces must exist to be shown, and the pack points at them rather
than pasting copies of policy text (sub-PRD **D2**).

**Accepted caveats carried forward, documented not enforced here:**

- **Commercial terms, price and paid-access timing are Founder decisions** — sub-PRD **D10**, **QL3**,
  **QL8**. This ticket writes the *process*, not the deal.
- **The known-gap list is produced later.** PRD §41.4's Acceptance stage needs "Written known-gap
  acceptance and issue list", but the authoritative gap list is `LNCH-05`'s closure record — and
  `LNCH-05` is `blocked_by` this ticket (breakdown-plan §6.2: `LNCH-04 --> LNCH-05`). This ticket
  therefore ships the **template plus the rule that the list is generated from
  `docs/release/definition-of-done.yaml`**, and `LNCH-05` fills it. That ordering is deliberate, not an
  oversight.
- **Demo data is synthetic and lives in the sandbox** — PRD §20.2 ("One strictly isolated sandbox
  organisation in production"), `DEV-003` ("synthetic by default"), PRD §45.1 item 6 ("Never expose
  blind evaluation gold, production credentials or customer content to coding agents"), breakdown-plan
  §9 R9.

## Goal

Produce `docs/onboarding/**` as the repeatable sales and onboarding pack: an eight-minute demo script
with all seven PRD §41.3 beats, exact routes, named synthetic scenarios, a pre-flight checklist and one
mandatory refusal/insufficient-evidence case; the eight-stage PRD §41.4 onboarding runbook with every
founder action, customer deliverable and exit condition; the PRD §24.3 limits sheet; and the templates
for known-gap acceptance and the weekly review — all cross-linked to real files (policies, runbooks,
status page) and verified by a dependency-free checker. Completion is mechanically checkable:
`node docs/onboarding/tools/check-onboarding.mjs` exits 0, every referenced path resolves, every §41.3
beat and §41.4 stage is present with its required fields, the refusal case is present, and the
prohibited-claims scan is clean.

## Non-goals

- **No commercial terms, price, discount or contract clause.** The **Founder** owns them (PRD §45.5
  Product change; PRD §24.3 "The first customer contract MAY adjust these manually"; sub-PRD D10, QL1,
  QL3). Anything of that kind is a `FOUNDER_INPUT_REQUIRED` marker, as in `LNCH-01`.
- **No policy text.** `docs/policies/**` is `LNCH-01`; the pack links it (sub-PRD D2).
- **No runbook content.** `docs/runbooks/**` is `18-ops-release` (`RLSE-10`); the pack links it.
- **No seed data, migration, fixture loader or product code.** The demo uses the sandbox organisation
  and existing synthetic fixtures; creating them is the owning modules' work (`PLTF-04` sandbox,
  `CRPS-08` fixture corpus release, the product modules' own fixtures).
- **No evaluation results.** The 600-case metrics, gate outcomes and the release evidence pack are
  `21-evaluation-600` (`GOLD-03`, `GOLD-17`); the pack cites them by reference.
- **No Definition-of-Done closure.** That is `LNCH-05` (`docs/release/**`), which this ticket blocks.
- **No customer content.** Every scenario is synthetic. PRD §10.2: "Customer queries and records MUST
  NOT be used for training, evaluation or manual product analysis by default."
- **No blind evaluation gold.** `evals/gold/**` blind material stays out of ordinary agent context
  (PRD §14.3, §43.1, §45.1 item 6; breakdown-plan §9 R9). Demo scenarios must not be drawn from it.

## File-scope (write-owns)

- `docs/onboarding/**` — the pack, its templates, its synthetic scenarios and its checker.

Does not touch:

- `docs/policies/**` — `LNCH-01`. `apps/web/src/features/legal/**` — `LNCH-02`.
  `apps/web/public-site/**` — `LNCH-03`. `docs/release/**` — `LNCH-05`.
- `docs/runbooks/**` — `18-ops-release` (`RLSE-10`). `docs/api/**` — `20-developer-platform`.
- `evals/**`, `pipelines/evaluation/**` — `21-evaluation-600`. **No path under `evals/gold/**` is read
  or referenced** (breakdown-plan §9 R9).
- `apps/**`, `packages/**`, `services/**`, `pipelines/**`, `infra/**`, `tests/**` — other modules; this
  ticket writes no product code.
- `docs/PRD.md` and the other frozen paths (breakdown-plan §4). `docs/adr/**` — no ADR is created here.
- Root manifests, lockfiles, `.github/workflows/**` — `00-foundation`.

**Serial-safety analysis.** First decomposition (breakdown-plan §1: phase 1, nothing merged), so no
ticket has previously written `docs/onboarding/**` and nothing contends for it. `docs/onboarding/**`
appears exactly once in breakdown-plan §4, under `24-launch`, and it is disjoint from every sibling
scope in this module (`docs/policies/**`, `apps/web/src/features/legal/**`, `apps/web/public-site/**`,
`docs/release/**`). This ticket is alone in wave 3 (breakdown-plan §7: 4 waves, 2 peak lanes), so
nothing runs concurrently with it inside the lane. It claims no `docs/adr/` file, so breakdown-plan
**A9** does not apply.

## Deliverables

1. **`docs/onboarding/README.md`** — the index: what the pack is, who executes each part (Founder),
   what is product fact versus Founder decision, the standing rule that no file here restates policy or
   runbook content (it links), and the two checker commands.
2. **`docs/onboarding/demo/eight-minute-demo.md`** — the PRD §41.3 script. For each of the seven beats:
   the target duration; the exact route from PRD §31.2 (`/search`, `/ask`, `/answers/:snapshotId`,
   `/records/:recordId`, `/monitor/alerts/:alertId`, `/developer/api`, `/developer/widget`, `/usage`,
   `/settings/security`); the named synthetic scenario to use; the exact thing to point at (for beat 1
   "all jurisdictions, active/limited groups, date ranges and freshness"; for beat 3 "PII boundary,
   progress, status, claim-level citations and an unresolved fact"; for beat 4 "effect date, status and
   authority role"); and the failure fallback if a beat cannot be shown (say so and move on — never
   improvise a positive result). The script must state, verbatim from PRD §41.3, that "The demo must
   include one legitimate refusal/insufficient-evidence case" and place that case explicitly (a
   dedicated moment inside beat 3 or an eighth beat), with the expected on-screen status
   (`INSUFFICIENT_EVIDENCE`, PRD §36.8) and the sentence the presenter says about why a refusal is a
   feature.
3. **`docs/onboarding/demo/scenarios/**`** — the named synthetic scenarios, one file each, with: the
   exact input text, the legal date and jurisdiction, the expected observable outcome, the corpus
   release and application version they were verified against, and a `verified_on` date. Required set:
   one exact-provision search, one legal-date switch, one anonymous Quick scenario with a genuinely
   unresolved fact, one refusal/insufficient-evidence case, one prepared source-change alert with an
   affected record, and one API/widget example. All synthetic, all PII-free, none drawn from
   `evals/gold/**`.
4. **`docs/onboarding/demo/pre-flight-checklist.md`** — what must be true before the demo starts:
   application release and corpus release versions recorded; the sandbox organisation seeded and
   labelled (PRD §20.2, `DEV-003`); founder budget headroom above the PRD §42.6 90% warning so a demo
   cannot trip the circuit breaker mid-answer; no active kill switch on generation, Deep Research or a
   demo-relevant source (PRD §42.5); status page green (`LNCH-03`); each scenario re-verified against
   the current release candidate; and a stated fallback for the beat most likely to fail (generation
   unavailable → show `UAT-ANS-08` behaviour, PRD §41.2: "Search remains available; Answer reports
   explicit generation unavailability").
5. **`docs/onboarding/demo/dry-run-log.md`** — the repeatability record and its template: date,
   application/corpus versions, per-beat elapsed time, total time, which beat overran, whether the
   refusal case fired as scripted, and defects found (with issue ids). PRD §41.3 calls the script
   "repeatable"; an unrehearsed script is not.
6. **`docs/onboarding/pilot/onboarding-runbook.md`** — the eight PRD §41.4 stages as the top-level
   structure. Each stage carries the PRD's founder action, customer deliverable/decision and exit
   condition verbatim, then the *operational* detail: exact screens and routes, the artifacts to send
   (links into `docs/policies/**` and `docs/onboarding/pilot/*`), and the verification step. Required
   per-stage detail:
   - **Qualify** — B2B entity, use case, the anonymous-data rule (PRD §10.1: employee PII is blocked and
     customers "MUST NOT bypass a positive employee-PII finding"), expected volume against PRD §24.3,
     official-source fit against the coverage registry; explicit scope-fit check against PRD §3.3
     non-goals.
   - **Contract/invoice** — the four `docs/policies/**` documents (with their draft status shown
     honestly), PRD §24.3 limits, PRD §13.2/§13.3 support and no-SLA position, and the PRD §24.4 rule
     that customer variable cost is prepaid or BYOK. All price and term fields are
     `FOUNDER_INPUT_REQUIRED`.
   - **Workspace** — organisation creation, Owner invitation, plan/limits, retention (PRD §10.3, §10.4)
     and region disclosures (PRD §19.2, including that the Oceania hint is not a residency guarantee);
     exit on Owner MFA enrolment (PRD §38.2, `AUTH-004`).
   - **Identity** — email/passkey, optional SAML/OIDC, and the break-glass test that PRD §38.3 and
     `UAT-AUTH-04` require before enforcement ("Cannot enforce before successful test").
   - **Integration** — scoped expiring service account (one-time secret, `AUTH-006`), webhook with
     signature verification (`MON-004`), sandbox (`DEV-003`) and optional widget origins (`DEV-002`,
     PRD §38.4 "long-lived service credentials MUST NOT enter the browser").
   - **Acceptance** — customer-selected anonymous scenarios plus a source-coverage review, ending in
     the written known-gap acceptance (Deliverable 8) whose content comes from `LNCH-05`.
   - **Go live** — the exact feature flags and limits to enable, budget and alerting confirmed active
     (PRD §42.2, §42.6).
   - **Review** — weekly initially, using Deliverable 9.
7. **`docs/onboarding/pilot/limits-and-plan.md`** — the PRD §24.2 trial and PRD §24.3 paid-pilot numbers
   transcribed with section citations, the PRD §24.4 funding-ledger rule
   (`FOUNDER_PLATFORM_BUDGET` vs `CUSTOMER_PREPAID_OR_BYOK`; "the system MUST NOT create unsecured
   founder liability"), the default per-organisation concurrency (two Quick, one Deep, one export), and
   the PRD §13.4 statement that the tested baseline "is a tested system baseline, not a
   single-customer entitlement or unlimited-capacity promise". Every number carries its PRD reference so
   a drift is detectable.
8. **`docs/onboarding/pilot/known-gap-acceptance-template.md`** — the PRD §41.4 Acceptance artifact:
   a signable list of known gaps and open issues, one row per gap with what it is, which surface shows
   it, what the customer should not rely on, and the tracking id. The template states that its content
   **must be generated from `docs/release/definition-of-done.yaml`** (`LNCH-05`) — every `LIMITED` or
   `NOT_SATISFIED` item becomes a row — and that a gap known to the team but absent from this list
   violates the stage's exit condition, "No critical defect/gap hidden".
9. **`docs/onboarding/pilot/weekly-review-template.md`** — the PRD §41.4 Review stage: usage against
   limits, failures, source gaps, costs, open issues, and the continue/change/cancel decision. It
   records **IDs, not content**: PRD §10.2 forbids using customer queries and records for "manual
   product analysis by default", so the template's fields are record/answer/job/issue ids and counts,
   with an explicit warning against pasting customer research text.
10. **`docs/onboarding/pilot/support-and-escalation.md`** — PRD §13.3 support terms, the PRD §12.4
    incident states and severities, the customer-facing status page (`LNCH-03`), the in-app issue
    reporting path (`COR-001`, PRD §12.3), and links to the relevant `docs/runbooks/*` files
    (`RLSE-10`) for the founder side. No runbook content is duplicated.
11. **`docs/onboarding/tools/check-onboarding.mjs`** — the dependency-free checker (Node stdlib only,
    exit 0/1, one line per violation; sub-PRD D11):
    1. all seven PRD §41.3 beats present, each with a duration, a route and a named scenario, and the
       beat durations summing to eight minutes;
    2. the mandatory refusal/insufficient-evidence case present and explicitly labelled;
    3. all eight PRD §41.4 stages present, each with founder action, customer deliverable/decision and
       exit condition;
    4. every relative link in the pack resolves to a file that exists — policies, runbooks, scenarios,
       templates (link presence assertion);
    5. every PRD reference resolves to a section heading in `docs/PRD.md`;
    6. `prohibited-claims.json` (from `LNCH-01`) finds zero matches;
    7. no scenario file contains a PII pattern (reuse the deterministic patterns named in PRD §10.1:
       TFN, bank, phone, email, date of birth) and no file references any path under `evals/gold/`;
    8. every PRD §24.3/§24.2 number in `limits-and-plan.md` matches the value in `docs/PRD.md` (a
       transcription check — the pack cannot silently drift from the PRD);
    9. every `FOUNDER_INPUT_REQUIRED` marker is well-formed and counted in the report;
    10. `--report <path>` emits the machine-readable summary `LNCH-05` references.
12. **`docs/onboarding/tools/check-onboarding.test.mjs`** — `node --test` assertions with negative
    fixtures under `docs/onboarding/tools/fixtures/`: a script missing the refusal case, a stage missing
    its exit condition, a broken link, a scenario containing a synthetic TFN, and a limits number that
    disagrees with PRD §24.3. Each must exit 1 with the expected rule id.

## Acceptance checklist (classified)

- [ ] `[machine]` `node docs/onboarding/tools/check-onboarding.mjs` exits 0 on the committed tree
      (PRD §41.3, §41.4)
- [ ] `[machine]` All seven PRD §41.3 beats are present with duration, route and named scenario, and
      the durations sum to eight minutes (PRD §41.3)
- [ ] `[machine]` The mandatory refusal/insufficient-evidence case is present and explicitly labelled —
      the checker fails without it (PRD §41.3 "The demo must include one legitimate
      refusal/insufficient-evidence case")
- [ ] `[machine]` All eight PRD §41.4 stages are present, each with founder action, customer
      deliverable/decision and exit condition (PRD §41.4; PRD §26 Product item 2)
- [ ] `[machine]` Every relative link in the pack resolves — including every `docs/policies/*`
      (`LNCH-01`) and `docs/runbooks/*` (`RLSE-10`) target (link presence assertion; PRD §42.7)
- [ ] `[machine]` Every PRD §24.2/§24.3 limit in `limits-and-plan.md` matches `docs/PRD.md` exactly
      (transcription check; PRD §24.3, §13.4)
- [ ] `[machine]` No scenario contains a PII pattern and no file references `evals/gold/**`
      (PRD §10.1, §45.1 item 6; breakdown-plan §9 R9)
- [ ] `[machine]` The prohibited-claims scan reports zero matches across the pack — no onboarding
      artifact promises compliance, legal advice, an SLA, unlimited capacity or complete coverage
      (PRD §11.2, §13.2, §13.4, §44.4)
- [ ] `[machine]` The weekly-review and known-gap templates record ids and counts, not customer research
      text, and say so explicitly (PRD §10.2)
- [ ] `[machine]` `node --test docs/onboarding/tools/` passes, including exit 1 on each of the five
      negative fixtures (Deliverable 12)
- [ ] `[machine]` `pnpm lint`, `pnpm typecheck`, `pnpm test` green — the repository suite is unaffected
      by this docs-only ticket (PRD §20.3, §45.3)
- [ ] `[machine]` PR states the PRD §45.4 items, naming PRD §26 Product item 2, the outstanding
      `FOUNDER_INPUT_REQUIRED` markers, and the dependency on `LNCH-05` for the known-gap list content
- [ ] `[human]` **Founder dry run** of the full eight-minute demo against the `GOLD-17` release
      candidate, within time, with the refusal case firing as scripted; result recorded in
      `docs/onboarding/demo/dry-run-log.md` (PRD §41.3, §43.4)
- [ ] `[human]` **Founder** walks the eight PRD §41.4 stages end to end against a throw-away
      organisation — invitation, MFA enrolment, SSO test with break glass, scoped service account,
      webhook, sandbox — and confirms each exit condition is reachable (PRD §41.4; `UAT-AUTH-02`,
      `UAT-AUTH-04`)
- [ ] `[human]` **Founder** supplies the commercial terms, price and invoicing detail marked
      `FOUNDER_INPUT_REQUIRED`, and decides paid-access timing (PRD §24.3, §45.5; sub-PRD QL3, QL8) —
      **required before paid access, not required to merge**
- [ ] `[human]` Gate 2 smoke: run beats 1–4 of the demo on the deployed release and confirm nothing in
      the script describes behaviour the build does not have (CLAUDE.md Gate 2; PRD §41.3)
- No `[fixture]` criteria — this ticket ships documentation and checkers; it replays no recorded data.
      The demo run itself is irreducibly human (PRD §41.3, §43.4; breakdown-plan §1.1)
- No `cargo test --workspace` / `uv run pytest` item — no Rust or Python touched (PRD §45.3)
- No `pnpm generate && pnpm generated:check` item — no generated bindings (PRD §20.1)

## Test plan

Reviewer steps, offline, no network:

1. `corepack pnpm install --frozen-lockfile`; `pnpm lint && pnpm typecheck && pnpm test` — confirm the
   repository suite is green and untouched.
2. `node docs/onboarding/tools/check-onboarding.mjs` → exit 0 with a one-line summary. The construction
   pattern to copy is `LNCH-01`'s `docs/policies/tools/check-policies.mjs` (same module, same
   dependency-free discipline, same output shape).
3. `node --test docs/onboarding/tools/` → all assertions pass; each negative fixture in
   `docs/onboarding/tools/fixtures/` exits 1 with the expected rule id.
4. Negative check by hand, then revert: delete the refusal-case section from
   `demo/eight-minute-demo.md`, re-run step 2, confirm exit 1 naming the refusal rule (PRD §41.3), then
   `git checkout -- docs/onboarding/demo/eight-minute-demo.md`.
5. Negative check by hand, then revert: change `250 Quick/month` to `500 Quick/month` in
   `pilot/limits-and-plan.md`, re-run step 2, confirm exit 1 naming the PRD §24.3 transcription rule,
   then revert.
6. Negative check by hand, then revert: point one policy link at a non-existent file, re-run step 2,
   confirm exit 1 naming the link rule, then revert.
7. Read `demo/eight-minute-demo.md` against PRD §41.3 and confirm each beat's route exists in PRD §31.2
   and each named scenario has a file under `demo/scenarios/`.
8. Read `pilot/onboarding-runbook.md` against PRD §41.4 and confirm the three PRD columns appear
   verbatim for all eight stages before any added operational detail.
9. Confirm no file in `docs/onboarding/**` contains policy or runbook prose that duplicates
   `docs/policies/**` or `docs/runbooks/**` — links only (sub-PRD D2; breakdown-plan §4).
10. Confirm `git status --porcelain` is clean after the run (the checker writes only with `--report`).
11. The four `[human]` rows are executed by the Founder against the release candidate and recorded in
    the PR and in `demo/dry-run-log.md`.

## Feedback obligation

**1. General rule.** If implementation falsifies this ticket, update **this ticket file** first
(version note + changelog line in the PR), re-publish with `publish-tickets.mjs --sync`, then change
the files. Silent divergence is an incomplete ticket (CLAUDE.md, issue #53).

**2. Foreseeable frictions, each with its exact writeback target.**

- **A PRD §41.3 beat cannot be demonstrated on the release candidate** (for example the widget sandbox
  or the source-change alert is not available) → **do not** rewrite the beat into something the build
  can do, and do not delete it. Record it in `docs/onboarding/demo/dry-run-log.md`, raise it against the
  owning module's ticket (docs change + `publish-tickets.mjs --sync`), and carry it into
  `docs/prd/24-launch/README.md` §8 as an unmet module-acceptance row so `LNCH-05` records it as a PRD
  §26 gap. PRD §44.4 permits delay or a *visible* limited state — not a quietly shortened demo.
- **The refusal case cannot be made to fire reliably** → that is a product-behaviour finding about
  `EVID-05`/`FND-07`/`ASK-*`, not a scripting problem. Raise it against the owning ticket, record it in
  the dry-run log, and escalate: PRD §41.3 says a demo without it "misrepresents the product's safety
  value", so shipping the script without the case is not an option.
- **A `docs/runbooks/*` file the pack links does not exist** → `docs/runbooks/**` is `RLSE-10`'s
  (breakdown-plan §4). Raise a docs change against `18-ops-release`, `--sync`; never write the runbook
  here, and never remove the link to make the checker pass.
- **PRD §24.3's limits do not match what the product enforces** (`RUNT-02`/`FND-09`/`PLTF-09`) → the
  pack transcribes the **PRD**; a mismatch is a product defect or a PRD change. Record it in the PR's
  known-gaps line, raise it against the enforcing module's ticket, and if the PRD itself is wrong that
  is a Product change for the Founder (PRD §45.5) — `docs/PRD.md` is frozen (breakdown-plan §4).
- **The known-gap list is needed before `LNCH-05` exists** → it is not: the template ships here and the
  content is generated later (breakdown-plan §6.2 `LNCH-04 --> LNCH-05`). If a real pilot needs the list
  earlier, that is a scheduling escalation to the Founder, not a reason to hand-write a gap list here
  that could disagree with `docs/release/definition-of-done.yaml`.
- **A demo scenario would be more convincing with real customer or gold data** → prohibited. PRD §45.1
  item 6 and breakdown-plan §9 R9 keep blind gold and customer content out of ordinary agent context;
  PRD §10.2 forbids customer content in manual product analysis. Use synthetic data or drop the
  scenario.

**3. Escalation.** PRD §26's "At least one paid-pilot path is operational through manual
onboarding/invoice" and PRD §41.3's mandatory refusal case are Definition-of-Done commitments. If the
onboarding path cannot be walked end to end, or the demo cannot honestly include a refusal, that is a
launch-readiness finding: escalate for re-review, record it so `LNCH-05` carries it into
`docs/release/definition-of-done.yaml`, and never close the gap by shortening the script or softening
the stage exit conditions.
