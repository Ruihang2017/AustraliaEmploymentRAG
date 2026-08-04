---
id: INGF-04
title: Licence snapshot/assessment registry and permitted-use gate
module: 05-ingestion-framework
lane: 05-ingestion-framework
size: L
agent: builder
status: draft
date: 2026-08-03
blocked_by: [INGF-03]
blocks: [INGF-07, INTL-05]
---

# INGF-04 — Licence snapshot/assessment registry and permitted-use gate

Implements PRD §11.1 (licensing registry), PRD §35.3 (`licence_snapshot`, `licence_assessment`) and
PRD §6.1 (source policy) — no ADR — the decision is already made in PRD §11.1; this is build ticket
4 of 9 against it.
Parent sub-PRD: [05-ingestion-framework README](../README.md). Master spec: [PRD](../../../PRD.md).
Depends on: [INGF-03 — Immutable artifact store](INGF-03-immutable-artifact-store-with-hashing-and-r2-keys.md)
**Why `builder`:** a bounded implementation of one port declared in `INGF-01`, against decision
states and defaults PRD §11.1 enumerates verbatim — not a new subsystem decision.

## Background + basis

**PRD §11.1 is the whole specification:**

> "Every SourceArtifact MUST link to the LicenceSnapshot applicable when acquired. LicenceAssessment
> MUST independently state commercial-use, storage, indexing, embedding, display, quotation, export,
> attribution and prohibited-use decisions."
>
> Assessment states: `PERMITTED`, `PERMITTED_WITH_ATTRIBUTION`, `METADATA_AND_LINK_ONLY`,
> `UNCLEAR_RESTRICTED`, `PROHIBITED`, `REVIEW_REQUIRED`.
>
> "**Unclear rights default to metadata, limited quotation and official links.** The product MUST NOT
> reproduce third-party commercial headnotes or imply government endorsement. Customer exports MUST
> apply the same restrictions."

**PRD §35.3 fixes the two records.** `licence_snapshot`: `id`, `source_id`, `captured_at`,
`terms_url`, `terms_sha256`, `artifact_key` — *"immutable"*. `licence_assessment`: `id`,
`licence_snapshot_id`, use-decision columns, `attribution_text`, `max_quote_chars`, `status`,
`assessed_at`, `notes_internal` — *"renderer/exporter enforces decisions"*.

**PRD §40.9** places `L[Licence gate]` between `F[Fetch + hash immutable artifact]` and
`P[Parse/OCR in isolation]`. The gate therefore runs after the artifact exists and before any content
is parsed, indexed, embedded or displayed.

**PRD §40.8 item 1** makes "registry row(s), official URL allowlist and **licence snapshot/assessment**"
part of every adapter's Definition of Done — 52 times. Plan §2.1 **A2** is the direct consequence:
these are **per-adapter files**, never one shared document, "because one shared file would serialise
all 52 adapter tickets". This ticket owns the schema for `pipelines/adapters/<group-id>/licence.yaml`
and `pipelines/adapters/<group-id>/licence-snapshots/**` (sub-PRD **D3**).

**PRD §6.1** constrains what may be in the corpus at all: "Only official public sources are eligible…
Third-party commercial headnotes and summaries are excluded. Official regulator summaries MAY
supplement but MUST NOT replace primary decisions or operative instruments."

**PRD §7** gives the customer-visible limited state this gate can force:
`LICENSING_RESTRICTED` — and forbids `PLANNED_NOT_ACTIVE` at release.

**Downstream consumers.** `INTL-05` (Licensing review console, `22-internal-admin`) is `blocked_by`
this ticket and requires "Assessment states reviewable and revisable with history" (ADM-001).
`EVID-06` (`packages/citations/src/licensing/**`) enforces quote limits at display/export time and
`XPRT-02`/`XPRT-03` at render time — **they consume this data, they do not duplicate the decision**.

**Carried caveat (sub-PRD M2).** PRD §11.1 says "limited quotation" and PRD §35.3 gives
`max_quote_chars` as a column, but the PRD fixes no number. This ticket pins a conservative initial
default and records it as an initial default, explicitly **not** a product rule (PRD §45.1 item 5:
"do not silently turn an initial default into a new product rule"). Owner of the real value: the
Founder, under PRD §11.2's `LEGAL_REVIEW_PENDING` risk.

