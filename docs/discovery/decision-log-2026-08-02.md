# AustraliaEmploymentRAG Discovery Decision Log

**Status:** Complete; superseded as the active specification by `PRD.md`  
**Last updated:** 3 August 2026 (Australia/Sydney)  
**Purpose:** Structured historical archive of decisions accepted during product discovery. The final, authoritative specification is `PRD.md`.

## 1. Current position

Discovery has progressed through:

1. Requirements and constraints — substantially complete and frozen as Requirements Baseline v1.
2. Delivery and operating-cost estimates — baseline accepted.
3. Canonical legal and customer data model — accepted.
4. API design — complete and frozen.
5. Deep dives and trade-offs — complete and frozen.
6. Architecture — complete and frozen.
7. Consolidated decision audit — complete.

Requirements, estimates, API/data model, trade-offs, architecture and the consolidated contradiction/gap audit are complete. The final English PRD now supersedes this discovery record as the active specification.

Architecture decisions accepted so far: a modular monolith with isolated app/worker/search processes, and a TypeScript application plus two SQLite databases, a Rust Tantivy/USearch search process, and a local Python corpus pipeline.
The deployment topology is also accepted: Cloudflare edge/static delivery, one small Sydney Lightsail node, R2 for public/rebuildable corpus objects, S3 Sydney for encrypted private backups, and a local build workstation.
Tenant isolation for SQLite is accepted as a structural application invariant rather than a developer convention.
The end-to-end Answer runtime flow is accepted: admission and budget reservation are transactional, jobs pin one corpus release, processing is at least once with idempotent effects, and completed snapshots become visible only after atomic commit.
The CorpusRelease deployment flow is accepted: offline build/signing, immutable upload, production compatibility/hash validation, shadow checks, atomic pointer promotion and evidence-preserving rollback.
The application delivery architecture is accepted: CI builds immutable artifacts, agents have no default production authority, and the founder manually promotes compatible application/database/corpus versions behind feature flags.
The low-cost observability architecture is accepted: bounded structured operational logs, lightweight aggregate metrics, external probes and separately retained audit/security records.
The backup and disaster-recovery architecture is accepted: continuously protect mutable customer state in S3 Sydney and rebuild application/corpus components from immutable artifacts.
The security architecture is accepted: edge/origin isolation, secure Web/widget/auth controls, sandboxed source parsing, evidence-only model use, deterministic output validation, least-privilege secrets and signed supply-chain artifacts.
The monorepo and multi-agent ownership architecture is accepted: central contracts/domain rules feed bounded deployable apps, Rust search, Python pipelines and generated SDKs, while high-conflict public schemas and migrations have serialized ownership.
The integrated architecture baseline is accepted, including the correction that private customer exports belong in S3 Sydney rather than R2.
The BYOK gap is resolved: customer-owned provider credentials are encrypted and restricted to approved provider/model profiles, and change billing ownership without bypassing platform controls.
The ephemeral-retention gap is resolved: ephemeral research content uses a non-replicated local transient database and expires shortly after completion with a hard maximum lifetime.
The model-selection gap is resolved at the process level: exact model aliases remain benchmark outputs, but profile promotion and fallback require security/cost gates plus development, validation, blind and full regression evaluation.
The source-catalogue gap is resolved: five dependency-ordered implementation waves all belong to the MVP, and customer-visible coverage is proven through a source registry rather than an absolute completeness claim.
The pilot-entitlement gap is resolved: trial and paid-pilot limits are explicit, while founder-funded and customer-prepaid/BYOK variable costs use separate ledgers and hard stops.

The first retrieval trade-off is now frozen: legal-aware lexical-first hybrid retrieval is used instead of vector-first retrieval.
The model-placement trade-off is also frozen: retrieval-oriented intelligence runs locally where practical, while validated hosted models perform legal synthesis.
The corpus-storage trade-off is frozen: preserve all permitted raw evidence and provenance in low-cost object storage while limiting only the hot semantic layer.
The legal-relationship extraction trade-off is frozen: official assertions and evidenced deterministic parsing may support conclusions, while LLM-derived relationships remain unconfirmed suggestions.
The answer-synthesis trade-off is frozen: evidence-first structured claims are deterministically validated before user-facing rendering.
The Deep Research autonomy trade-off is frozen: decomposition is agentic only inside a bounded, auditable state machine.
The evaluation trade-off is frozen: deterministic legal/citation gates control release, with LLM judging and human review used only as bounded supporting signals.
The PII-detection trade-off is frozen: client-side assistance is backed by authoritative local server-side detection before storage or provider calls.
The freshness trade-off is frozen: frequent collection-level discovery and targeted incremental processing are backed by periodic reconciliation instead of repeated full-corpus crawling.
The availability trade-off is frozen: the MVP prioritises tested recovery on a single Sydney node over multi-node high availability.
The evaluation trade-off is frozen: deterministic legal/retrieval/citation gates control release, with LLM judging and founder review used as secondary quality signals.

## 2. Product identity and commercial goal

- Working name: **AustraliaEmploymentRAG**.
- Possible future expansion: **AustraliaBusinessRAG**, but that expansion is out of current scope.
- B2B only; no direct consumer product.
- Customer types:
  - Australian SME payroll/HR platforms;
  - overseas payroll/HR platforms entering Australia;
  - direct B2B workspaces for HR, payroll, compliance, in-house legal and professional-services teams.
- The initial customer may have no internal payroll-compliance or employment-law expert.
- Internal compliance research and embedded customer Q&A are two surfaces of the same product.
- Commercial MVP success: at least one genuine B2B organisation voluntarily pays to use the product.
- Early sales may use an invite-only paid pilot, manual invoice or payment link. A full self-service billing portal is not required.

## 3. Product surfaces

The MVP includes:

- authenticated English-language Web workspace;
- Simple Search and Advanced Legal Search;
- Quick Answer and Deep Research;
- Compare by jurisdiction, time or authority/instrument;
- Coverage Navigator for workplace system, enterprise agreement, modern award and classification research;
- saved Research Records, answer versioning, internal review and comments;
- Monitor/watchlists with in-app, email and webhook alerts;
- versioned REST API;
- TypeScript and Python SDKs;
- sandbox/developer portal;
- embeddable JavaScript/React widget;
- internal administration console and kill switches;
- PDF, Word and JSON exports.

The marketing site may be public, but Search, Ask, Compare, Monitor, APIs and widget sandbox require authenticated, invite-controlled B2B access. There is no anonymous public Q&A or public API key.

## 4. Legal and regulatory corpus

Only official public sources are included. Customer private documents are excluded from the MVP.

The corpus covers Commonwealth law and all eight states and territories, including:

