# 24-launch — sub-PRD

> Module sub-PRD, authored from `docs/prd/breakdown-plan.md` §5.25. The **ticket files under
> `tickets/` are the executable source of truth**; this README is the module-level frame around
> them. On any disagreement between a ticket and this README, the ticket wins (CLAUDE.md, issue #53).

| Field | Value |
|---|---|
| Module | `24-launch` |
| Ticket prefix | `LNCH` |
| Lane | `24-launch` |
| Tickets | 5 (`LNCH-01` … `LNCH-05`) |
| Agent | `builder` (all 5 — breakdown-plan §1.1) |
| Depends on modules | `00-foundation`, `03-app-runtime`, `18-ops-release`, `19-exports`, `20-developer-platform`, `21-evaluation-600`, `23-assurance` |
| PRD epics | E34 (launch-gate closure) |
| Owned requirement IDs | None outright. PRD §26 **Definition of Done** closure across every module is the module's charter; it contributes the launch half of `AUTH-001` (marketing/login-only public entry, `LNCH-03`) and `OPS-002` (public status page, `LNCH-03`), and *records* `EVAL-002` rather than enforcing it (`21-evaluation-600` enforces). |
| Master spec | [`docs/PRD.md`](../../PRD.md) |
| Decomposition plan | [`docs/prd/breakdown-plan.md`](../breakdown-plan.md) §2.1 (A8 — accepted, A9), §4, §5.25, §6.2, §7, §8 (decision register) |
| §8 register entries binding here | **Q8 CONFIRMED** — public marketing/status site placement and build; transcribed as **D4**, implemented and recorded by `LNCH-03` · **Q10 CONFIRMED POLICY** — limited-state launch policy; transcribed as **D12**, evidence from `GOLD-16`, disclosure verified by `LNCH-05` · **Q12 CONFIRMED** — exact toolchain versions, owned by `FND-01`; this module consumes the pins and sets none |
| Version | v0.2 — 2026-08-03 |

---

## 1. Problem

This module is **terminal**: it is the last module in the plan's topological order (breakdown-plan §3,
§6.1) and nothing depends on it. Its job is not to add a feature but to make the product *legally
presentable, publicly reachable, sellable and honestly closed out*.

Four things are missing and nothing else in the plan produces them.

1. **There is no legal positioning.** PRD §11.2 requires that "Terms of Service, Privacy Policy,
   Acceptable Use Policy and disclaimer copy MUST be drafted before paid access", that the product
   "MUST include clear disclaimers in the Web app, widget and exports", and that it "MUST NOT state
   that a customer is definitely compliant". PRD §26 makes published drafts a Definition-of-Done item.
   No module has written a policy, and PRD §8.10 additionally requires that the disclaimer, citations
   and product-source indicator "MUST NOT be removable by customer theming" — a property that has to
   be *verified*, not merely intended.
2. **There is no public surface.** PRD §5 item 14 lists "Public marketing and status pages without
   public research access" as a required MVP surface, PRD §13.3 requires a "Public status page
   independent of the origin server", and `UAT-AUTH-01` expects an unauthenticated visitor to find
   "marketing/login only". **No PRD section names a path for it**, so the decomposition fixed one —
   and that placement is now an **accepted architecture decision**: breakdown-plan §8 **Q8**
   (confirmed), with §2.1 **A8** reading as confirmed. A separately built static bundle sourced at
   `apps/web/public-site/**`, built by a self-contained Node build script into
   `apps/web/public-site/dist/`, deployed to Cloudflare Pages, independent of the authenticated
   application and of the origin server. `LNCH-03` **implements and records** that decision (**D4**);
   it does not make one.
3. **There is no way to sell or demonstrate it.** PRD §41.3 fixes a seven-step eight-minute executive
   demonstration and PRD §41.4 an eight-stage first-paid-pilot onboarding table; PRD §26 requires "At
   least one paid-pilot path is operational through manual onboarding/invoice", and the single
   commercial success signal is that "A real B2B organisation voluntarily pays to use the product".
4. **Nobody assembles the closure.** PRD §26 has 22 Definition-of-Done items spread across every
   module; PRD §43.5 requires "one immutable release report"; PRD §44.4 restricts the permitted launch
   outcomes to *delay* or *explicitly visible limited state* and says flatly: "It is not permitted to
   silently call an unimplemented source category covered." Without one mechanical assembly point,
   "done" degrades into "the last agent said it was done".

