# 12-evidence-safety — sub-PRD

> Module sub-PRD. Authored from `docs/prd/breakdown-plan.md` §5.13 (wave B). The **tickets** under
> `tickets/` are the executable source of truth; this file is the module's shared context. On any
> disagreement between a ticket and this file, the ticket wins (CLAUDE.md, issue #53).

| Field | Value |
|---|---|
| Module | `12-evidence-safety` |
| Lane | `12-evidence-safety` |
| Ticket prefix | `EVID` |
| Tickets | 10 (`EVID-01` … `EVID-10`) |
| PRD epics | `E19-PII`, `E20-MODEL-GATEWAY`, `E21-ANSWER` (the evidence-pack / validator / render half; the workflow half is `15-answer-product`) |
| Requirement families | `PII-001`, `PII-002`, `SEC-003`, `ANS-005`, `ANS-007`, `OPS-003` (contributes to `ANS-002`, `ANS-004`, `EXP-001`) |
| Depends on modules | `00-foundation`, `01-app-data`, `11-retrieval-engine` |
| Modules that depend on this one | `15-answer-product`, `19-exports`, `21-evaluation-600`, `22-internal-admin`, `23-assurance` |
| Languages | TypeScript only (`packages/pii`, `packages/citations`, `packages/model-gateway`) |
| Master spec | [`docs/PRD.md`](../../PRD.md) |
| Version | v0.4 (2026-08-08) |

## Problem

This module holds the product's **central safety invariant**:

> A displayed legal claim is trusted only after it is tied to exact evidence in one pinned corpus
> release and has passed deterministic validation.

PRD §21 states it as a trust rule: *"Trust customer input, official source content, customer host
pages and model output as untrusted. … trust a displayed answer only after deterministic
validation."* PRD §9.4 states it as a sequence that MUST hold:

```text
retrieve → evidence pack → structured claims → deterministic validation → render → final status check
```

and adds the two rules that decide where the code lives: *"The model may cite only system-supplied
evidence IDs. **Code MUST create source titles, links, pinpoints and status badges.**"* and
*"Hidden chain-of-thought MUST NOT be requested, stored or displayed."*

Four pressures make this one module.

1. **Three PRD §20.1 packages, one boundary.** PRD §45.2 gives `packages/pii` ("Admission
   detector/contracts", must not own "Provider generation"), `packages/citations` ("Evidence/claim
   deterministic validation", must not own "Retrieval ranking/model prose") and
   `packages/model-gateway` ("Approved profiles, provider adapters, schema/cost/retention controls",
   must not own "Product decisions or arbitrary tools") three disjoint trees and three different
   "must not own" rows. They are the whole untrusted-input boundary of the product, and no other
   module writes them.
2. **The PII gate is a *server-side* boundary or it is nothing.** PRD §10.1: *"The server MUST be the
   authoritative PII boundary before logging, persistence or provider calls"* and *"Customers MUST
   NOT bypass a positive employee-PII finding."* A client-side check can never satisfy `PII-001`; PRD
   §37.2 goes further and forbids even the escape hatch (*"not a generic 'ignore warning' button"*).
   This has to be a package the API and worker call, not a screen behaviour.
3. **Validation must be mechanical, not persuasive.** PRD §36.6 lists twelve checks with twelve named
   failure consequences, ranging from "reject claim" to "fail entire execution as integrity
   incident". PRD §14.3: *"Deterministic checks control legal/citation launch gates."* `ANS-005`'s
   acceptance evidence is *"Unsupported definitive claim count is zero"* and PRD §14.2 gates it at
   exactly zero. A check that can only be enforced by asking a model is not a check.
4. **Everything downstream waits here.** `ASK-01` (answer admission), `ASK-02` (Quick workflow),
   `ASK-06` (Ask form), `XPRT-02`/`XPRT-03` (PDF/DOCX), `GOLD-14`/`GOLD-15` (safety cases and profile
   promotion), `INTL-07` (cost console) and `ASSR-02`/`ASSR-03`/`ASSR-04` (security, PII no-leak and
   citation suites) all carry a `blocked_by` edge into this module (breakdown plan §6.2).

## Scope

In scope — the module's breakdown plan §4 write-owns row:

- `packages/pii/**` — the PRD §37.2 admission pipeline: request byte/field limits, deterministic
  patterns and checksums, local entity recognition, contextual public-entity allow rules,
  combination/risk rules, the accept-sanitized/reject-with-offsets contract, and the PRD §10.1
  availability split.
- `packages/citations/**` — the PRD §36.4 evidence pack and untrusted-content delimitation, the PRD
  §36.6 twelve-check deterministic validator with one bounded repair, PRD §11.1 licence-aware
  quotation/display/export limits, and PRD §36.6/§37.5 output sanitisation and code-generated URLs.
- `packages/model-gateway/**` — the PRD §14.4 profiles, provider adapters with no tool surface, PRD
  §36.5/§37.5 schema enforcement, the PRD §42.6 reservation/settlement circuit breaker and PRD §16.4
  BYOK.

Out of scope in one line: **this module decides what may be sent to a provider and what may be
displayed; it never orchestrates a workflow, owns a route, renders a screen, or writes a table.**

## Non-goals

Each names its owner module/ticket or standing reason.

| Not in this module | Owner / reason |
|---|---|
| Answer job admission, the Quick/Deep workflow, clarification, snapshots, SSE stages, Coverage, Compare | `15-answer-product` (`ASK-01` … `ASK-12`). `ASK-01` is `blocked_by EVID-03`+`EVID-08`; `ASK-02` is `blocked_by EVID-05`+`EVID-07`. PRD §18.5 puts the sequence in app/worker; this module supplies the callable boundary. |
| Retrieval, ranking, hard-filter execution, evidence *candidate* assembly, the search process | `11-retrieval-engine` (`RETR-01` … `RETR-10`). PRD §45.2 forbids `packages/citations` to own "Retrieval ranking". `EVID-04` consumes `RETR-09`'s typed client and `RETR-08`'s `EvidenceCandidate`; it never re-ranks. |
| The **local** embedding and rerank runtime, its model artefacts and its tokenizer | `11-retrieval-engine` (`RETR-07`), executing inside the search boundary (PRD §17.3). Breakdown plan §8 **Q11** is a **confirmed** architecture decision — Microsoft ONNX Runtime, CPU-only, through an exactly pinned `ort` crate — and implementing it is module 11's work, not this module's to revisit. `packages/model-gateway` is the **hosted-provider** boundary: it loads no local model, holds no ONNX or tokenizer artefact, and treats `QUERY_EMBEDDING`/`LOCAL_RERANK` as local profiles that are a typed error if invoked through it (`EVID-07`). Q11 settles nothing about `packages/pii`'s own local entity recogniser — that is **Q-EVID-1** below. |
| `AnswerStatus`, `ClaimSupport`, `CitationRole`, the §36.8 refusal table, the §36.2 eligibility predicate, the §9.1 hierarchy, budget arithmetic | `00-foundation` (`FND-03`, `FND-07`, `FND-09`, `FND-10`). PRD §45.2: `packages/domain` owns "Pure permissions, state transitions, evidence/budget rules". This module *calls* those decisions; a second copy would be the "Duplicated business rules" §45.2 forbids. |
| Every app/ephemeral table, migration, TenantContext repository and field-encryption primitive | `01-app-data` (`DATA-02`, `DATA-03`, `DATA-07`). Breakdown plan **A3** and PRD §45.2 give `packages/database` exactly that scope. `EVID-07`/`EVID-08`/`EVID-09` write `model_execution` and `usage_ledger` rows **through** those repositories. |
| PII hint UI, placeholder buttons, the Ask form, the answer result screen, the evidence panel component | `15-answer-product` (`ASK-06`, `ASK-07`) and `03-app-runtime` (`RUNT-06`, breakdown plan **A6**). PRD §10.1 makes client hints advisory (*"SHOULD provide immediate PII hints"*) — they never satisfy `PII-001`. |
| Export jobs, S3 lifecycle, signed URLs, PDF/DOCX/JSON renderers | `19-exports` (`XPRT-01` … `XPRT-05`). `XPRT-02`/`XPRT-03` are `blocked_by EVID-06`; they call the limits, they do not define them. |
| The cost console, kill-switch UI, incident workflow, `/internal/v1` routes | `22-internal-admin` (`INTL-07`, `INTL-09`) and `01-app-data` (`DATA-07`). This module *consults* kill-switch state and *emits* cost metadata; it does not own the switch or the screen. |
| The 600 evaluation cases, gold answers, metrics, gates, model-profile promotion | `21-evaluation-600` (`GOLD-14`, `GOLD-15`, `GOLD-17`). Per breakdown plan **R9** and PRD §14.3 (*"Blind gold answers MUST remain outside ordinary coding-agent context"*), **no ticket in this module reads `evals/gold/**`**; every fixture here is authored inside the module's own tree. |
| Cross-boundary suites (`tests/security/pii/**`, `tests/integration/citations/**`, SSRF/XSS suites) | `23-assurance` (`ASSR-02`, `ASSR-03`, `ASSR-04`). Breakdown plan §1.1: unit/integration tests live inside the owning package. `23-assurance` confirms; it does not discover (plan **R8**). |
| Source fetching, parser/OCR isolation, licence *registry* and assessment authoring | `05-ingestion-framework` (`INGF-02`, `INGF-04`, `INGF-06`). `EVID-06` consumes a `LicenceAssessment`; it never assesses a source. |
| Choosing the exact hosted model per profile, and any policy-permitted optional hosted reranker/fallback | **Benchmark-selected** — breakdown plan §8 **Q1** (PRD §1, §14.4). The choice is made by comparing accuracy, zero-tolerance failures, latency, provider availability and cost through the evaluation pipeline; `GOLD-15` records the promotion report, and the Founder approves production promotion **after** seeing that evidence rather than picking a model on preference beforehand. `EVID-07` continues to build against provider/profile abstractions and stubs, so nothing in this module waits on it. Provider **commercial terms and retention posture** are a separate, still-open question — **Q-EVID-4** below. |

## Decisions

Each decision states its basis: a PRD section, a `00-foundation` sub-PRD decision, or a breakdown
plan §2.1 ADR candidate. Where the PRD does not answer, the item is an open question below, not a
decision.

| # | Decision | Basis |
|---|---|---|
| D1 | **The PII gate is the authoritative server-side boundary and fails closed.** `packages/pii` exposes one admission entry point that runs before logging, persistence, job creation or any provider call. Browser/widget hints are advisory input that the server recomputes from scratch; a client result is never trusted, never short-circuits a stage, and never satisfies `PII-001`. | PRD §10.1 *"The server MUST be the authoritative PII boundary before logging, persistence or provider calls"*; §37.2 pipeline (*"browser hints (not trusted)"* is literally the first line); §18.5 step 1. |
| D2 | **There is no bypass, at any layer.** No parameter, header, role, flag or support tool can convert a positive employee-PII finding into an accepted request. The absence is structural: the admission request type has no override field and the result type has no "accepted with warnings" state for a blocked category. | PRD §10.1 *"Customers MUST NOT bypass a positive employee-PII finding"*; §37.2 *"not a generic 'ignore warning' button"*. |
| D3 | **A finding never carries the detected value, and nothing derived from it is reversible.** Findings carry field, character range, category and a suggested placeholder only. Metrics record category, count and result. There is no debug mode, no sampling and no hash of detected text anywhere in the module. | PRD §37.2 *"Detection response includes field, character range, category and suggested placeholder but never echoes the detected value"* and *"Metrics record category/count/result, not content or reversible hash"*; §37.3 row "Blocked raw PII — Never / Never / Never / Never". |
| D4 | **Public-entity exceptions are structural, not textual.** Employer name, ABN and public case party are accepted only when they arrive in the dedicated structured fields; the same string in free text is treated by the ordinary rules. | PRD §37.2 *"Public-entity exceptions must come from structured `employer`, `abn` or `public_case_party` fields"*; §10.1; §37.1 allowed column. |
| D5 | **Detector unavailability degrades by *operation class*, not globally.** Public legal Search continues; free-text Ask, Compare and Coverage fail closed with `GENERATION_UNAVAILABLE` (503). No new error code is invented — PRD §34.9's existing 503 row already means *"Search remains available; retry when status recovers"*. | PRD §10.1 final bullet; `PII-002`; §34.9; §8.2; §36.8 final row. |
| D6 | **Evidence is code-constructed and per-call opaque.** `EVID-04` assigns the `evidence_id` values; every other §36.4 field is copied from corpus/release metadata supplied by `RETR-08`. The model receives no source identifier it may not cite and constructs no title, link, pinpoint or badge. | PRD §36.4; §9.4 *"The model may cite only system-supplied evidence IDs. Code MUST create source titles, links, pinpoints and status badges."*; `RETR-08` deliverable 6 (which deliberately omits `evidence_id`). |
| D7 | **Untrusted-source delimitation uses a per-call unforgeable nonce.** The delimiter token embeds a cryptographically random per-call nonce; any occurrence of that token, or of the delimiter grammar, inside evidence text is neutralised before assembly. Evidence is prefaced with the invariant that instructions inside it are data. | PRD §36.4 *"Source text is delimited as untrusted evidence and prefaced with the invariant that instructions inside it are data. It cannot change the legal date, request tools, select URLs or alter output policy."*; §21.1 *"Evidence delimited as data; source instructions cannot select tools, URLs, providers or scope"*; `UAT-ANS-04`. |
| D8 | **The validator is a pure function.** `EVID-05` takes `(evidence pack, parsed model output, request)` and returns findings plus signals. It performs no I/O, holds no credential, and never calls a provider. The single §36.6 repair call is made through an **injected port** that `ASK-02` backs with `EVID-07`'s `STRUCTURED_REPAIR` profile — so `packages/citations` stays free of provider code as PRD §45.2 requires. | PRD §36.6; §45.2 (`packages/citations` must not own "model prose"); §9.4. |
| D9 | **Validator consequences are typed and graded, and one of them is fatal.** The finding type carries exactly the PRD's consequence: `REJECT_CLAIM`, `REJECT_CITATION`, `DOWNGRADE_TO_BACKGROUND`, `ISOLATE_FUTURE_SECTION`, `TRIM_OR_METADATA_ONLY`, `REPLACE_URL`, `SANITISE`, `REPAIRABLE` and `FAIL_EXECUTION_INTEGRITY_INCIDENT`. The last is reserved for exactly one check — version/node outside the pinned release — and aborts the whole execution. | PRD §36.6 table, especially *"Version/node belongs to pinned release → Fail entire execution as integrity incident"*; §35.8 invariant 3. |
| D10 | **The validator produces signals; `FND-07` decides the status.** `EVID-05` emits the `decideAnswerStatus` signal record and never selects an `AnswerStatus` itself. | PRD §45.2 (no "Duplicated business rules" outside `packages/domain`); `FND-07` deliverable 2 and its feedback item 2. |
| D11 | **One repair call, structurally.** The repair port's input type carries only structured findings and a reference to the *same* pack (identity checked by pack hash before and after). It has no field for new candidates, a new query, a new date or a widened scope, and the loop counter is a type-level `0 \| 1`. After repair, failing claims are deleted, not softened. | PRD §36.6 *"One repair call may receive only structured validation findings and the same evidence pack. It cannot retrieve new evidence or expand scope. After repair, failed claims are deleted."* |
| D12 | **Licence limits are one function used by both surfaces.** `EVID-06` exports a single limit-application function; the answer screen (via `packages/ui`) and the PDF/DOCX exporters call the same one, so a limit cannot hold in the UI and lapse in an export. Trimming is visible, never silent. | PRD §11.1 *"Customer exports MUST apply the same restrictions"*; §8.9 *"Licensing rules MUST restrict excerpt length"*; §36.6 *"Trim/metadata-link-only; never bypass"*. |
| D13 | **The model gateway has no tool surface, enforced by an architecture test.** The package imports no database driver, no `child_process`, no mailer, no webhook client and no browser automation; it opens no URL outside the per-profile allowlist. | PRD §37.5 *"The model gateway exposes no shell, Web, database, email, webhook or arbitrary tool"*; §21.1 *"Model has no arbitrary Web, shell, database or customer-data tools"*; §16.4 *"Arbitrary base URLs are prohibited"*. |
| D14 | **No hidden chain-of-thought exists as a type anywhere in this module.** No request asks for reasoning traces, no response type has a field capable of carrying one, no persisted structure stores one, and a provider response containing an unknown reasoning field is a schema failure, not a silently-dropped extra. Concise reasoning *summaries*, assumptions and evidence mappings are ordinary §36.5 fields and are allowed. | PRD §9.4 *"Hidden chain-of-thought MUST NOT be requested, stored or displayed. Concise reasoning summaries, assumptions and evidence mappings MAY be shown."* |
| D15 | **Every provider call is replayable offline.** Each adapter has a recorded-cassette transport; the whole module's test suite runs with no network and no provider key. A record mode exists but is off by default and never runs in CI. | Breakdown plan §1.1 acceptance-tag mapping (recorded provider responses → `[fixture]`); PRD §20.3 (CI gates run per PR); §20.2 (*"Coding agents MUST NOT receive production … provider credentials by default"*). |
| D16 | **No unvalidated fallback, ever.** Provider failure, schema failure, kill switch or budget exhaustion produce `GENERATION_UNAVAILABLE`; they never select a different model, a smaller model, a cached answer or an unstructured completion. A fallback profile exists only if it is itself an approved §14.4 profile. | PRD §17.3 *"No unvalidated fallback is permitted during provider failure or budget exhaustion"*; §14.4 *"Every fallback requires independent approval"*; `ANS-007`; §42.5 row "Global generation". |
| D17 | **A hosted call is impossible without a held reservation.** The provider-call entry point takes a `HeldReservation` value that only `EVID-08` can mint, and settlement is idempotent per job attempt. Under at-least-once worker delivery this yields one charge per answer. | PRD §42.6 *"Before a hosted call the gateway computes a conservative reservation … Admission requires both operation quota and funding-ledger balance"*; §35.8 invariant 2; §18.5; `UAT-ANS-01`. |
| D18 | **Search is never gated on a generation ledger.** Nothing in `packages/model-gateway` is on the Search path, and the budget module exports no function Search could call. A 100% circuit-breaker state leaves Search and saved records fully available. | PRD §8.2; §26 *"Search remains available independently of hosted-generation budget"*; §36.8 final row; `OPS-003`; `FND-09` deliverable 10. |
| D19 | **BYOK changes who pays and nothing else.** A BYOK key is decrypted only inside the gateway at call time, is never logged, exported or shown to support, and cannot introduce a base URL, a model, a retention policy or a limit that the platform has not approved. | PRD §16.4 *"decrypted only inside the Model Gateway and excluded from logs/exports/support. Arbitrary base URLs are prohibited. BYOK changes who pays and whose provider contract governs retention; it does not bypass model allowlists, evidence, validation, safety, abuse or rate limits."* |
| D20 | **Rendering rejects rather than repairs unknown links.** A URL the model emitted that is not a code-generated official URL present in the pack is removed and counted — never rewritten into something plausible. Raw HTML in model output is removed outright rather than sanitised-and-kept. | PRD §36.6 rows 11–12 (*"Replace model URL; reject unknown URL"*, *"Escape/remove unsafe output"*); §37.5; §21.1 *"suggestions do not execute automatically"*; `SEC-003`. |
| D21 | **Test and manifest layout.** Each ticket owns `packages/<pkg>/test/<its own area>/**` matching its `src/` area name. `packages/{pii,citations,model-gateway}/package.json` and `tsconfig.json` are created by `FND-01` and are **module-shared, append-only** — a ticket adds only its own dependency lines. Root `pnpm-lock.yaml` is regenerated as a build artifact, never hand-merged. | Breakdown plan §1.1 ("Package manifests", "Tests"); PRD §44.3. |
| D22 | **Every fixture in this module is synthetic and authored here.** PII corpora use invented identifiers with documented canary tokens; provider cassettes are recorded against stubs; evidence packs are built from `CRPS-08`-shaped fixtures. Nothing reads `evals/gold/**` and nothing contains real customer or production data. | PRD §45.1 item 6 (*"Never expose blind evaluation gold data, production credentials or customer content to coding agents"*); §10.2; breakdown plan **R9**. |

## Rejected alternatives

| Rejected | Why |
|---|---|
| **Trust the browser/widget PII check** and skip server detection when the client says the payload is clean. | PRD §10.1: the server *"MUST be the authoritative PII boundary"*, and PRD §37.2's pipeline opens with *"browser hints (not trusted)"*. `PII-001`'s acceptance evidence is a server-side synthetic suite. |
| **An "I confirm this is anonymous" acknowledgement** that lets a customer proceed past a positive employee-PII finding. | PRD §10.1 *"Customers MUST NOT bypass a positive employee-PII finding"*; §37.2 explicitly rejects *"a generic 'ignore warning' button"*. Replaced by D2/D4: the only route past a false positive is a structured field or a detector-category report carrying no original text. |
| **Store a salted hash of blocked PII** for deduplication or abuse analysis. | PRD §37.2: metrics record *"category/count/result, not content or reversible hash"*; §37.3 marks blocked raw PII "Never" in all four columns. |
| **Let the model emit source titles, links or pinpoints** and validate them afterwards. | PRD §9.4: *"Code MUST create source titles, links, pinpoints and status badges."* Validation-after-the-fact still means a model URL can be displayed if a check is missed; D6/D20 make model-authored links unrepresentable. |
| **Ask the model for its chain-of-thought** so the validator has more to check. | PRD §9.4 forbids requesting, storing or displaying it. D14 removes the field entirely so it cannot be added by accident. |
| **Ask the model for a confidence percentage** and threshold on it. | PRD §36.8: *"numeric model-confidence percentages are prohibited. Uncertainty is represented by status, assumptions, missing facts, conflicts and evidence roles."* `FND-07` deliverable 5 detects the language. |
| **Use an LLM judge as the validator** (or as a tiebreaker on a §36.6 check). | PRD §14.3: a pinned judge *"MUST NOT decide legal correctness, binding status, date applicability or release alone"*; PRD §9.4 requires *deterministic* validation. The judge exists, is non-deciding, and belongs to `21-evaluation-600` (`GOLD-04`). |
| **Loop repair until the claims validate.** | PRD §36.6: *"One repair call…"*. An unbounded loop also breaks the §36.7 hosted-call caps (Quick: 1 + optional repair) and the §24 budget. Replaced by D11. |
| **Let the repair call retrieve more evidence** when the findings show a gap. | PRD §36.6: *"It cannot retrieve new evidence or expand scope."* A gap is `INSUFFICIENT_EVIDENCE` (§36.8), which is a correct product outcome, not a failure to work around. |
| **Fall back to a cheaper/other model when the budget or provider fails.** | PRD §17.3 *"No unvalidated fallback is permitted"*; `ANS-007`'s evidence is *"Failure matrix produces explicit unavailable/status response"*. Replaced by D16. |
| **Allow a BYOK customer to set a custom base URL** so they can use their own gateway. | PRD §16.4 *"Arbitrary base URLs are prohibited."* It would also make the §37.5 no-tool boundary and the §10.2 retention guarantees unverifiable. |
| **Enforce licence quote limits only in the UI**, since exports are generated from the same snapshot. | PRD §11.1 *"Customer exports MUST apply the same restrictions"*; PRD §8.9 repeats it. Two enforcement points drift; D12 makes it one function. |
| **Silently truncate a quote to fit a licence limit.** | PRD §36.6 *"Trim/metadata-link-only; never bypass"* — and a silently shortened quote is a citation hazard, because PRD §36.6 also requires quote offsets to reproduce exact evidence text. Trimming is visible and offset-consistent (D12). |
| **Sanitise and keep raw HTML** from model output. | PRD §37.5 renders Markdown *"through an allowlist"* and sanitises HTML; the smaller, provable rule is to remove raw HTML entirely (D20). `SEC-003`'s evidence is *"Prompt-injection/XSS/invalid-URL fixtures pass"*, which a removal rule passes trivially and a sanitiser passes only as well as its blocklist. |
| **Put PII detection inside `services/search-rs`** because PRD §17.3 lists "PII pre-screening" as an online-local task. | PRD §37.2 makes it an *admission* boundary that runs *before* logs, persistence, jobs and provider calls — i.e. before search is called at all (§18.5 steps 1–4). `11-retrieval-engine`'s sub-PRD already records this as a non-goal on its side. |
| **Fail Search when the PII detector is unavailable**, for uniformity. | PRD §10.1: *"If authoritative detection is unavailable, public legal search MAY continue but free-text Ask/Compare/Coverage MUST fail closed."* `PII-002` tests exactly this split. |
| **One `packages/safety` holding all three concerns.** | PRD §20.1 and §45.2 name the three packages separately with different "must not own" rows; merging them makes the module a single write-set, and breakdown plan §7 requires ≥2 useful lanes (this cut reaches 4). |
| **Have `EVID-05` import `EVID-06`/`EVID-10` for the licence and sanitisation checks.** | Both are `blocked_by EVID-05`; the import direction would invert the DAG. Replaced by ports: `EVID-05` ships conservative built-in behaviour for §36.6 rows 10–12 and `EVID-06`/`EVID-10` refine it through the declared port. |

## Open questions

None blocks the module's first wave. Each names an owner and the artifact that resolves it.

One breakdown plan §8 register entry is carried here. **Q1** is a *benchmark-selected* parameter —
settled by measured evidence through `GOLD-15`, not a Founder decision waiting to be taken, and never
something an implementing agent may settle by preference. Plan §8 **Q11** (the local embedding and
rerank runtime: Microsoft ONNX Runtime, CPU-only, through an exactly pinned `ort` crate, owned by
`RETR-07` in `11-retrieval-engine`) is a **confirmed** decision and is therefore not an open question
here; it is recorded in Non-goals above and must not be re-litigated. `Q-EVID-1` … `Q-EVID-8` are this
module's own questions. **`Q-EVID-1` is CLOSED by `EVID-02`** (2026-08-08) — see the row below and
the writeback section that follows the table. `Q-EVID-2` … `Q-EVID-8` remain open exactly as
authored.

| # | Question | Owner | Resolved by | Blocks | Basis |
|---|---|---|---|---|---|
| **Q1 (plan §8)** | **Exact hosted model per profile** (`QUICK_SYNTHESIS`, `DEEP_SYNTHESIS`, `STRUCTURED_REPAIR`, `EVALUATION_JUDGE`, and any policy-permitted optional hosted reranker/fallback). **Status: benchmark-selected** — chosen by comparing accuracy, zero-tolerance failures, latency, provider availability and cost through the evaluation pipeline, never by preference. | `21-evaluation-600`; the Founder approves production promotion **after** seeing the benchmark evidence (PRD §14.4) | `GOLD-15` (`blocked_by EVID-07`), which records the promotion report and pins the promoted profile | Production promotion only — `EVID-07` continues to build against provider/profile abstractions and stubs | PRD §14.4, §17.3; plan §8 Q1 |
| **Q-EVID-1 — CLOSED (2026-08-08, `EVID-02`)** — resolved by [`docs/adr/0001-local-pii-entity-runtime.md`](../../adr/0001-local-pii-entity-runtime.md): *ship the rule/gazetteer recogniser as the local entity-recognition runtime for v1; define the pinned-model runtime as a port plus a hash-verifying loader contract; select no artifact and ship none.* | **Local entity-recognition runtime for `EVID-02`.** PRD §17.3 lists "local entity recognition"/"PII pre-screening" as online-local work and PRD §18.2 says "small pinned … runtime", but names no library. This is **not** plan §8 **Q11**: that entry confirms the *embedding and rerank* runtime inside `11-retrieval-engine` (`RETR-07`) and settles nothing about the PII recogniser in `packages/pii`, which is this module's to choose. **ADR candidate** (durable dependency + a model artifact that must ship inside the release archive and the §39.2 `app` 320 MiB budget). | `12-evidence-safety` (`EVID-02`) | `EVID-02`, which records the choice in a new `docs/adr/NNNN-local-pii-entity-runtime.md` (plan **A9**: the creating ticket claims the file) | Nothing — `EVID-02` ships a deterministic gazetteer/rule recogniser behind the same port, so CI never needs a model | PRD §17.3, §18.2, §21.1 (*"no arbitrary runtime plugin/model/code download"*), §45.5 |
| **Q-EVID-2** | **The configured PII recall target.** `PII-001`'s evidence is *"Synthetic PII suite meets **configured** recall and zero raw logging"* — the PRD sets no number, and the number is a risk decision, not an engineering one. | **Founder** (product/risk, PRD §45.5), staged through `12-evidence-safety` | `EVID-02` records the measured recall/precision per category on its synthetic corpus; the *target* is confirmed by the Founder and re-measured by `ASSR-03` and `GOLD-14` | Nothing — the blocked-category list (§37.1) and zero-raw-logging are absolute today | PRD §30.2 `PII-001`, §10.1, §37.1 |
| **Q-EVID-3** | **The default quote limit when a `LicenceAssessment` states none.** PRD §11.1 says unclear rights default to *"metadata, limited quotation and official links"* without a character count, and §36.4's `licence_quote_limit` may be absent. | `12-evidence-safety` (`EVID-06`) proposes; **Founder** approves the customer-visible default; `05-ingestion-framework` (`INGF-04`) owns the assessment fields | `EVID-06` (initial conservative default recorded in the ticket); reviewed with `INGF-04` | Nothing — `PROHIBITED`/`METADATA_AND_LINK_ONLY` behaviour is fixed by §11.1 | PRD §11.1, §36.4, §36.6, §8.9 |
| **Q-EVID-4** | **Which providers actually offer no-training with zero or approved minimal retention**, and under whose contract. | **Founder** (commercial), with `21-evaluation-600` for capability | `GOLD-15` + the Founder's provider decision; `EVID-07` encodes the requirement as a per-profile precondition that an unconfigured provider fails | Production promotion only | PRD §10.2, §14.4, §16.4 |
| **Q-EVID-5** | **How "contradictory higher/equal authority is *unaddressed*" is decided deterministically** (PRD §36.6 row 9). This is the §36.6 check most at risk of not being mechanical, and D8/§9.4 do not permit resolving it by asking a model. | `12-evidence-safety` (`EVID-05`) | `EVID-05` ships an evidence-derived rule (a `CONTRADICTS`-role citation, or a higher/equal-authority pack item on the same pinpoint, that no claim addresses) and reports its behaviour; falsified by `GOLD-14`/`GOLD-17` conflict cases | Nothing today — the conservative outcome (`CONFLICTING_SOURCES`) is the safe one | PRD §36.6, §36.8, §9.1, §14.3 |
| **Q-EVID-6** | **Where the customer-visible PII category vocabulary lives.** `UAT-PII-01` requires the block response to name *categories* and offsets, which makes the list part of the §34.9 `EMPLOYEE_PII_DETECTED` error detail — but `FND-03`'s enum families (its deliverable 1) do not include a PII family, and this module may not write `packages/contracts` (PRD §44.3 serial-owned). | `00-foundation` (`FND-03`/`FND-04`) with `12-evidence-safety` (`EVID-01`) | `EVID-01` defines the vocabulary in `packages/pii/src/contract/**` as the initial owner and reports it; promoting it into `packages/contracts` is a docs PR against `FND-03`/`FND-04` **plus** a `blocked_by` edge in plan §5.13/§6.2 | Nothing — `apps/api` can map the module's vocabulary today | PRD §34.9, §37.2, §41.2 `UAT-PII-01`, §44.3 |
| **Q-EVID-7** | **Who owns the BYOK configuration route/screen.** PRD §16.4 gives Owner/Admin the capability, but no ticket in plan §5 owns a BYOK endpoint or `/settings` screen; `EVID-09` owns only the gateway-side key handling. | `12-evidence-safety` (`EVID-09`) raises it; owner of the resulting ticket is `13-identity-surface` or `22-internal-admin` | A plan change (`docs/prd/breakdown-plan.md` §5) before any route is written — never by adding a route inside this module | — | PRD §16.4, §31.2; plan §4 |
| **Q-EVID-8** | **Whether `EVID-04` may hard-import `FND-10`'s eligibility predicate.** PRD §36.2 requires the hard filter to run *"again before evidence-pack construction"*, and `FND-10`'s ticket names `EVID-04` as that call site — but plan §5.13 gives `EVID-04` blockers `FND-07` and `RETR-09` only, and inventing the edge would break `dag-scan.mjs` parity with the plan. | `12-evidence-safety` (`EVID-04`) with `00-foundation` (`FND-10`) | `EVID-04` consumes the predicate through a **structural port** with `FND-10`'s exact signature (the same device `FND-07` uses for `compareAuthority`) and reports parity. A required hard edge is a docs PR against plan §5.13 **and** §6.2 | Nothing — `RETR-08` already re-applies the filter inside the search boundary, and `EVID-04` re-checks the code-supplied metadata | PRD §36.2; plan §5.13, §6.2; `FND-10` non-goals |

### Open-question status — writeback from `EVID-01` (2026-08-08)

The rows above stay open; what follows is the evidence `EVID-01` produced, recorded here so the
decider is not asked to decide without it.

**Q-EVID-2 — the configured PII recall target.** `EVID-01` shipped the measurement, not the target.
Measured over the synthetic corpus in `packages/pii/test/deterministic/corpora/**` and committed to
`packages/pii/test/deterministic/recall-report.json` (regenerated by the test run, never hand-written):

| Category | Positives | Recall | Negatives | False positives | Precision |
|---|---|---|---|---|---|
| `EMPLOYEE_OR_PRIVATE_INDIVIDUAL_NAME` | 22 | 1.0 | 27 | 0 | 1.0 |
| `PRIVATE_CONTACT_EMAIL` | 22 | 1.0 | 27 | 0 | 1.0 |
| `PRIVATE_CONTACT_PHONE` | 22 | 1.0 | 27 | 0 | 1.0 |
| `PRIVATE_SOCIAL_IDENTIFIER` | 20 | 1.0 | 27 | 0 | 1.0 |
| `HOME_ADDRESS_OR_PRECISE_LOCATION` | 20 | 1.0 | 27 | 0 | 1.0 |
| `TAX_FILE_NUMBER` | 24 | 1.0 | 27 | 0 | 1.0 |
| `BANK_OR_CARD_DETAIL` | 20 | 1.0 | 27 | 0 | 1.0 |
| `MEDICARE_NUMBER` | 22 | 1.0 | 27 | 0 | 1.0 |
| `PASSPORT_NUMBER` | 20 | 1.0 | 27 | 0 | 1.0 |
| `DRIVER_LICENCE_NUMBER` | 20 | 1.0 | 27 | 0 | 1.0 |
| `EMPLOYEE_OR_PAYROLL_IDENTIFIER` | 20 | 1.0 | 27 | 0 | 1.0 |
| `PAYSLIP_OR_PERSONNEL_EXTRACT` | 20 | 1.0 | 27 | 0 | 1.0 |
| `EXACT_DATE_OF_BIRTH` | 20 | 1.0 | 27 | 0 | 1.0 |
| `IDENTIFYING_COMBINATION` | 0 (**20 deferred**) | **0.0** | 27 | 0 | 0.0 |
| `REQUEST_LIMIT_EXCEEDED` | 20 | 1.0 | 20 | 0 | 1.0 |

**Read these numbers as what they are.** They are recall against a corpus this module authored, so
they measure "the detectors do what their own cases say", not "the detectors catch real-world PII".
The honest signal in the table is the **`IDENTIFYING_COMBINATION` row at 0%** — PRD §37.1 blocked row
7 has twenty authored cases and no detector, because it *is* the combination/risk stage PRD §37.2
places after entity recognition and `EVID-01`'s Non-goals assign to `EVID-02`. `EVID-01` floors only
the three checksum-verifiable categories at 100% (deliverable 12); the rest are recorded. **The
target remains the Founder's**, and lowering a floor stays a PRD §45.5 risk decision.

**Q-EVID-6 — where the PII category vocabulary lives.** Still open, still `00-foundation`'s to
resolve. `EVID-01` owns it locally at `packages/pii/src/contract/category.ts`, shaped exactly like a
`FND-03` enum family (`PII_CATEGORY_VALUES` frozen tuple + derived union + `isPiiCategory` guard) so
promotion into `packages/contracts` is a file move, not a rename. **One member is not a PRD §37.1
row:** `REQUEST_LIMIT_EXCEEDED`, added by the `EVID-01` ticket amendment §0.1 because deliverable 6
requires a limit violation to be a `REJECT` *with a finding*, and `PiiFinding.category` is a
`PiiCategory` with no other channel. A promotion of this vocabulary inherits that member and the
reason for it.

**Shared primitive — the ABN mod-89 check (ticket Feedback obligation).** `14-search-product` needs
the same check for `INVALID_ABN` (`UAT-SRCH-04`, PRD §34.9). `EVID-01` exports `isValidAbn` from
`packages/pii/src/deterministic/index.ts` so there is one owner to depend on. **A second
implementation is the failure mode**; the resolution is one owner plus a dependency edge, raised on
`docs/prd/breakdown-plan.md` §4.2 as a contested primitive.

**Consequence of failing closed, recorded so `14-search-product` and `15-answer-product` are not
surprised.** A valid eleven-digit ABN pasted into *free text* may still be blocked (a Medicare-shaped
eleven-digit run can fire, and blocking wins). The supported channel for a public ABN is the
structured `abn` field, which is exactly what PRD §37.2 and `UAT-PII-02` require.

### Open-question status — writeback from `EVID-02` (2026-08-08)

**Q-EVID-1 — the local entity-recognition runtime. CLOSED.** Recorded in
[`docs/adr/0001-local-pii-entity-runtime.md`](../../adr/0001-local-pii-entity-runtime.md), the
repository's first ADR (breakdown plan **A9**). Decision, in one line: **ship the rule/gazetteer
recogniser for v1; define the pinned-model runtime as a port plus a pure, hash-verifying loader
contract; select no artifact and ship none.** Three options were considered and the **hosted
service was rejected outright** — PRD §17.3 makes this task local and PRD §10.1 forbids sending
unadmitted customer text anywhere, so detecting PII by shipping it to a provider would be the exact
failure `PII-001` exists to prevent. The decisive constraint is mechanical rather than a preference:
`packages/pii/test/contract/purity.test.ts` (`EVID-01`, unmodifiable by `EVID-02`) asserts that every
module specifier under `packages/pii/src/**` is relative, so this package cannot read a file, hash
bytes, read an environment variable or open a socket — a model runtime's impurity has to be injected
by the host. `ENTITY_ARTIFACT_PINS` is an empty frozen tuple: **empty by decision, not by omission**.
Consequences: **`RLSE-01`'s release archive gains nothing** (no model file, no licence text, no SBOM
entry, no new scan target); `EVID-03` consumes the three-state `readiness()` accessor, which never
defaults to `READY`; no new dependency and no `pnpm-lock.yaml` change.

**Q-EVID-2 — the configured PII recall target. Still open, still the Founder's.** `EVID-02` shipped
the measurement for PRD §37.2 stages 4–6, committed to
`packages/pii/test/entity/recall-report.json` (recomputed by the test run, never hand-written):

| Category | Positives | Recall | Negatives | False positives | Precision | Detected by stage |
|---|---|---|---|---|---|---|
| `EMPLOYEE_OR_PRIVATE_INDIVIDUAL_NAME` (unlabelled, stage 4) | 47 | **1.0** | 64 | 0 | 1.0 | entity 47 |
| `IDENTIFYING_COMBINATION` (stage 6) | 22 | **1.0** | 44 | 0 | 1.0 | combination 22 |

**`IDENTIFYING_COMBINATION` is no longer at 0%.** `EVID-01` reported it at 0% with twenty `deferred`
cases owned by this ticket; all twenty now produce a `BLOCKING` finding, and
`packages/pii/test/context/stages-regression.test.ts` proves it the honest way — it replays
`EVID-01`'s entire corpus under `CONSERVATIVE_STAGE_DEFAULTS` and under `PII_STAGES` and asserts that
the **only** decision changes are those twenty ids, that no case flips `REJECT → ACCEPT`, and that
no §37.1 allowed row changes outcome.

**Read these numbers as what they are.** They are recall against corpora this module authored, so
they measure "the rules do what their own cases say", not "the recogniser catches real-world names".
**The named blind spots** — recorded here so the next measurement does not rediscover them, and so
the number is not mistaken for coverage: scripts without case (**CJK, Arabic, Hebrew, Thai are not
covered at all** — every rule keys on `\p{Lu}`), all-lower-case names, bare mononyms with no
possessive cue, and a name inside a sentence that also carries a citation-shaped reference. The
*target* remains the Founder's; `ASSR-03` and `GOLD-14` re-measure on corpora this module did not
write.

**`COMBINATION_RULE_V1`, and the derivation the next measurement is re-measuring.** The rule is
frozen versioned data: `threshold: 2` distinct dimensions, `required: [PERSONAL_EVENT]`,
`narrowing: [ROLE_SPECIFICITY, SMALL_WORKPLACE, RESIDUAL_IDENTIFIER]` (at least one), over the five
dimensions `ROLE_SPECIFICITY`, `SMALL_WORKPLACE`, `PERSONAL_EVENT`, `PRECISE_TIME_OR_PLACE`,
`RESIDUAL_IDENTIFIER`. Derived, not chosen: only **9 of `EVID-01`'s 20** deferred cases carry an
explicit headcount, so a plain threshold of 3 misses eleven of them; and a plain threshold of 2 would
block *"The dismissal took effect on 12/03/2024 after the meeting."* (`PERSONAL_EVENT` +
`PRECISE_TIME_OR_PLACE`), an ordinary question PRD §10.1 says MAY be accepted. Hence a personal event
is required and its partner must be identity-*narrowing*. **Any change to those numbers is a new
`version`, never an edited constant**, and is recorded here (ticket Feedback obligation).

**The canary manifest is extended, not forked — for `ASSR-03`.**
`packages/pii/test/deterministic/corpora/canaries.json` gained a **second top-level key**,
`stageCanaries` (three cases: two `recogniseEntities`, one `applyCombinationRules`), authored in the
same `generate.mjs`. `loadCanaries()` still reads `.canaries`, so `EVID-01`'s leak suite is
unaffected; `packages/pii/test/entity/fixture.ts#loadStageCanaries` reads the new key. **`23-assurance`
must read this file rather than fork a copy** — a second manifest is how the two suites drift.

**Stage 5 is narrower than `EVID-01`'s conservative default, by category as well as by channel.**
A structured channel now explains only the categories it actually covers
(`employer`/`publicCaseParty` → `EMPLOYEE_OR_PRIVATE_INDIVIDUAL_NAME`; `abn` → `TAX_FILE_NUMBER`,
`MEDICARE_NUMBER`, `EMPLOYEE_OR_PAYROLL_IDENTIFIER`), so a personal email pasted into the `employer`
field is no longer cleared by an allow rule written for company names. This can only ever REJECT
more, never less. `structured.publicCaseParty` additionally requires the value itself to carry a
citation-shaped reference: a bare "Smith" is not public material.

**Recorded so `EVID-03` and `15-answer-product` are not surprised.** `readiness()` has exactly three
states (`READY` / `DEGRADED` / `UNAVAILABLE`) and never defaults to `READY`; the shipped
deterministic recogniser reports `READY` because it loads nothing and has no failure mode. What an
operation does under `UNAVAILABLE` is `EVID-03`'s decision (D5), not the port's. Measured on the
delivery run with the runtime off: RSS **62.5 MiB** for the test process, **7.9 MiB** transient
across 20 maximum-size admissions, p95 admission latency **2.7 ms** for 16 × 8,000 characters —
against the PRD §39.2 `app` limit of **320 MiB**.

## Work breakdown

Lane is `12-evidence-safety` and agent is `builder` for all ten tickets (breakdown plan §1.1).
File-scopes are relative to the repository root, are exactly breakdown plan §5.13, and are disjoint
between tickets that can run concurrently. `depends-on` is exactly breakdown plan §5.13.

| Ticket | Size | Lane | File-scope (write-owns) | Depends on |
|---|---|---|---|---|
| [`EVID-01`](tickets/EVID-01-pii-deterministic-patterns-checksums-and-admission-contract.md) — PII deterministic patterns/checksums and admission contract | L | `12-evidence-safety` | `packages/pii/src/{deterministic,contract}/**`, `packages/pii/test/{deterministic,contract}/**` | `FND-03` |
| [`EVID-02`](tickets/EVID-02-local-ner-public-entity-context-rules-combination-risk.md) — Local NER, public-entity context rules, combination risk | L | `12-evidence-safety` | `packages/pii/src/{entity,context}/**`, `packages/pii/test/{entity,context}/**`, `docs/adr/NNNN-local-pii-entity-runtime.md` (new file, **A9**) | `EVID-01` |
| [`EVID-03`](tickets/EVID-03-pii-availability-split-search-continues-research-fails-closed.md) — PII availability split (search continues, research fails closed) | M | `12-evidence-safety` | `packages/pii/src/availability/**`, `packages/pii/test/availability/**` | `EVID-02` |
| [`EVID-04`](tickets/EVID-04-evidence-pack-construction-and-untrusted-content-delimitation.md) — Evidence-pack construction and untrusted-content delimitation | L | `12-evidence-safety` | `packages/citations/src/pack/**`, `packages/citations/test/pack/**` | `FND-07`, `RETR-09` |
| [`EVID-05`](tickets/EVID-05-deterministic-claim-citation-validator-and-bounded-repair.md) — Deterministic claim/citation validator and bounded repair | L | `12-evidence-safety` | `packages/citations/src/validator/**`, `packages/citations/test/validator/**` | `EVID-04`, `FND-10` |
| [`EVID-06`](tickets/EVID-06-licence-aware-quotation-display-and-export-limits.md) — Licence-aware quotation, display and export limits | M | `12-evidence-safety` | `packages/citations/src/licensing/**`, `packages/citations/test/licensing/**` | `EVID-05` |
| [`EVID-07`](tickets/EVID-07-model-gateway-profiles-providers-schema-enforcement.md) — Model gateway: profiles, providers, schema enforcement | L | `12-evidence-safety` | `packages/model-gateway/src/{profiles,providers,schema}/**`, `packages/model-gateway/test/{profiles,providers,schema}/**` | `FND-03`, `DATA-02` |
| [`EVID-08`](tickets/EVID-08-budget-reservation-settlement-and-hard-circuit-breaker.md) — Budget reservation/settlement and hard circuit breaker | L | `12-evidence-safety` | `packages/model-gateway/src/budget/**`, `packages/model-gateway/test/budget/**` | `EVID-07`, `FND-09`, `DATA-07` |
| [`EVID-09`](tickets/EVID-09-byok-encrypted-credentials-and-funding-ledger-routing.md) — BYOK encrypted credentials and funding-ledger routing | M | `12-evidence-safety` | `packages/model-gateway/src/byok/**`, `packages/model-gateway/test/byok/**` | `EVID-08`, `DATA-03` |
| [`EVID-10`](tickets/EVID-10-output-sanitisation-code-generated-urls-markdown-html-allowlist.md) — Output sanitisation: code-generated URLs, Markdown/HTML allowlist | M | `12-evidence-safety` | `packages/citations/src/render/**`, `packages/citations/test/render/**` | `EVID-05` |

Standing module-shared exceptions (breakdown plan §1.1 "Package manifests"):

- `packages/pii/package.json`, `packages/citations/package.json`,
  `packages/model-gateway/package.json` and their `tsconfig.json` — created by `FND-01`;
  **append-only** inside this module (own dependencies only). Regenerate the root `pnpm-lock.yaml`
  as a build artifact; never hand-merge it.
- Each package's `src/index.ts` barrel — created by `FND-01`; each ticket appends exactly one export
  line for the area it owns (the same append-only class as a manifest).

### Lane shape (breakdown plan §7: **3 minimum waves, 4 useful lanes, not fully serial**)

External blockers in brackets:

```text
wave 1  EVID-01 [FND-03]   | EVID-04 [FND-07, RETR-09]   | EVID-07 [FND-03, DATA-02]
wave 2  EVID-02            | EVID-05 [FND-10]            | EVID-08 [FND-09, DATA-07]
wave 3  EVID-03            | EVID-06 | EVID-10           | EVID-09 [DATA-03]
```

The three package trees (`pii`, `citations`, `model-gateway`) are the three concurrent branches;
they share no source file, no test directory and no import edge between them.

### Cross-module consumers (breakdown plan §6.2)

Every edge below is drawn in plan §6.2 and mirrored in the tickets' `blocks` frontmatter.

| This ticket | Unblocks |
|---|---|
| `EVID-01` | `EVID-02`, `ASK-06` (Ask form screen) |
| `EVID-02` | `EVID-03`, `ASSR-03` (PII no-leak suite with canaries) |
| `EVID-03` | `ASK-01` (answer job admission), `GOLD-14` (safety/refusal cases) |
| `EVID-04` | `EVID-05` |
| `EVID-05` | `EVID-06`, `EVID-10`, `ASK-02` (Quick workflow), `GOLD-14`, `ASSR-04` (citation-validation suite) |
| `EVID-06` | `XPRT-02` (PDF renderer), `XPRT-03` (DOCX renderer) |
| `EVID-07` | `EVID-08`, `ASK-02`, `GOLD-15` (model/retrieval profile promotion) |
| `EVID-08` | `EVID-09`, `ASK-01`, `INTL-07` (global usage and cost console) |
| `EVID-09` | — (no dependent in plan §6.2) |
| `EVID-10` | `ASSR-02` (security suite: SSRF, injection, XSS, supply chain) |

## Acceptance — what makes the whole module done

The module is done when all ten tickets are delivered (`/verify-delivery` green each) **and**:

1. **`PII-001` — deterministic patterns, local NER and contextual rules form the server boundary.**
   The synthetic PII suite runs server-side only, meets the configured recall per category
   (Q-EVID-2), and **no raw detected value, and no reversible derivative of one, appears in any log,
   metric, database row, error body or provider payload** — asserted with canary tokens. Client
   hints are demonstrably not consulted by the server decision. (PRD §30.2 `PII-001`; §10.1; §37.2;
   `UAT-PII-01`/`UAT-PII-02`.)
2. **`PII-002` — the availability split behaves exactly as PRD §10.1 states.** With the detector
   forced unavailable, public legal Search continues and free-text Ask/Compare/Coverage fail closed
   with `GENERATION_UNAVAILABLE`; no partially-detected payload is ever accepted. (PRD §30.2
   `PII-002`; §10.1; §34.9.)
3. **`ANS-005` — every material claim has validated source evidence or is removed/downgraded.**
   Over the module's own fixture corpus the count of unsupported definitive claims is **zero**: each
   of PRD §36.6's twelve checks has at least one positive and one negative fixture, the version/node
   check fails the whole execution as an integrity incident, exactly one repair call is possible, and
   claims still failing after repair are deleted with the status downgraded via `FND-07`. (PRD §30.2
   `ANS-005`; §9.4; §36.6; §14.2 gates "Unsupported definitive claims = 0", "Critical legal-date or
   jurisdiction errors = 0"; `UAT-ANS-03`/`UAT-ANS-05`.)
4. **`SEC-003` — model output is schema/citation/licence/sanitisation validated before display.**
   Prompt-injection fixtures embedded in official-source text change no date, tool, URL, provider or
   scope; XSS fixtures produce no executable output; a model-authored or unknown URL never reaches a
   rendered answer or an export. (PRD §30.2 `SEC-003`; §21.1; §36.6; §37.5; `UAT-ANS-04`;
   `ASSR-02`.)
5. **`ANS-007` — budget/provider/source failure never selects an unvalidated model.** The failure
   matrix (provider error, schema failure, timeout, kill switch, 100% budget, missing price/FX data)
   produces an explicit unavailable response in every cell, with no substitution and no partial
   answer. (PRD §30.2 `ANS-007`; §17.3; §42.5; §42.6; `UAT-ANS-08`.)
6. **`OPS-003` — founder-funded monthly spend stops at A$50 and Search remains usable.** The 90%
   warning fires exactly once at the crossing and the 100% hard stop denies further founder-funded
   generation admissions; Search and saved records are unaffected in both states; BYOK-funded work
   debits zero founder funds. (PRD §30.2 `OPS-003`; §24.1; §24.4; §42.6; `UAT-OPS-03`.)
7. **`ANS-004` contribution — one pinned release and one approved profile per answer.** Every
   evidence pack names exactly one `corpus_release_id`, every gateway call names an `APPROVED`
   profile, and the actual provider model version is recorded for the snapshot. (PRD §30.2
   `ANS-004`; §14.4; §18.5 step 2.)
8. **`EXP-001` contribution — licence limits are identical in UI and export.** The same limit
   function produces the same permitted excerpt for `DISPLAY` and `EXPORT`, and hidden
   prompts/reasoning, secrets and internal licensing notes are absent from export inputs. (PRD §11.1;
   §8.9; `XPRT-02`/`XPRT-03`.)
9. **No hidden chain-of-thought exists anywhere in the module.** A machine check finds no request
   field asking for reasoning traces, no response or persisted type able to carry one, and no test
   fixture containing one. (PRD §9.4.)
10. **Every `[machine]`/`[fixture]` item reproduces offline** with no network access and **no
    provider key**: `pnpm test`, `pnpm typecheck`, `pnpm lint` and `pnpm generate &&
    pnpm generated:check` green on the merged default branch. `cargo test --workspace` and
    `uv run pytest` are unaffected — this module writes no Rust and no Python. (PRD §20.3, §45.3;
    plan §1.1.)

## Changelog

- **v0.1 — 2026-08-03** — initial decomposition from `docs/prd/breakdown-plan.md` §5.13 (10 tickets,
  `EVID-01` … `EVID-10`). Records decisions D1–D22, rejects 17 alternatives, carries breakdown plan
  §8 entry Q1 as it stood at the time and opens Q-EVID-1 … Q-EVID-8 — one of them an ADR candidate
  (the local entity-recognition runtime, Q-EVID-1/`EVID-02`), two of them cross-module contract
  questions escalating to `00-foundation` (Q-EVID-6 PII category vocabulary, Q-EVID-8 the `FND-10`
  predicate edge), and one a plan gap (Q-EVID-7 BYOK route ownership).
- **v0.2 — 2026-08-03** — aligned with the `docs/prd/breakdown-plan.md` §8 decision register.
  **Q1 (hosted model per profile) is restated as a benchmark-selected parameter**, not a question
  awaiting a Founder answer: the Non-goals row and the `Q1` open-questions row now name the
  evaluation-pipeline comparison (accuracy, zero-tolerance failures, latency, provider availability,
  cost), make `GOLD-15` the resolver that records the promotion report, and place Founder approval
  **after** that evidence. `EVID-07` carries the same restatement, refreshes its now-stale verbatim
  quote of plan §8, corrects its "model selection … irreducibly human" line, and reclassifies its `Q1`
  known-gap entry as a pending measurement. **Q11 (local embedding and rerank runtime) is confirmed** —
  Microsoft ONNX Runtime, CPU-only, through an exactly pinned `ort` crate, owned by `RETR-07` in
  `11-retrieval-engine` — and is recorded as a Non-goal that fixes the local/hosted boundary this
  module's gateway must not blur; `Q-EVID-1` (the `packages/pii` entity recogniser) is explicitly
  distinguished from it and stays open. **Q14 (Resend) changes nothing here** — this module mentions
  email only as a capability PRD §37.5 forbids the gateway to have. No change to scope, tickets,
  `blocked_by`/`blocks` edges, file-scope, PRD traceability, requirement mapping, the PRD §9.4 sequence
  or any acceptance gate; `Q-EVID-1` … `Q-EVID-8` all remain open as authored. Two pre-existing table
  defects are repaired without changing meaning: **D11**'s inline `0 \| 1` pipe is escaped so the cell
  no longer splits, and the **Q-EVID-7** row gains the `Blocks` cell it was missing (placeholder `—`,
  asserting nothing the row did not already say).
- **v0.3 — 2026-08-08** — `EVID-01` writeback (its acceptance checklist's writeback item). Adds the
  **Open-question status** section after the open-questions table: the measured per-category
  recall/precision for **Q-EVID-2** (target still the Founder's; only the three checksum categories
  floored, `IDENTIFYING_COMBINATION` reported at 0% with twenty deferred cases owned by `EVID-02`),
  the status and local home of the category vocabulary for **Q-EVID-6** plus its one non-§37.1 member
  `REQUEST_LIMIT_EXCEEDED` (`EVID-01` ticket amendment §0.1), the ABN mod-89 check recorded as a
  contested primitive shared with `14-search-product`, and the fail-closed consequence for an ABN in
  free text. No decision is made here and no question is closed: scope, tickets,
  `blocked_by`/`blocks` edges, file-scope and every acceptance gate are unchanged, and Q-EVID-1 …
  Q-EVID-8 all remain open.
- **v0.4 — 2026-08-08** — `EVID-02` writeback (its acceptance checklist's writeback item). **Closes
  `Q-EVID-1`**, pointing at the merged `docs/adr/0001-local-pii-entity-runtime.md` and quoting its
  decision; adds the `EVID-02` section of **Open-question status** with the measured per-category
  recall/precision for **Q-EVID-2** (`IDENTIFYING_COMBINATION` no longer at 0% — `EVID-01`'s twenty
  deferred cases are closed and proved by a differential replay; the target remains the Founder's),
  the `COMBINATION_RULE_V1` threshold derivation so the next measurement knows what it is
  re-measuring, the **named recogniser blind spots** (scripts without case, all-lower-case names,
  bare mononyms, names beside a citation), the `stageCanaries` manifest extension for `ASSR-03`, the
  narrowing of stage 5 by category, and the measured memory/latency against PRD §39.2. **No decision,
  scope, ticket, `blocked_by`/`blocks` edge, file-scope or acceptance gate changed**; `Q-EVID-2` …
  `Q-EVID-8` all remain open exactly as authored.