## Goal

Implement the licensing layer under `pipelines/ingestion/src/<root>/licensing/**`: the per-adapter
`licence.yaml` schema and loader, an immutable snapshot capture path that fetches and stores the
terms document through `INGF-02`/`INGF-03`, the `LicenceAssessment` model covering all nine PRD §11.1
decision axes, and the `LicenceGate` port implementation that answers a permitted-use question for
each of the six intended uses — with unclear or missing rights collapsing to the metadata/link-only
permission set **before** storage, indexing, embedding, display, quotation or export, proven by an
exhaustive decision-table test.

## Non-goals

- **No enforcement at render or export time** — `EVID-06` (`packages/citations`), `XPRT-02`,
  `XPRT-03`, `XPRT-04`. This ticket produces the decision; those tickets apply it. PRD §35.3:
  "renderer/exporter enforces decisions".
- **No licensing review UI or revision history UI** — `INTL-05` (`22-internal-admin`), which is
  `blocked_by` this ticket.
- **No index-tier assignment.** `CRPS-04` owns `T1/T2/T3/EXCLUDED_LICENSING/QUARANTINED_QUALITY`
  (PRD §17.2). This ticket emits an `index_eligibility` constraint (`EXCLUDED_LICENSING` or `None`)
  and nothing else.
- **No registry composition or coverage status** — `INGF-07`. This ticket exposes the licence facts
  the registry reads.
- **No legal advice or licence interpretation for any real source** — modules `06`–`10` author each
  group's `licence.yaml`; PRD §11.2 keeps external legal review as an explicit open risk
  (`LEGAL_REVIEW_PENDING`).
- **No fetching outside `INGF-02`'s fetcher** — the terms document is fetched through the same
  allowlisted, SSRF-safe path as any other artifact (PRD §37.4).
- **No customer-facing licence copy** — `24-launch` / `LNCH-01` owns `docs/policies/**`.

## File-scope (write-owns)

- `pipelines/ingestion/src/<root>/licensing/**` (plan §5.6 `src/licensing/**`).
- `pipelines/ingestion/tests/licensing/**`.
- `pipelines/ingestion/pyproject.toml` — **append-only** (YAML/JSON-Schema validation deps);
  conflicts resolve by re-running `uv lock` (plan §1.1).
- Does not touch: `pipelines/ingestion/src/<root>/{adapter,fetch,artifacts,quarantine,runs,parsing,registry,discovery,conformance}/**`
  — `INGF-01`…`INGF-03`, `INGF-05`…`INGF-09`.
- Does not touch: `pipelines/adapters/**` — modules `06`–`10` own every real `licence.yaml`;
  synthetic fixtures live under `pipelines/ingestion/tests/licensing/fixtures/adapters/`.
- Does not touch: `packages/citations/**` — `12-evidence-safety` (`EVID-06`).
- Does not touch: `apps/api/src/routes/internal/**`, `apps/admin/**` — `22-internal-admin`
  (`INTL-05`).
- Does not touch: `pipelines/corpus-builder/**` — `04-corpus-contract` (`CRPS-04` owns tiering).

**Serial safety.** First decomposition; nothing merged, nothing in flight. `INGF-01`…`INGF-03` have
landed and own `adapter/`, `fetch/` and `artifacts/`. The ticket that can be concurrent with this one
is **`INGF-05`** (both are `blocked_by INGF-03`), which owns `src/<root>/{quarantine,runs}/**` and
`tests/{quarantine,runs}/**` — disjoint. `INGF-06` may also still be in flight (`blocked_by INGF-02`),
owning `parsing/` — also disjoint. The one shared path is `pyproject.toml`, append-only by plan §1.1.

## Deliverables

