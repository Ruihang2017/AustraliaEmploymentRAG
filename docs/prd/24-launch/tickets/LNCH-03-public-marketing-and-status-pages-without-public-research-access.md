---
id: LNCH-03
title: "Public marketing and status pages without public research access"
module: 24-launch
lane: 24-launch
size: M
agent: builder
status: draft
date: 2026-08-03
blocked_by: [LNCH-01, RLSE-08]
blocks: []
---

# LNCH-03 — Public marketing and status pages without public research access

Implements PRD §5 item 14 ("Public marketing and status pages without public research access"),
PRD §13.3 ("Public status page independent of the origin server") and PRD §19.1 (Cloudflare
edge/static), carrying the public half of requirement `AUTH-001` ("Access is invite-only; public signup
is absent" — `UAT-AUTH-01`: "marketing/login only") and the external half of `OPS-002` (status is
observable without content logs).
**The placement and build of this site are already decided; this ticket implements and records them.**
Breakdown-plan §8 **Q8** is a **confirmed** architecture decision and §2.1 **A8** reads as accepted, so
nothing below is a placement choice. Recording it means authoring
`docs/adr/NNNN-public-site-static-bundle.md` (status `accepted`, owner `24-launch` / `LNCH-03`, dated
at implementation time, via this ticket's PR), because PRD §45.5 classifies a durable
deployment/technology trade-off as an **Architecture decision** requiring an ADR under `docs/adr/`.
`docs/adr/` is empty today (breakdown-plan §1 header): **that ADR does not exist yet**, nothing has
been implemented against it, and the Builder writes it at implementation time from the decision input
in Deliverable 1 — it records a decision already made and may not record a different outcome. The file
is claimed per breakdown-plan **A9** (ADR ownership is per file, claimed by the creating ticket).
Parent sub-PRD: [24-launch README](../README.md). Master spec: [PRD](../../../PRD.md).
Depends on:
[`LNCH-01`](LNCH-01-terms-privacy-aup-disclaimer-drafts-and-legal-review-pending-register.md) — the
canonical policy source and claim-language rules; `RLSE-08` — alerting, external checks and status page
infrastructure ([`18-ops-release`](../../18-ops-release/README.md)), which publishes the status feed
this site renders.
**Why `builder`:** a bounded change inside one module's declared file-scope (`apps/web/public-site/**`
plus one claimed ADR file) against a surface PRD §5 and §13.3 already fix and a placement/build shape
breakdown-plan §8 **Q8** already settles — no new subsystem decision is taken here; the settled one is
written down as an ADR rather than left implicit.

## Background + basis

**The surface is required and its constraint is in its name.** PRD §5, the MVP surface list, item 14:

> 14. Public marketing and status pages without public research access.

**PRD §13.3 fixes the independence property:**

> - Email and in-app issue reporting.
> - **Public status page independent of the origin server.**
> - Target response within two business days.
> - Critical incidents: best effort same business day.
> - No phone or 24/7 support.

"Independent of the origin server" is the whole design constraint: a status page whose data or hosting
depends on the Lightsail origin shows nothing at precisely the moment it matters. PRD §19.1 puts a
"Cloudflare edge/static/tunnel" in front of a single Sydney Lightsail host, and PRD §24.1 budgets
"Cloudflare Pages/tunnel/free edge | A$0 target".

**The unauthenticated-visitor behaviour is a UAT row.** PRD §41.2:

> | `UAT-AUTH-01` | Open signup URL without invitation | No public account creation path;
> marketing/login only |

and `AUTH-001` in PRD §30.2: "Access is invite-only; public signup is absent."

**No PRD section names a path — and the placement is now settled.** Breakdown-plan §8 **Q8** is the
canonical wording and it is a **confirmed** decision (§2.1 **A8** accepted):

> - Source path `apps/web/public-site/**`; build by a self-contained Node build script; output
>   `apps/web/public-site/dist/`; deployed to Cloudflare Pages.
> - The static bundle is independent of the authenticated application and of the origin server.
> - It is not a pnpm workspace member.
> - It has no npm runtime or build dependencies by default, unless a future ADR explicitly overturns
>   that constraint.
> - The status page uses a status feed independent of the origin server.
> - It must contain no public Research, Search, Ask, customer-data or account-creation surface.

Every requirement below implements one of those six clauses; none of them is this ticket's to
re-litigate, and an implementing agent must not substitute its own preference for any of them. A
Builder that believes the code falsifies a clause uses the feedback obligation — writeback to
`docs/prd/breakdown-plan.md` §8 **Q8** and `docs/prd/24-launch/README.md` **D4** first, code second —
never a local substitution (breakdown-plan §8 standing note).

**Why it cannot be a pnpm workspace member.** `FND-01` deliverable 1 fixes the workspace globs:

> **`pnpm-workspace.yaml`** using globs, never an enumerated member list: `packages: ['apps/*',
> 'packages/*', 'tests/*']`. A later module that adds a directory must never have to edit this file.

