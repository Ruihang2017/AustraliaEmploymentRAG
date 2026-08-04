---
id: EVID-02
title: "Local NER, public-entity context rules, combination risk"
module: 12-evidence-safety
lane: 12-evidence-safety
size: L
agent: builder
status: draft
date: 2026-08-03
blocked_by: [EVID-01]
blocks: [EVID-03, ASSR-03]
---

# EVID-02 — Local NER, public-entity context rules, combination risk

Implements PRD §10.1, §37.1 and §37.2 (stages 4–6 of the admission pipeline) — requirement
**PII-001**; epic `E19-PII`.
No ADR for the *rules* — the decision is already made in PRD §10.1 (server detection MUST combine
deterministic patterns, local entity recognition and context-aware public-entity rules) and PRD §37.2
(the stage order); this is build ticket 2 of 10 against it. **One ADR is created by this ticket** for
the local entity-recognition *runtime*, which the PRD does not name: `docs/adr/NNNN-local-pii-entity-runtime.md`
(breakdown plan **A9** — the creating ticket claims the file; sub-PRD open question **Q-EVID-1**).
Parent sub-PRD: [12-evidence-safety README](../README.md). Master spec: [PRD](../../../PRD.md).
Depends on: [EVID-01 — PII deterministic patterns/checksums and admission contract](EVID-01-pii-deterministic-patterns-checksums-and-admission-contract.md) (mirrors `blocked_by`)
**Why `builder`:** a bounded change inside one module's declared file-scope against a fixed contract —
`EVID-01` froze the stage ports and the finding type; this fills stages 4–6 behind them.

## Background + basis

**PRD §10.1, the three-part detector, quoted verbatim:**

> Server detection MUST combine **deterministic patterns/checksums, local entity recognition and
> context-aware public-entity rules**.
>
> Actual employee names, private contact/address data, TFNs, bank details, employee/payroll
> identifiers, precise birth dates and **identifying combinations** MUST be blocked.
>
> **Employer names, ABNs, public business information, public case parties and necessary
> role/duty/location facts MAY be accepted.**

**PRD §37.2, the three stages this ticket owns**, in their fixed position in the pipeline:

```text
… → deterministic patterns and checksums
→ local entity recognition
→ contextual public-entity allow rules
→ combination/risk rules
→ accept sanitized payload OR reject with offsets/types/replacements
```

> **Public-entity exceptions must come from structured `employer`, `abn` or `public_case_party`
> fields, not a generic "ignore warning" button.** If users need to explain a false positive, they can
> report the detector category and request ID without the original text.

**PRD §37.1** supplies the two hardest rows, which are exactly this ticket's subject matter:

| Allowed | Blocked |
|---|---|
| Public employer name and ABN | **Employee or private individual name** |
| Public case party/citation | … |
| Anonymous role, duties, qualifications and employment type | **Identifying combination of rare role + tiny workplace + personal event** |

**PRD §17.3** places the recogniser: *"Online local: query embedding, identifier/date/jurisdiction
classification, **PII pre-screening** and small-set reranking."* PRD §18.2 calls for a *"small
pinned … runtime"*. Neither names a library — that gap is sub-PRD **Q-EVID-1** and is why this ticket
writes an ADR.

**PRD §21.1** constrains how such a runtime may ship: *"Pinned dependencies/images, lockfiles, SBOM,
scans, signed manifests and **no arbitrary runtime plugin/model/code download**."* PRD §39.2 gives
`app` **320 MiB** — the process where admission runs — so a recogniser artifact is a budget line, not
a free choice.

**Requirement PII-001** (PRD §30.2): *"Deterministic patterns, local NER and contextual rules form the
server boundary … Synthetic PII suite meets configured recall and zero raw logging."* `UAT-PII-02`
(PRD §41.2): *"Enter employer name, valid ABN and public case party → **Allowed only through correct
structured/public context**."*

**`EVID-01`'s frozen contract, inherited unchanged:** the three stage ports
(`recogniseEntities`, `applyPublicEntityRules`, `applyCombinationRules`), the `PiiFinding` type that
cannot carry a value, the `PII_CATEGORY_VALUES` vocabulary, and the rule that any `BLOCKING` finding
forces `REJECT`. This ticket implements the ports; it does not change them.

