---
id: EVID-05
title: "Deterministic claim/citation validator and bounded repair"
module: 12-evidence-safety
lane: 12-evidence-safety
size: L
agent: builder
status: draft
date: 2026-08-03
blocked_by: [EVID-04, FND-10]
blocks: [EVID-06, EVID-10, ASK-02, GOLD-14, ASSR-04]
---

# EVID-05 — Deterministic claim/citation validator and bounded repair

Implements PRD §9.4, §36.5 and §36.6 — requirements **ANS-005** and **SEC-003**; epic `E21-ANSWER`.
No ADR — the decision is already made in PRD §36.6 (the twelve checks and their failure consequences)
and PRD §9.4 (deterministic validation is a mandatory stage of the generation sequence); this is build
ticket 5 of 10 against it.
Parent sub-PRD: [12-evidence-safety README](../README.md). Master spec: [PRD](../../../PRD.md).
Depends on: [EVID-04 — Evidence-pack construction and untrusted-content delimitation](EVID-04-evidence-pack-construction-and-untrusted-content-delimitation.md), [FND-10 — Domain: temporal applicability and authority hierarchy](../../00-foundation/tickets/FND-10-domain-temporal-applicability-and-authority-hierarchy.md) (mirrors `blocked_by`)
**Why `builder`:** a bounded change inside one module's declared file-scope against a fixed contract —
PRD §36.6 is a finished check table with stated consequences; this makes each row mechanical rather
than persuasive.

## Background + basis

**This ticket carries the product's central safety invariant:** a displayed legal claim is trusted only
after it is tied to exact evidence in one pinned corpus release and has passed deterministic
validation. PRD §21: *"Trust customer input, official source content, customer host pages and model
output as untrusted. … **trust a displayed answer only after deterministic validation.**"*

**PRD §9.4 evidence-first synthesis, quoted verbatim:**

> The generation sequence MUST be:
>
> ```text
> retrieve → evidence pack → structured claims → deterministic validation → render → final status check
> ```
>
> The model may cite only system-supplied evidence IDs. Code MUST create source titles, links,
> pinpoints and status badges. **The validator MUST check evidence identity, exact offsets, corpus
> membership, legal date, jurisdiction, status, authority role, contradictory evidence and licensing. A
> bounded repair attempt MAY be made; remaining unsupported claims MUST be removed and the answer
> downgraded/refused.**
>
> **Hidden chain-of-thought MUST NOT be requested, stored or displayed.** Concise reasoning summaries,
> assumptions and evidence mappings MAY be shown.

**PRD §36.6 deterministic validator, transcribed verbatim — the acceptance target:**

| Check | Failure consequence |
|---|---|
| Evidence ID exists in supplied pack | Reject claim |
| Quote offsets reproduce exact evidence text | Reject citation; claim may be repaired |
| Version/node belongs to pinned release | **Fail entire execution as integrity incident** |
| Requested date is in effective interval | Reject claim; critical date error counter |
| Jurisdiction applies | Reject claim; critical jurisdiction error counter |
| Status is allowed for current/historical/future mode | Reject or visibly isolate future/proposed section |
| Citation role is legally permitted | Reject claim or downgrade to background |
| Definitive wording has direct sufficient support | Downgrade/remove/refuse |
| Contradictory higher/equal authority is unaddressed | `CONFLICTING_SOURCES` or repair |
| Quote/display/export is licence-permitted | Trim/metadata-link-only; never bypass |
| URL is code-generated official URL | Replace model URL; reject unknown URL |
| Rendered Markdown/HTML passes sanitisation | Escape/remove unsafe output |

> **One repair call may receive only structured validation findings and the same evidence pack. It
> cannot retrieve new evidence or expand scope. After repair, failed claims are deleted. If deletion
> removes the material conclusion, final status becomes `INSUFFICIENT_EVIDENCE` or
> `CONFLICTING_SOURCES`.**

**PRD §36.5 model output schema, quoted verbatim** — the only shape this validator accepts:

```json
{
  "proposed_status": "CONDITIONAL",
  "short_answer": "…",
  "claims": [
    {
      "kind": "RULE",
      "text": "…",
      "support": "CONDITIONAL",
      "evidence": [
        {"evidence_id": "ev_03", "role": "SUPPORTS", "quote_start": 10, "quote_end": 75}
      ],
      "assumption_refs": [0]
    }
  ],
  "assumptions": [{"text": "…", "source": "USER_NOT_CONFIRMED", "impact_if_false": "…"}],
  "missing_facts": ["…"],
  "next_checks": ["…"],
  "limitations": ["…"]
}
```