- PAYG, STP, superannuation/Payday Super and FBT;
- all eight payroll-tax regimes;
- Fair Work Act, regulations and the National Employment Standards;
- all modern awards and relevant pay data;
- Fair Work Commission decisions and orders;
- enterprise agreements and approval, variation, replacement and termination chains;
- state and territory employment legislation and official guidance;
- WHS/OHS;
- discrimination and equal opportunity;
- industrial relations;
- workers compensation;
- labour hire;
- portable long-service leave;
- workplace surveillance and employment-related privacy;
- whistleblowing;
- child employment;
- public-sector employment;
- employment-related migration and right-to-work matters;
- High Court decisions;
- Federal Court and Full Court decisions;
- Federal Circuit and Family Court decisions;
- Fair Work Commission decisions, including Full Bench treatment;
- relevant state and territory courts and tribunals;
- regulator decision summaries and impact materials;
- Bills, explanatory memoranda, enacted-but-not-in-force amendments, drafts and consultations.

The default answer uses only law in force for the requested date. Future and proposed law is separated and clearly labelled.

Supported legal statuses:

- `IN_FORCE`
- `ENACTED_NOT_IN_FORCE`
- `BILL_NOT_ENACTED`
- `DRAFT_OR_CONSULTATION`
- `REPEALED`
- `SUPERSEDED`
- `STATUS_UNCONFIRMED`

Point-in-time support initially covers the current financial year and the preceding two financial years. At the current project date this means 2026–27, 2025–26 and 2024–25. Case law and still-operative instruments are not excluded merely because they are older than three years.

Enterprise agreements remain potentially operative after nominal expiry until replaced or terminated. Nominal expiry must never be treated as automatic cessation.

## 5. Product answer behaviour

The product provides evidence-grounded legal research and conditional compliance guidance, not merely document links and not legal representation.

The standard answer contains:

1. Short answer: `Yes`, `No`, `Likely`, `Depends` or insufficient evidence.
2. Explanation and application of the relevant rules.
3. Conditions and assumptions.
4. Claim-level authorities and pinpoint citations.
5. Practical next steps or checks.
6. Limitations and unresolved facts.

Answer statuses:

- `SUPPORTED`
- `CONDITIONAL`
- `INSUFFICIENT_EVIDENCE`
- `CONFLICTING_SOURCES`
- `OUT_OF_SCOPE`
- `SOURCE_NOT_CURRENT`

The model may not fill gaps from general model knowledge. If the corpus cannot support an answer, it must refuse or qualify the conclusion. It must not silently assume jurisdiction, date, employee type, award, agreement or classification.

The system does not expose misleading numeric confidence percentages. It communicates evidence status, material assumptions and unresolved conflicts.

## 6. Coverage Navigator

Coverage Navigator is an MVP core feature. It follows this sequence:

1. Determine the likely workplace-relations system.
2. Search for relevant enterprise agreements by employer name/ABN and other facts.
3. Check approval, variation, replacement, termination and coverage.
4. If no applicable agreement is established, identify modern-award candidates.
5. Test industry and occupational coverage and exclusions.
6. Identify possible classifications from principal duties, qualifications and responsibility.
7. Request missing determinative facts.

Job title alone is insufficient. The result may rank multiple candidates and must cite coverage, exclusion and classification clauses. `Award-free` or `agreement not applicable` conclusions require evidence.

## 7. Case law and authority treatment

- Show tribunal/court, level, date, case number and neutral citation.
- Distinguish binding, potentially binding, persuasive and unknown authority status.
- Track appeal, affirmation, reversal, overruling, distinction, following and citation relationships where evidence permits.
- Prefer higher, later and still-followed authority.
- Use `TREATMENT_NOT_CONFIRMED` when later treatment cannot be established.
- Distinguish holding/reasons from obiter, party submissions and background facts.
- Do not generalise a single decision into a universal rule without support.
- Regulator summaries and impact materials are secondary aids and do not replace the decision itself.
- The product may explain implications for an anonymous scenario, but does not predict litigation or tribunal outcomes.

## 8. Source priority and conflicts

The default authority hierarchy is:

1. Constitution and applicable legislation.
2. Regulations and legislative instruments.
3. Binding judicial authority.
4. FWC orders, approved agreements, modern awards and decisions with operative effect.
5. Persuasive court, tribunal and FWC decisions.
6. Official regulator guidance, rulings, summaries and impact materials.
7. Explanatory memoranda and interpretive material.
8. Bills, consultations and non-operative future material.

The engine must also consider date, jurisdiction, commencement, repeal, transitional provisions, specific-versus-general rules, instrument interaction, the statutory version interpreted by a case and later amendments. Irreconcilable authoritative sources produce `CONFLICTING_SOURCES`; the model cannot silently choose one. Guidance never silently overrides legislation, an operative instrument or binding authority.

## 9. Safety, privacy and data use

- Only anonymous fact scenarios are accepted.
- The product actively detects and blocks employee PII before submission.
- Blocked raw content is not sent to an LLM, logged or stored.
- Employer names, ABNs, public business information, public case-party names and public case information are allowed where required.
- The API and widget enforce the same validation as the Web app.
- Payslips, employment contracts, medical certificates and personnel files are not accepted in the MVP.
- Customer queries are not used for training, evaluation or manual analysis by default. Anonymised product-improvement use requires opt-in.
- LLM/rerank providers must be configured for no training and zero or approved minimal retention; subprocessors and transient cross-border processing are disclosed.
- The product refuses instructions for unlawful avoidance, sham contracting, adverse action, discrimination, wage theft, falsification, concealment or regulator evasion. It may explain legal risk, remediation and lawful alternatives.
- The product does not provide legal representation, certify compliance, guarantee outcomes, make automated high-impact decisions, submit filings or execute payroll.
- It may retrieve rates and formulas but is not a payroll execution/calculation engine.
- Pre-launch paid legal review is not an MVP blocker. Terms, Privacy Policy, AUP and disclaimers will be drafted with `LEGAL_REVIEW_PENDING` recorded as a risk.

## 10. Licensing policy

- Use only official public material.
- Where commercial reuse is clearly permitted, content may be stored, indexed and displayed with required attribution.
- Where rights are unclear, retain metadata, limited quotations and official links only.
- Do not copy third-party headnotes or commercial summaries.
- Do not use logos, coats of arms or branding in a way that implies endorsement.
- Maintain immutable licence snapshots and conservative source-level assessments.
- A terms change may cause new content to be quarantined until reassessed.

## 11. Freshness, incidents and correction

- Detect official changes within 24 hours and normally process them within the following 24 hours.
- Show `last checked` and `last successfully ingested`.
- Use `FRESHNESS_DEGRADED` when a source is stale or failing.
- If missing or stale data may change the answer, return `SOURCE_NOT_CURRENT` or `INSUFFICIENT_EVIDENCE`.
- Candidate corpus releases pass completeness, date, citation, duplication and retrieval checks before promotion.
- A failed release keeps the previous active corpus; partial data never replaces production silently.
- Users can report issues at answer, claim, citation or source level.
- Confirmed errors trigger correction, re-evaluation, impact analysis, audit records and customer notification where required.
- Old answers are never silently overwritten.