The sharper problem is **honesty under pressure**. This module runs at the end of an eight-week plan
when the incentive to declare victory is highest. Its design therefore puts the anti-narrowing rules
in *code*, not in prose: the Definition-of-Done record quotes PRD §26 verbatim and a checker compares
those quotes against `docs/PRD.md`, evidence is referenced by path plus content hash, and
`LEGAL_REVIEW_PENDING` is a register entry no ticket in this module is permitted to close.

## 2. Scope

Five artifacts, in four dependency waves:

1. **`docs/policies/**`** — the single canonical source for Terms of Service, Privacy Policy,
   Acceptable Use Policy and disclaimer copy; the machine-readable claim-language rules
   ("MUST NOT state that a customer is definitely compliant"); and the `LEGAL_REVIEW_PENDING`
   risk register (`LNCH-01`).
2. **`apps/web/src/features/legal/**`** — the in-product legal feature area (policy pages, canonical
   disclaimer register, non-dismissible disclaimer component) plus the **surface conformance kit**
   that proves the disclaimer, citations and product-source indicator survive hostile theming on the
   web app, the widget and PDF export (`LNCH-02`).
3. **`apps/web/public-site/**`** — the separately built static marketing + status bundle deployed to
   Cloudflare Pages, with no unauthenticated research path and no dependency on the origin server
   (`LNCH-03`), plus the ADR that records the confirmed breakdown-plan §8 **Q8** decision (§2.1
   **A8**). `docs/adr/` is empty today (breakdown-plan §1 header): that ADR **does not exist yet**,
   nothing has been implemented against it, and the Builder authors it at implementation time from the
   decision input `LNCH-03` carries.
4. **`docs/onboarding/**`** — the repeatable eight-minute demo script (including the mandatory refusal
   case) and the eight-stage paid-pilot onboarding pack (`LNCH-04`).
5. **`docs/release/**`** — the Definition-of-Done closure record, the release-evidence index against
   PRD §43.5, the launch-limitations statement required by PRD §44.4, and the checkers that make all
   three mechanical (`LNCH-05`).

## 3. Non-goals

Each exclusion names the owning module, per breakdown-plan §4.

| Excluded | Owner |
|---|---|
| The legal **content decisions** — what the Terms actually say, governing law, liability, pricing, when paid access opens | **Founder** (PRD §11.2, §45.5 "Product change … requires founder approval"). This module ships structure, rules and rendering; it never authors substantive legal text. |
| Widget loader, sandboxed iframe, React wrapper | `20-developer-platform` (`PLTF-05`, `PLTF-06`) |
| Export job admission, PDF/DOCX/JSON renderers, signed URLs | `19-exports` (`XPRT-01`…`XPRT-05`) |
| Web app shell, navigation slots, organisation switcher, status badges, `apps/web/{package.json,index.html,vite.config.ts}`, `apps/web/src/{app,shell,lib}/**` | `03-app-runtime` (`RUNT-05`) |
| `packages/ui` primitives, async states, evidence panel, accessibility harness | `03-app-runtime` (`RUNT-06`, breakdown-plan **A6**) |
| Answer, records, search, monitor, coverage, compare screens that *render* the disclaimer | `15-answer-product`, `17-records-collab`, `14-search-product`, `16-monitor-alerts` — they import this module's register; this module never writes their trees |
| Cloudflare Pages/tunnel/DNS configuration, external checks, alerting, the status **feed** | `18-ops-release` (`RLSE-03`, `RLSE-08`) |
| Runbook files (`docs/runbooks/**`) | `18-ops-release` (`RLSE-10`) |
| Evaluation gates, the 600-case run, `evals/reports/**`, roster reconciliation | `21-evaluation-600` (`GOLD-03`, `GOLD-16`, `GOLD-17`) |
| Cross-boundary suites `tests/{integration,tenant-isolation,security,e2e}` including the accessibility suite | `23-assurance` (`ASSR-01`…`ASSR-08`) |
| Generated-answer safety (refusal/status decisions, claim validation, "no unsupported definitive claim") | `12-evidence-safety` (`EVID-05`), `00-foundation` (`FND-07`), verified by `ASSR-04` |
| Root manifests, lockfiles, root scripts, `pnpm-workspace.yaml`, `.github/workflows/**` | `00-foundation` (`FND-01`, `FND-02`) — serial-owned, breakdown-plan §4.1 |
| Internal admin consoles (release, evaluation, cost, incidents) | `22-internal-admin` |