> Claim kinds are `SHORT_ANSWER`, `RULE`, `APPLICATION`, `CONCLUSION`, `DATE_OR_STATUS`,
> `PRACTICAL_STEP` and `LIMITATION`. A `PRACTICAL_STEP` that is pure workflow advice may be labelled
> non-legal; **every factual/legal component still needs evidence.**

**Requirements.** `ANS-005` (PRD §30.2): *"Every material claim has validated source evidence or is
removed/downgraded … **Unsupported definitive claim count is zero**"*. `SEC-003`: *"Model output is
schema/citation/licence/sanitisation validated before display … Prompt-injection/XSS/invalid-URL
fixtures pass"*. PRD §14.2 gates *Factual citation coverage 100%*, *Citation precision ≥ 98%*,
*Critical legal-date or jurisdiction errors 0*, *Unsupported definitive claims 0*.
`UAT-ANS-05`: *"Citation uses wrong offset/date/jurisdiction fixture → **Validator rejects; repaired or
removed; critical metric increments**."*

**What is already decided elsewhere and must not be re-decided here.** `FND-07` owns
`decideAnswerStatus`, `classifyClaimSupport`, `guidanceCannotOverride`,
`containsProhibitedCertainty` and `isDefinitiveClaim` (its deliverables 2–7). `FND-10` owns
`isEligible`, `PERMITTED_STATUSES_BY_MODE`, `effectiveIntervalContains`, `AUTHORITY_RANK`,
`compareAuthority` and `guidanceCannotOutrank` (its deliverables 1–5). `EVID-04` owns the pack, its
`packHash`, its per-call `evidence_id` resolver and the delimitation invariant. PRD §45.2 forbids
duplicating any of it here.

**Sub-PRD decisions carried forward:** **D8** (the validator is pure; the repair call is an injected
port), **D9** (graded consequences, one of them fatal), **D10** (signals here, status in `FND-07`),
**D11** (one repair call, structurally), **D14** (no chain-of-thought type exists), **D22** (fixtures
are synthetic and authored here).

**Accepted caveats carried forward:**

- **`FND-07` is reached transitively.** Plan §5.13 gives this ticket blockers `EVID-04` and `FND-10`;
  `FND-07` is `EVID-04`'s blocker and is therefore merged before this ticket starts. Its functions are
  consumed directly; no new DAG edge is invented.
- **Checks 10–12 are split with `EVID-06` and `EVID-10`, which are `blocked_by` this ticket.** This
  ticket owns all twelve checks with conservative built-in behaviour and declares two refinement ports;
  `EVID-06` supplies the licence limit policy and `EVID-10` the sanitiser and URL allowlist. The import
  direction is never inverted.
- **Check 9 ("contradictory higher/equal authority is unaddressed") is the one row most at risk of not
  being mechanical.** It is sub-PRD open question **Q-EVID-5**, owned here. PRD §14.3 and §9.4 forbid
  resolving it by asking a model. This ticket ships an evidence-derived rule whose conservative outcome
  is `CONFLICTING_SOURCES` and reports its behaviour for `GOLD-14`/`GOLD-17` to falsify.

## Goal

Produce `packages/citations/src/validator/**`: strict PRD §36.5 output parsing, the twelve PRD §36.6
checks as individually-addressable deterministic rules each carrying the PRD's stated consequence, the
critical-error counters PRD §14.2 gates on, exactly one bounded repair call over the same pack, deletion
of still-failing claims, and the `FND-07` signal record for the final status check — all pure, with no
network, no provider and no clock. Completion is mechanically checkable: every §36.6 row has a passing
positive and a failing negative fixture, the pinned-release check fails the whole execution, the repair
loop is type-level bounded to one, and the count of surviving unsupported definitive claims is zero.

## Non-goals