## 12. Research Records and collaboration

Workflow states:

- `DRAFT`
- `IN_REVIEW`
- `CUSTOMER_REVIEWED`
- `REVIEW_REQUIRED`
- `ARCHIVED`

Research Records support ownership, reviewer assignment, comments, mentions, versioning and audit. `CUSTOMER_REVIEWED` means customer-internal review only.

Each formal answer is an immutable Answer Snapshot containing the question/facts, requested legal date, corpus release, source versions, cited passages, retrieval pipeline, model/prompt version, claims, citations, assumptions, answer status and review/correction history. Rerunning under current law creates a new version and permits side-by-side comparison.

## 13. Data retention and security

- Research Records and Answer Snapshots persist until customer deletion or organisation closure.
- Ordinary application logs: 14 days.
- Security and audit events: 12 months.
- Deleted customer records: 30-day recoverable period, then deletion from the primary database.
- Backup copies age out within a further maximum of 30 days.
- Organisation closure provides export followed by deletion within 30 days.
- API request/response bodies are not logged by default.
- Public legal sources and non-customer evaluation data may be retained long term.
- Persistent customer data and backups remain in an Australian region.
- Daily database backups retain seven days; weekly encrypted backups retain 30 days; restore tests run monthly.
- Rebuildable vector indexes and embeddings do not require backup.
- Logs exclude secrets, tokens, SAML assertions, complete API keys and raw PII.

Organisation roles:

- Owner
- Admin
- Researcher
- Viewer
- Developer

Enterprise SSO, MFA and service accounts are included. Authentication uses self-hosted Better Auth or an equivalent low-cost approach, with TOTP/passkeys/recovery codes, scoped service-account keys and manually configured SAML/OIDC for early customers.

## 14. Accessibility, service and performance objectives

- English-only application and output. Chinese is used only in founder/product-development discussion.
- WCAG 2.2 AA target.
- Responsive Web workspace and widget.
- Internal availability objective: 99.5%, but the low-cost single-node MVP offers no contractual SLA.
- Search p95 objective: 2 seconds.
- Source retrieval p95 objective: 1 second.
- Answer streaming should begin within approximately 3 seconds.
- Normal answers should normally finish within 30 seconds; Deep Research may take up to 60 seconds or continue in the background.
- Support: email, in-app issue reporting and public status page; two-business-day target, critical issues handled best effort on the same business day. No 24/7 or phone support.

## 15. Evaluation and launch gates

The MVP starts directly with 600 stratified synthetic cases:

- 360 development;
- 120 validation;
- 120 blind test.

Cases are derived from official sources and include gold nodes, expected claims, temporal/jurisdiction traps, conflicts, refusals, PII and malicious-avoidance cases.

Proposed launch gates:

- factual citation coverage: 100%;
- citation precision: at least 98%;
- recall@10: at least 90%;
- zero critical time or jurisdiction errors;
- zero unsupported definitive claims;
- correct refusal: at least 95%;
- source-status correctness: at least 98%.

Evaluation runs locally wherever possible and do not consume the production monthly AI budget.

## 16. Delivery estimate

Accepted planning baseline:

- six-week aggressive functional target;
- two-week quality/data-risk buffer;
- eight weeks total planning horizon.

Indicative sequence:

1. Foundation, organisations, authentication, database, admin and first source.
2. Federal legislation, ATO, FWO, FWC, awards and agreements.
3. States/territories, courts, historical versions and status modelling.
4. Search, Quick Answer, Deep Research, Compare and refusal behaviour.
5. Web workspace, records, API, SDK, widget and alerts.
6. Evaluation, security, backups, accessibility and performance.
7. Two-week quality/data buffer.

Development may use multiple coding agents overnight, with the founder performing human testing during the day. Human testing and corpus validation, not token availability, are treated as the primary schedule constraint.

## 17. Operating-cost constraint and corpus strategy

Hard founder-funded operating limit: **A$50 per calendar month**.

Accepted low-cost approach:

- offline/local crawling, parsing, embedding and evaluation;
- a small Sydney server for customer data and the live application;
- inexpensive object storage for the public legal corpus;
- disk-oriented lexical/citation search;
- tiered semantic indexing;
- hard provider budgets and pre-call cost reservation;
- search remains available when AI budget is exhausted;
- Quick Answer may queue and Deep Research pauses rather than switching to an unvalidated model;
- customers may prepay extra AI credits or use their own provider key.

Corpus planning baseline:

- approximately 300,000 documents;
- approximately 150 GB total source storage;
- full legal scope remains discoverable;
- approximately 600,000–1,000,000 cloud search chunks after structural consolidation;
- approximately 150,000–300,000 always-on semantic chunks;
- all content receives metadata, lexical, field and citation indexing where licensing permits;
- high-authority/high-frequency content receives full semantic indexing;
- lower-frequency cases, agreements and historical material use lexical retrieval plus selective/on-demand semantic processing.

Index tiers:

- `TIER_1_FULL_SEMANTIC`
- `TIER_2_LEXICAL_AND_SELECTIVE_SEMANTIC`
- `TIER_3_METADATA_AND_ON_DEMAND`
- `EXCLUDED_LICENSING`
- `QUARANTINED_QUALITY`

Accepted retrieval ordering principles:

- classify citation, ABN, award/agreement, temporal, comparative and ordinary natural-language queries before retrieval;
- apply hard legal-date, jurisdiction, status, document-type and licensing constraints before relevance ranking;
- prioritise exact identifiers, pinpoint references, neutral citations, agreement/award identifiers and ABNs;
- search the complete eligible corpus through disk-oriented lexical retrieval;
- add selective dense retrieval according to index tier and cache high-value long-tail semantic results on demand;
- fuse ranks rather than directly adding incompatible BM25/vector scores;
- use authority, temporal fit, jurisdiction fit, operative status and legal relationships as explicit ranking features;
- reserve stronger reranking and multi-query expansion for generated answers and Deep Research;
- semantic similarity and reranking may improve recall/order but may never override legal applicability.

Accepted model-placement principles:

- document embeddings are built locally/offline and online query embeddings use the same pinned model family/version;
- rules and small local models handle query classification, identifier/date/jurisdiction extraction, PII pre-screening and limited reranking;
- ordinary Search remains local by default;
- Quick Answer uses local retrieval/reranking plus a validated economical hosted generation model;
- Deep Research may use validated hosted reranking and a stronger validated hosted generation model;
- model changes pass shadow evaluation before production promotion;
- provider failure or budget exhaustion never triggers substitution with an unvalidated weaker model;
- schema validation, cost reservation, context minimisation and separate Quick/Deep quotas constrain hosted spend;
- actual provider/model/prompt versions are retained in Answer Snapshots while product code calls a provider-neutral model gateway.

