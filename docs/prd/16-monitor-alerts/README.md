# 16-monitor-alerts — sub-PRD

> Module sub-PRD, authored from `docs/prd/breakdown-plan.md` §5.17. The **ticket files under
> `tickets/` are the executable source of truth**; this README is the module-level frame around
> them. On any disagreement between a ticket and this README, the ticket wins (CLAUDE.md, issue #53).

| Field | Value |
|---|---|
| Module | `16-monitor-alerts` |
| Ticket prefix | `WTCH` |
| Lane | `16-monitor-alerts` |
| Tickets | 9 (`WTCH-01` … `WTCH-09`) |
| Agent | `builder` (all 9 — breakdown-plan §1.1) |
| Depends on modules | `00-foundation`, `01-app-data`, `03-app-runtime`, `04-corpus-contract`, `14-search-product` |
| PRD epic | `E25-MONITOR` (PRD §44.2 — "Change matching, watchlists, alerts, email/webhook/digest … MON tests and delivery replay") |
| Owned requirement IDs | `MON-001`, `MON-002`, `MON-003`, `MON-004` |
| UAT scripts | `UAT-MON-01`, `UAT-MON-02` (PRD §41.2) |
| Master spec | [`docs/PRD.md`](../../PRD.md) |
| Decomposition plan | [`docs/prd/breakdown-plan.md`](../breakdown-plan.md) §2.1, §4, §4.2, §5.17, §6.2, §7, §8 |
| Version | v0.2 — 2026-08-03 |

---

## 1. Problem

A legal-research product whose corpus changes weekly is only trustworthy if the customer learns that
the law they relied on has moved. PRD §8.8 makes this a functional requirement, and PRD §33.4 makes
it an end-to-end pipeline that crosses four other modules:

> 1. Scheduled discovery detects changed official metadata/hash.
> 2. Adapter fetches only approved official URLs and stores immutable artifact.
> 3. Parser/normaliser creates candidate versions/events/relations.
> 4. Validation either quarantines the change or includes it in a candidate CorpusRelease.
> 5. Promotion atomically changes the active release.
> 6. **Change matcher creates one `DetectedChange` and finds matching watch targets and cited Answer
>    Snapshots.**
> 7. **Transaction creates tenant alerts and marks materially affected records `REVIEW_REQUIRED`.**
> 8. **Outbox delivers in-app/email/webhook idempotently.**
> 9. Customer can rerun; the original answer remains unchanged.

Steps 1–5 belong to `05-ingestion-framework`, the source modules, `04-corpus-contract` and
`18-ops-release`. **This module owns steps 6–8** plus the customer surfaces that configure and read
them (PRD §31.2 `/monitor/watchlists`, `/monitor/alerts`, `/monitor/alerts/:alertId`).

Three properties make this module hard, and each is a hard requirement rather than an aspiration:

1. **Fan-out, not per-tenant crawling.** PRD §8.8: *"A single detected source change MUST fan out to
   matching watchlists rather than create one crawler per watchlist."* PRD §35.6 records
   `detected_change` as a *"global public-source event, not tenant content"* with the constraint
   *"no crawler per watch"* on `watchlist`/`watch_target`. `MON-002`'s acceptance evidence is
   literally *"N matching tenants do not trigger N crawls"*.
2. **Structured change types, never diffs.** PRD §8.8: *"Changes MUST be structured as amendment,
   commencement, rate, replacement, appeal, guidance, source-removal or freshness events—not raw HTML
   diffs."* PRD §32.7 closes the loophole: *"Raw HTML diffs never become customer alerts."*
3. **Delivery is a security surface.** PRD §8.8: *"Webhook delivery MUST use HMAC-SHA256 signatures,
   timestamps, idempotent event IDs, secret rotation and bounded exponential retry. Payloads MUST
   avoid complete customer questions/answers by default."* PRD §34.8 fixes the headers, the signature
   input and the payload shape to the byte.

## 2. Scope

| # | Area | Tickets |
|---|---|---|
| 1 | Watchlist and watch-target HTTP surface with typed normalisation of all six `MON-001` target kinds | `WTCH-01` |
| 2 | Detected-change recording and single-pass fan-out to every matching tenant watchlist | `WTCH-02` |
| 3 | Tenant alert creation, `REVIEW_REQUIRED` impact marking, and the alert HTTP surface | `WTCH-03` |
| 4 | Email delivery channel behind a provider port and a directory-scanned provider registry | `WTCH-04` |
| 5 | Signed webhook delivery, subscription CRUD/test/rotate, retry and dead-letter | `WTCH-05` |
| 6 | Daily digest and `IMMEDIATE` / `DAILY_DIGEST` delivery-mode selection | `WTCH-06` |
| 7 | Watchlist screens and the create-watch-from-search/source entry point (breakdown-plan §4.2) | `WTCH-07` |
| 8 | Alerts list and alert detail screens | `WTCH-08` |
| 9 | The confirmed transactional-email provider adapter (Resend) behind the `EmailTransport` port | `WTCH-09` |

The module's total write-set is exactly breakdown-plan §4's row:

```text
apps/api/src/routes/{watchlists,alerts,webhook-subscriptions}/**
apps/worker/src/handlers/{change-matching,alerts,notifications}/**
apps/web/src/features/monitor/**
```

`WTCH-09`'s provider directory sits inside that same row
(`apps/worker/src/handlers/notifications/email/providers/resend/**`), so the module's allocation in
breakdown-plan §4 is unchanged. The only files this module writes outside that row are the two ADRs
it claims under breakdown-plan **A9** (`docs/adr/**` is shared-additive with per-file ownership):
`docs/adr/NNNN-transactional-email-provider.md` (`WTCH-04`) and
`docs/adr/NNNN-webhook-secret-rotation.md` (`WTCH-05`). Neither exists yet — `docs/adr/` is empty
today, and each is created by its ticket's Builder at implementation time.

## 3. Non-goals

Each exclusion names its owner (breakdown-plan §4), or a standing reason.

| Excluded | Owner / reason |
|---|---|
| `watchlist`, `watch_target`, `detected_change`, `alert`, `alert_delivery` tables, migrations and repositories | `01-app-data`/`DATA-07` — breakdown-plan **A3**; PRD §45.2 gives `packages/database` exactly this scope and forbids it to others |
| `outbox_event`, `job`, `job_event` tables and `packages/jobs` lease primitives | `01-app-data`/`DATA-05` |
| Webhook/SSE **schemas**, the envelope, and the HMAC sign/verify helper | `00-foundation`/`FND-05` — `schemas/events/**` is PRD §44.3 serial-owned |
| Canonical enums (`ChangeType`, delivery mode, channel) and opaque id prefixes (`alt_`, `wat_`, `evt_`) | `00-foundation`/`FND-03` |
| The record workflow state machine and ETag rules | `00-foundation`/`FND-08` |
| Discovery scheduling, conditional requests, source fetching, parsing, quarantine, freshness dates | `05-ingestion-framework` (`INGF-02`, `INGF-05`, `INGF-07`, `INGF-08`) |
| Candidate release build, gates and the corpus-side release diff this module consumes | `04-corpus-contract`/`CRPS-06` |
| Corpus promotion, the atomic active pointer, rollback | `18-ops-release`/`RLSE-07` |
| Route/handler/feature **registration machinery**, admission middleware, SSE, worker lease loops, web shell, `packages/ui` | `03-app-runtime` (`RUNT-01`…`RUNT-06`) |
| Research records, turns, review actions, comments, corrections and the record screens | `17-records-collab` — this module only *triggers* `REVIEW_REQUIRED` through `FND-08` |
| Correction-driven notification (PRD §12.3) | `17-records-collab`/`RCRD-07` and `22-internal-admin`/`INTL-08` |
| Internal operator consoles for source health, quarantine and incidents | `22-internal-admin` |
| Developer-facing webhook screens (`/developer/webhooks`) and SDK webhook verification | `20-developer-platform` (`PLTF-07`, `PLTF-02`, `PLTF-03`) — `PLTF-07` is `blocked_by` `WTCH-05` |
| Cross-boundary tenant-isolation / E2E UAT suites | `23-assurance` (`ASSR-01`, `ASSR-06`); `ASSR-06` is `blocked_by` `WTCH-08` |
| Provisioning the email provider account, the sealed-secret entry (`RESEND_API_KEY`) and the sending domain's DNS records | `18-ops-release` (`infra/**`, the PRD §39.6 sealed-secret layer, PRD §42.7 runbooks). The code refuses to send from an unverified sending domain (**D14**); performing the verification is an operational step, not a code step |
| Bounce, complaint, unsubscribe and suppression processing, and any inbound provider webhook | Standing open gap recorded in breakdown-plan §8 **Q14** (*"remains open until a ticket explicitly plans and implements it"*). No PRD section specifies it; it needs a product change (PRD §45.5), a `DATA-07` column and its own ticket. Both `WTCH-04` and `WTCH-09` declare it a non-goal. See **Q-WTCH-10** |
| **Generated alert summaries / any model-gateway call** | Standing reason: `MON-003` requires an alert to be *"useful with generated summary disabled"*, and this module has no `blocked_by` edge to `12-evidence-safety`. See **D6** |
| **Any outbound HTTP other than (a) a customer-configured webhook endpoint and (b) the transactional email provider's own fixed, configured API endpoint** | Standing reason: PRD §8.8 forbids a crawler per watch and PRD §37.5 keeps the model gateway away from *"shell, Web, database, email, webhook or arbitrary tool"*. The provider endpoint is the single destination the **confirmed** §8 **Q14** decision adds; it is owned by `WTCH-09`, is a fixed configured host rather than customer input, and is subject to the same address policy as webhook egress (**D10**, **Q-WTCH-4**) |

## 4. Decisions

| # | Decision | Basis |
|---|---|---|
| D1 | Every surface registers by **directory convention** — one `apps/api/src/routes/<area>/index.ts` per route area, one `apps/worker/src/handlers/<area>/index.ts` per handler area, one `apps/web/src/features/monitor/feature.tsx`. No file owned by `03-app-runtime` is edited by any ticket in this module. | breakdown-plan **A1**; `RUNT-01` §"A1 registration contract", `RUNT-04` §"A1 worker registration contract", `RUNT-05` §"A1 web registration contract" |
| D2 | `apps/worker/src/handlers/notifications/` is **one** handler area under `RUNT-04`'s contract (immediate children of `handlers/` are areas). Its area entry `index.ts` plus the channel sub-registry is owned by **`WTCH-03`**, which is strictly before `WTCH-04`/`WTCH-05`/`WTCH-06` in the DAG; each channel then registers by dropping in `notifications/<channel>/channel.ts` with zero diff outside its own directory. `WTCH-04`, `WTCH-05` and `WTCH-06` may run as concurrent lanes because their channel subtrees are disjoint. | `RUNT-04` contract items 1–3 and 6; breakdown-plan §5 preamble ("file-scopes are disjoint from sibling tickets except where a `blocked_by` edge orders them"); §6.2 (`WTCH-03 --> WTCH-04 & WTCH-05`) |
| D3 | `apps/web/src/features/monitor/` is **one** feature area under `RUNT-05`'s contract (`import.meta.glob('../features/*/feature.tsx')`). `feature.tsx` is owned by **`WTCH-07`** and composes screens by scanning `./*/routes.tsx`; `WTCH-08` adds `alerts/routes.tsx` only. `WTCH-08` is `blocked_by` `WTCH-07`, so the two are never concurrent even if the sub-glob is later replaced. | `RUNT-05` contract items 1–4 and 6; breakdown-plan §4 (`apps/web/src/features/monitor/**` is this module's row), §6.2 (`WTCH-07 --> WTCH-08`) |
| D4 | `WTCH-02` **never creates an alert**. It writes the `detected_change` row(s) and, in the *same* transaction, one internal `outbox_event` per matched `(organization_id, watchlist_id, detected_change_id)`. `WTCH-03` consumes those and performs PRD §33.4 step 7's single transaction (alerts + `REVIEW_REQUIRED`). | The `blocked_by` direction is `WTCH-02 → WTCH-03` (§5.17), so `WTCH-02` cannot import `WTCH-03`; PRD §33.4 splits steps 6 and 7; PRD §35.8 invariant 6 (*"Outbox event and corresponding business state commit in one transaction"*) |
| D5 | The **in-app channel** needs no delivery job: an `alert` row *is* the in-app delivery, recorded as an `alert_delivery` row with channel `IN_APP` inside `WTCH-03`'s transaction. Only email, webhook and digest need `notifications`-class jobs. | PRD §8.8 (three channels); PRD §39.5 (`notifications` queue = "email/webhook/digest"); PRD §42.5 (*"Webhooks … Alerts remain in-app/queued"*) |
| D6 | Alerts are assembled from **structured data only**. The optional `generated_summary` field is never populated by this module, and every screen and payload must be complete without it. | `MON-003` evidence: *"Alert remains useful with generated summary disabled"*; PRD §32.7; no `blocked_by` edge to `12-evidence-safety` |
| D7 | A detected change that cannot be classified into one of the eight PRD §8.8 types produces **no alert**: it is recorded with `change_type = UNCLASSIFIED`, counted in an operator metric, and left for `22-internal-admin`. It never degrades into a text or HTML diff. | PRD §8.8 (the eight types are exhaustive for alerts); PRD §32.7 (*"Raw HTML diffs never become customer alerts"*) |
| D8 | `DAILY_DIGEST` batches the **delivery pass**, not the event contract: the email channel sends one aggregate message, and the webhook channel enqueues the same individual `alert.created` events at the digest boundary. No new webhook event type is invented. | PRD §32.7 (delivery mode is a watchlist property); PRD §34.8 (`alert.created` is the only specified event); `schemas/events/**` is `FND-05`'s serial-owned tree |
| D9 | Webhook **secret rotation** uses a bounded overlap window: `rotate-secret` returns the new secret once and records `signing_switch_at`; the sender signs with the previous secret until that instant and with the new secret after it, always emitting exactly one `X-AER-Signature` header. Receivers verify against both secrets across the window using `FND-05`'s ordered-secret verifier. | PRD §34.8 fixes the header set (a second signature header would be a contract change); `FND-05` deliverable 3 (*"`verifyWebhook` accepts an ordered list of secrets … so `WTCH-05` can implement PRD §8.8's rotation with an overlap window without changing this contract"*); PRD §32.8 (*"Secrets are never redisplayed"*) |
| D10 | The **outbound egress guard** for webhook delivery (HTTPS-only, DNS resolution with private/loopback/link-local/multicast/metadata denial, pinned-IP connect, no redirects, bounded response read) is implemented inside `apps/worker/src/handlers/notifications/webhook/**`. `INGF-02`'s fetcher lives in `pipelines/ingestion` and is not importable from `apps/worker`, and this module has no `blocked_by` edge to it. `WTCH-09`'s provider adapter applies the same policy class to its fixed provider host, in its own directory, for the same reason plus the absence of a `blocked_by` edge to `WTCH-05`. | PRD §21.1, §37.4 (the policy class); breakdown-plan §4 (module boundaries); open question **Q-WTCH-4** records the duplication |
| D11 | Both delivery channels are built against a **port**, and every `[machine]`/`[fixture]` criterion in this module runs offline against it. The transactional email provider is **confirmed**: Resend, on the Resend Free transactional-email tier, behind the existing `EmailTransport` port (breakdown-plan §8 **Q14**), implemented by `WTCH-09` as a small typed HTTPS adapter — the vendor SDK is not used. `WTCH-04` stays provider-neutral and ships the port, the provider registry and the offline transports. **No test in this module may require a live email provider, a real API key, a verified sending domain or a live webhook endpoint**: the webhook suite runs against a local in-process receiver and the provider suite against an in-process fake with a literal fake key. Restore drills keep `NullTransport`, and the committed safe default stays the file transport. The API key exists only in the production sealed-secret layer (recommended name `RESEND_API_KEY`) and is never committed, logged or exposed to a coding agent. | breakdown-plan §8 **Q14** (CONFIRMED PROVIDER DECISION); PRD §42.3 / `UAT-OPS-02` (*"no emails/webhooks/providers/real sessions fire"*); PRD §39.6 (secret groups "email credential", "webhook encryption key"); PRD §20.2 (*"Coding agents MUST NOT receive production … provider credentials by default"*) |
| D12 | `RECORD_AUTHORITY` watch targets are **materialised at creation time** into one normalised target row per cited authority, each carrying `source_record_id`. Match time therefore reads only `watch_target`, never the research tables. | PRD §8.8 (*"authorities referenced by Research Records"* is a target kind); `MON-002` (*"N matching tenants do not trigger N crawls"* — matching must be index-driven); PRD §35.6 (`watch_target` holds a *"typed normalised target"*) |
| D13 | Every route area in this module uses the `RUNT-02` admission chain unchanged and the `monitor:read` / `monitor:write` scopes; organisation is never read from a request body. | PRD §16.5, §16.3 (scope list), §34.1 (*"Tenant … derived from authenticated session/key/widget token"*) |
| D14 | The email tree is **split along the port**. `WTCH-04` owns `apps/worker/src/handlers/notifications/email/**` **except** `providers/resend/**` — the channel, the `EmailTransport` port, the provider registry (`providers/{index.ts,provider-contract.ts}`) and the `File`/`Null`/`Failing` transports. `WTCH-09` owns `providers/resend/**` — the typed HTTPS client, its configuration, its address check and its offline fake — and nothing else. The write-sets are disjoint, both tickets state the exclusion, and `WTCH-09` is `blocked_by` `WTCH-04`, so they never run concurrently. A provider is added by dropping in a directory the registry scans, producing zero diff outside it; the credential reaches the adapter only through the sealed-secret accessor on `EmailTransportContext`, never through configuration, a fixture or a log; and the adapter transmits exactly what `WTCH-04`'s renderer produced, performs one attempt per `send()` and never retries internally. The durable ADR `docs/adr/NNNN-transactional-email-provider.md` is **`WTCH-04`**'s file (breakdown-plan **A9**) and is authored by its Builder at implementation time — it does not exist yet. | breakdown-plan §5.17 (the `WTCH-09` row and its preamble: *"the two write-sets are disjoint, and the `blocked_by` edge orders them"*), §6.2 (`WTCH-04 --> WTCH-06 & WTCH-09`), §8 **Q14**; `RUNT-04` contract item 6 (registration by scan, zero diff outside) |

## 5. Rejected alternatives

| Rejected | Why |
|---|---|
| **A crawler or scheduled fetch per watchlist** | PRD §8.8 forbids it in one sentence; PRD §35.6 repeats it as a table constraint (*"no crawler per watch"*); `MON-002`'s evidence is the negative test |
| **Alerting from a text/HTML diff of the source** | PRD §8.8 and §32.7 both forbid it. The eight structured types are the contract; an unclassifiable change is silence plus an operator finding (**D7**), never a diff |
| **Creating alerts inside `WTCH-02`** | Would invert the plan's `blocked_by` direction (`WTCH-02 → WTCH-03`) and merge PRD §33.4 steps 6 and 7 into one ticket, hiding the fan-out property that `MON-002` tests |
| **A `watch_match` table to carry results between `WTCH-02` and `WTCH-03`** | PRD §35.6 enumerates the operations tables and does not include one; adding a table is `01-app-data`'s (breakdown-plan **A3**, risk **R4**). The transactional outbox already provides exactly this durable hand-off (PRD §18.1, §35.8 invariant 6) |
| **Writing watch targets from `14-search-product`'s screens** | breakdown-plan §4.2 assigns "create watch target from search/source" to `WTCH-07` precisely so `14` never writes watch state. `WTCH-07` publishes a deep-link contract instead (**Q-WTCH-6**) |
| **Defining an `alert.digest` webhook event** | `schemas/events/**` is `FND-05`'s serial-owned tree and PRD §34.8 specifies only `alert.created`. **D8** keeps the event contract intact; adding a type is a writeback to `FND-05`, not a local schema |
| **Two signature headers (old + new) during rotation** | PRD §34.8 fixes the three `X-AER-*` headers. **D9** achieves overlap without changing the wire contract |
| **Following HTTP redirects on webhook delivery** | A redirect to a loopback or metadata address is the classic SSRF escalation; PRD §37.4's policy class denies those addresses "before and after redirects", and refusing redirects outright is the strictly safer subset |
| **Summarising alerts with the model gateway** | `MON-003` requires usefulness with generation disabled, and PRD §37.5 forbids generated text from triggering external action. **D6** |
| **Building the live provider adapter inside `WTCH-04`** | breakdown-plan §5.17 splits the email tree along the port so the provider-neutral channel and one vendor's adapter are separately owned, separately testable and separately revertible. Merging them would leave no file boundary between "the email channel" and "Resend", and would make `WTCH-04`'s port suite depend on a vendor shape (**D14**) |
| **Taking the Resend SDK as a dependency** | breakdown-plan §8 **Q14**: *"A small typed HTTPS adapter is sufficient — the Resend SDK is not mandatory."* One HTTP call does not justify a runtime dependency plus churn on `pnpm-lock.yaml`, which PRD §44.3 declares serial-owned (breakdown-plan risk **R7**) |
| **A retry loop inside the provider adapter** | `WTCH-04` deliverable 5 owns the bounded exponential schedule and the `DEAD_LETTER` terminal state. A transport that retries internally multiplies attempts invisibly and breaks `MON-004`'s bounded, observable delivery |
| **One combined "monitor" ticket** | breakdown-plan §7 requires no module to be fully serial; the 9-ticket cut yields 4 waves at 3 useful lanes |
| **Owning any `packages/database` file to add a missing column** | breakdown-plan **A3**, risk **R4** and PRD §45.2 all forbid it; the path is a new `01-app-data` ticket plus a `blocked_by` edge |

## 6. Open questions

None blocks Gate 1. Each has a named owner and an exact writeback target.

**Q14 is no longer one of them.** breakdown-plan §8 records it as a **CONFIRMED PROVIDER DECISION**:
Resend on its Free transactional-email tier, behind the existing `EmailTransport` port, with native
idempotency keys on the `alert_delivery` id, the API key only in the sealed-secret layer, a verified
sending domain, no research content in email, and `NullTransport` for restore drills. It is recorded
here as **D11** and **D14**, implemented by `WTCH-04` (port, registry, offline transports, and the ADR
decision input) and `WTCH-09` (the adapter). Nothing in this module waits on a provider decision.

| # | Question | Owner | Resolved by | Affects | Writeback target |
|---|---|---|---|---|---|
| Q-WTCH-1 | **Who enqueues the change-matching job after an atomic corpus promotion?** PRD §33.4 step 5 is `RLSE-07`'s tool and step 6 is this module's handler; no ticket in the plan declares the edge | `18-ops-release` (`RLSE-07`) with `22-internal-admin` (`INTL-04`) | `RLSE-07` / `INTL-04` | `WTCH-02` in production only — the handler is fully testable from its documented enqueue contract | `docs/prd/breakdown-plan.md` §5.19/§5.23 and §6.2 (a new edge), never a local scheduler inside `apps/worker` |
| Q-WTCH-2 | **Who emits a freshness change** (PRD §8.8's `freshness` type, PRD §12.1's `FRESHNESS_LIMITED`)? The five freshness dates are `INGF-07`'s and discovery is `INGF-08`'s; this module has no edge to either | `05-ingestion-framework` (`INGF-07`, `INGF-08`) | `INGF-08` | The `freshness` change type in `WTCH-02`; the other seven types come from `CRPS-06`'s release diff | `docs/prd/breakdown-plan.md` §5.6 and §6.2 |
| Q-WTCH-3 | **No declared `blocked_by` edge to `DATA-06`** (research and evidence tables) although `WTCH-01` validates `source_record_id` and `WTCH-03` reads answer citations to mark records | this decomposition — `docs/prd/breakdown-plan.md` §5.17 | the first `WTCH-*` ticket that finds `DATA-06` unmerged at execution time | `WTCH-01`, `WTCH-03` | `docs/prd/breakdown-plan.md` §5.17 + §6.2 (add `DATA-06` to the `blocked_by` set). **Never stub the repository or duplicate a research query** |
| Q-WTCH-4 | **Is a shared outbound-egress guard needed?** `INGF-02`'s SSRF-safe fetcher is a `pipelines/ingestion` module that `apps/worker` cannot import, so **D10** re-implements the address policy — now in two places, since `WTCH-09` has no `blocked_by` edge to `WTCH-05` and must not import a sibling channel's subtree | `03-app-runtime` / `00-foundation`; **ADR candidate** | `WTCH-05` records the local implementation and `WTCH-09` records the second one; a shared package is a plan change | `WTCH-05`, `WTCH-09`; later `19-exports` and any other outbound caller | `docs/adr/NNNN-outbound-egress-guard.md` **and** `docs/prd/breakdown-plan.md` §4 (a new package allocation) |
| Q-WTCH-5 | **Digest delivery hour and timezone.** PRD §32.7 names the `DAILY_DIGEST` mode but no time; no PRD section gives one | `16-monitor-alerts` (`WTCH-06`) for the committed safe default; **Founder** for any customer-visible per-organisation setting | `WTCH-06` (default 08:00 `Australia/Sydney`, configuration layer 1 per PRD §39.6) | `WTCH-06` only | This README Q-WTCH-5 + `WTCH-06`; a per-organisation setting is a **product change** (PRD §45.5) and needs a `DATA-07` column |
| Q-WTCH-6 | **Where the "save search/watch" affordance is rendered.** PRD §32.1's results toolbar requires it, but breakdown-plan §4.2 keeps watch writes out of `14-search-product` | `14-search-product` (`FIND-04`, `FIND-05`) renders the link; `16-monitor-alerts` (`WTCH-07`) publishes the target | `WTCH-07` publishes the deep-link contract; `FIND-04`/`FIND-05` link to it | `WTCH-07` acceptance passes without it (the route is exercised directly) | `docs/prd/breakdown-plan.md` §4.2 if the affordance needs a shared component rather than a link. Precedent: `RCRD-09` has the identical shape |
| Q-WTCH-7 | **Secret-rotation overlap semantics.** PRD §8.8 requires "secret rotation"; no PRD section defines the overlap window | `16-monitor-alerts` (`WTCH-05`); **ADR candidate** | `WTCH-05` (**D9**: default 24 h, range 0–7 days) | `WTCH-05`, and `PLTF-07`'s developer screen which documents it | `docs/adr/NNNN-webhook-secret-rotation.md` + this README **D9**; changing the header set is a PRD change |
| Q-WTCH-8 | **A ninth change type.** If a real source change fits none of PRD §8.8's eight types, **D7** makes it silent-plus-operator-finding | **Founder** (product change), with `00-foundation` (`FND-03`) for the enum | the ticket that observes it | `WTCH-02` classification | PRD change (§45.5 "Product change") → `FND-03` enum → `docs/prd/breakdown-plan.md` §5.1/§6.2 edge → this module. **Never** emit an unstructured diff instead |
| Q-WTCH-9 | **No declared `blocked_by` edge to `RUNT-06`** (`packages/ui`), although breakdown-plan **A6** puts the shared evidence/source panel and the PRD §31.3 async-state components there and both screens need them | this decomposition — `docs/prd/breakdown-plan.md` §5.17 | the first screen ticket that finds `RUNT-06` unmerged at execution time | `WTCH-07`, `WTCH-08` | `docs/prd/breakdown-plan.md` §5.17 + §6.2 (add `RUNT-06` to the `blocked_by` set). **Never build a second component set inside `features/monitor/**`** — that is exactly what **A6** exists to prevent |
| Q-WTCH-10 | **Bounce, complaint and suppression processing.** breakdown-plan §8 **Q14** confirms the provider *and* records that this gap *"remains open until a ticket explicitly plans and implements it"*. No PRD section specifies an inbound provider webhook, a suppression list or the member-notification consequences of a hard bounce | **Founder** (product change, PRD §45.5) with `01-app-data` (`DATA-07`) for storage | a future ticket that explicitly plans it — **no ticket in this decomposition does** | Real-world deliverability of the email channel only. `WTCH-04` and `WTCH-09` both declare it a non-goal, and neither ships a silent in-memory suppression | PRD change (§45.5) → `docs/prd/breakdown-plan.md` §5.17 and §6.2 (a new ticket) + a `DATA-07` column + this README |

## 7. Work breakdown

`lane` = `16-monitor-alerts` and `agent` = `builder` for all nine (breakdown-plan §1.1). Sizes and
`blocked_by` are transcribed from breakdown-plan §5.17; `blocks` is its exact inverse from §6.2.

| Ticket | Size | Lane | File-scope (write-owns) | Depends on (`blocked_by`) |
|---|---|---|---|---|
| [`WTCH-01`](tickets/WTCH-01-watchlist-and-watch-target-routes-with-typed-normalisation.md) — Watchlist and watch-target routes with typed normalisation | M | `16-monitor-alerts` | `apps/api/src/routes/watchlists/**` | `RUNT-02`, `DATA-07` |
| [`WTCH-02`](tickets/WTCH-02-detected-change-matcher-and-single-crawl-fan-out.md) — Detected-change matcher and single-crawl fan-out | L | `16-monitor-alerts` | `apps/worker/src/handlers/change-matching/**` | `RUNT-04`, `DATA-07`, `CRPS-06` |
| [`WTCH-03`](tickets/WTCH-03-alert-creation-impact-marking-and-alert-routes.md) — Alert creation, impact marking and alert routes | L | `16-monitor-alerts` | `apps/api/src/routes/alerts/**`, `apps/worker/src/handlers/alerts/**`, `apps/worker/src/handlers/notifications/{index.ts,registry.ts,channel-contract.ts}` (**D2**) | `WTCH-02`, `FND-08` |
| [`WTCH-04`](tickets/WTCH-04-email-delivery-channel.md) — Email delivery channel | M | `16-monitor-alerts` | `apps/worker/src/handlers/notifications/email/**` **except** `providers/resend/**` (**D14**), plus `docs/adr/NNNN-transactional-email-provider.md` (**A9**) | `WTCH-03` |
| [`WTCH-05`](tickets/WTCH-05-signed-webhook-delivery-and-subscription-routes.md) — Signed webhook delivery and subscription routes | L | `16-monitor-alerts` | `apps/api/src/routes/webhook-subscriptions/**`, `apps/worker/src/handlers/notifications/webhook/**`, `docs/adr/NNNN-webhook-secret-rotation.md` (**A9**) | `WTCH-03`, `FND-05` |
| [`WTCH-06`](tickets/WTCH-06-daily-digest-and-delivery-mode-selection.md) — Daily digest and delivery-mode selection | M | `16-monitor-alerts` | `apps/worker/src/handlers/notifications/digest/**` | `WTCH-04` |
| [`WTCH-07`](tickets/WTCH-07-watchlist-screens-and-create-watch-from-source.md) — Watchlist screens and create-watch-from-source | M | `16-monitor-alerts` | `apps/web/src/features/monitor/watchlists/**`, `apps/web/src/features/monitor/feature.tsx` (**D3**) | `RUNT-05`, `WTCH-01`, `FIND-05` |
| [`WTCH-08`](tickets/WTCH-08-alerts-list-and-alert-detail-screens.md) — Alerts list and alert detail screens | M | `16-monitor-alerts` | `apps/web/src/features/monitor/alerts/**` | `WTCH-03`, `WTCH-07` |
| [`WTCH-09`](tickets/WTCH-09-resend-transactional-email-provider-adapter.md) — Resend transactional-email provider adapter | M | `16-monitor-alerts` | `apps/worker/src/handlers/notifications/email/providers/resend/**` (**D14**) | `WTCH-04` |

**Lane profile** (breakdown-plan §7: 9 tickets, min 4 waves, max useful lanes 3, peak 3, **not fully
serial**). Rounds at concurrency 3:

- Round 1 — `WTCH-01`, `WTCH-02` (no intra-module blockers)
- Round 2 — `WTCH-03`, `WTCH-07`
- Round 3 — `WTCH-04`, `WTCH-05`, `WTCH-08`
- Round 4 — `WTCH-06`, `WTCH-09`

breakdown-plan §7 states the reason the width changed: adding `WTCH-09` left the minimum wave count
**unchanged at 4** — it lands in the same wave as `WTCH-06` because both are blocked only by
`WTCH-04`, so the `WTCH-02 → WTCH-03 → WTCH-04 → …` chain does not get longer — but nine tickets
cannot fit into four waves at concurrency 2, so reaching those four waves now needs **three** lanes.

All nine file-scopes are pairwise disjoint. The three places where sibling tickets share a *directory*
— `handlers/notifications/`, `handlers/notifications/email/` and `features/monitor/` — are resolved by
**D2**, **D14** and **D3**: in each case the shared parent belongs to a single ticket that is strictly
earlier in the DAG, and the siblings own only their own leaf subtree. `docs/adr/` is shared-additive
with per-file ownership (**A9**), and the two slugs claimed here — `transactional-email-provider`
(`WTCH-04`) and `webhook-secret-rotation` (`WTCH-05`) — are distinct files.

**Cross-module dependents** (`blocks`, from breakdown-plan §6.2): `WTCH-01 → RCRD-08`;
`WTCH-05 → PLTF-07`; `WTCH-08 → ASSR-06`. Intra-module: `WTCH-04 → WTCH-06`, `WTCH-04 → WTCH-09`.

## 8. Acceptance — what makes the module done

The module is done when all nine tickets are `done` and:

1. **`MON-001`** — *"A watchlist can target documents, nodes, ABNs, topics, saved searches and record
   authorities"*; evidence *"Target normalisation and tenant isolation pass"*. All six kinds
   round-trip through `POST/GET/PATCH/DELETE /v1/watchlists`, ABNs normalise with checksum
   validation, duplicate normalised targets are rejected, and the cross-tenant id matrix returns an
   indistinguishable `RESOURCE_NOT_FOUND` (`WTCH-01`, surfaced by `WTCH-07`).
2. **`MON-002`** — *"One detected source change fans out to matching watchlists"*; evidence *"N
   matching tenants do not trigger N crawls"*. One `detected_change` row, one matching pass whose
   query count is independent of tenant count, and **zero** outbound fetches from the matcher
   (`WTCH-02`).
3. **`MON-003`** — *"Alerts identify change type, dates, before/after sources and affected records"*;
   evidence *"Alert remains useful with generated summary disabled"*. Every alert carries a
   structured PRD §8.8 change type, the PRD §32.7 detail fields, and the affected-record links, with
   no generated text anywhere in the module (`WTCH-03`, `WTCH-08`, **D6**).
4. **`MON-004`** — *"Email/webhook delivery is retryable and idempotent"*; evidence
   *"Signature/replay/retry/dead-letter tests pass"*. Deliveries are idempotent per
   `(alert, channel, destination)`, webhook signatures match PRD §34.8 byte for byte, retries follow
   the bounded exponential schedule, and terminal failure lands in dead-letter (`WTCH-04`, `WTCH-05`,
   `WTCH-06`). `WTCH-09`'s provider adapter sits underneath all of it and must not weaken any of it:
   it performs one attempt per `send()`, forwards the `alert_delivery`-derived idempotency key
   unchanged, and owns no retry loop (**D14**).
5. **`UAT-MON-01`** (PRD §41.2) — *"Promote fixture change cited by three tenants → One
   DetectedChange, tenant-isolated alerts, affected records marked correctly."* Automated end to end
   as a `[fixture]` replay across `WTCH-02`/`WTCH-03`; run by the Founder as the `[human]` Gate 2
   smoke test through `WTCH-08`'s screens; automated as an E2E script by `23-assurance`/`ASSR-06`.
6. **`UAT-MON-02`** (PRD §41.2) — *"Replay signed webhook → Receiver/test verifier rejects replay but
   original delivery remains successful."* Automated against the local in-process receiver in
   `WTCH-05`; run by the Founder at Gate 2.
7. **PRD §8.8 payload minimisation holds module-wide** — no alert, email, digest, provider request or
   webhook payload carries a complete customer question or answer by default; each of the nine tickets
   carries this as an explicit acceptance item. breakdown-plan §8 **Q14** repeats it for email
   specifically: *"Transactional email still must not contain customer questions, answers, evidence
   excerpts or Research Record content."*
8. **Offline reproducibility** — every `[machine]` and `[fixture]` criterion in the module runs with
   no network, no email provider, no real API key, no verified sending domain and no external webhook
   endpoint (**D11**; §8 **Q14** *"tests keep using offline/fake/file transports"*).
9. **PRD §20.3 CI gates** pass for every ticket: `pnpm lint`, `pnpm typecheck`, `pnpm test`,
   `pnpm generate && pnpm generated:check`.
10. **PRD §45.4** PR contract items are stated on every PR in the module, naming the `MON-*` ids and
    the `UAT-MON-*` scripts.
11. **The §8 Q14 decision is recorded, not just implemented** — `WTCH-04`'s Builder has created
    `docs/adr/NNNN-transactional-email-provider.md` with its accepted decision, rationale, rejected
    alternatives and consequences (**A9**, PRD §45.5), the credential exists only in the sealed-secret
    layer, and no key, account identifier or environment-specific DNS value appears anywhere in the
    repository.

Contributed-to but **not owned** here: `REC-004` (the workflow machine is `FND-08`; the review
surfaces are `17-records-collab`), `COR-002` (correction notification is `RCRD-07`/`INTL-08`),
`DEV-002`/`DEV-001` (webhook verification in the SDKs is `PLTF-02`/`PLTF-03`), `SEC-001` (tenant
isolation is enforced by `DATA-02` and `RUNT-02`; this module must not weaken it).

## 9. Changelog

- **v0.2 — 2026-08-03** — breakdown-plan §8 **Q14** confirmed (Resend, Free transactional-email tier,
  behind the existing `EmailTransport` port). Q14 removed from the open-question table and recorded as
  decisions **D11** (rewritten) and **D14** (new); `WTCH-09` added as the ninth ticket with
  `WTCH-04`'s file-scope narrowed to exclude `providers/resend/**`; `WTCH-04` gains the ADR decision
  input for `docs/adr/NNNN-transactional-email-provider.md` (authored by its Builder — no ADR exists
  yet); lane profile updated to 9 tickets / 4 waves / 3 useful lanes per breakdown-plan §7; non-goals
  reconciled for the provider's outbound endpoint, provisioning ownership and the standing
  bounce/complaint/suppression gap (new **Q-WTCH-10**); `Q-WTCH-4` extended to cover `WTCH-09`'s
  second copy of the address policy.
- **v0.1 — 2026-08-03** — initial decomposition from `docs/prd/breakdown-plan.md` §5.17. Eight
  tickets, four waves, two useful lanes. Records decisions D1–D13, rejected alternatives, and open
  questions Q14 (Founder), Q-WTCH-1 … Q-WTCH-9.