- **No evidence-pack construction, delimitation, `evidence_id` assignment or pack hashing** —
  `EVID-04` (merged; this ticket's blocker). The pack is an input and is never rebuilt here.
- **No licence quote-limit policy, trimming rules, attribution text or export shaping** — `EVID-06`
  (`packages/citations/src/licensing/**`, `blocked_by` this ticket). This ticket **checks** the limit
  the pack carries and declares the refinement port.
- **No Markdown/HTML renderer, sanitiser implementation or URL allowlist implementation** — `EVID-10`
  (`packages/citations/src/render/**`, `blocked_by` this ticket). This ticket declares the sanitiser
  port with a conservative default that rejects all markup and all non-pack URLs.
- **No provider call, prompt text, schema-mode configuration or token accounting** — `EVID-07`
  (`packages/model-gateway/**`). The repair call is made **through** an injected port; PRD §45.2 keeps
  provider code out of `packages/citations`.
- **No answer status, claim-support classification, authority ranking, refusal table or prohibited-
  language list** — `00-foundation` (`FND-07`, `FND-10`). Consumed, never re-implemented (PRD §45.2).
- **No workflow orchestration, retry, cancellation, SSE or persistence** — `15-answer-product`
  (`ASK-02`, `ASK-05`) and `01-app-data` (`DATA-06`).
- **No evaluation metrics, gates or judge** — `21-evaluation-600` (`GOLD-02`, `GOLD-03`, `GOLD-04`,
  `GOLD-14`). This ticket exposes counters; the gates read them.
- **No cross-boundary citation/refusal suite** — `23-assurance` (`ASSR-04`, `blocked_by` this ticket).

## File-scope (write-owns)

Owned by this ticket:

- `packages/citations/src/validator/**`
- `packages/citations/test/validator/**` (sub-PRD **D21**)
- `packages/citations/package.json`, `packages/citations/src/index.ts` — **append-only**, own entries
  only

Does not touch:

- `packages/citations/src/pack/**` — `EVID-04` (merged); `src/licensing/**` — `EVID-06`;
  `src/render/**` — `EVID-10`.
- `packages/pii/**` — `EVID-01`…`EVID-03`; `packages/model-gateway/**` — `EVID-07`…`EVID-09`.
- `packages/contracts/**`, `packages/domain/**` — `00-foundation` (PRD §44.3 serial-owned); consumed,
  never written. `packages/database/**` — `01-app-data`. `packages/retrieval-client/**`,
  `services/search-rs/**` — `11-retrieval-engine`. `packages/ui/**` — `03-app-runtime`.
- `apps/**`, `pipelines/**`, `infra/**`, `tests/**`, `evals/**`, `docs/adr/**` — other modules per
  breakdown plan §4 and A9. `docs/PRD.md` — frozen.
- Root manifests and lockfiles — `FND-01`.

**Serial-safety analysis.** First decomposition: nothing merged, no in-flight contention (breakdown
plan §1 header). `packages/citations/src/validator/**` is written by no other ticket in the plan (plan
§5.13). This is a wave-2 ticket; its concurrent siblings are `EVID-02` (`packages/pii/**`) and
`EVID-08` (`packages/model-gateway/**`) — different packages, disjoint trees, no shared file. Its
intra-package neighbours are `EVID-04` (merged; blocker) and `EVID-06`/`EVID-10` (both `blocked_by`
this ticket, therefore never concurrent). Both declared blockers land first: `EVID-04` (module wave 1)
and `FND-10` (`00-foundation` wave 3). Shared append-only files: this package's manifest and
`src/index.ts`.

## Deliverables

1. **`src/validator/parse.ts::parseModelOutput(raw, pack): ParsedOutput | SchemaFailure`** — strict
   PRD §36.5 parsing:
   - unknown top-level or per-claim properties are a **failure**, not silently dropped — this is how
     `D14` is enforced: a provider that returns a `reasoning`, `thinking`, `chain_of_thought` or
     `scratchpad` field fails the schema rather than having it discarded (PRD §9.4);
   - `kind` must be one of the seven §36.5 values; `support` one of `FND-07`'s `ClaimSupport` values;
     `role` one of `FND-07`'s `CitationRole` values;
   - `quote_start`/`quote_end` must be non-negative integers with `start < end`;
   - `assumption_refs` must index an existing assumption;
   - a schema failure is a typed result; there is **no** best-effort text fallback and no free-text
     escape hatch (PRD §37.5 *"Returned JSON is schema-validated"*).
2. **`src/validator/checks/**` — one module per §36.6 row**, each exporting a pure
   `(claim | citation, pack, request, deps) => Finding[]`, so a Reviewer can read a row of the PRD
   beside a file. The mechanics, in the PRD's order:

   | # | Rule id | Mechanics | Consequence (`FindingConsequence`) |
   |---:|---|---|---|
   | 1 | `EVIDENCE_ID_EXISTS` | `pack.resolve(evidence_id)` returns an item of **this** pack (`EVID-04` deliverable 5) | `REJECT_CLAIM` |
   | 2 | `QUOTE_OFFSETS_REPRODUCE_TEXT` | with `[quote_start, quote_end)` interpreted relative to the item's `text_offset_base`, the slice of the item's NFC `exact_text` equals the quoted span; out-of-bounds, inverted or overlapping-escape offsets fail | `REJECT_CITATION` (+ `REPAIRABLE`) |
   | 3 | `VERSION_NODE_IN_PINNED_RELEASE` | the cited item's `document_version_id`/`node_version_id` belong to `pack.corpusReleaseId`, re-checked independently of `EVID-04` | **`FAIL_EXECUTION_INTEGRITY_INCIDENT`** |
   | 4 | `REQUESTED_DATE_IN_EFFECTIVE_INTERVAL` | `FND-10`'s `effectiveIntervalContains(item, request.legalAsAt)` | `REJECT_CLAIM` + `criticalLegalDateErrors++` |
   | 5 | `JURISDICTION_APPLIES` | `request.jurisdictions ∩ item.jurisdictions ≠ ∅` | `REJECT_CLAIM` + `criticalJurisdictionErrors++` |
   | 6 | `STATUS_ALLOWED_FOR_MODE` | `FND-10`'s `PERMITTED_STATUSES_BY_MODE[request.mode]` contains `item.legal_status`; future/proposed material in a non-future mode is `ISOLATE_FUTURE_SECTION`, never relabelled current | `REJECT_CLAIM` or `ISOLATE_FUTURE_SECTION` |
   | 7 | `CITATION_ROLE_PERMITTED` | the claimed `role` ∈ `item.citation_role_allowed`; a `BACKGROUND_ONLY`-only claim can never be definitive (`FND-07` deliverable 3) | `REJECT_CLAIM` or `DOWNGRADE_TO_BACKGROUND` |
   | 8 | `DEFINITIVE_WORDING_HAS_DIRECT_SUPPORT` | `FND-07`'s `isDefinitiveClaim(claim)` ∧ `classifyClaimSupport(...) ∈ {DIRECTLY_SUPPORTED}` for a definitive claim; `FND-07`'s `containsProhibitedCertainty(text)` is a failure in its own right | `DOWNGRADE`, else `REJECT_CLAIM` |
   | 9 | `CONTRADICTORY_AUTHORITY_ADDRESSED` | deliverable 3 | `REPAIRABLE`, else `CONFLICTING_SOURCES` signal |
   | 10 | `LICENCE_PERMITS_QUOTE` | quoted length ≤ `item.licence_quote_limit`; a `METADATA_AND_LINK_ONLY` or `PROHIBITED` item may carry no quote at all; refined by the `EVID-06` port | `TRIM_OR_METADATA_ONLY` — **never bypass** |
   | 11 | `URL_IS_CODE_GENERATED_OFFICIAL` | every URL in claim text, short answer, assumptions, next checks and limitations must be **identical** to an `officialUrl` in the pack; anything else is removed and counted — never rewritten to a plausible one | `REPLACE_URL` / `REJECT_CLAIM` |
   | 12 | `RENDERED_MARKUP_PASSES_SANITISATION` | the sanitiser port accepts the text; the built-in default rejects all raw HTML, all non-allowlisted Markdown constructs and all non-`https` schemes; refined by the `EVID-10` port | `SANITISE` |

   Every check evaluates **independently** — the runner does not short-circuit on the first failure,
   except for check 3, which aborts (deliverable 4). Basis: PRD §36.6 in full.
3. **`src/validator/checks/contradiction.ts` — check 9, made deterministic** (sub-PRD **Q-EVID-5**).
   A claim is `CONTRADICTORY_AUTHORITY_UNADDRESSED` when **all** of the following hold, using only
   evidence and code:
   - the pack contains an item `X` that the model cited with role `CONTRADICTS` for this claim, **or**
     an item `X` at the same pinpoint/provision as a supporting item whose `authority_role` compares
     **equal or higher** under `FND-10`'s `compareAuthority`;
   - the claim's own citation set contains no item that `QUALIFIES` or `CONTRADICTS` `X`, and the
     answer's `limitations`/`assumptions` do not reference `X`'s `evidence_id`;
   - `FND-07`'s `guidanceCannotOverride` is not already flagging the pair (that is check 7's job).

   The rule is **versioned frozen data** (`CONTRADICTION_RULE_V1`) so a change is explicit and
   auditable, its behaviour is reported for `GOLD-14`/`GOLD-17`, and its conservative outcome is the
   safe one: `CONFLICTING_SOURCES` (PRD §36.8). It never consults a model — PRD §14.3 forbids a judge
   from deciding *"legal correctness, binding status, date applicability"*, and PRD §9.4 requires the
   validation stage to be deterministic.