**Sub-PRD decisions carried forward:** **D3** (no finding carries a value, nothing derived is
reversible — this applies to entity spans exactly as it applies to pattern matches), **D4** (public
entities are accepted structurally, never textually), **D22** (every fixture is synthetic and authored
here; nothing reads `evals/gold/**`).

**Accepted caveats carried forward:**

- **A statistical recogniser cannot be a hard gate on its own.** PRD §10.1 requires the *combination*
  of three techniques, and PRD §37.2 orders them so that the deterministic stage runs first. This
  ticket must not let a model score override a deterministic finding, and must not make acceptance
  depend on a recogniser's confidence alone.
- **The recall target is Q-EVID-2**, owner **Founder**. This ticket measures and reports per category;
  it does not set the customer-facing promise.
- **The runtime choice is reversible only through the ADR.** Whatever `Q-EVID-1` resolves to must ship
  behind the port so CI, and every downstream module's tests, run with the deterministic recogniser and
  no model artifact.

## Goal

Produce `packages/pii/src/{entity,context}/**`: a local entity recogniser behind a stable port with a
deterministic default that needs no model artifact; the PRD §37.2 contextual public-entity allow rules
that admit an employer, ABN or public case party **only** from the structured fields; and the PRD
§37.1 combination/risk rules that block an identifying combination even when no single element is
blocked — plus the ADR recording the runtime choice. Completion is mechanically checkable: the
synthetic corpus replays with per-category recall and precision, the public-entity acceptance test
passes only through the structured channel, and the whole suite runs with the model runtime disabled.

## Non-goals

- **No changes to the admission contract, stage ports, finding type, category vocabulary or
  deterministic detectors** — `EVID-01` (`packages/pii/src/{deterministic,contract}/**`). A needed
  change is a docs PR amending both tickets, then `--sync`.
- **No availability/health decision** — `EVID-03` (`packages/pii/src/availability/**`), which is
  `blocked_by` this ticket. A recogniser that fails to load is *reported* here; what that means for an
  operation is `EVID-03`'s.
- **No HTTP route, error mapping or middleware** — `03-app-runtime` (`RUNT-02`) and
  `15-answer-product` (`ASK-01`).
- **No UI hints or placeholder buttons** — `15-answer-product` (`ASK-06`). PRD §10.1 makes client hints
  advisory.
- **No model *gateway*, hosted provider or budget** — `EVID-07`/`EVID-08`. The recogniser here is
  **local** (PRD §17.3) and never leaves the process.
- **No entity recognition over corpus text** — public official sources are public (PRD §37.3); this
  boundary governs customer input only. Corpus-side extraction belongs to `05-ingestion-framework`.
- **No cross-boundary PII no-leak suite** — `23-assurance` (`ASSR-03`), which is `blocked_by` this
  ticket and reuses this ticket's canary manifest.
- **No shipping of a model artifact into the release archive** — `18-ops-release` (`RLSE-01`) owns the
  archive. This ticket declares the artifact, its size and its hash; it does not change packaging.

## File-scope (write-owns)

Owned by this ticket:

- `packages/pii/src/entity/**`
- `packages/pii/src/context/**`
- `packages/pii/test/entity/**`, `packages/pii/test/context/**` (sub-PRD **D21**)
- `docs/adr/NNNN-local-pii-entity-runtime.md` — a **new** file claimed by this ticket (breakdown plan
  **A9**: `docs/adr/**` is shared-additive with per-file ownership; the number is the next free one at
  merge time)
- `packages/pii/package.json`, `packages/pii/src/index.ts` — **append-only**, own entries only

Does not touch:

- `packages/pii/src/{deterministic,contract}/**` — `EVID-01` (merged before this ticket starts);
  `packages/pii/src/availability/**` — `EVID-03`.
- `packages/citations/**` — `EVID-04`, `EVID-05`, `EVID-06`, `EVID-10`; `packages/model-gateway/**` —
  `EVID-07`, `EVID-08`, `EVID-09`.