`apps/web/public-site` is nested one level too deep to match `apps/*`, and `pnpm-workspace.yaml` is
**serial-owned by `FND-01`** (breakdown-plan §4.1). `FND-01`'s own feedback obligation anticipates this
case ("a member outside `apps/*`, `packages/*`, `tests/*`") and routes it to a `00-foundation` change.
For four static pages that trade is not worth a root-file edit and a new DAG edge. §8 **Q8** settles
it: the bundle is **not** a pnpm workspace member and has **no npm runtime or build dependencies by
default**, unless a future ADR explicitly overturns that constraint. Sub-PRD decision **D4**
transcribes it. This is the decision the ADR records, not one the ADR reaches.

**Its relationship to the pinned toolchain.** Breakdown-plan §8 **Q12** is confirmed — Node.js
`24.18.0`, pnpm `11.4.0`, Rust `1.97.1`, Python `3.14.6`, committed by `FND-01`. `build.mjs`,
`check-site.mjs` and the tests are plain Node scripts **run by that pinned Node**; this ticket pins,
upgrades or restates no version. Because §8 **Q8** keeps the bundle outside the pnpm workspace and free
of npm dependencies, it has **no manifest dependency entry, no lockfile entry and no install step** —
`pnpm-workspace.yaml`, `package.json` and `pnpm-lock.yaml` are untouched here. The pinned toolchain
reaches this ticket transitively through `LNCH-01 → FND-01`; no new `blocked_by` edge is needed, and
none may be invented locally (it would fail `dag-scan.mjs`).

**The status data comes from `RLSE-08`, not from the origin.** breakdown-plan §5.19: `RLSE-08` —
"Alerting, external checks and status page | `infra/deploy/monitoring/**` | §22, §42.1, §42.2,
`OPS-002`" — and §6.2 draws `RLSE-08 --> LNCH-03`. PRD §42.1 does make `/v1/system-status` public and
low-detail, but it is served *by the origin*, so PRD §13.3 forbids depending on it here (sub-PRD
rejected alternative). The feed's exact URL and schema are open question **QL4**, owned by
`18-ops-release`; this ticket codes against a committed fixture of that shape and degrades to `UNKNOWN`.

**Coverage language is governed by PRD §44.4:**

> It is not permitted to silently call an unimplemented source category covered.

Marketing copy is the easiest place in the product to break that rule, so this ticket forbids
category-level coverage claims outright (Deliverable 4) and `LNCH-05` re-checks the built copy against
the final coverage statement at closure.

**Accepted caveats carried forward, documented not enforced here:**

- **Deployment wiring is `18-ops-release`'s.** `infra/cloudflare/**` belongs to `RLSE-03`
  (breakdown-plan §4, §4.1). §8 **Q8** already fixes the shape — a self-contained Node build script
  emitting `apps/web/public-site/dist/`, deployed to **Cloudflare Pages** — so what remains is the
  exact command, which this ticket produces and records in the ADR and the module README; binding a
  Pages **project** to it is **QL5**.
- **No automated WCAG audit tool is available here.** The dependency-free choice (D4) means no axe.
  This ticket ships structural accessibility assertions that are computable in Node stdlib plus a
  `[human]` founder review; a machine WCAG audit over the public site, if required, belongs to
  `23-assurance` (`ASSR-07`, `tests/e2e/accessibility/**`) — see Feedback obligation.