4. **`src/validator/run.ts::validate(output, pack, request, deps): ValidationResult`** — the ordered
   runner:
   1. parse (deliverable 1); a schema failure ends validation with no claims;
   2. run check 3 over every citation **first**; any failure aborts the whole execution with
      `IntegrityIncident { rule, evidenceId, packReleaseId, citedReleaseId }` and no partial result —
      PRD §36.6 *"Fail entire execution as integrity incident"*, PRD §35.8 invariant 3;
   3. run checks 1, 2, 4–12 over every claim and citation, collecting **all** findings;
   4. apply consequences: reject citations, reject/downgrade/isolate claims, replace or remove URLs,
      trim or metadata-only per licence, sanitise text;
   5. compute the counters (deliverable 5) and the `FND-07` signal record (deliverable 7).

   `ValidationResult` is `{ claims, citations, findings, counters, signals, integrityIncident? }` and
   carries **no** answer status (sub-PRD D10) and no prose.
5. **`src/validator/counters.ts` — the PRD §14.2 / §22 counters**, incremented only by the rules that
   PRD §36.6 names: `criticalLegalDateErrors` (check 4), `criticalJurisdictionErrors` (check 5),
   `unsupportedDefinitiveClaims` (check 8, counted **after** deletion so `ANS-005`'s "count is zero"
   is measurable on the delivered answer), `rejectedCitations`, `rejectedClaims`, `replacedUrls`,
   `sanitisedSpans`, `licenceTrims`, `repairAttempted`, `integrityIncidents`, plus a per-rule rejection
   histogram. The counters are plain numbers with no text, so PRD §22's *"Logs MUST exclude
   research/evidence content"* holds when they are emitted. `ASSR-04`'s evidence is *"validator counters
   increment"*, and `GOLD-02`/`GOLD-03` read the same names.