Accepted corpus-storage principles:

- permitted raw HTML/XML/PDF/JSON artifacts and normalised text are stored immutably with retrieval time, hash and licence snapshot;
- reducing cloud cost means reducing hot SSD/RAM/vector footprint, not discarding official evidence;
- Tier 1 receives full lexical and dense indexing, Tier 2 full lexical plus selective/on-demand dense indexing, and Tier 3 metadata or compressed lexical access without default embeddings;
- rights-unclear sources retain only permitted provenance, metadata, official links and limited quotations;
- the small live-server disk carries the current lexical/citation index, high-value vectors and bounded caches, while the approximately 150 GB raw corpus remains in inexpensive object storage;
- long-tail lexical hits may populate a capacity-limited semantic cache without changing the underlying legal record;
- embedding eviction or model replacement never deletes raw evidence, and large re-embedding jobs run locally/offline where possible.

Accepted legal-relationship principles:

- prefer official structured amendment, commencement, repeal, agreement-lifecycle, appeal and corrected-judgment facts;
- deterministically parse neutral citations, provision references and explicit relationship phrases with evidence locations and parser versions;
- a citation initially establishes only `CITES`; followed/distinguished/doubted/overruled/reversed treatment requires additional explicit evidence;
- model-discovered relations are stored as `MODEL_SUGGESTED` and cannot alter legal status, produce a supported claim or trigger a definitive treatment label;
- use `TREATMENT_NOT_CONFIRMED` for unresolved later treatment;
- concentrate founder review on high-impact status/treatment relations, high-frequency authorities, evaluation cases, conflicts and reported defects rather than attempting manual review of the full graph.

Accepted answer-synthesis principles:

- build an evidence pack containing immutable evidence IDs, exact text, pinpoint, jurisdiction, status, effective interval and authority level before generation;
- the model may cite only evidence IDs supplied in that pack and returns schema-constrained claims, assumptions, missing facts and limitations;
- deterministic validation checks evidence identity, quote offsets, corpus membership, legal date, jurisdiction, status, authority role, contradictory evidence and licensing limits;
- citation labels, links, pinpoints, source metadata and status badges are generated by code rather than invented by the model;
- a failed validation receives at most a bounded repair attempt, after which unsupported claims are removed and the answer is downgraded or refused;
- only validated structured claims are rendered into user-facing English;
- concise reasoning summaries and evidence mappings may be shown, but hidden chain-of-thought is neither requested nor retained.

Accepted Deep Research principles:

- use fixed scope/decompose/retrieve/gap-check/follow-up/synthesis/validation stages with structured contracts;
- plans may create bounded subquestions but cannot alter the requested legal date/jurisdiction or recurse indefinitely;
- enforce maximum subquestions, retrieval rounds, candidate nodes, hosted calls, tokens, estimated cost and elapsed time;
- allow parallel retrieval branches and at most bounded evidence-gap/conflict follow-up;
- restrict production research to the active corpus and approved official-source adapters, with official live fetches only for freshness verification;
- stop on sufficient authority, missing decisive facts, unresolved conflict, stale/unavailable sources, scope exclusion or resource limits;
- expose user-readable progress and evidence categories without hidden reasoning or raw prompts;
- Quick Answer and Deep Research use distinct workflows and quotas, and agents cannot autonomously increase their budget.

Accepted evaluation principles:

- deterministically score gold authority/version/node retrieval, exact quotation, claim support, jurisdiction, legal date, source status, prohibited authority use, answer/refusal status, unsupported claims, latency and cost;
- use a pinned LLM judge only for clarity, missing conditions, coherence, usefulness and comparative presentation, never as the sole arbiter of legal correctness or release;
- focus founder review on failures, changed results, affected source topics, model/prompt changes, conflicts, coverage/classification, case treatment and temporal traps;
- run targeted smoke subsets on changes, development cases nightly where practical, development plus validation weekly, and all 600 cases for release candidates;
- protect the blind split from ordinary coding-agent context and keep prompt examples separate from evaluation cases;
- version gold data corrections rather than editing formal comparison history in place;
- block release for critical regressions even if aggregate metrics remain above threshold.

Accepted PII-detection principles:

- perform immediate client-side hints and one-click placeholder replacement, but never treat client checks as the security boundary;
- before logging, persistence or provider calls, run server-side deterministic patterns/checksums, local entity recognition and context-aware public-entity rules;
- allow necessary public employer/ABN/case/authority information while blocking actual employee identity, private contact/financial/payroll identifiers and identifying fact combinations;
- return field/offset/type/replacement guidance without logging the detected original text;
- customers cannot bypass a positive employee-PII finding; structured public-entity fields handle legitimate false positives;
- regression-test detection with synthetic PII cases and expose only anonymous technical detection metrics to internal administration;
- if authoritative detection is unavailable, public legal search may continue but free-text Ask/Compare/Coverage fail closed.

Accepted freshness principles:

- interpret the 24-hour detection target as checking official feeds/APIs/sitemaps/updated listings/manifests and conditional-request metadata rather than downloading every document daily;
- scan critical collections every 6–12 hours and normal official collections at least daily where source capabilities permit;
- run weekly collection count/hash reconciliation and a deeper monthly manifest reconciliation;
- keep lightweight discovery and small increment processing on the live server while local machines handle parser replays, full rebuilds, mass embedding and complete evaluation;
- separately expose last discovery check, successful change scan, full reconciliation, content ingestion and freshness status;
- use partitioned polling and `FRESHNESS_LIMITED` for sources without reliable delta/change mechanisms rather than claiming false compliance;
- normally detect within 24 hours and process/validate/publish within a further 24 hours, prioritising commencement, rate and operative-instrument changes;
- preserve the prior release and surface degraded status when an incremental update fails validation.

Accepted availability/recovery principles:

- operate a single Sydney production node behind edge DNS/TLS/static delivery and protection;
- provide frequent incremental customer-data backup, daily full backup, weekly encrypted 30-day retention, immutable corpus releases and monthly restore tests;
- target customer-data RPO of 15 minutes and core-service RTO of four hours, while treating corpus indexes as rebuildable from immutable artifacts/manifests;
- keep an independently reachable status page and use explicit maintenance mode during database/corpus consistency failures;
- retain idempotency semantics across uncertain requests and run integrity checks before leaving maintenance mode;
- retain 99.5% as an internal objective but make no contractual SLA, zero-downtime, automatic-failover or zero-data-loss promise;
- fund high availability only when a customer contract, revenue, scale or demonstrated outage impact justifies it.

## 18A. Accepted architecture decisions