1. **`<root>.licensing.schema` — the per-adapter `licence.yaml` (sub-PRD D3).** Exact path
   `pipelines/adapters/<group-id>/licence.yaml`; exact keys, validated by a committed JSON Schema at
   `<root>/licensing/schema/licence.schema.json` with `additionalProperties: false`:

   ```yaml
   group_id: LEG-CTH
   snapshot:
     terms_url: https://www.legislation.gov.au/copyright
     captured_at: 2026-08-03T00:00:00Z         # UTC ISO-8601 (PRD §35.1)
     terms_sha256: <64 hex>                    # hash of the stored snapshot artifact
     snapshot_file: licence-snapshots/2026-08-03-<sha256[:12]>.html
   assessment:
     commercial_use: ALLOWED                   # ALLOWED | DENIED | UNCLEAR  (all nine axes)
     storage: ALLOWED
     indexing: ALLOWED
     embedding: ALLOWED
     display: ALLOWED
     quotation: ALLOWED
     export: ALLOWED
     attribution: REQUIRED                     # REQUIRED | NOT_REQUIRED | UNCLEAR
     prohibited_uses: []                       # free-text list; non-empty implies review
     attribution_text: "© Commonwealth of Australia"
     max_quote_chars: 5000                     # integer; required unless status is PROHIBITED
     status: PERMITTED_WITH_ATTRIBUTION        # one of the six PRD §11.1 states
     assessed_at: 2026-08-03T00:00:00Z
     assessed_by: founder                      # free text; who made the call
     notes_internal: ""                        # never customer-visible (PRD §35.3)
   ```

   The nine decision axes are exactly PRD §11.1's list: commercial-use, storage, indexing, embedding,
   display, quotation, export, attribution, prohibited-use. A missing axis is a **load error**, not a
   default — the assessment must "independently state" each one.

2. **`<root>.licensing.snapshot` — immutable snapshot capture.**
   `capture_snapshot(group_id, terms_url, *, fetcher, artifacts, clock) -> LicenceSnapshotRecord`
   fetches the terms document through `INGF-02`'s `Fetcher` (so the terms URL must itself be in that
   group's `allowlist.yaml`), stores it through `INGF-03`'s `ArtifactStore` with
   `storage_permitted=True` (terms text is public), and returns a record with exactly the PRD §35.3
   `licence_snapshot` columns: `id`, `source_id`, `captured_at`, `terms_url`, `terms_sha256`,
   `artifact_key`. Also writes the snapshot copy into the group's `licence-snapshots/` directory when
   invoked in "author" mode by an adapter ticket (a CLI, deliverable 8) — the framework never edits an
   adapter's files during an ingestion run. Snapshots are **append-only**: a second capture of the
   same `terms_url` with different bytes creates a *new* snapshot file and a new record; it never
   overwrites (PRD §35.3 "immutable").

3. **`<root>.licensing.model` — the assessment.** `LicenceAssessment` frozen dataclass with the PRD
   §35.3 columns (`id`, `licence_snapshot_id`, the nine decisions, `attribution_text`,
   `max_quote_chars`, `status`, `assessed_at`, `notes_internal`) plus `AssessmentStatus` as a closed
   enum of exactly the six PRD §11.1 states, in PRD order. A consistency validator rejects
   combinations that contradict the status — e.g. `status: PERMITTED` with any axis `DENIED` or
   `UNCLEAR`; `status: PERMITTED_WITH_ATTRIBUTION` with `attribution: NOT_REQUIRED`; `status:
   PROHIBITED` with any axis `ALLOWED`; a non-empty `prohibited_uses` with `status: PERMITTED`.