- `packages/contracts/**`, `packages/domain/**` — `00-foundation` (PRD §44.3 serial-owned).
  `packages/database/**` — `01-app-data`. `packages/ui/**`, `packages/observability/**` —
  `03-app-runtime`. `services/search-rs/**`, `packages/retrieval-client/**` — `11-retrieval-engine`.
- `apps/**`, `pipelines/**`, `infra/**`, `tests/**`, `evals/**` — other modules per breakdown plan §4.
  Any **existing** `docs/adr/NNNN-*.md` — owned by its creating ticket. `docs/PRD.md` — frozen.
- Root manifests and lockfiles — `FND-01`; a new dependency regenerates `pnpm-lock.yaml` as a build
  artifact, never a hand-merge.

**Serial-safety analysis.** First decomposition: nothing merged, no in-flight contention (breakdown
plan §1 header). `packages/pii/src/{entity,context}/**` is written by no other ticket in the plan
(plan §5.13). This is a wave-2 ticket; its concurrent siblings are `EVID-05`
(`packages/citations/src/validator/**`) and `EVID-08` (`packages/model-gateway/src/budget/**`) —
different packages, disjoint trees, no shared file. Its only intra-package neighbours are `EVID-01`
(merged; this ticket's blocker) and `EVID-03` (`blocked_by` this ticket, therefore never concurrent).
`docs/adr/**` is shared-additive per **A9**: this ticket creates one new file and touches no existing
ADR. Shared append-only files: `packages/pii/package.json` and `src/index.ts`.

## Deliverables

1. **`src/entity/port.ts` — the recogniser port**, matching the `stages.recogniseEntities` signature
   `EVID-01` froze: `(fields: readonly {field, value}[]) => readonly PiiFinding[]`, plus a
   `readiness(): 'READY' | 'DEGRADED' | 'UNAVAILABLE'` accessor that `EVID-03` consumes. The port
   returns findings in the `EVID-01` type — so an entity span, like a pattern match, **cannot carry the
   detected text** (sub-PRD D3).
2. **`src/entity/deterministic/**` — the default recogniser, requiring no model artifact.** A
   rule/gazetteer recogniser that detects person-name-shaped spans by structure and context rather than
   by a name list: honorific + capitalised token(s); a capitalised bigram in an employment-relation
   context (`my employee`, `the employee`, `works for`, `reports to`, `dismissed`, `terminated`,
   `on leave`); a signature/greeting pattern; a capitalised token adjacent to a detected private
   contact detail. It ships with an explicit **allow gazetteer** of public-entity forms (company
   suffixes `Pty Ltd`, `Ltd`, `Inc`, `Limited`; government/regulator names; court/tribunal names; the
   PRD §37.1 placeholder forms `Employee A`, `the worker`) so that "Acme Pty Ltd" is not a person.
   Every rule is named, testable in isolation and documented with its false-positive risk. Basis: PRD
   §10.1 (*"local entity recognition"*), §37.1.
3. **`src/entity/runtime/**` — the optional pinned model runtime behind the same port** (sub-PRD
   **Q-EVID-1**). Requirements, whatever the ADR selects:
   - the artifact is **pinned by version and hash**, verified before load, and loaded from the release
     directory — never downloaded at runtime (PRD §21.1 *"no arbitrary runtime plugin/model/code
     download"*);
   - it is **off by default**; enabling it is explicit configuration, and the whole test suite passes
     with it off (sub-PRD D15's sibling rule for models);
   - its resident memory is measured and reported against the PRD §39.2 `app` **320 MiB** limit;
   - a load failure downgrades `readiness()` to `UNAVAILABLE` and **never** silently accepts a payload —
     the pipeline's decision under that state is `EVID-03`'s;
   - it never sends text off-process: no network client is imported (import-graph test).
4. **`docs/adr/NNNN-local-pii-entity-runtime.md`** — the ADR the PRD's silence requires (PRD §45.5
   *"Architecture decision: durable technology/dependency/deployment trade-off"*). It records: the
   options considered (rule/gazetteer only; a small pinned NER model; a hosted service — **rejected**,
   because PRD §17.3 makes this local and PRD §10.1 forbids sending unadmitted text anywhere), the
   decision, the artifact size/hash/licence, the measured memory and latency against PRD §39.2, the
   consequences for `RLSE-01`'s release archive, and the fallback behaviour when the artifact is
   absent. Status, owner and date per the ADR convention.
5. **`src/context/publicEntity.ts` — the contextual public-entity allow rules.** An entity or pattern
   finding is suppressed **only** when the same span is explained by a value in the request's
   `structured` fields:
   - `structured.employer` — an exact or normalised match (case, whitespace, legal-suffix
     normalisation) of the span;
   - `structured.abn` — a **checksum-valid** ABN (`EVID-01`'s `abn` detector) matching the span;
   - `structured.publicCaseParty` — a party name accompanied by a citation-shaped reference, so that
     "Smith v Acme Pty Ltd [2024] FWC 123" is public material and a bare "Smith" is not.

   No other channel exists. A generic acknowledgement, a role, a header, an environment variable or a
   permission **cannot** suppress a finding — a type-level test asserts the suppression function's only
   inputs are the finding and the `structured` block. Basis: PRD §37.2 (*"must come from structured
   `employer`, `abn` or `public_case_party` fields, not a generic 'ignore warning' button"*), §10.1;
   sub-PRD **D4**; `UAT-PII-02`.
6. **`src/context/necessaryFacts.ts` — the "necessary role/duty/location facts" allowance** (PRD
   §10.1). Anonymous role, duties, qualifications, employment type, award/classification language,
   approximate wage/rate facts, state/territory-level location and age bands are explicitly **not**
   findings. Implemented as a named negative rule set with its own fixtures, so that the detector does
   not degrade the product's actual purpose — PRD §32.2's Ask form is *meant* to carry these facts.
7. **`src/context/combination.ts` — the identifying-combination rule** (PRD §37.1 last blocked row:
   *"Identifying combination of rare role + tiny workplace + personal event"*). A `BLOCKING`
   `IDENTIFYING_COMBINATION` finding is produced when a configured number of independent identifying
   dimensions co-occur in one request. The dimensions, each detected by a named rule:
   - **specificity of role** — a role qualified beyond an ordinary title (a unique position, a named
     team of one, "the only X");
   - **smallness of workplace** — an explicit small headcount, "the only other employee", a named
     single-site micro-business;
   - **personal event** — a dismissal, injury, illness, pregnancy, complaint, investigation or
     bereavement tied to an individual;
   - **precise time or place** — an exact date or a precise location beyond state/territory;
   - **residual identifier** — any advisory-severity finding from an earlier stage.

   The rule is **thresholded and versioned** (`COMBINATION_RULE_V1`, frozen, with a `version` field);
   the finding names the dimensions that fired (as names, never as text — sub-PRD D3) and points at the
   union span. The threshold is an initial default recorded here and re-measured under **Q-EVID-2**.
8. **Ordering is `EVID-01`'s, not this ticket's.** These three stages are invoked by
   `EVID-01`'s `admit` in the PRD §37.2 order; this ticket exports them as the real implementations
   replacing `CONSERVATIVE_STAGE_DEFAULTS` and adds no ordering of its own. A test asserts that a
   deterministic `BLOCKING` finding from stage 3 is **never** suppressed by a later stage's confidence —
   only the structured public-entity rule may suppress, and only for the categories it covers. Basis:
   PRD §37.2 stage order; PRD §10.1 (*"MUST combine"*, not "may override").
9. **Nothing is stored, logged or echoed** — inherited from `EVID-01` deliverable 10 and re-asserted
   here for the entity path: no logger, no file write, no socket, no database; the injected
   `PiiMetricsSink` remains the only observability surface, and the recogniser's inputs never reach it.
   A canary test covers the entity and combination paths specifically. Basis: PRD §37.2, §37.3, §22.
10. **`test/entity/corpora/**` and `test/context/corpora/**` — synthetic fixtures** extending
    `EVID-01`'s corpus (sub-PRD **D22**, all values invented and marked synthetic):
    - ≥ 40 person-name positives across greeting, employment-relation, signature and
      adjacent-contact-detail contexts, including non-Anglo names and names that are also common words;
    - ≥ 40 negatives from PRD §37.1's allowed column, including company names that look like person
      names ("Smith & Co Pty Ltd"), public case parties with citations, and the placeholder forms;
    - a public-entity matrix: each of `employer`/`abn`/`publicCaseParty` supplied **in the structured
      field** (expected `ACCEPT`) and the identical string supplied **only in free text** (expected
      handling by the ordinary rules) — this is `UAT-PII-02`'s mechanical half;
    - ≥ 20 combination cases at, above and below the threshold, each naming the dimensions expected to
      fire, plus ≥ 20 near-miss cases that must **not** fire (a general role in a large employer with an
      approximate date);
    - the canary manifest extended, in the same file `EVID-01` created, for `ASSR-03`'s reuse.
11. **`report.ts` + the updated measurement report** — per-category recall and precision over the
    combined `EVID-01` + `EVID-02` corpus, written to
    `packages/pii/test/deterministic/recall-report.json`'s companion
    `packages/pii/test/entity/recall-report.json`, reproduced by the test run, with the model runtime
    both **off** and **on** (the "on" row is skipped with a named message when the artifact is absent —
    never silently). Input to sub-PRD **Q-EVID-2**.
12. **`README.md` update in `packages/pii`** — append the stage-4–6 description, the structured-only
    suppression rule, the combination dimensions, and how to run with the model runtime enabled.

## Acceptance checklist (classified)

- [ ] `[machine]` **Structured-only suppression**: a type-level test proves the suppression function
      takes only the finding and the `structured` block — no role, header, flag, environment variable or
      acknowledgement can reach it; a runtime test proves an identical string in free text is not
      suppressed. (PRD §37.2, §10.1; sub-PRD D4; `UAT-PII-02`)
- [ ] `[fixture]` **Public-entity matrix**: every `employer`/`abn`/`publicCaseParty` case is accepted
      through the structured channel and handled by the ordinary rules in free text; an ABN failing the
      checksum is not accepted as a public entity. (PRD §37.1, §37.2; `UAT-PII-02`)
- [ ] `[fixture]` **Person-name recall**: the entity corpus replays with per-category recall and
      precision recorded in `packages/pii/test/entity/recall-report.json`; every positive context class
      (greeting, employment relation, signature, adjacent contact detail) has at least one passing case.
      (PRD §10.1; `PII-001`; Q-EVID-2)
- [ ] `[fixture]` **Necessary facts are not blocked**: anonymous role, duties, qualifications,
      employment type, approximate wage facts, state-level location and age bands replay as `ACCEPT`.
      (PRD §10.1 *"necessary role/duty/location facts MAY be accepted"*; §37.1)
- [ ] `[fixture]` **Identifying combination**: cases at and above the threshold produce a `BLOCKING`
      `IDENTIFYING_COMBINATION` finding naming the fired dimensions; near-miss cases produce none.
      (PRD §37.1 last blocked row; §10.1)
- [ ] `[machine]` **No stage may override an earlier block**: a deterministic `BLOCKING` finding
      survives every later stage; only the structured public-entity rule suppresses, and only for the
      categories it covers. (PRD §37.2; §10.1 *"MUST combine"*)
- [ ] `[machine]` **Findings still carry no value**: the entity and combination findings are the
      `EVID-01` `PiiFinding` type; a type-level test re-asserts the absent value/hash members, and a
      runtime test asserts the fired-dimension list contains names, not text. (PRD §37.2; sub-PRD D3)
- [ ] `[machine]` **Zero raw logging on the entity path**: with a capturing metrics sink injected, a
      canary name appears in no sink call, error, stack trace or finding. (PRD §37.2, §37.3, §22;
      `PII-001`)
- [ ] `[machine]` **Runs with the model runtime disabled**: the full suite passes with no model
      artifact present, and `readiness()` reports the state honestly rather than defaulting to `READY`.
      (PRD §20.3 — CI runs offline; sub-PRD Q-EVID-1)
- [ ] `[machine]` **No runtime download and no network**: an import-graph test asserts the package
      imports no HTTP client, and a test asserts the runtime loader verifies the artifact's pinned hash
      before load and refuses on mismatch. (PRD §21.1)
- [ ] `[machine]` **Memory budget reported**: resident memory with the runtime enabled is measured and
      recorded in the ADR and the PR against the PRD §39.2 `app` 320 MiB limit; with the runtime
      disabled the package's footprint is reported too. (PRD §39.2)
- [ ] `[machine]` **Determinism**: with the runtime disabled, the same request always yields the same
      findings; no clock, randomness or `process.env` in `src/{entity,context}/**` outside the
      documented runtime-enable switch. (PRD §39.1, §45.2)
- [ ] `[machine]` **ADR exists and is complete**: `docs/adr/NNNN-local-pii-entity-runtime.md` records
      options, decision, consequences, artifact hash/size/licence and the absent-artifact fallback.
      (PRD §45.5; breakdown plan A9; sub-PRD Q-EVID-1)
- [ ] `[machine]` `pnpm lint`, `pnpm typecheck` and `pnpm test` green (standing item, PRD §45.3).
- [ ] `[machine]` `pnpm generate && pnpm generated:check` clean. (PRD §20.1, §45.3)
- [ ] `[machine]` No Rust or Python surface — `cargo test --workspace` / `uv run pytest` unaffected;
      declared not applicable. (PRD §45.3)
- [ ] `[machine]` **Writeback item**: `docs/prd/12-evidence-safety/README.md` **Q-EVID-1** is closed
      (pointing at the merged ADR) and **Q-EVID-2** carries the measured per-category numbers.
      (Breakdown plan §1.1; CLAUDE.md issue #53)
- [ ] `[machine]` PR states the PRD §45.4 items: requirement/UAT IDs (**PII-001**; `UAT-PII-01`/
      `UAT-PII-02` run end to end downstream), user-visible change and non-goals, schema/API/event
      compatibility impact (none — no contract change), **tenant/PII/security and retention impact**
      (nothing stored; the recogniser never leaves the process), source/licence impact (**the model
      artifact's licence, if one is selected**), cost/memory/latency impact (measured, above), rollback
      path (disable the runtime; the deterministic recogniser remains), known gaps (**Q-EVID-2**;
      documented recogniser blind spots).

Absent classes: no `[human]` criteria — this is a server-side detector verified mechanically;
`UAT-PII-02` is the human script and runs at Gate 2 against `15-answer-product`/`ASK-06` with
cross-boundary assertions in `23-assurance`/`ASSR-03`. The `[fixture]` items are synthetic-corpus
replays authored in this package (sub-PRD D22) — the PRD §14/§43 evaluation replays are
`21-evaluation-600`/`GOLD-14`.

## Test plan

Every step runs offline: no network, no provider key, no model download.

1. **Read the corpora against the PRD.** Compare `packages/pii/test/{entity,context}/corpora/**` with
   `docs/PRD.md` §37.1 row by row. Confirm the negatives really come from the "Allowed" column, that
   company-shaped and person-shaped strings both appear, and that all values are synthetic.
2. **Run the suite twice.** `pnpm --filter @<scope>/pii test` with the model runtime **disabled**
   (default) and again **enabled** if the artifact is present; confirm the enabled run is skipped with a
   named message when it is absent — never silently green. Then `pnpm test`, `pnpm typecheck`,
   `pnpm lint`, `pnpm generate && pnpm generated:check` from the repository root. Construction pattern
   to copy: `EVID-01`'s `packages/pii/test/deterministic/**`.
3. **Structured-channel test.** For each of the three structured fields, submit the identical string
   (a) in the structured field and (b) only in free text, and assert the two different outcomes.
4. **Suppression negative test.** On a scratch branch add a `role`/`acknowledged` parameter to the
   suppression function and make it suppress; assert the type-level test fails; discard.
5. **Override-resistance test.** Assert that a deterministic TFN finding is still `BLOCKING` when the
   entity stage is stubbed to return "high confidence, not PII".
6. **Combination matrix.** Walk the threshold: N−1 dimensions (no finding), N dimensions (finding), N+1
   dimensions (finding). Confirm the fired-dimension list is names only.
7. **Canary leak test.** Extend `EVID-01`'s harness with the entity and combination canaries; assert
   nothing emitted contains them, including `JSON.stringify` of the result and of the metrics calls.
8. **Runtime loader test.** Point the loader at an artifact whose hash does not match the pin; assert
   it refuses and reports `UNAVAILABLE` rather than loading or falling back silently.
9. **Memory and latency.** Measure resident memory and p95 admission latency for a maximum-size
   request, runtime off and on; record both in the ADR and the PR.
10. **Purity/imports.** Import-graph test: no HTTP client, no database driver, no `child_process`, no
    file write outside the artifact read. Grep `src/{entity,context}/**` for `fetch(`, `http`, `https`,
    `Math.random`, `Date.now`.
11. **Append-only manifest.** `git diff packages/pii/package.json packages/pii/src/index.ts` shows
    additions only; confirm the ADR file is new and no existing `docs/adr/*.md` is modified.
12. **Reviewer focus.** Confirm no path lets a recogniser score reduce a deterministic block; confirm
    the public-entity suppression genuinely cannot be reached by any input other than the structured
    block; confirm the combination rule's threshold is versioned data, not a magic number in a
    condition; confirm the recall report is generated, not hand-written; confirm the ADR names the
    rejected hosted-service option and why (PRD §10.1 forbids sending unadmitted text anywhere).

## Feedback obligation

1. **General rule.** If implementation falsifies this ticket, update **this ticket** (docs PR →
   merge → `publish-tickets.mjs --sync`) and, where module context changes,
   `docs/prd/12-evidence-safety/README.md` (version +0.1 with a changelog line) **before** changing
   code. Silent divergence is an incomplete ticket.
2. **Foreseeable frictions, each with its exact writeback target:**
   - *No acceptable local runtime exists inside the PRD §39.2 320 MiB budget* → that is the ADR's
     decision to record, not a reason to call a hosted service. Write the ADR with the
     rule/gazetteer-only decision and its measured recall, update
     `docs/prd/12-evidence-safety/README.md` **Q-EVID-1/Q-EVID-2**, and raise the recall consequence to
     the **Founder**. Sending unadmitted customer text to a provider to detect PII would invert PRD
     §10.1 — see item 3.
   - *The combination rule's threshold produces too many false positives on real questions* → add the
     cases to the negative corpus, adjust `COMBINATION_RULE_V1` **as versioned data with a new version
     number**, and record the change in `docs/prd/12-evidence-safety/README.md`. Never remove the
     dimension — PRD §37.1 lists identifying combinations as blocked.
   - *A needed suppression channel does not exist* (e.g. a public register identifier that is neither
     employer, ABN nor case party) → PRD §37.2 names exactly three structured fields. Adding a fourth is
     a **product change** (PRD §45.5): raise it against `EVID-01`'s request type in a docs PR, record it
     in `docs/prd/12-evidence-safety/README.md`, and only then implement. Never widen the free-text
     path.
   - *`EVID-03` needs a readiness signal this port does not expose* → change the **port in this
     ticket**, in a docs PR amending `EVID-02` and `EVID-03` together; never let `EVID-03` write
     `src/entity/**`.
   - *`ASSR-03` needs a canary the manifest does not contain* → extend the manifest here (it is this
     module's file) and record it in `docs/prd/12-evidence-safety/README.md`; `23-assurance` must not
     fork its own copy, or the two will drift.
3. **Falsified protocol.** If local-only detection proves incapable of meeting any defensible recall —
   i.e. the only way to satisfy `PII-001` is to send unadmitted customer text to a hosted model — that
   directly overturns PRD §10.1's ordering (*"before logging, persistence or **provider calls**"*) and
   PRD §17.3's local/hosted split. **Stop. Do not send the text.** Escalate for re-review, record it in
   the ADR's consequences **and** `docs/prd/12-evidence-safety/README.md`, and raise it on
   `docs/prd/breakdown-plan.md` before any code. A PII detector that leaks the PII it is detecting is
   the exact failure `PII-001` exists to prevent.