- Use one repository and one versioned product release with separately supervised app, worker and search runtime processes on the same production node.
- Keep domain boundaries for identity, tenancy, corpus, retrieval, research, coverage, compare, monitoring, export, budgets, correction, admin and audit without deploying each as a microservice.
- Use a database-backed durable job queue and transactional outbox instead of Redis/Kafka/RabbitMQ in the MVP.
- Run heavy ingestion, parser replay, embedding, evaluation and candidate-release construction as local/offline workflows rather than persistent cloud services.
- Use TypeScript for React/Vite Web and widget clients, Fastify REST/SSE APIs, Better Auth and product-domain logic.
- Use `better-sqlite3` with a migration/query layer such as Drizzle or Kysely, and pin an Active LTS Node.js runtime.
- Separate mutable `app.sqlite` (identity, tenants, research, jobs, audit and usage) from immutable release-specific `corpus.sqlite` (legal metadata, nodes, events, relationships, provenance and licensing).
- Continuously replicate `app.sqlite` WAL changes with Litestream to Australian-region object storage.
- Use a localhost-only Rust search process with Tantivy for lexical/field/citation retrieval, USearch for quantised dense vectors and a small local model runtime for query embedding/limited reranking.
- Package each immutable corpus release as `corpus.sqlite`, Tantivy index, USearch vector index, embedding manifest and signed/hashed release manifest.
- Use Python only for local/offline official-source adapters, parsing/OCR orchestration, normalisation, identity/event/relation extraction, batch embeddings, evaluation and release building.
- Validate real-scale index size, two-GB-memory startup, p95 latency, concurrency, vector recall and release-switch memory before committing; if necessary reduce hot dense coverage before lexical coverage.
- Defer Postgres/pgvector until revenue or concurrency justifies it; the first future database migration moves only mutable app data while preserving corpus-release and search boundaries.
- Deploy the production processes to a Sydney Lightsail two-GB/60-GB instance with a 32-GB attached SSD, initially using the lower-cost IPv6 path behind Cloudflare where connectivity tests pass.
- Put application releases, mutable `app.sqlite`, bounded logs and temporary files on the system disk; put active/candidate/previous hot corpus-release bundles on the attached disk.
- Host static Web/widget assets at Cloudflare Pages and reach the origin through an outbound Cloudflare tunnel/proxy; do not edge-cache authenticated customer data.
- Store permitted public legal artifacts, normalised text, candidate/archive corpus releases and rebuildable indexes in Cloudflare R2.
- Store only encrypted Litestream replicas and customer-data disaster-recovery material in AWS S3 Sydney.
- Do not place customer backups in R2: its Oceania location hint is best-effort rather than an Australian-residency guarantee, and publicly available jurisdictional R2 buckets do not include Australia.
- Run app, worker, search, Litestream and tunnel processes under explicit resource limits; keep worker concurrency at one initially and perform no production compilation, mass embedding or large index builds.
- Keep the expected monthly stack within A$42–50, with approximately A$12 reserved as the hosted-model hard budget and Cloudflare Paid Workers excluded by default.
- Give every tenant-owned row an `organization_id` and use organisation-scoped unique/composite foreign keys wherever possible to prevent cross-tenant relationships at the database layer.
- Derive an immutable TenantContext only from verified Web, widget or service-account identity; never trust request body/query fields for tenant selection.
- Require all customer repositories to accept TenantContext and forbid business modules from using unscoped database connections or ID-only lookup helpers.
- Route exceptional cross-organisation administration through separate recent-MFA, reason-required, fully audited internal repositories.
- Authorise before resource lookup and return the same not-found response for absent, forbidden and other-tenant opaque IDs.
- Keep the public-corpus search process read-only and physically unable to read `app.sqlite`.
- Re-authorise queued jobs before execution and retain organisation/actor/resource scope on jobs and outbox events.
- Require automated cross-tenant endpoint tests and migration checks for every new tenant-owned table.
- Use OS permissions and narrowly scoped storage credentials so app/worker/Litestream, search, corpus promotion and backup components receive only the files/prefixes they need.
- Admit Answer jobs only after auth, tenant/permission, PII, schema, legal-scope, rate, budget and idempotency checks; create the job, sanitized saved turn, budget reservation, pinned corpus release and outbox event in one transaction.
- Process durable jobs with expiring worker leases and at-least-once delivery, while unique operation IDs and immutable snapshots ensure one observable result and no duplicate charge.
- Re-authorise actor, organisation, resource and budget immediately before execution.
- Pass only sanitized queries, hard legal filters and the pinned corpus release to the customer-data-blind search process.
- Route hosted calls through a model gateway enforcing model/retention allowlists, timeout, schema, circuit breaking and maximum token/cost limits.
- On success, atomically commit Answer Snapshot, claims/citations/assumptions, retrieval/model metadata, actual budget settlement, job status, audit and outbox events before emitting completion.
- On failure/cancellation, retain safe failure metadata, charge only actual external cost, release unused reservation and never expose a partial supported answer.
- Persist SSE job events so reconnect/restart can resume by event ID without retaining hidden reasoning or raw provider payloads.
- Build `corpus.sqlite`, Tantivy/USearch indexes and versioned manifests locally from a fixed artifact manifest, with counts, coverage, tool/schema/model versions, evaluation results, compatibility requirements and per-file hashes.
- Sign the immutable manifest offline, upload to an R2 staging prefix and publish a final completion marker only after every object is present.
- Production verifies signature, compatibility, disk capacity, file hashes, read-only database/index integrity, smoke queries and critical count deltas before promotion.
- Use a shadow search process where memory allows; otherwise validate serially or use an explicit maintenance window rather than risking OOM.
- Briefly freeze new Answer admissions, drain or safely handle pinned jobs, atomically switch the active pointer, reload/health-check search and then resume.
- Never remove an old release while a job is pinned to it; completed answers retain their historical release ID even after local index eviction.
- Rollback atomically switches to the prior verified bundle, opens an incident and marks answers created under the failed release for impact analysis/review.
- Keep active and previous releases locally, plus a candidate only during promotion; archive older immutable bundles to R2 after verifying remote integrity and reference safety.
- Use local development, CI verification, static frontend previews and one tenant-isolated production sandbox organisation instead of paying for a permanent staging server.
- Deny coding agents production SSH/database/storage/signing access by default and require synthetic/local fixtures and bounded provider usage.
- Gate merges/releases with type/unit/schema/migration/tenant/auth/PII/citation/Rust/Python/retrieval/security checks, adding integration, restore, evaluation and rollback checks for release candidates.
- Build Web/server/worker/search/migrations/OpenAPI/SBOM/manifests once in CI; production verifies and runs the immutable artifact without compiling or installing floating dependencies.
- Before application promotion, verify health/space/compatibility, force a customer-database backup, preflight migrations, start/health-check the candidate, atomically switch the application pointer and retain the prior release.
- Use expand/contract SQLite migrations, background backfills and explicit handling for destructive changes; prefer forward fixes over automatic destructive database rollback.
- Require founder recent MFA, explicit version confirmation and changelog for production promotion, without two-person approval.
- Version application and corpus independently with declared compatibility ranges, and roll out high-risk capabilities through internal/sandbox/pilot-scoped feature flags.
- Emit structured JSON operational logs with request/job/retrieval/model/answer correlations and technical status/latency/cost/version fields, while excluding research content, evidence text, PII, credentials, assertions and provider payloads.
- Separate 14-day disposable application logs from 12-month backed audit/security records and business content.
- Monitor server resources/backup lag, application/auth/PII behaviour, job queues, search performance/release identity, source/citation/evaluation quality and provider/tenant costs.
- Rotate logs by age and size, cap disk use, disable debug by default with automatic expiry and avoid high-cardinality trace retention or crash dumps.
- Deduplicate immediate alerts for availability, disk/memory, backup, isolation, budget, critical freshness, citation, promotion and severe incidents; send lower-priority conditions as summaries.
- Use external liveness/readiness, authenticated synthetic Search and budget-limited synthetic Answer checks; readiness includes database/search/release consistency.
- Investigate customer-specific content only through permissioned, audited issue workflows rather than full-content debug logs.
- Continuously replicate WAL-backed `app.sqlite` to a dedicated S3 Sydney backup prefix, target less than 15-minute lag, keep daily recovery points seven days and weekly points 30 days, and alert on lag/age.
- Do not duplicate rebuildable corpus databases/indexes, application binaries or static assets into customer backup storage; recover them from immutable signed artifacts in R2/CI releases.
- Use transport and S3 at-rest encryption plus application-level encryption for SSO/provider/webhook secrets; keep destructive backup deletion and break-glass restore authority off the production server.
- Force and confirm recovery points before migrations, application/auth changes, bulk customer-data operations and key rotation.
- Restore monthly into an isolated environment with outbound email/webhook/provider/SSO/session behaviour disabled, run database/schema/reference checks and retain a restore report.
- Maintain a whole-server runbook that rebuilds Sydney compute/storage, restores app state, retrieves compatible corpus/app releases, verifies integrity, reconnects the tunnel and resumes services in priority order.
- Keep an offline recovery package for storage restore, encryption/account/domain recovery and provider-key rotation without retaining reusable customer sessions or plaintext user/service credentials.
- Treat Internet/customer input, official source content, customer host pages and model output as untrusted; trust application/corpus artifacts only after signature/hash/compatibility verification and user-facing answers only after deterministic validation.
- Hide origin and internal ports behind the outbound tunnel, harden health/admin/session/download surfaces and enforce CSP/CSRF/output encoding, exact widget origins and token hygiene.
- Restrict source adapters to approved HTTPS domains with redirect/DNS/private-address/content-size/type/time/resource protections and isolated parser/OCR processes.
- Pass source text only as delimited evidence data; it cannot invoke tools, choose URLs/providers, expand scope or alter policy, and generation has no arbitrary Web/shell/database/customer-data tools.
- Treat generated JSON/Markdown/URLs as untrusted until schema, citation, licence and sanitisation checks pass; suggestions never execute automatically.
- Isolate, encrypt, rotate and minimally scope storage/provider/email/SSO/webhook credentials, keeping restore and release-signing authority outside the ordinary production runtime and agent context.
- Pin dependencies/images, keep lockfiles and SBOMs, scan code/artifacts, sign corpus manifests and forbid runtime plugin/model/code downloads from arbitrary locations.
- Automate Web/API/tenant/auth/SSRF/prompt-injection/XSS/parser/secret/dependency/origin/backup security tests and publish a `security.txt` plus vulnerability-report address.
- Organise the repository into deployable Web/API/worker/admin/widget apps, an isolated Rust search service, shared TypeScript contracts/domain/database/auth/retrieval/model/PII/citation/job/observability/UI packages, local Python ingestion/build/evaluation pipelines, generated TypeScript/Python SDKs, versioned schemas, eval data, infrastructure and cross-cutting tests/docs.
- Keep business rules out of route handlers/components and centralise legal/answer/workflow/permission/evidence/budget/incident decisions in a framework-independent domain package.
- Make one contracts package the source for REST/SSE/internal-search/webhook schemas and generate OpenAPI/SDK/event/manifest bindings rather than hand-maintaining copies.
- Let the application database package own only mutable app schema/migrations/tenant repositories/outbox/encryption, while corpus schema/build ownership remains with pipeline/search boundaries.
- Divide agent work by bounded domain workstreams and serialize changes to lockfiles, canonical enums, OpenAPI roots, migration order, corpus manifests and production deployment files.
- Capture durable technology rationale in ADRs, while the discovery log remains the record of accepted product decisions.
- Keep module unit tests close to code, cross-boundary isolation/security/e2e tests at repository level and the 600-case legal evaluation dataset separate from unit fixtures.
- Route Web/admin/widget/SDK clients through Cloudflare to a private Sydney origin containing the TypeScript app/worker, mutable `app.sqlite`, customer-data-blind Rust search and immutable active corpus bundle.
- Route only sanitized, evidence-bounded synthesis calls through the model gateway to approved hosted providers and retain no unapproved provider content.
- Keep public legal artifacts and rebuildable corpus releases in R2, customer database recovery material under an S3 Sydney backup prefix, and seven-day private PDF/DOCX/JSON customer export artifacts under a separately permissioned S3 Sydney export prefix.
- Preserve system invariants: Australian persistence for customer data, no customer content in R2, search isolation from app data, no arbitrary model tools, one corpus release per answer, node-version citations, immutable release promotion, TenantContext-first access, hard AI quality/budget stops and maintenance on incompatible versions.
- Leave embedding/generation/reranker model aliases, tokenizer/index schema details, hot vector counts, release-size/concurrency limits, source-specific chunking and provider token/time ceilings to benchmark/evaluation-driven configuration rather than treating them as architectural assumptions.
- Allow an organisation Owner/Admin to configure, test, rotate, disable and delete an encrypted customer-owned model credential only for pre-integrated providers and evaluation-approved model profiles.
- Decrypt BYOK credentials only inside the model gateway; expose only provider/key-prefix/timestamps/status and exclude keys from logs, exports, detailed audit/support views and all non-customer evaluation/ingestion work.
- Do not permit arbitrary provider base URLs, automatic fallback to founder-funded credentials or use across tenants; optional platform-funded fallback requires explicit organisation opt-in and remains subject to the global hard budget.
- Keep BYOK requests under the same evidence, validation, safety, abuse, rate and technical quota controls, while disclosing that the customer's own provider contract controls provider-side retention/region terms.
- Store sanitized ephemeral questions/facts, evidence and streamed/final responses only in a separate local `ephemeral.sqlite` that is excluded from Litestream, daily/weekly backups, exports and support tooling.
- Keep only non-content job/tenant/operation/status/token/cost/latency/model/failure metadata in `app.sqlite`.
- Retain ephemeral content while running, for one hour after completion/failure/cancellation, and never more than 24 hours after creation; clean at five-minute intervals and on startup.
- Return `410 EPHEMERAL_CONTENT_EXPIRED` after deletion, retain no recoverable snippet/content hash and make no recovery promise after expiry or server loss.
- Require the same PII/provider controls for ephemeral use, and require `SAVE` for durable audit, export, review, version comparison or change alerts.
- Define separate version-pinned profiles for query embedding, local rerank, Quick synthesis, Deep synthesis, structured repair and evaluation judging rather than hard-coding provider names into business logic.
- Reject candidates before quality testing if schema/context/versioning/retention/data-processing/rate/latency/cost constraints are incompatible.
- Tune only on the 360 development cases, freeze configuration for 120 validation cases, use the protected 120 blind cases for promotion, and run all 600 for final non-regression comparison.
- Require absolute launch gates, no critical temporal/jurisdiction/unsupported-claim regression, acceptable schema reliability/latency and a budget-compatible forecast before promotion.
- Treat every fallback as an independently evaluated profile; if none is approved, fail unavailable rather than silently substituting.
- Require dual-index recall/resource comparison and pointer rollback for embedding changes, and verify rerankers cannot demote exact/applicable/high-authority results improperly.
- Use synthetic evaluation traffic for shadowing by default; production customer shadowing requires explicit anonymised-improvement opt-in.
- Record actual provider model/version and circuit-break silent alias/behaviour/cost changes until re-evaluated.
- Implement source coverage in five dependency waves: primary operative Commonwealth/state/territory law; industrial instruments and payroll rules; official courts/tribunals; employment-adjacent regimes; and future/proposed law.
- Treat all five waves as MVP scope rather than later product versions, while allowing official/technical/licensing constraints to produce explicit limited coverage states.
- Maintain a Source Coverage Registry with authority/jurisdiction/official endpoints/document and date coverage/full-text/history/change detection/licensing/adapter/freshness/count/gap/status details.
- Require every mandatory source group to be active or explicitly limited before release, with no undisclosed gaps, validated date ranges/count baselines/freshness/licensing and a passing evaluation subset.
- Market coverage through the published/auditable registry and visible known limitations rather than claiming that every Australian employment-law document is included without exception.
- Treat ten organisations, 100 users, 5,000 monthly searches, 1,000 Quick Answers, 100 Deep Research runs, 100 active watchlists and 10,000 API calls as the tested overall MVP capacity baseline rather than a single-customer entitlement.
- Offer an invitation-only 14-day trial with up to five users, one service account, 1,000 searches, 20 Quick, two Deep, five watchlists, 500 API calls and a sandbox widget, followed by 30 days of read-only record access unless earlier deletion is requested.
- Default a manually contracted paid pilot to 25 users, five service accounts, 5,000 searches, 250 Quick, 25 Deep, 25 advanced Compare/Coverage tasks, 100 watchlists, 10,000 API calls and all agreed Web/API/SDK/widget/export/SSO/alert surfaces, subject to adjustment in the first customer contract.
- Map customer-visible operations to internal research credits, reserve estimated cost before work and charge generation quota only after paid-provider execution begins.
- Separate `FOUNDER_PLATFORM_BUDGET` from `CUSTOMER_PREPAID_OR_BYOK`; trials/internal use consume the former, while paid excess must be prepaid or BYOK and may not create unsecured founder liability.
- Default per-organisation concurrency to two Quick, one Deep and one export task with independent API/search burst limits and notification queues.
- Defer public self-service price-page decisions; validate price through the first manually invoiced paid pilot.