4. **`<root>.licensing.gate` — the `LicenceGate` implementation (the load-bearing deliverable).**
   `evaluate(group_id: str, use: IntendedUse) -> LicenceDecision` where `IntendedUse` is `INGF-01`'s
   six-value type (`STORE_ARTIFACT`, `INDEX_LEXICAL`, `EMBED`, `DISPLAY_TEXT`, `QUOTE`, `EXPORT`).
   The **conservative collapse** (PRD §11.1 "Unclear rights default to metadata, limited quotation and
   official links") is applied before the axis lookup:

   | Status | Effective permission set |
   |---|---|
   | `PERMITTED` | per-axis decisions as declared |
   | `PERMITTED_WITH_ATTRIBUTION` | as declared; every allowed decision carries `attribution_text`, which must be non-empty |
   | `METADATA_AND_LINK_ONLY` | `STORE_ARTIFACT` allowed; `INDEX_LEXICAL` metadata-only; `EMBED` denied; `DISPLAY_TEXT` denied; `QUOTE` allowed up to `max_quote_chars`; `EXPORT` metadata + official link only |
   | `UNCLEAR_RESTRICTED` | **collapses to `METADATA_AND_LINK_ONLY`** with `max_quote_chars = min(declared, UNCLEAR_MAX_QUOTE_CHARS)` |
   | `REVIEW_REQUIRED` | **collapses to `METADATA_AND_LINK_ONLY`** with the same clamp |
   | `PROHIBITED` | every use denied, including `STORE_ARTIFACT`; `index_eligibility = EXCLUDED_LICENSING` |
   | *missing / unloadable `licence.yaml`* | treated as `REVIEW_REQUIRED` — **never** as permitted |

   An individual axis marked `UNCLEAR` is denied for `EMBED`, `DISPLAY_TEXT` and `EXPORT`, and
   downgraded to the metadata/link-only behaviour for `INDEX_LEXICAL` and `QUOTE`, regardless of
   status. `LicenceDecision` carries `allowed`, `reason` (a `FailureCode` when denied),
   `max_quote_chars`, `attribution_text` and `index_eligibility`.

5. **`UNCLEAR_MAX_QUOTE_CHARS = 200`** — a named constant whose docstring states verbatim: *"Initial
   default, not a product rule (PRD §45.1 item 5). PRD §11.1 requires 'limited quotation' for unclear
   rights but fixes no number; the value is owned by the Founder under PRD §11.2's
   `LEGAL_REVIEW_PENDING` risk — see sub-PRD open question M2."* A test asserts the docstring contains
   the words "Initial default".

6. **Gate placement helper.** `permitted_storage(group_id) -> bool` — the single call `INGF-05`'s
   stage runner makes between fetch and parse (PRD §40.9 `F → L → P`) to derive the
   `storage_permitted` argument `INGF-03.put()` already accepts. Exposed as a stable function so the
   runner does not reach into gate internals.

7. **Failure codes** registered with `register_failure_codes("licensing", …)`, each with an operator
   action: `LICENCE_MISSING`, `LICENCE_INVALID`, `LICENCE_SNAPSHOT_MISMATCH` (file hash ≠
   `terms_sha256`), `LICENCE_AMBIGUOUS` (the PRD §12.2 quarantine class "licensing ambiguity"),
   `LICENCE_PROHIBITED`, `LICENCE_ATTRIBUTION_MISSING`, `LICENCE_STATUS_INCONSISTENT`.

8. **CLI.** `python -m <root>.licensing capture <group-dir> [--terms-url URL]` (author mode: fetch,
   store, write the snapshot file and fill `snapshot.*` in the group's `licence.yaml`) and
   `python -m <root>.licensing check <group-dir>` (validate schema + snapshot hash + status
   consistency, exit non-zero on failure). `check` is what `INGF-09`'s DoD item 1 invokes and what
   adapter tickets run locally.

9. **Export of the review surface.** `list_assessments(adapters_root) -> Sequence[LicenceAssessment]`
   plus a stable JSON serialisation — the read model `INTL-05` renders. Revision **history** comes
   from the append-only snapshot files plus `assessed_at`; this ticket exposes them ordered, and the
   console owns the UI.

## Acceptance checklist (classified)

- [ ] `[machine]` `licence.yaml` schema: a file missing any one of the nine PRD §11.1 decision axes
      fails to load — nine parametrised cases, one per axis (PRD §11.1 "MUST independently state").
- [ ] `[machine]` `AssessmentStatus` contains exactly the six PRD §11.1 states, in PRD order, and no
      others (PRD §11.1).
- [ ] `[machine]` Status/axis consistency validator rejects each contradictory combination in
      deliverable 3 and accepts each consistent one (table test) (PRD §11.1).
- [ ] `[machine]` **Conservative collapse**: `UNCLEAR_RESTRICTED` and `REVIEW_REQUIRED` both produce
      the `METADATA_AND_LINK_ONLY` permission set with `max_quote_chars ≤ UNCLEAR_MAX_QUOTE_CHARS`;
      a **missing** `licence.yaml` produces the same and never an allow (PRD §11.1 "Unclear rights
      default to metadata, limited quotation and official links").
- [ ] `[machine]` **Full decision table**: 6 statuses × 6 intended uses = 36 cases asserted against
      an explicit expected table held in the test file, plus the per-axis `UNCLEAR` override cases
      (PRD §11.1; deliverable 4).
- [ ] `[machine]` `PROHIBITED` denies `STORE_ARTIFACT` and yields
      `index_eligibility == "EXCLUDED_LICENSING"` (PRD §11.1, §17.2).
- [ ] `[machine]` `PERMITTED_WITH_ATTRIBUTION` with an empty `attribution_text` fails validation with
      `LICENCE_ATTRIBUTION_MISSING`; a permitted decision always carries the attribution text
      (PRD §11.1 "MUST NOT … imply government endorsement" / attribution decision).
- [ ] `[fixture]` **Snapshot capture** replays a recorded terms-page response through the `INGF-02`
      fetcher stub and the `INGF-03` local store: the record carries exactly the PRD §35.3
      `licence_snapshot` columns; the stored file's SHA-256 equals `terms_sha256`; a second capture
      with different bytes creates a **new** snapshot and leaves the first byte-identical
      (PRD §35.3 "immutable").
- [ ] `[machine]` `LICENCE_SNAPSHOT_MISMATCH` is raised when the on-disk snapshot file's hash differs
      from `terms_sha256` (tamper detection) (PRD §35.3).
- [ ] `[machine]` `permitted_storage()` returns `False` for `PROHIBITED` and `True` for
      `METADATA_AND_LINK_ONLY`, and the value flows into `INGF-03.put(storage_permitted=…)` so
      `r2_key is None` exactly when storage is denied (PRD §35.3, §40.9).
- [ ] `[machine]` `UNCLEAR_MAX_QUOTE_CHARS`'s docstring contains "Initial default" and cites PRD
      §45.1 (PRD §45.1 item 5; sub-PRD M2).
- [ ] `[machine]` `python -m <root>.licensing check` exits non-zero for each invalid fixture group and
      zero for the valid one (the entry point `INGF-09` DoD item 1 calls).
- [ ] `[machine]` Every failure code in deliverable 7 is registered with a non-empty operator action
      (ADM-001, PRD §40.8 item 10, PRD §12.2 "licensing ambiguity" → quarantine).
- [ ] `[machine]` `uv run pytest` green.
- [ ] `[machine]` `pnpm test` green (unchanged — no TypeScript in this ticket).
- [ ] `[human]` **Founder review of the collapse table and `UNCLEAR_MAX_QUOTE_CHARS`.** PRD §11.2
      keeps external legal review an explicit unresolved launch risk (`LEGAL_REVIEW_PENDING`) and PRD
      §43.4 item 4 puts "source adapter count/time/licence/quarantine anomalies" in the founder review
      queue. This is irreducibly a judgment call, not a test (sub-PRD M2).
- [ ] `[human]` PR body states the PRD §45.4 items, with the **source/licence/provenance impact**
      section filled in full: requirement IDs (**ADM-001**; supports **EXP-001**'s licence fidelity
      via `EVID-06`); UAT IDs — none directly (`UAT-EXP-01` is `XPRT-02`'s); schema/API/event
      compatibility (fixes `licence.yaml`, consumed by 52 adapter tickets); tenant/PII/security impact
      (none — no customer data); cost/memory/latency impact (negligible); rollback path; known gaps
      (sub-PRD M2).
- **No further `[fixture]` criteria** beyond snapshot capture — the gate is pure logic over loaded
  files. Declared explicitly.

## Test plan

Harness: `uv run pytest pipelines/ingestion/tests/licensing -q`, fully offline. Fixture groups live
under `pipelines/ingestion/tests/licensing/fixtures/adapters/` (`demo-permitted`,
`demo-attribution`, `demo-metadata-only`, `demo-unclear`, `demo-review`, `demo-prohibited`,
`demo-missing-axis`, `demo-inconsistent`, `demo-no-licence-file`, `demo-tampered-snapshot`).

1. `uv sync --frozen && uv run pytest pipelines/ingestion/tests/licensing -q`.
2. **`test_schema.py`** — nine missing-axis cases, unknown key, bad status value, `max_quote_chars`
   absent with a non-`PROHIBITED` status, malformed `captured_at`.
3. **`test_model.py`** — the consistency validator table (accept and reject rows).
4. **`test_gate_table.py`** — the 36-cell decision table plus the per-axis `UNCLEAR` overrides plus
   the missing-file case. The expected table is written out literally in the test file so a change to
   the gate must be a deliberate change to an explicit expectation.
5. **`test_snapshot.py`** `[fixture]` — recorded terms response replayed through the `INGF-02` fetcher
   test double and `INGF-03`'s `LocalObjectBackend`; asserts columns, hash equality, append-only
   re-capture, and `LICENCE_SNAPSHOT_MISMATCH` on a tampered file.
6. **`test_cli.py`** — `check` exit codes over every fixture group; `capture` in author mode against
   a temp copy of a fixture group (never against `pipelines/adapters/**`).
7. **`test_review_surface.py`** — `list_assessments()` ordering and JSON stability (the shape
   `INTL-05` consumes).
8. `uv run pytest` (whole repo) and `pnpm test` — green.

Reviewer focus: that **no** path returns `allowed=True` when the licence file is missing, unloadable
or `UNCLEAR`; that the collapse happens before the axis lookup rather than after; and that
`notes_internal` never appears in the serialisation used by any customer-facing consumer.

## Feedback obligation

**General rule.** If implementation falsifies this ticket, update **this ticket** first (docs PR/MR,
sub-PRD changelog line, then `publish-tickets.mjs --sync`), then change code.

**Foreseeable frictions and their exact writeback targets:**

1. **A real source's terms cannot be reduced to the nine axes** (e.g. per-document-class licensing
   within one group) → do **not** widen the gate silently. Update this ticket's deliverable 1 and
   `docs/prd/05-ingestion-framework/README.md` D9 first; the likely correct shape is a per-collection
   override *inside* `licence.yaml` (still one file per group, preserving A2), not a second file or a
   shared document.
2. **The `UNCLEAR_MAX_QUOTE_CHARS` default is wrong in practice** → it is sub-PRD open question
   **M2**, owner **Founder**. Record the decision in
   `docs/prd/05-ingestion-framework/README.md` M2 and in this ticket's deliverable 5 **before**
   changing the constant. PRD §45.1 item 5 forbids turning an initial default into a product rule by
   editing code.
3. **`EVID-06` needs a decision field this gate does not expose** (e.g. a per-jurisdiction attribution
   variant) → add it to `LicenceDecision` here and update
   `docs/prd/05-ingestion-framework/README.md`; `packages/citations/**` must never re-derive a licence
   decision from raw terms text — PRD §35.3 makes this the authoritative record and
   §11.1 requires exports to apply the same restrictions.
4. **The terms URL is not in the group's `allowlist.yaml`** → that is an adapter-ticket fix in modules
   `06`–`10` (add the host/path), not a fetcher bypass here. If terms are only available off an
   allowlisted host, the group's registry status becomes a limited state (`INGF-07`) and the
   assessment becomes `REVIEW_REQUIRED`.
5. **A source's licence forbids storage entirely, making the group unusable** → that is a
   `LICENSING_RESTRICTED` / `METADATA_AND_LINK_ACTIVE` registry state (PRD §7), recorded in that
   group's `registry.yaml` and reconciled by `GOLD-16`. PRD §44.4: "It is not permitted to silently
   call an unimplemented source category covered." Never work around it here.

**Escalation rule.** If the conservative default of PRD §11.1 ("Unclear rights default to metadata,
limited quotation and official links") cannot be implemented as a pre-emptive collapse — or if any
path can return an allow without a loaded, consistent assessment — that overturns a stated PRD
safety rule with direct legal exposure (PRD §11.2). Stop and escalate for re-review; never relax it
inside this ticket.