6. **`src/validator/repair.ts` — exactly one bounded repair, structurally.**
   `repairOnce(result, pack, port): ValidationResult`:
   - the port type is `(input: RepairInput) => Promise<unknown>` where
     `RepairInput = { findings: readonly StructuredFinding[]; pack: EvidencePack }` — **closed**, with
     no member for new candidates, a new query, a new date, a wider jurisdiction, a different mode or a
     different release. A type-level test asserts a caller cannot add one;
   - `StructuredFinding` carries rule id, claim/citation index, evidence id and consequence — **no
     free-form instruction text**, so the repair call cannot be turned into a second synthesis prompt;
   - the pack passed to the port is compared by `packHash` (`EVID-04` deliverable 9) before and after;
     a mismatch is a failure, not a retry — PRD §36.6 *"the same evidence pack"*;
   - the attempt counter is a type-level `0 | 1`; a second call is unrepresentable, not merely guarded;
   - the repaired output is re-parsed and **all twelve checks run again** — repair grants no exemption;
   - claims still failing after repair are **deleted** (PRD §36.6 *"After repair, failed claims are
     deleted"*), and the deletion is recorded in the findings so the workflow can explain it.
7. **`src/validator/signals.ts` — the `FND-07` handoff.** After deletion the validator emits exactly the
   signal record `FND-07`'s `decideAnswerStatus` accepts — `outOfScope`,
   `sourceStaleOrUnavailableAndMaterial`, `unreconciledAuthorityConflict`,
   `sufficientApplicableEvidence`, `allMaterialClaimsSupported`, `materialFactUnknown` — and calls it,
   returning both the status and the fired-condition list. Specifically: deletion that removes the
   material conclusion sets `sufficientApplicableEvidence: false`, so the status becomes
   `INSUFFICIENT_EVIDENCE`; an unresolved check-9 finding sets `unreconciledAuthorityConflict: true`,
   so it becomes `CONFLICTING_SOURCES` (PRD §36.6 closing paragraph, §36.8). This module chooses no
   status itself (sub-PRD **D10**).
8. **`src/validator/ports.ts` — the two refinement ports and their conservative defaults.**
   `LicenceLimitPort` (refined by `EVID-06`) and `SanitiserPort` (refined by `EVID-10`), each with a
   built-in default that is **stricter** than the final implementation: the default licence policy
   permits a quote only up to the pack's `licence_quote_limit` and forbids any quote when the limit is
   absent or zero; the default sanitiser rejects all raw HTML, all Markdown beyond paragraphs, emphasis
   and lists, and every URL that is not identical to a pack `officialUrl`. Defaults are exported as
   `STRICT_PORT_DEFAULTS` and documented as such, so a missing port never means a missing check.
9. **Purity and isolation.** No network, no file, no database, no clock, no randomness, no
   `process.env`, no logger; the repair port is the module's only outward call and it is injected. An
   import-graph test asserts no provider SDK, HTTP client or database driver is reachable from
   `src/validator/**`. Basis: PRD §39.1, §45.2 (`packages/citations` must not own "model prose"); sub-PRD
   **D8**.
10. **`test/validator/fixtures/**` — one directory per §36.6 row** (synthetic, authored here per sub-PRD
    D22), each with a **passing** case and at least one **failing** case, plus:
    - `prd-36-6-checks.json` — the §36.6 table transcribed verbatim (check name, consequence), asserted
      against the rule registry so a missing or renamed rule fails;
    - `uat-ans-05.json` — the wrong-offset, wrong-date and wrong-jurisdiction fixtures named in PRD
      §41.2, asserting rejection **and** counter increment;
    - `integrity-incident.json` — a citation naming a node from another release, asserting the whole
      execution fails;
    - `repair/**` — a repairable finding set, the repaired output, and a still-failing output whose
      claims are deleted and whose status downgrades;
    - `injection/**` — model output carrying a fabricated `evidence_id`, an invented URL, embedded HTML
      and a prohibited-certainty phrase.
11. **`src/validator/testing/**`** — a `./testing` export giving `EVID-06`, `EVID-10`, `ASK-02`,
    `GOLD-14` and `ASSR-04` a canned `ValidationResult` builder and a scripted repair port, so no
    downstream module invents divergent semantics.
12. **`README.md` update in `packages/citations`** — append the twelve-check table with each rule's file,
    the abort rule for check 3, the one-repair rule and how it is type-enforced, the counter names, and
    the statement that the status decision belongs to `FND-07`.

## Acceptance checklist (classified)

- [ ] `[fixture]` **All twelve §36.6 rows replay**: `prd-36-6-checks.json` matches the rule registry
      name-for-name and consequence-for-consequence, and every row has a passing and a failing fixture.
      (PRD §36.6; `ANS-005`)
- [ ] `[fixture]` **`UAT-ANS-05`**: wrong-offset, wrong-date and wrong-jurisdiction fixtures are
      rejected, the claim is repaired or removed, and `criticalLegalDateErrors` /
      `criticalJurisdictionErrors` increment. (PRD §41.2 `UAT-ANS-05`; §36.6; §14.2)
- [ ] `[fixture]` **Integrity incident**: a citation naming a node outside `pack.corpusReleaseId` fails
      the **entire execution** — no partial claims, no repair attempt — and increments
      `integrityIncidents`. (PRD §36.6 row 3; §35.8 invariant 3)
- [ ] `[machine]` **Unsupported definitive claims are zero after validation**: a property test over
      generated outputs asserts no surviving claim is both definitive (`FND-07`'s `isDefinitiveClaim`)
      and lacking direct sufficient support; `unsupportedDefinitiveClaims` is measured on the delivered
      claim set. (PRD §14.2; **`ANS-005`** *"Unsupported definitive claim count is zero"*)
- [ ] `[machine]` **`BACKGROUND_ONLY` cannot support a definitive claim** — asserted through
      `FND-07`'s `classifyClaimSupport`, not re-implemented here. (PRD §15.5; §36.6 row 7)
- [ ] `[machine]` **Schema strictness**: an output containing `reasoning`, `chain_of_thought`,
      `thinking` or any unknown field is a **schema failure**, not a silent drop; there is no free-text
      fallback path. (PRD §9.4; §37.5; sub-PRD D14)
- [ ] `[machine]` **Exactly one repair**: a type-level test proves a second repair call is
      unrepresentable; a runtime test proves the port is invoked at most once and that all twelve checks
      re-run afterwards. (PRD §36.6; sub-PRD D11)
- [ ] `[machine]` **Repair cannot widen scope**: a type-level test proves `RepairInput` has no member
      for new candidates, query, date, jurisdiction, mode or release; a runtime test proves a port that
      mutates the pack is caught by the `packHash` comparison. (PRD §36.6 *"cannot retrieve new evidence
      or expand scope"*)
- [ ] `[fixture]` **Deletion and downgrade**: still-failing claims are deleted after repair and, when
      deletion removes the material conclusion, `FND-07` returns `INSUFFICIENT_EVIDENCE`; an unresolved
      check-9 finding returns `CONFLICTING_SOURCES`. (PRD §36.6 closing paragraph; §36.8)
- [ ] `[machine]` **The validator chooses no status**: a test asserts `ValidationResult` has no
      `AnswerStatus` member and that the status comes from `FND-07`'s function. (PRD §45.2; sub-PRD D10)
- [ ] `[machine]` **URLs are pack-identical or removed**: an invented URL, a look-alike official domain,
      a `javascript:`/`data:` scheme and a percent-encoded evasion are all removed and counted; none is
      rewritten into a "corrected" URL. (PRD §36.6 row 11; §37.5; `SEC-003`; sub-PRD D20)
- [ ] `[machine]` **Licence limits are never bypassed**: a quote exceeding `licence_quote_limit`, and
      any quote from a `METADATA_AND_LINK_ONLY` or `PROHIBITED` item, are trimmed or reduced to
      metadata+link by the strict default port. (PRD §36.6 row 10; §11.1)
- [ ] `[machine]` **Missing port ≠ missing check**: with `STRICT_PORT_DEFAULTS` in place, checks 10 and
      12 still fail their negative fixtures. (PRD §36.6; sub-PRD D8)
- [ ] `[machine]` **No short-circuit**: an output failing four different checks reports all four
      findings (except check 3, which aborts). (PRD §36.6; `UAT-ANS-05` *"critical metric increments"*)
- [ ] `[machine]` **Counters carry no content**: a canary in claim text never appears in any counter,
      finding message or thrown error. (PRD §22)
- [ ] `[machine]` **Purity/isolation**: import-graph test finds no provider SDK, HTTP client, database
      driver or file access; no clock, randomness or `process.env`; repeated validation is deeply equal.
      (PRD §39.1, §45.2; sub-PRD D8)
- [ ] `[machine]` `pnpm lint`, `pnpm typecheck` and `pnpm test` green (standing item, PRD §45.3).
- [ ] `[machine]` `pnpm generate && pnpm generated:check` clean. (PRD §20.1, §45.3)
- [ ] `[machine]` No Rust or Python surface — `cargo test --workspace` / `uv run pytest` unaffected;
      declared not applicable. (PRD §45.3)
- [ ] `[machine]` **Writeback item**: sub-PRD **Q-EVID-5** in `docs/prd/12-evidence-safety/README.md` is
      updated with `CONTRADICTION_RULE_V1`'s exact rule and its measured behaviour on the fixtures.
      (Breakdown plan §1.1; CLAUDE.md issue #53)
- [ ] `[machine]` PR states the PRD §45.4 items: requirement/UAT IDs (**ANS-005**, **SEC-003**;
      `UAT-ANS-05` and `UAT-ANS-03`, run end to end by `15-answer-product` and `23-assurance`/`ASSR-04`),
      user-visible change and non-goals, schema/API/event compatibility impact (the `ValidationResult`
      shape consumed by `ASK-02`, `EVID-06`, `EVID-10`, `GOLD-02`), **tenant/PII/security and retention
      impact** (no content in counters or findings messages), **source/licence impact** (check 10 is a
      hard gate), cost/memory/latency impact (validation is CPU-only inside `apps/worker`'s 384 MiB —
      report p95 for a 20-item pack; the repair call is one hosted call and is `EVID-08`-reserved),
      **an evaluation subset** (PRD §45.4: *"Changes to legal status/date/citation behaviour include an
      evaluation subset"* — name the `GOLD-14` cases), rollback path, known gaps (**Q-EVID-5**).

Absent classes: no `[human]` criteria — deterministic validation is verified mechanically, and PRD
§14.3 explicitly makes deterministic checks (not human or model judgement) the controlling gate. The
human-facing acceptance is `UAT-ANS-03`/`UAT-ANS-05` at Gate 2 through `15-answer-product`, and PRD
§43.4 founder review of failures belongs to `21-evaluation-600`. The `[fixture]` items are synthetic
corpora authored here (sub-PRD D22) — the PRD §14/§43 evaluation replays are `21-evaluation-600`.

## Test plan

Every step runs offline: no network, **no provider key**, no model. The repair port is a scripted stub
in every test.

1. **Read the check table against the PRD.** Compare `test/validator/fixtures/prd-36-6-checks.json`
   with `docs/PRD.md` §36.6 row by row — twelve rows, twelve consequences, in order. A reordered or
   merged row silently deletes a rule.
2. **Run the suite.** `pnpm --filter @<scope>/citations test`, then `pnpm test`, `pnpm typecheck`,
   `pnpm lint` and `pnpm generate && pnpm generated:check` from the repository root. Construction
   pattern to copy: `FND-10`'s `packages/domain/test/legal/**` (fixture-first) and `EVID-04`'s
   `test/pack/**` (pack builder from `./testing`).
3. **Per-row positive/negative.** For each of the twelve rows, run its passing fixture (no finding) and
   its failing fixture (exactly the tabled consequence). Confirm the failing fixture fails for the
   stated reason, not incidentally.
4. **Integrity abort.** Run `integrity-incident.json`; assert no claims are returned, no repair is
   attempted and the incident names both release ids.
5. **Repair bound.** Script a port that always returns still-failing output; assert it is called exactly
   once, that the twelve checks re-run, that failing claims are deleted and that the status downgrades.
   On a scratch branch make the counter a plain `number` and loop twice; assert the type-level test
   fails; discard.
6. **Pack-immutability test.** Script a port that returns a mutated pack; assert the `packHash`
   comparison rejects it.
7. **Scope-widening test.** Attempt to construct a `RepairInput` with an extra `candidates` member;
   assert a compile error.
8. **URL matrix.** Feed invented, look-alike, `javascript:`, `data:`, protocol-relative,
   percent-encoded and unicode-confusable URLs; assert removal and `replacedUrls` increment, and that no
   output URL differs from a pack `officialUrl`.
9. **Definitive-claim property test** (≥ 10,000 generated outputs): no surviving claim is definitive
   without direct sufficient support; `unsupportedDefinitiveClaims` is zero on the delivered set.
10. **Counter canary.** Put a canary token in claim text; assert it appears in no counter, finding or
    error.
11. **Purity.** Inject a failing global `fetch`; assert it is never called. Grep `src/validator/**` for
    `fetch(`, `http`, `sqlite`, `Date.now`, `Math.random`, `process.env` — none.
12. **Append-only manifest.** `git diff packages/citations/package.json packages/citations/src/index.ts`
    shows additions only.
13. **Reviewer focus.** Confirm each of the twelve rules is separately addressable and separately
    tested; confirm check 3 aborts rather than rejecting a claim; confirm the repair port genuinely
    cannot receive new evidence; confirm no status is chosen here; confirm `STRICT_PORT_DEFAULTS` fail
    their negative fixtures so a missing `EVID-06`/`EVID-10` cannot silently disable a check; confirm
    check 9's rule is versioned data with its behaviour written back to Q-EVID-5.

## Feedback obligation

1. **General rule.** If implementation falsifies this ticket, update **this ticket** (docs PR →
   merge → `publish-tickets.mjs --sync`) and, where module context changes,
   `docs/prd/12-evidence-safety/README.md` (version +0.1 with a changelog line) **before** changing
   code. Silent divergence is an incomplete ticket. PRD §45.4 additionally requires an **evaluation
   subset** with any change to legal status/date/citation behaviour.
2. **Foreseeable frictions, each with its exact writeback target:**
   - *Check 9 cannot be decided from evidence alone on a real case* → this is sub-PRD **Q-EVID-5**,
     owned here. Record the case and the rule's behaviour in
     `docs/prd/12-evidence-safety/README.md` **Q-EVID-5** first, bump `CONTRADICTION_RULE_V1`, and
     notify `21-evaluation-600` (`GOLD-14`). **Never** resolve it by asking a model: PRD §14.3 forbids a
     judge from deciding legal correctness and PRD §9.4 requires this stage to be deterministic — see
     item 3.
   - *One repair is not enough to salvage otherwise-good answers* → PRD §36.6 says one. The correct
     outcome of an unsalvageable answer is `INSUFFICIENT_EVIDENCE` (PRD §36.8), which is a **product
     feature**, not a defect. Record the pressure in `docs/prd/12-evidence-safety/README.md`; raising
     the bound is a PRD §45.5 product change and also moves the §36.7 hosted-call limits and the §24
     budget.
   - *`FND-07`'s signal record lacks a signal this validator produces* → extend it **in `FND-07`**
     (docs PR against `00-foundation`, per that ticket's own feedback item 2), record it in
     `docs/prd/12-evidence-safety/README.md`, and never add a second status decision here (PRD §45.2).
   - *`FND-10`'s per-mode status sets reject material a real answer needs* → that is `FND-10`'s open
     question **Q-F5**, owner **Founder**. Route it there; do not add a local exception, because PRD
     §36.3 states no score may reintroduce a filtered item and a validator exception is the same failure
     by another route.
   - *`EVID-06`/`EVID-10` need a port shape this ticket does not expose* → change the **port here** in
     one docs PR amending this ticket and theirs together; never let them write `src/validator/**`.
   - *`ASK-02` wants the validator to make the repair call itself* → refuse. PRD §45.2 keeps provider
     code out of `packages/citations`; the port stays injected. Record any pressure in
     `docs/prd/12-evidence-safety/README.md` **D8**.
   - *An offset convention disagreement with `EVID-04` appears* → amend **both tickets in one docs PR**
     (see `EVID-04`'s matching item); a half-open/inclusive mismatch between pack and validator is a
     silent citation-precision failure that both sides would pass in isolation.
3. **Falsified protocol.** **A §36.6 check that cannot be enforced deterministically overturns PRD
   §9.4.** If any of the twelve rows proves impossible to decide from evidence and code — most likely
   row 9 — do **not** relax it, soften its consequence, make it advisory, or delegate it to a model
   inside this ticket. Stop, escalate for re-review, raise an ADR under `docs/adr/`, and write back to
   `docs/prd/12-evidence-safety/README.md` **and** `docs/prd/breakdown-plan.md` before any code. PRD
   §9.4's sequence and PRD §21's *"trust a displayed answer only after deterministic validation"* are
   the product's core safety promise; a check quietly downgraded here is indistinguishable, at review
   time, from an answer that was never validated.