Accepted evaluation principles:

- deterministically score gold authority/version/node retrieval, quote offsets, claim support, jurisdiction, legal date, source status, prohibited authorities, answer status, refusal, unsupported definitive claims, recall, latency and cost;
- use a pinned LLM judge only for clarity, completeness of conditions, concise reasoning, usefulness and comparative presentation—not for legal validity or release approval;
- focus founder review on failures, changed outputs, adapter/model/prompt impacts, conflicts, coverage/classification, treatment and temporal traps;
- run relevant smoke subsets on changes, development cases nightly where practical, development plus validation weekly, and all 600 cases for release candidates;
- reserve blind cases for release candidates and material model/pipeline choices and keep them out of normal coding-agent context;
- version datasets and gold corrections rather than silently editing prior baselines;
- reject critical jurisdiction/time/refusal/citation regressions even if aggregate scores remain above threshold.

Early usage baseline remains up to ten organisations, 100 users, 5,000 searches, 1,000 Quick Answers, 100 Deep Research runs, 100 active watchlists and 10,000 API calls per month, subject to organisation and system-level generation quotas.

## 18. Accepted canonical data model

### Legal corpus and provenance

- `Source`
- `LegalDocument`
- `DocumentVersion`
- `DocumentNode`
- `NodeVersion`
- `NodeRelation`
- `SearchChunk`
- `ChunkEmbedding`
- `LegalEvent`
- `SourceArtifact`
- `IngestionRun`
- `CorpusRelease`
- `LicenceSnapshot`
- `LicenceAssessment`