Standing reasons (not owner-based):

- **No agent-authored legal copy.** PRD §45.5 classifies a change to "customer behaviour, scope,
  promise, price/limit, data use or release gate" as a **Product change** requiring founder approval.
  A Terms clause invented by a coding agent is an unreviewed legal position shipped under the
  Founder's name. Tickets deliver placeholders that are *machine-detectable as unfilled*.
- **`LEGAL_REVIEW_PENDING` is never closed here.** PRD §11.2: it "MUST remain an explicit launch risk
  and be revisited when revenue permits"; PRD §26: it "remains disclosed internally".
- **No item of PRD §26 is closed by reinterpreting it.** PRD §44.4 permits exactly two outcomes when
  something cannot pass. Narrowing the meaning of an item is not one of them.

## 4. Decisions

| # | Decision | Basis |
|---|---|---|
| D1 | Policy and disclaimer **content** is Founder-owned; tickets deliver the file set, the frontmatter schema, the required-section skeleton, machine-readable claim rules, the renderers and the checkers. Unfilled sections carry an explicit `FOUNDER_INPUT_REQUIRED` marker that the checker reports and the UI labels as draft. | PRD §11.2, §27 ("Founder cannot fund legal review … Draft policies/disclaimers"), §45.5 (Product change) |
| D2 | **One canonical source, two renderers.** `docs/policies/**` (`LNCH-01`) is the only place policy text exists; the in-product feature (`LNCH-02`) and the public site (`LNCH-03`) each compile it at build time. This is why breakdown-plan §5.25 gives both `blocked_by: LNCH-01`. | PRD §26 ("drafts are published"), §11.2 (Web app, widget and exports), §20.1 (contracts centralised, generated outputs not hand-edited) |
| D3 | `LEGAL_REVIEW_PENDING` is a **standing register entry** with one row per policy document and per PRD §11.2 surface. No ticket in this module may set it to resolved; `LNCH-05` reports it as an open risk in the closure record. | PRD §11.2, §26 (Security/privacy item 4), §27 |
| D4 | **Confirmed architecture decision — breakdown-plan §8 Q8, with §2.1 A8 accepted.** The public marketing/status site is a separately built static bundle: source at `apps/web/public-site/**`, built by a **self-contained Node build script** into `apps/web/public-site/dist/`, deployed to **Cloudflare Pages**. It is **independent of the authenticated application and of the origin server**; it is **not** a pnpm workspace member; it has **no npm runtime or build dependencies by default**, unless a future ADR explicitly overturns that constraint; it imports nothing from `apps/web/src/**` or any workspace package; its status page uses a **status feed independent of the origin server**; and it carries **no public Research, Search, Ask, customer-data or account-creation surface**. `LNCH-03` implements this decision and authors the ADR that records it — that ADR does not exist yet. An implementing agent may not re-litigate any clause of it or substitute its own preference; a genuine falsification runs through `LNCH-03`'s feedback obligation — writeback to breakdown-plan §8 Q8 and this README first, code second. | breakdown-plan §8 **Q8** (confirmed), §2.1 **A8**; `FND-01` fixes `pnpm-workspace.yaml` globs to `['apps/*','packages/*','tests/*']`, and that root file is serial-owned by `00-foundation` (breakdown-plan §4.1); PRD §5.14, §13.3 (status page independent of the origin), §19.1 (Cloudflare static edge), §21.1 (supply chain), §24.1 (Pages at A$0 target), §45.5 |
| D5 | Non-removability of the disclaimer is verified as an **outcome**, by a conformance kit inside `apps/web/src/features/legal/conformance/**` that drives already-built surfaces with hostile configuration. Reads are unrestricted; writes are not — so the kit never edits `apps/widget/**` or `apps/worker/src/handlers/export/**`. | PRD §8.10, §11.2; breakdown-plan §4 (writes allocated, reads unrestricted), §5.25 (`LNCH-02` `blocked_by` `PLTF-05`, `XPRT-02`) |
| D6 | The legal feature attaches to the existing **`HELP`** navigation slot (PRD §31.1 item 11, "Help/status/user menu") and adds a `/legal/*` route group. No twelfth nav slot is invented and PRD §31.2's route table is not edited. | PRD §31.1, §31.2, §45.5; `RUNT-05`'s stated interim rule ("the surface attaches under `HELP` or `SETTINGS` and the deviation is stated in the PR's known-gaps line") — see open question **QL2** |
| D7 | The Definition-of-Done record is a **machine-checked evidence index**, not a narrative. Every PRD §26 item carries a verbatim `prd_quote`, a status of `SATISFIED / LIMITED / NOT_SATISFIED / PENDING_FOUNDER_EVENT`, and either an evidence reference or a fully-specified visible limitation. A checker re-extracts §26 from `docs/PRD.md` and fails if any quote drifts. | PRD §26, §43.5, §44.4; breakdown-plan §5.25 (`LNCH-05` goal: "Every §26 item evidenced or explicitly declared limited") |
| D8 | Evidence is **referenced** (path + content hash + run id + producing ticket), never copied into `docs/release/**`. The evaluation pack itself stays `evals/reports/**` (`GOLD-03`, `GOLD-17`). | PRD §43.5 ("one immutable release report"), §18.4 (immutability discipline); breakdown-plan §4.2 (one owner per artifact) |
| D9 | The demo script is written **against the release candidate** and the isolated sandbox organisation, using synthetic scenarios committed under `docs/onboarding/**`. This module creates no seed code and touches no blind gold. | PRD §41.3, §20.2 ("One strictly isolated sandbox organisation in production"), `DEV-003`, §45.1 item 6; breakdown-plan §9 R9 |
| D10 | Paid-access timing, pricing, contract terms and the launch decision under PRD §44.4 are **Founder decisions**. No ticket gates on them and no ticket may record them as satisfied; `DOD-COMM-01` may only become `SATISFIED` with a dated payment reference the Founder supplies. | PRD §11.2, §24.3 ("The first customer contract MAY adjust these manually"), §26 (Commercial validation), §44.4 |
| D11 | Every checker in this module is a **dependency-free Node script** runnable offline (`node docs/policies/tools/check-policies.mjs`, `node docs/onboarding/tools/check-onboarding.mjs`, `node docs/release/tools/check-dod.mjs`). They run on the toolchain `FND-01` commits — Node.js `24.18.0` (breakdown-plan §8 **Q12**, confirmed) — and declare no npm dependency of their own. Wiring them into root scripts or CI would require editing `00-foundation`-owned files, which this module may not do (**QL9**). | breakdown-plan §4, §4.1, §8 **Q12**; PRD §45.3, §20.3 |
| D12 | **Confirmed limited-state launch policy — breakdown-plan §8 Q10.** No mandatory source group is pre-selected for omission or reduced implementation; every Commonwealth, state and territory mandatory source group in the approved MVP scope must be attempted in full; arbitrary scope reduction to make a release date easier is not permitted. A source group may launch in a customer-visible limited state **only** where measured evidence shows a genuine limitation prevents `ACTIVE` — official capability limits, the official body not publishing the material, licensing restriction, historical material unavailable, freshness limitation, or another real official-source constraint — using one of the states the PRD already defines (`METADATA_AND_LINK_ACTIVE`, `FRESHNESS_LIMITED`, `LICENSING_RESTRICTED`, `SOURCE_UNAVAILABLE`), and recording the evidence, the affected dates or collections, the customer-visible warning, and why full coverage is unavailable. Silent omission is prohibited, and no unofficial source or commercial headnote may substitute for unavailable official material. `GOLD-16` produces the measured evidence and the proposed registry state; **`LNCH-05` verifies that the final launch statement discloses those limitations accurately**; Gate 2 is the verification and sign-off step under this policy, not an opportunity to cut mandatory scope. The specific list of limited groups, if any, remains a Gate 2 output derived from evidence (**QL6**). | breakdown-plan §8 **Q10** (confirmed policy); PRD §7, §25.2, §26, §44.4 |

## 5. Rejected alternatives

| Rejected | Why |
|---|---|
| **Agents drafting the actual Terms/Privacy/AUP text** | PRD §45.5: a promise/data-use/price statement is a Product change requiring founder approval. An invented indemnity clause is an unreviewed legal position; PRD §27's mitigation is "Draft policies/disclaimers … retain `LEGAL_REVIEW_PENDING`", not "have the build agent write law". |
| **Treating `LEGAL_REVIEW_PENDING` as a risk this module closes** | PRD §11.2 says it "MUST remain an explicit launch risk". A module that closes it has falsified the PRD, not completed it. |
| **Publishing the marketing/status site as a route inside the authenticated SPA** | PRD §13.3 requires the status page to be "independent of the origin server" — an SPA route dies with the origin. PRD §5 item 14 requires "without public research access"; shipping the product bundle publicly puts the entire research client one bundle-inspection away. |
| **Making `apps/web/public-site` a pnpm workspace member** | Settled against by breakdown-plan §8 **Q8**: the bundle is **not** a pnpm workspace member. The supporting reasons stand — `pnpm-workspace.yaml` is serial-owned by `FND-01` (breakdown-plan §4.1) and its globs (`apps/*`, `packages/*`, `tests/*`) do not match a nested directory, so membership would mean a root-file edit plus a new DAG edge for what is four static pages. `FND-01`'s own feedback obligation already names this case. |
| **Putting the disclaimer component in `packages/ui`** | `packages/ui` is `03-app-runtime`'s (`RUNT-06`) and this module has no edge to it (breakdown-plan §5.25). More importantly the disclaimer is *content* governed by `docs/policies/**`, not a component-library primitive; A6 covers evidence/async components, not legal copy. |
| **Editing `apps/widget/**` and `apps/worker/src/handlers/export/**` so they render the disclaimer** | Both are other modules' write-owns (breakdown-plan §4). `LNCH-02` verifies the outcome and escalates a failure as a docs change against the owning ticket; it never reaches into another lane's tree. |
| **Copying evaluation, security and benchmark results into `docs/release/**`** | Duplicates `evals/reports/**` (`GOLD-03`) and drifts the moment either side is regenerated. D8's path+hash reference is falsifiable; a copy is not. |
| **A single "launch" ticket** | breakdown-plan §7 requires no module to be fully serial (this module: 5 tickets, 4 waves, 2 peak lanes) and it would bundle Founder-owned content decisions, a static build, a demo script and the closure audit into one unreviewable diff. |
| **Adding a twelfth navigation slot or editing PRD §31.2's route table** | PRD §45.5 Product change (founder approval + PRD update); `RUNT-05` explicitly forbids it and prescribes the `HELP`-slot interim (D6, QL2). |
| **A status page that calls `GET /v1/system-status`** | PRD §42.1 makes that endpoint public and low-detail, but PRD §13.3 requires independence from the origin: a page whose only data source is the origin shows nothing precisely when it matters. The feed comes from `RLSE-08`'s external checks (QL4). |

## 6. Open questions

None blocks wave B or Gate 1. Each has a named owner.

**No breakdown-plan §8 register entry is open for this module.** §8 **Q8** (public marketing/status
site placement and build) is **confirmed** and transcribed as **D4**; §8 **Q10** (the limited-state
launch policy) is **confirmed policy** and transcribed as **D12**; §8 **Q12** (exact toolchain
versions) is **confirmed** and owned by `FND-01`, which this module consumes and never decides. The
rows below are this module's own questions, plus — in **QL6** — the measured Gate 2 *output* that
Q10's confirmed policy deliberately leaves to evidence.

| # | Question | Owner | Resolved by | Affects | Basis |
|---|---|---|---|---|---|
| QL1 | The substantive content of Terms of Service, Privacy Policy, AUP and the disclaimer copy — including governing law, liability, subprocessor list and data-region wording | **Founder** | `LNCH-01` `[human]` item; content lands as a docs change under `docs/policies/**` | Paid access (PRD §11.2), not the build | PRD §11.2, §27, §45.5 |
| QL2 | Does PRD §31.2's route table need amending to list `/legal/*`, and which navigation slot owns the legal surface? | **Founder** (product change; PRD §31.2 is in the frozen `docs/PRD.md`) | Founder + a PRD update; interim per D6 | `LNCH-02` only — it ships under `HELP` and states the deviation in the PR's known-gaps line | PRD §31.1, §31.2, §45.5; `RUNT-05` feedback obligation |
| QL3 | When paid access opens, and when policies move from `DRAFT_*` to `PUBLISHED` | **Founder** | Founder decision recorded in `docs/policies/CHANGELOG.md` and `docs/release/definition-of-done.yaml` (`DOD-SEC-04`) | `LNCH-01`, `LNCH-04`, `LNCH-05` record it; none gates on it | PRD §11.2 ("before paid access"), §24.3 |
| QL4 | The public status feed's URL, schema, freshness semantics and incident history shape | `18-ops-release` (`RLSE-08`) | `RLSE-08`; `LNCH-03` codes against a committed fixture of that shape and renders `UNKNOWN` when absent | `LNCH-03` status page only | PRD §13.3, §42.1, §42.2 |
| QL5 | Which Cloudflare Pages **project** is bound to `apps/web/public-site/**`, and with what project-level configuration | `18-ops-release` (`RLSE-03`) with `LNCH-03` as producer | `RLSE-03` config pointing at the build command and output directory §8 **Q8** fixes and `LNCH-03`'s ADR records | Deployment binding only — Cloudflare Pages as the target, the self-contained Node build script and `apps/web/public-site/dist/` are settled by Q8 (**D4**); the bundle builds and is verifiable offline regardless | PRD §19.1, §24.1; breakdown-plan §8 **Q8**, §4 (`infra/cloudflare/**` is `18`'s) |
| QL6 (plan §8 **Q10**) | Which source groups, if any, end up in an explicitly limited state — a **Gate 2 output derived from measured evidence**, not a policy question: the governing limited-state launch policy is confirmed (**D12**) | **Founder** verifies and signs off at Gate 2, under D12 rather than by preference | `GOLD-16` produces the measured evidence and the proposed registry state → `LNCH-05` verifies that the launch statement discloses every limitation accurately | The launch-limitations statement; the public-site coverage language makes no category-level claim in any case (`LNCH-03` Deliverable 4) | PRD §7, §25.2, §26, §44.4; breakdown-plan §8 **Q10** (confirmed policy) |
| QL7 | PRD §26's Security/privacy and Quality items need evidence from `ASSR-02` (security), `ASSR-03` (PII), `ASSR-04` (citations/refusal) and `ASSR-06` (UAT automation), but breakdown-plan §5.25 gives `LNCH-05` edges only to `ASSR-01`, `ASSR-05`, `ASSR-07`, `ASSR-08` | this decomposition — `docs/prd/breakdown-plan.md` §5.25/§6.2 | `LNCH-05` records the item `NOT_SATISFIED` and escalates; the fix is adding the edges to the plan, never narrowing the item | `LNCH-05` closure completeness | breakdown-plan §5.25, §6.2; PRD §26, §44.4 |
| QL8 | Commercial validation — "A real B2B organisation voluntarily pays to use the product" | **Founder** | No ticket can produce it. `DOD-COMM-01` stays `PENDING_FOUNDER_EVENT` until a dated payment reference exists | The closure record's `launch_ready` header | PRD §26 (Commercial validation), §41.4 |
| QL9 | Whether this module's three checkers and the public-site build get wired into root scripts (`FND-01`) and CI (`FND-02`) | `00-foundation` | A `00-foundation` ticket raised by whichever `LNCH-*` ticket needs it | Nothing — every checker runs standalone offline (D11) | PRD §20.3, §45.3; breakdown-plan §4.1 |

## 7. Work breakdown

`lane` = `24-launch` and `agent` = `builder` for all five (breakdown-plan §1.1).

| Ticket | Size | Lane | File-scope (write-owns) | Depends on (`blocked_by`) |
|---|---|---|---|---|
| [`LNCH-01`](tickets/LNCH-01-terms-privacy-aup-disclaimer-drafts-and-legal-review-pending-register.md) — Terms, Privacy, AUP, disclaimer drafts and `LEGAL_REVIEW_PENDING` register | M | `24-launch` | `docs/policies/**` | `FND-01` |
| [`LNCH-02`](tickets/LNCH-02-in-product-legal-and-disclaimer-surfaces-web-widget-exports.md) — In-product legal and disclaimer surfaces (web, widget, exports) | M | `24-launch` | `apps/web/src/features/legal/**` | `LNCH-01`, `RUNT-05`, `PLTF-05`, `XPRT-02` |
| [`LNCH-03`](tickets/LNCH-03-public-marketing-and-status-pages-without-public-research-access.md) — Public marketing and status pages without public research access | M | `24-launch` | `apps/web/public-site/**`, `docs/adr/NNNN-public-site-static-bundle.md` | `LNCH-01`, `RLSE-08` |
| [`LNCH-04`](tickets/LNCH-04-paid-pilot-onboarding-pack-and-eight-minute-demo-script.md) — Paid-pilot onboarding pack and eight-minute demo script | M | `24-launch` | `docs/onboarding/**` | `GOLD-17`, `RLSE-10`, `LNCH-02` |
| [`LNCH-05`](tickets/LNCH-05-definition-of-done-closure-and-release-evidence-assembly.md) — Definition-of-Done closure and release evidence assembly | M | `24-launch` | `docs/release/**` | `GOLD-17`, `ASSR-01`, `ASSR-05`, `ASSR-07`, `ASSR-08`, `RLSE-11`, `LNCH-04` |

**Lane profile** (breakdown-plan §7: 5 tickets, min 4 waves, 2 max useful lanes, not fully serial):

- Wave 1 — `LNCH-01`.
- Wave 2 — `LNCH-02`, `LNCH-03` (two concurrent lanes; `apps/web/src/features/legal/**` and
  `apps/web/public-site/**` are disjoint trees).
- Wave 3 — `LNCH-04`.
- Wave 4 — `LNCH-05`.

All five file-scopes are pairwise disjoint. The only intra-module contention risk is `docs/adr/`,
which is shared-additive with per-file ownership (breakdown-plan **A9**); only `LNCH-03` claims a file
there, and the slug `public-site-static-bundle` is reserved to it.

**`blocks` (inverse of `blocked_by`, breakdown-plan §6.2):** `LNCH-01` → `LNCH-02`, `LNCH-03`;
`LNCH-02` → `LNCH-04`; `LNCH-04` → `LNCH-05`; `LNCH-03` and `LNCH-05` block nothing — this module is
terminal.

## 8. Acceptance — what makes the module done

The module is done when all five tickets are `done` and the following hold. Each row names the PRD §26
Definition-of-Done item it closes; PRD §26 items owned by other modules are *evidenced* here, not
re-implemented.

1. **PRD §26 Security/privacy item 4 — "Terms, Privacy, AUP and disclaimer drafts are published;
   `LEGAL_REVIEW_PENDING` remains disclosed internally."** All four documents exist under
   `docs/policies/**` with schema-valid frontmatter, are rendered in-product (`LNCH-02`) and on the
   public site (`LNCH-03`), and `docs/policies/legal-review-register.md` carries an open row per
   document and per PRD §11.2 surface. No checker in this module can mark that register resolved.
2. **PRD §11.2 in-product positioning.** The claim-language checker reports zero prohibited claims
   across every surface this module renders, and no surface states that a customer is definitely
   compliant or that the product provides legal representation (`LNCH-01` rules, `LNCH-02` and
   `LNCH-03` enforcement).
3. **PRD §8.10 non-removability.** The conformance kit proves that the disclaimer, citations and
   product-source indicator survive every documented theming option plus injected hostile CSS on the
   widget, are present in PDF export, and are present on every web surface this module renders
   (`LNCH-02`). Surfaces owned elsewhere are scanned and reported, and any gap appears in the closure
   record rather than being silently absorbed.
4. **PRD §26 Product item 1 (public half) and `AUTH-001` / `UAT-AUTH-01`.** An unauthenticated visitor
   reaches marketing, status, support and policies and finds **no** account-creation path and **no**
   research surface (`LNCH-03`).
5. **PRD §13.3 / `OPS-002` public status.** The status page is a static artifact that renders without
   the origin server, never claims "operational" without a fresh feed, and links support expectations
   (two business days; critical incidents best effort same business day; no phone or 24/7 support; no
   contractual SLA) (`LNCH-03`).
6. **PRD §13.1 accessibility on this module's surfaces.** The in-product legal pages pass an automated
   WCAG 2.2 AA audit at 360/768/1280 px; the public site passes the dependency-free structural
   accessibility assertions plus a founder review at the same widths (`LNCH-02`, `LNCH-03`).
7. **PRD §26 Product item 2 — "At least one paid-pilot path is operational through manual
   onboarding/invoice."** The eight PRD §41.4 stages each have a written founder action, customer
   deliverable and exit condition, with every referenced policy, runbook and limit resolving to a real
   file (`LNCH-04`).
8. **PRD §41.3 demonstration.** The eight-minute script exists with all seven beats, named synthetic
   scenarios, a pre-flight checklist and **one legitimate refusal/insufficient-evidence case**, and has
   been dry-run against the release candidate within time (`LNCH-04`).
9. **PRD §26 in full + PRD §43.5.** `docs/release/definition-of-done.yaml` carries all 22 PRD §26 items
   with verbatim quotes that match `docs/PRD.md`, each `SATISFIED` with a resolvable, hash-matched
   evidence reference or `LIMITED` with a fully-specified customer-visible limitation, or explicitly
   `NOT_SATISFIED` / `PENDING_FOUNDER_EVENT`; and `docs/release/release-evidence-index.yaml` maps every
   PRD §43.5 pack element to its producing artifact (`LNCH-05`).
10. **PRD §44.4 schedule truth, under the confirmed limited-state launch policy (D12).**
    `docs/release/launch-limitations.md` names the chosen permitted outcome — delay production access,
    or launch with explicitly visible limited state — and no source category is described as covered
    anywhere in this module's artifacts unless `GOLD-16`'s registry reconciliation says `ACTIVE`
    (`LNCH-05`, cross-checked against `LNCH-03`'s marketing copy). **`LNCH-05` verifies that the final
    launch statement discloses every limitation accurately**: each non-`ACTIVE` group in `GOLD-16`'s
    gap list appears with its permitted state, the measured evidence, the affected dates or
    collections, the customer-visible warning and why full coverage is unavailable; nothing is
    disclosed as limited that `GOLD-16` does not evidence; and no mandatory group is absent from both
    sides (D12; PRD §25.2, §44.4).
11. **PRD §20.3 / §45.3 gates** pass on every ticket: `pnpm lint`, `pnpm typecheck`, `pnpm test`,
    and `pnpm generate && pnpm generated:check` where the ticket touches generated output.
12. **PRD §45.4** PR contract items are stated on every PR in the module, including the known-gaps line
    that carries QL2 and any unresolved QL7 evidence gap.

Contributed-to but **not owned** here: `EVAL-002` (enforced by `GOLD-03`/`GOLD-17`), `OPS-001`/`OPS-003`
(`18-ops-release`, `12-evidence-safety`), `EXP-001` (`19-exports`), `DEV-002` (`20-developer-platform`),
`SEC-*`/`PII-*` (`23-assurance`).

## 9. Changelog

- **v0.2 — 2026-08-03** — aligned with the breakdown-plan §8 decision register. **Q8 CONFIRMED**: the
  public marketing/status site is an accepted architecture decision, not an invented placement —
  **D4** rewritten with the full Q8 shape (source `apps/web/public-site/**`, self-contained Node build
  script, output `apps/web/public-site/dist/`, Cloudflare Pages, independent of the authenticated
  application and of the origin server, not a pnpm workspace member, no npm runtime or build
  dependencies by default unless a future ADR explicitly overturns that constraint, an
  origin-independent status feed, and no public Research/Search/Ask/customer-data/account-creation
  surface); §1 item 2, §2 item 3, the workspace-member rejected alternative and **QL5** restated
  accordingly; `LNCH-03` now *implements and records* the decision and carries the ADR **decision
  input** for `docs/adr/NNNN-public-site-static-bundle.md`, which **does not exist yet** and is
  authored by the Builder at implementation time. **Q10 CONFIRMED POLICY**: the limited-state launch
  policy is transcribed as **D12**, **QL6** is restated as the measured Gate 2 *output* rather than a
  policy question, and acceptance item 10 makes accurate disclosure of every limitation an explicit
  `LNCH-05` obligation. **Q12 CONFIRMED**: Node.js `24.18.0`, pnpm `11.4.0`, Rust `1.97.1`, Python
  `3.14.6`, owned by `FND-01` — **D11**, `LNCH-01` and `LNCH-03` now consume the pins instead of
  awaiting them. No change to product scope, the source roster, the ticket set, dependency order, PRD
  traceability, the evidence obligations, the quality gates, PRD §26's Definition-of-Done items or the
  A$50 ceiling. `LEGAL_REVIEW_PENDING` remains an explicit, unresolved launch risk (**D3**).
- **v0.1 — 2026-08-03** — initial decomposition from `docs/prd/breakdown-plan.md` §5.25. Five tickets,
  four waves, two peak lanes. Records decisions D1–D11, rejected alternatives, and open questions
  QL1–QL9 (QL6 is plan §8 Q10; QL7 is a plan-completeness question raised by this module). Written
  before §8 became a decision register: Q8/A8 and Q10 are restated as confirmed by v0.2 above.