- **`LEGAL_REVIEW_PENDING` is internal.** PRD §26 says it "remains disclosed **internally**"; it must
  not appear anywhere in the public bundle (`LNCH-01`'s checker rule 7 states the same for policy copy).

## Goal

Produce `apps/web/public-site/**` as a dependency-free static bundle — marketing, status, support and
the four published policies — built by `node apps/web/public-site/build.mjs` into a deterministic
`apps/web/public-site/dist/`, together with the ADR that records the confirmed breakdown-plan §8 **Q8**
decision. The bundle must contain **no public Research, Search, Ask, customer-data or account-creation
surface**, must render its status page from a feed **independent of the origin server** and without any
call to the origin, must never display "operational" without a fresh feed, and must carry the policy
text compiled from `docs/policies/**` with its version and draft status visible. Completion is mechanically
checkable: the build is byte-identical across two runs, the emitted HTML passes the site checker (no
forms, no origin URLs, no research routes, required links present, structural accessibility rules,
prohibited-claims scan clean), and the status page renders `UNKNOWN` for a missing feed and `STALE` for
an expired one from committed fixtures.

## Non-goals

- **No marketing *positioning* decisions.** Product claims, pricing language, customer logos and the
  value proposition wording are the **Founder's** (PRD §45.5 Product change; sub-PRD QL1). This ticket
  ships the page structure and PRD-cited factual copy, and marks everything else
  `FOUNDER_INPUT_REQUIRED` exactly as `LNCH-01` does.
- **No policy text.** `docs/policies/**` is `LNCH-01`; this site compiles it (sub-PRD D2).
- **No Cloudflare configuration, DNS, tunnel, Pages project, external checks or alert rules.**
  `infra/cloudflare/**` and `infra/deploy/monitoring/**` are `18-ops-release` (`RLSE-03`, `RLSE-08`).
- **No status *checking*.** This site renders a feed; it never probes the product. Probing is
  `RLSE-08`'s external checks and `RUNT-08`'s `/health/*` (PRD §42.1).
- **No live corpus, registry or coverage data.** The Source Coverage Registry is an authenticated
  product surface (PRD §8.5, §12.1) served by `14-search-product`/`22-internal-admin`; rendering it
  publicly would both break origin-independence and risk PRD §44.4 coverage claims.
- **No login, signup, invitation, password reset or session code.** Authentication surfaces are
  `13-identity-surface` (`IDNT-*`); this site carries a **link** to the app's `/login` and nothing more
  (`AUTH-001`, `UAT-AUTH-01`).
- **No analytics, tag manager, font CDN, or third-party script.** PRD §41.1 forbids research content in
  analytics; the simpler and checkable rule here is zero third-party runtime origins (also PRD §21.1
  supply chain, §24.1 A$0 target).
- **No in-product legal feature.** `apps/web/src/features/legal/**` is `LNCH-02` (same module, same
  wave, disjoint tree).

## File-scope (write-owns)

- `apps/web/public-site/**` — sources, templates, styles, the build script, the checker, tests,
  fixtures and the build output directory convention.
- `docs/adr/NNNN-public-site-static-bundle.md` — a **new** file claimed by this ticket under
  breakdown-plan **A9**. The file **does not exist yet** and nothing has been implemented against it;
  the Builder authors it at implementation time to record the confirmed breakdown-plan §8 **Q8**
  decision (Deliverable 1). Take the lowest unused four-digit number at authoring time; the slug
  `public-site-static-bundle` is reserved to this ticket.

Does not touch:

- `apps/web/src/**`, `apps/web/{package.json,tsconfig.json,index.html,vite.config.ts}`,
  `apps/web/test/**` — `RUNT-05` (`03-app-runtime`). The public site imports **nothing** from them
  (sub-PRD D4).
- `apps/web/src/features/legal/**` — `LNCH-02` (same module).
- `docs/policies/**` — `LNCH-01` (read-only input). `docs/onboarding/**` — `LNCH-04`.
  `docs/release/**` — `LNCH-05`.
- `infra/cloudflare/**`, `infra/deploy/**` — `18-ops-release` (`RLSE-03`, `RLSE-08`).
- `pnpm-workspace.yaml`, root manifests, lockfiles, `.github/workflows/**` — `00-foundation`
  (`FND-01`, `FND-02`), serial-owned (breakdown-plan §4.1).
- `apps/widget/**`, `apps/admin/**`, `apps/api/**`, `packages/**`, `tests/**` — other modules.
- Any other `docs/adr/` file — per-file ownership (breakdown-plan A9).

**Serial-safety analysis.** First decomposition (breakdown-plan §1: phase 1, nothing merged), so no
ticket has previously written `apps/web/public-site/**` and nothing contends for it. breakdown-plan §4
allocates that path to `24-launch` alone, and `RUNT-05` — the only other owner inside `apps/web` —
explicitly lists it in its own does-not-touch set ("`apps/web/public-site/**` — `24-launch`"). Inside
this module the sibling scopes are disjoint trees; this ticket shares wave 2 with `LNCH-02`
(`apps/web/src/features/legal/**`) only, and the two directories do not intersect, so both run as
concurrent lanes safely (breakdown-plan §7: 4 waves, 2 peak lanes). `docs/adr/` is shared-additive with
per-file ownership (**A9**) and this slug is unique in the plan — `LNCH-03` is the only `24-launch`
ticket that claims an ADR.

## Deliverables

1. **`docs/adr/NNNN-public-site-static-bundle.md` — authored by this ticket to record the confirmed §8
   Q8 decision.** `docs/adr/` is empty today (breakdown-plan §1 header): this ADR **does not exist
   yet**, nothing has been implemented against it, and the Builder writes it at implementation time,
   **before** the first page is emitted. It records a decision that is already made — it is not a
   decision-making exercise and it may not record a different outcome. Required content, in the
   repository's ADR form (status/owner/date · context · decision · alternatives · consequences), is
   the **decision input** below:

   - **Status: Accepted.** Owner `24-launch` / `LNCH-03`; dated at implementation time. Source:
     breakdown-plan §8 **Q8**, confirmed architecture decision, with §2.1 **A8** accepted. PRD basis
     §5.14, §19.1, §45.5.
   - **Context.** PRD §5 item 14 requires "Public marketing and status pages without public research
     access"; PRD §13.3 requires a "Public status page independent of the origin server"; `AUTH-001`
     and `UAT-AUTH-01` require an unauthenticated visitor to find marketing/login only; PRD §19.1 puts
     a Cloudflare static edge in front of a single Sydney Lightsail origin and PRD §24.1 budgets
     "Cloudflare Pages/tunnel/free edge | A$0 target"; PRD §21.1 governs supply chain. **No PRD section
     names a path**, so the decomposition fixed one and the register confirmed it. `FND-01` fixes
     `pnpm-workspace.yaml` to the globs `['apps/*','packages/*','tests/*']` and that root file is
     serial-owned by `00-foundation` (breakdown-plan §4.1), so a nested member would cost a root-file
     edit plus a new DAG edge.
   - **Decision (accepted), clause by clause — each is §8 Q8 verbatim in substance, and none is
     re-decided here:**
     1. **Source path `apps/web/public-site/**`.**
     2. **Built by a self-contained Node build script** — `node apps/web/public-site/build.mjs`, Node
        stdlib only, no network at build time — **with output `apps/web/public-site/dist/`**.
     3. **Deployed to Cloudflare Pages** (the project binding is `RLSE-03`'s, **QL5**).
     4. **Independent of the authenticated application and of the origin server**: it imports nothing
        from `apps/web/src/**` or any workspace package, and every page renders without the origin.
     5. **Not a pnpm workspace member**, with **no npm runtime or build dependencies by default** —
        a constraint overturned only by a future ADR that explicitly says so, never by adding a
        dependency in passing.
     6. **The status page uses a status feed independent of the origin server** (`RLSE-08`'s external
        checks, never `/v1/system-status`), and the bundle contains **no public Research, Search, Ask,
        customer-data or account-creation surface**.
   - **Alternatives**, each recorded with the trade-off that decides it:

     | Alternative | Outcome | What the ADR must record |
     |---|---|---|
     | **Separately built static bundle at `apps/web/public-site/**`, Cloudflare Pages** | **Accepted** | That it satisfies every constraint above at PRD §24.1's A$0 target, survives an origin outage (PRD §13.3), and publishes no product code; plus the measured build time and output size. |
     | **A route inside the authenticated SPA** | Rejected | An SPA route dies with the origin, so PRD §13.3's independence fails exactly when it matters; and publishing the product bundle puts the whole research client one bundle-inspection away, against PRD §5 item 14. |
     | **A nested pnpm workspace member** | Rejected | Requires editing `pnpm-workspace.yaml`, serial-owned by `FND-01` (breakdown-plan §4.1), plus a new DAG edge — for four static pages. |
     | **A second Vite build inside `apps/web`** | Rejected | Requires editing `apps/web/package.json` and `vite.config.ts`, owned by `RUNT-05` (`03-app-runtime`), and couples the public bundle to the application's dependency tree, breaking clause 4. |
     | **A third-party status-page SaaS** | Rejected | Recurring cost against PRD §24.1's A$0 target, plus a third-party runtime origin against PRD §21.1 and Deliverable 5 rule 4. |

   - **Consequences.** No framework, no bundler and no component reuse from `packages/ui` — the site is
     hand-written semantic HTML/CSS with a small vanilla-JS status fetch; accessibility is asserted
     structurally here (Deliverable 5 rule 8) and audited by a human, with a machine WCAG audit
     belonging to `ASSR-07` if one is required; the feed contract is **QL4** and the deploy binding
     **QL5**; policy text is compiled from `docs/policies/**` at build time, so a policy change needs a
     rebuild (sub-PRD **D2**); the bundle sits outside `pnpm test`, so its own `node --test` suite is
     the only guard; and if the site ever needs an npm dependency, that is a writeback to §8 **Q8**
     plus a superseding ADR plus a `00-foundation` change — never a local root edit.
   - **Cross-references:** `docs/prd/breakdown-plan.md` §8 **Q8** and §2.1 **A8**/**A9**,
     `docs/prd/24-launch/README.md` **D4**, PRD §45.5, and `RUNT-05`'s web-autoload ADR (the two must
     not be confused: this bundle is outside the feature-registry contract entirely).
2. **`apps/web/public-site/build.mjs`** — the dependency-free builder (Node stdlib only, sub-PRD D11):
   reads page sources from `content/**`, the compiled policy documents from `docs/policies/*.md`, the
   templates from `templates/**` and the stylesheet from `assets/**`; emits `dist/` containing one HTML
   file per route, one CSS file, one small JS file for the status fetch, `_headers`, `_redirects`,
   `robots.txt` and `sitemap.xml`. Requirements:
   - **Deterministic**: two runs from the same inputs produce byte-identical output (no timestamps, no
     random ids); a `--check` mode rebuilds into a temp directory and diffs.
   - **Configurable feed**: the status feed URL comes from `PUBLIC_STATUS_FEED_URL` (build-time), with
     the default documented in the ADR and the module README (**QL4**). The build fails loudly if the
     value is an origin-app URL (a literal `/v1/` path or the app hostname) — PRD §13.3 independence,
     enforced in the build.
   - **No network at build time**; policies and content are read from the working tree.
3. **Pages** (`content/**` + `templates/**`), each with one programmatic `<h1>`, semantic landmarks and
   a skip link:
   - **`/` — marketing.** What the product is, who it is for, the official-source evidence approach,
     and an explicit statement that research requires an invited account. Required factual statements,
     each PRD-cited in a source comment: information and conditional guidance, **not legal
     representation** (PRD §11.2); invite-only access (`AUTH-001`); the short-form disclaimer from
     `docs/policies/disclaimer.md`. Everything else — positioning, benefits, pricing language — is
     `FOUNDER_INPUT_REQUIRED` (Non-goals).
   - **`/status`.** Renders the `RLSE-08` feed: overall state, per-component states, last-updated time
     (`3 Aug 2026, 14:05 AEST` style — PRD §41.1 unambiguous dates), and incident history if the feed
     supplies it (PRD §12.4 states). Behaviour is fail-visible: **no feed → `UNKNOWN`**, **feed older
     than the configured freshness window → `STALE`**, malformed feed → `UNKNOWN`. "Operational" is
     representable **only** from a fresh, well-formed feed. Every state carries text plus icon/shape
     (PRD §41.1 "colour is never the only status signal"). The page renders fully server-side-free:
     the static HTML already shows `UNKNOWN` before any JS runs, so a blocked script never yields a
     falsely healthy page.
   - **`/support`.** PRD §13.3 verbatim in substance: email and in-app issue reporting, target response
     within two business days, critical incidents best effort same business day, **no phone or 24/7
     support**, and PRD §13.2's "no contractual SLA" position. Contact address is
     `FOUNDER_INPUT_REQUIRED`.
   - **`/legal/terms`, `/legal/privacy`, `/legal/acceptable-use`, `/legal/disclaimer`** — compiled from
     `docs/policies/**` with `version`, `effective_date` and a visible **Draft** badge whenever
     `status !== 'PUBLISHED'` (same honesty rule as `LNCH-02` deliverable 5). This is how PRD §26's
     "Terms, Privacy, AUP and disclaimer drafts are **published**" is satisfied for a prospective
     customer who has no account yet.
   - **`/login` is a link, not a page** — it points at the authenticated application. No form, no field,
     no credential input exists in this bundle.
4. **Coverage-language rule.** The site makes **no category-level coverage claim**. The build checker
   fails on any per-jurisdiction/per-source-category coverage assertion in site copy, and the only
   permitted coverage sentence points the reader at the in-product Source Coverage Registry for exact
   status, dates and limits. Basis: PRD §44.4 ("It is not permitted to silently call an unimplemented
   source category covered"), PRD §12.1 (five separate freshness dates), and breakdown-plan §8 **Q10**
   — under the confirmed limited-state launch policy, which groups (if any) are limited is a Gate 2
   output derived from `GOLD-16`'s measured evidence (sub-PRD **D12**, **QL6**), so no build-time copy
   in this bundle may anticipate it in either direction.
5. **`apps/web/public-site/check-site.mjs`** — the dependency-free site checker (exit 0/1, one line per
   violation) run over `dist/`:
   1. **No research access**: no `<form>` element anywhere; no `<input>` except none at all; no
      occurrence of `/v1/`, the API base URL, `search`, `ask`, `answer` or `coverage` as a *link
      target*; no imported script other than the site's own `status.js` (PRD §5 item 14).
   2. **No account creation**: no signup/registration route, no invitation-acceptance form; the only
      auth affordance is a single outbound link to the app's `/login` (`AUTH-001`, `UAT-AUTH-01`).
   3. **Origin independence**: every runtime network origin used by `status.js` is the configured feed
      origin; the string `/v1/system-status` appears nowhere (PRD §13.3).
   4. **Third-party freedom**: zero external script, style, font or image origins (PRD §21.1, §24.1).
   5. **Required links present**: every page footer links to the four policy pages, `/support` and
      `/status` (link/copy presence assertion; PRD §26).
   6. **Prohibited claims**: `docs/policies/claim-language/prohibited-claims.json` finds zero matches in
      any emitted HTML text, plus the coverage-language rule of Deliverable 4 (PRD §11.2, §11.1, §13.2,
      §13.4, §44.4).
   7. **`LEGAL_REVIEW_PENDING` appears nowhere** in the bundle (PRD §26 — internal disclosure only).
   8. **Structural accessibility** (computable without a browser): `<html lang="en">`; exactly one
      `<h1>` per page; no heading-level skips; every `<img>` has `alt`; every link has a discernible
      accessible name; no positive `tabindex`; a skip link as the first focusable element; the
      stylesheet declares a visible focus style and never `outline:none` without a replacement; every
      status indicator carries text as well as colour; and the declared colour tokens meet WCAG 2.2 AA
      contrast, computed arithmetically from the CSS custom properties (PRD §13.1, §41.1).
   9. **Determinism**: `build.mjs --check` reports no diff.
6. **`assets/site.css`** — one stylesheet with declared colour tokens, responsive layout at 360, 768 and
   1280 px (PRD §41.1), visible focus styling, and no web font fetched from a third party.
7. **`assets/status.js`** — the only script: fetches the feed, applies the freshness window, swaps the
   pre-rendered `UNKNOWN` state for the feed's state, and fails to `UNKNOWN` on any error. No cookies,
   no storage, no telemetry, no third-party call.
8. **`_headers` and `_redirects`** (Cloudflare Pages content-level conventions, therefore this
   bundle's files, not `infra/cloudflare/**`): a Content-Security-Policy that permits only `'self'` and
   the feed origin for `connect-src` and forbids inline script; `X-Content-Type-Options`,
   `Referrer-Policy: no-referrer`, `X-Frame-Options`/`frame-ancestors` denying framing; and a redirect
   from any legacy signup path to `/` (so `UAT-AUTH-01`'s "open signup URL" lands on marketing).
9. **`test/fixtures/status-feed/**`** — committed synthetic feed recordings shaped by **QL4**:
   `operational.json`, `degraded.json`, `incident.json`, `stale.json` (timestamp beyond the freshness
   window) and `malformed.json`, plus the absent-feed case. No customer content.
10. **`test/site.test.mjs`** — Node's built-in test runner (`node --test`, no framework dependency):
    builds the site into a temp directory, runs the checker, and replays each status fixture asserting
    the rendered state, including that the pre-JS HTML is `UNKNOWN` and that `operational` is
    unreachable from the `stale`, `malformed` and absent cases.
11. **`README.md`** (inside `apps/web/public-site/`) — the build command, the output directory, the
    `PUBLIC_STATUS_FEED_URL` contract, the deploy handoff for `RLSE-03` (**QL5**) and a pointer to the
    ADR. This is what a Cloudflare Pages project is configured from; keeping it in-tree is what makes
    **QL5** a five-minute change in `18-ops-release` rather than an archaeology exercise.

## Acceptance checklist (classified)

- [ ] `[machine]` `node apps/web/public-site/build.mjs` produces `dist/` offline, and a second run is
      byte-identical (`--check` reports no diff) — static-site build (breakdown-plan §1.1)
- [ ] `[machine]` `node apps/web/public-site/check-site.mjs dist` exits 0 for all nine rule groups of
      Deliverable 5 (PRD §5 item 14, §13.3, §21.1, §26, §41.1, §44.4)
- [ ] `[machine]` The bundle contains **no form, no input and no account-creation path**, and its only
      auth affordance is one link to the app's `/login` (`AUTH-001`; `UAT-AUTH-01` automated half)
- [ ] `[machine]` The bundle contains no research surface: no search/ask/answer/coverage link target and
      no API client (PRD §5 item 14)
- [ ] `[machine]` No runtime origin other than the configured status feed; `/v1/system-status` appears
      nowhere; the build fails if `PUBLIC_STATUS_FEED_URL` points at the origin app
      (PRD §13.3 "independent of the origin server")
- [ ] `[machine]` The four policy pages render from `docs/policies/**` with `version`, `effective_date`
      and a text-plus-icon **Draft** badge whenever `status !== 'PUBLISHED'`
      (PRD §26 "drafts are published"; sub-PRD D1/D2)
- [ ] `[machine]` `LEGAL_REVIEW_PENDING` appears nowhere in the bundle
      (PRD §26 "remains disclosed internally")
- [ ] `[machine]` The prohibited-claims scan reports zero matches, and the coverage-language rule finds
      no category-level coverage claim (PRD §11.2, §11.1, §13.2, §13.4, §44.4; sub-PRD QL6)
- [ ] `[machine]` `/support` states the PRD §13.3 terms — email and in-app reporting, two business
      days, critical incidents best effort same business day, no phone or 24/7 support — and PRD
      §13.2's no-contractual-SLA position (link/copy presence assertion)
- [ ] `[machine]` Structural accessibility rules pass on every page: `lang="en"`, one `<h1>`, no heading
      skips, alt text, discernible link names, skip link first, visible focus style, no positive
      `tabindex`, status signalled by text as well as colour, and declared colour tokens meeting WCAG
      2.2 AA contrast by arithmetic check (PRD §13.1, §41.1)
- [ ] `[machine]` `docs/adr/NNNN-public-site-static-bundle.md` is created by this PR and records the
      **confirmed** breakdown-plan §8 **Q8** decision — status `accepted`, context, the accepted
      decision clause by clause, the rejected alternatives and the consequences of Deliverable 1 — takes
      an unused number, and is referenced from the PR. It records a decision already made: an ADR that
      records a different outcome fails this row (PRD §45.5; breakdown-plan §8 Q8, §2.1 A8/A9)
- [ ] `[machine]` The bundle declares **no npm runtime or build dependency** and is **not** a pnpm
      workspace member: no manifest dependency entry, no lockfile entry, no import from `node_modules`,
      `apps/web/src/**` or any workspace package, and every script runs on the pinned Node `24.18.0`
      alone (breakdown-plan §8 **Q8** and **Q12**; sub-PRD D4)
- [ ] `[machine]` `pnpm lint`, `pnpm typecheck`, `pnpm test` green — the repository suite is unaffected;
      this bundle is not a workspace member by design (PRD §20.3, §45.3; sub-PRD D4)
- [ ] `[machine]` PR states the PRD §45.4 items, naming `AUTH-001`, `OPS-002`, `UAT-AUTH-01`, the ADR,
      and the **QL4**/**QL5** handoffs to `18-ops-release`
- [ ] `[fixture]` Replaying the committed status-feed recordings renders the expected state for
      `operational`, `degraded`, `incident`, `stale`, `malformed` and absent-feed; the pre-JS HTML is
      `UNKNOWN`; and no fixture other than a fresh well-formed one can produce "operational"
      (PRD §13.3, §42.1, §42.2)
- [ ] `[human]` Founder review of all seven pages at 360, 768 and 1280 px: keyboard-only navigation
      works with visible focus, nothing legally material is hidden at the narrow width, and the WCAG
      2.2 AA audit the structural checker cannot perform (colour rendering, focus order, screen-reader
      pass) is acceptable (PRD §13.1, §41.1, §43.4)
- [ ] `[human]` `UAT-AUTH-01`: open the signup URL without an invitation and confirm "No public account
      creation path; marketing/login only" (PRD §41.2)
- [ ] `[human]` Gate 2 smoke: with the origin app stopped, the status page still loads from Cloudflare
      Pages and reports a non-operational state (CLAUDE.md Gate 2; PRD §13.3)
- [ ] `[human]` **Founder** approves the marketing copy and supplies every `FOUNDER_INPUT_REQUIRED`
      value (positioning, contact address) — **required before paid access, not required to merge**;
      outstanding markers ship as known gaps and are re-checked by `LNCH-05` (sub-PRD QL1/QL3)
- No `cargo test --workspace` / `uv run pytest` item — no Rust or Python touched (PRD §45.3)
- No `pnpm generate && pnpm generated:check` item — this bundle produces no OpenAPI/SDK/event bindings
      (PRD §20.1)

## Test plan

Reviewer steps, offline, no network:

1. `corepack pnpm install --frozen-lockfile`; `pnpm lint && pnpm typecheck && pnpm test` — confirm the
   repository suite is green and untouched (the bundle is deliberately outside the workspace).
2. `node apps/web/public-site/build.mjs` → `dist/` is created. Run it a second time into a temp
   directory and diff: byte-identical. Then `node apps/web/public-site/build.mjs --check` → exit 0.
3. `node apps/web/public-site/check-site.mjs dist` → exit 0. The construction pattern to copy is
   `LNCH-01`'s `docs/policies/tools/check-policies.mjs` (same module, same dependency-free discipline,
   same one-line-per-violation output).
4. `node --test apps/web/public-site/test/` → all assertions pass, including:
   - **feed replay** — for each fixture in `test/fixtures/status-feed/`, load `dist/status/index.html`
     plus `assets/status.js` in the test's DOM shim, inject the fixture as the fetch result, and assert
     the rendered state string, the last-updated rendering and the icon/text pair;
   - **pre-JS state** — parse `dist/status/index.html` with no script execution and assert the visible
     state is `UNKNOWN`;
   - **stale/malformed/absent** — assert none of them can render "operational".
5. Negative check by hand, then revert: add `<form action="/signup">` to a template, rebuild, re-run the
   checker, confirm exit 1 naming the no-research/no-signup rule, then revert.
6. Negative check by hand, then revert: add the sentence `We cover every employment law source in
   Australia.` to `/` content, rebuild, re-run the checker, confirm exit 1 naming the
   `complete-coverage` and coverage-language rules (PRD §44.4), then revert.
7. Negative check by hand, then revert: set `PUBLIC_STATUS_FEED_URL` to the origin app's
   `/v1/system-status`, rebuild, confirm the build **fails** with the origin-independence error
   (PRD §13.3), then revert.
8. `grep -r LEGAL_REVIEW_PENDING dist/` → no match.
9. Confirm `docs/adr/NNNN-public-site-static-bundle.md` exists, its number does not collide with another
   ADR on the default branch, and it records the decision, the rejected alternatives (SPA route, nested
   pnpm member, `apps/web` sub-build, third-party SaaS) and the consequences named in Deliverable 1.
10. Read `apps/web/public-site/README.md` and confirm the build command, output directory and feed
    contract are stated well enough for `RLSE-03` to configure Cloudflare Pages without asking
    (**QL5**).
11. The four `[human]` rows are run against the built bundle served locally (any static file server)
    and, for the Gate 2 row, against the deployed Pages site with the origin stopped; results recorded
    in the PR.

## Feedback obligation

**1. General rule.** If implementation falsifies this ticket, update **this ticket file** first
(version note + changelog line in the PR), re-publish with `publish-tickets.mjs --sync`, then change
code. Silent divergence is an incomplete ticket (CLAUDE.md, issue #53). Because this ticket **creates**
an ADR, a falsified decision also updates the ADR's consequences section before any code changes.

**2. Foreseeable frictions, each with its exact writeback target.**

- **`RLSE-08` publishes no status feed, or one this page cannot consume** (**QL4**) → do **not** build a
  second checker here and do **not** call `/v1/system-status`. Keep rendering `UNKNOWN` from the
  committed fixture shape, raise a docs change against `18-ops-release`'s `RLSE-08` ticket naming the
  required feed URL, schema and freshness window, `publish-tickets.mjs --sync`, and record the state in
  `docs/prd/24-launch/README.md` §6 **QL4**. PRD §13.3's independence requirement is not negotiable and
  is the reason a second local checker is not an acceptable shortcut.
- **The site genuinely needs an npm dependency** (a Markdown parser, a template engine, a bundler) →
  this falsifies a **confirmed** register decision, not a local preference. §8 **Q8** says the bundle
  has no npm runtime or build dependencies by default "unless a future ADR explicitly overturns that
  constraint" — so the constraint is overturned only by an explicit ADR, never by adding the dependency
  and moving on. Write, in order: (a) the writeback to `docs/prd/breakdown-plan.md` §8 **Q8** and §2.1
  **A8** carrying the evidence that falsifies it; (b) `docs/prd/24-launch/README.md` §4 **D4** amended;
  (c) this ticket file amended; (d) the ADR — its consequences section if it already exists, or a
  superseding ADR that explicitly overturns the no-dependency constraint; (e) a `00-foundation` ticket
  for the `pnpm-workspace.yaml` glob (serial-owned by `FND-01`, breakdown-plan §4.1) plus the new
  `blocked_by` edge in `docs/prd/breakdown-plan.md` §5.25 and its inverse in §6.2; then `dag-scan.mjs`,
  then `--sync`. **Never edit `pnpm-workspace.yaml`, `package.json` or `pnpm-lock.yaml` from this
  ticket**, and never add the dependency first.
- **A machine WCAG 2.2 AA audit is required over the public site** (the structural checker is judged
  insufficient) → `tests/e2e/accessibility/**` is `23-assurance`'s (`ASSR-07`). Raise a docs change
  against `ASSR-07` adding public-site coverage, `--sync`, and record it in
  `docs/prd/24-launch/README.md` §6. Do not add a browser-automation dependency here (previous bullet)
  and do not write into `tests/**`.
- **The Cloudflare Pages project cannot use this build command or output directory** (**QL5**) →
  `infra/cloudflare/**` is `RLSE-03`'s. Adjust the command *here* if the constraint is real and
  re-record it in the ADR and `apps/web/public-site/README.md`; if the constraint is on their side,
  raise a docs change against `RLSE-03`, `--sync`. Never edit `infra/**`.
- **Marketing copy wants to name jurisdictions or source categories as covered** → forbidden by
  Deliverable 4 and PRD §44.4. The permitted move is the pointer sentence to the in-product registry.
  If the Founder wants specific coverage language, it must be derived from `GOLD-16`'s measured
  evidence under the confirmed limited-state launch policy (breakdown-plan §8 **Q10**; sub-PRD **D12**)
  and is therefore gated on `LNCH-05`'s closure record and launch statement — raise it as **QL6** in
  `docs/prd/24-launch/README.md` §6, not as a copy edit. The same rule applies in the other direction:
  this site does not pre-announce a limitation either, because the limited set is a Gate 2 output.
- **PRD §31.2's route table or the shell seems to need a public route** → it does not: this bundle is
  outside the authenticated SPA entirely (that is the point of §8 **Q8** clause 4). If a shared route
  ever seems necessary, that is a Product change (PRD §45.5) for the Founder, not a local fix.

**3. Escalation.** Breakdown-plan §8 **Q8** is a **confirmed** decision in the register and §2.1 **A8**
is decomposition-critical; PRD §13.3's "independent of the origin server" is a product-level MUST behind
PRD §26's "External health/status … operate". If either is outright falsified — the placement cannot
work, or the status page ends up depending on the origin — that overturns a confirmed founder-level
decision: escalate for re-review, update `docs/prd/breakdown-plan.md` §8 **Q8** and §2.1 **A8**,
`docs/prd/24-launch/README.md` **D4** and the ADR's consequences **before any code lands**, and never
quietly re-point the status page at the origin to make it work.