Important modelling decisions:

- publication, legal effect, retrieval and system-knowledge times are distinct;
- status is derived from evidenced legal events rather than overwritten in place;
- provision labels are version-specific and are not permanent identities;
- node lineage supports renumber, replace, split, merge, amend, cite and interpret relationships;
- SearchChunks and embeddings are rebuildable derived artifacts;
- citations target immutable document/node versions and exact offsets, never SearchChunks;
- each Answer Snapshot records the corpus release used.

### Customer, research and operations

- `Organization`
- `User`
- `Membership`
- `ServiceAccount`
- `ApiCredential`
- unified `Actor` abstraction
- `ResearchRecord`
- `ResearchTurn`
- immutable `AnswerSnapshot`
- `AnswerClaim`
- `ClaimCitation`
- `AnswerAssumption`
- `RetrievalRun`
- `RetrievalCandidate`
- `ModelExecution`
- `UsageLedger`
- `ReviewAction`
- `Comment`
- `IssueReport`
- `Correction`
- `Watchlist`
- `WatchTarget`
- `DetectedChange`
- `Alert`
- `AlertDelivery`

### Evaluation

- `EvaluationCase`
- `GoldAuthority`
- `ExpectedClaim`
- `EvaluationRun`
- `EvaluationResult`

## 19. Accepted API decisions so far

### Platform contract

- Versioned JSON REST API under `/v1`.
- TypeScript and Python SDKs use the same REST contract.
- No GraphQL in the MVP.
- Organisation is derived from authenticated context, not trusted from request bodies.
- Cursor pagination, ISO 8601 UTC timestamps, stable opaque IDs and per-response request IDs.
- `Idempotency-Key` for retryable writes.
- HTTP status and domain answer status remain separate.
- Server-Sent Events stream progress and answer sections without exposing hidden chain-of-thought.
- Breaking changes require a new major API version.

### Accepted API areas

- `POST /v1/search` with Simple and Advanced modes, legal-date filtering and explicit status/jurisdiction handling.
- Document, version, node, timeline and relationship retrieval.
- Stable links to exact historical document/node versions.
- `POST /v1/answers` supporting Quick and Deep modes.
- Clarification-before-generation when decisive facts are missing.
- Asynchronous answer jobs with streaming, status polling and cancellation.
- `SAVE` and `EPHEMERAL` retention modes.
- Claim-level structured answer output.
- Compare API for jurisdiction, time and authority/instrument comparisons.
- Coverage Navigator API following the mandatory workplace-system/agreement/award/classification sequence.
- Research Record CRUD, immutable turns, answer reruns, workflow actions and comments.
- Optimistic concurrency using ETag/version and `If-Match`.
- Organisation-internal sharing only in the MVP; no unauthenticated public share links.
- Watchlist CRUD for documents, nodes, employer/ABN targets, jurisdiction topics, saved searches and Research Record authorities.
- Structured alerts with effective dates, before/after authorities and affected Research Records.
- In-app, email and signed webhook deliveries.
- HMAC-SHA256 webhook signatures, timestamp-based replay protection, idempotent event IDs, secret rotation and exponential-backoff retries.
- Source changes are detected once and fanned out to matching watchlists; watchlists do not create independent crawlers.
- Rule-based structured diffs continue when AI budget is unavailable; optional generated summaries may pause.
- Daily digest by default with immediate delivery reserved for critical events.
- Asynchronous export jobs for Research Records, Answer Snapshots, comparisons, coverage assessments, search results and organisation data.
- PDF and DOCX provide a human-readable, version-specific research record; JSON provides a versioned machine-readable contract.
- Exported answers preserve their original legal date, corpus release, claims, citations, assumptions, limitations and correction state.
- Licensing controls source-excerpt length; hidden prompts/reasoning, secrets and internal licensing notes are excluded.
- Export artifacts use short-lived signed download URLs and are deleted after seven days by default; immutable source records remain reproducible.
- Repeated identical exports may reuse an existing artifact, and export generation does not consume research credits.
- Customer usage APIs expose current-period consumption, remaining research credits, limits, reset dates and service-account usage without exposing secrets or other tenants.
- Audit APIs are role-restricted and retain actor, organisation, action, resource, result and request metadata without storing full research content or credentials.
- Customer issue APIs cover citation, date, jurisdiction, source, PII and unsupported-claim reports; only the internal workflow can resolve issues.
- Internal administration is isolated under `/internal/v1` and is not shipped in customer SDKs.
- Internal administration covers source health, ingestion, corpus promotion/quarantine, licensing, evaluation, costs, issue triage, corrections, incidents and kill switches.
- Kill switches can pause generation, a provider/model, Deep Research, a source/jurisdiction, corpus promotion, ingestion, webhooks, invitations or an abusive tenant/key.
- Emergency actions require actor, reason, scope, incident linkage and review/expiry time and cannot bypass audit or delete data.
- Incident severity and lifecycle are structured; severe incidents may trigger scoped kill switches and customer-notification assessment.
- A public system-status API reveals general availability/freshness without exposing infrastructure or security details.
- Public registration is disabled; organisation membership begins with a single-use expiring invitation or controlled verified-domain JIT provisioning.
- Email/password, magic link, passkey and SAML/OIDC SSO are supported; Owner, Admin and internal administrators require MFA.
- Sensitive operations require recent reauthentication, and active sessions can be listed and revoked.
- SSO connections move through draft/test/active/error/disabled states and cannot be enforced before a successful test.
- A tightly controlled MFA-protected Owner break-glass account prevents customer IdP failure from locking out the organisation and generates a high-priority event when used.
- SCIM provisioning is explicitly excluded from the MVP.
- Service-account credentials are scoped, hashed, rotatable, expiring and optionally constrained by IP, rate and budget; complete keys are displayed only once.
- Developer membership does not implicitly grant access to Research Record content, and service accounts cannot log into the Web UI.
- TypeScript and Python SDKs share an OpenAPI-generated core plus hand-written streaming, retry, cancellation, webhook verification and ergonomic helpers.
- SDK retries are limited to safe/idempotent operations, honour `Retry-After`, expose typed domain errors and do not send research content in telemetry.
- The browser widget never receives a long-lived service-account key; a customer backend issues a short-lived, organisation-scoped, feature/credit/origin-limited widget session.
- The widget is delivered through a JavaScript loader and sandboxed iframe, with a typed React wrapper and origin/schema-validated events.
- Widget sessions are short-lived, not stored in localStorage, use pseudonymous external-user IDs and cannot access administration functions.
- Disclaimer, citation and product-source indicators cannot be hidden by customer theming.
- The developer sandbox is tenant-isolated, low quota, synthetic by default and marks webhook events as sandbox traffic.
- Internal source APIs manage authority, crawl schedule, rate/concurrency limits, adapters, expected corpus shape, freshness and index-tier policy.
- Ingestion supports discovery-only, incremental, full rebuild, parser replay and dry-run modes; full rebuilds never modify the active corpus in place.
- Failed parsing, licensing ambiguity, count anomalies, OCR defects, identity conflicts and broken structure enter quarantine with reasoned retry/accept/exclude actions.
- Candidate releases must pass completeness, temporal consistency, identity, citation, licensing, smoke-search, evaluation-subset and manifest checks before promotion.
- Promotion uses recent MFA, explicit reason and an immutable rollback point; two-person approval is not required for the solo-founder MVP.
- Rollback moves the active pointer to a prior verified release, preserves failed evidence, opens an incident and marks potentially affected answers `REVIEW_REQUIRED`.
- Source-specific adapters implement discover/fetch/identify/parse/normalise/event/relation/validate boundaries.
- Change detection avoids repeated download/parsing/embedding, large rebuilds run locally where possible and every ingestion run has hard resource/cost limits.

## 20. Discovery completion status

Discovery is complete for the MVP specification. The consolidated contradiction,
completeness and unresolved-parameter audit has been performed, and no blocking
product or architecture decision remains open.

The authoritative English specification is now the repository-root `PRD.md`.
Future changes must be recorded through normal product change control rather than
silently changing this discovery record.

## 21. Legacy PRD disposition

The older TaxRAG/ATO-focused template was preserved unchanged at
`docs/archive/PRD-taxrag-original.md`. It is historical context only and is not an
active specification. The repository-root `PRD.md` supersedes it.
