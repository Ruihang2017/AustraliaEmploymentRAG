---
id: INGF-01
title: Adapter interface and versioned intermediate records
module: 05-ingestion-framework
lane: 05-ingestion-framework
size: M
agent: builder
status: draft
date: 2026-08-03
blocked_by: [CRPS-01]
blocks: [INGF-02]
---

# INGF-01 — Adapter interface and versioned intermediate records

Implements PRD §40.7 (adapter interface) and PRD §40.8 (adapter Definition of Done) — no ADR — the
decision is already made in PRD §40.7; this is build ticket 1 of 9 against it.
Parent sub-PRD: [05-ingestion-framework README](../README.md). Master spec: [PRD](../../../PRD.md).
Depends on: `CRPS-01` — `corpus.sqlite` schema + intermediate normalised-record contract, module
`04-corpus-contract` (`docs/prd/04-corpus-contract/tickets/`).
**Why `builder`:** a bounded change inside one module's declared file-scope against a contract PRD
§40.7 already fixes verbatim — not a new subsystem decision.

## Background + basis

**PRD §40.7 fixes the interface literally.** The eight boundaries are given as code:

```text
discover(cursor, since) → RemoteDescriptor[]
fetch(descriptor, validators) → SourceArtifact
identify(artifact) → StableDocumentIdentity
parse(artifact) → ParsedDocument
normalise(parsed) → DocumentVersion + NodeVersions
extractEvents(normalised) → LegalEvents
extractRelations(normalised) → NodeRelations
validate(candidate, priorState) → ValidationFindings
```

and the responsibility split is stated in the same section:

> "The adapter never writes active corpus tables directly. It emits versioned intermediate records
> with source URL, artifact hash and tool version. Shared framework code performs HTTP safety,
> hashing, artifact persistence, retry, licensing, metrics, quarantine and run accounting."

**Why this ticket is first.** 52 adapter tickets (PRD §40.2–40.6, modules `06`–`10`) are built in
parallel — PRD §44.3: "Safe parallel work units are individual source adapters". They can only be
parallel if the contract they implement is frozen before any of them starts. Plan §6.2 puts all 13
first-wave adapter tickets behind `INGF-09`, and `INGF-09` behind this contract.

**The payload types are not ours.** Plan §2.1 decision **A4**: "The corpus builder consumes the
versioned intermediate normalised-record contract, never adapter code; it is testable from contract
fixtures alone." `CRPS-01` (module `04-corpus-contract`, file-scope
`pipelines/corpus-builder/schema/**` + `pipelines/corpus-builder/src/contracts/**`) owns the record
types for `source_artifact`, `document_version`, `node_version`, `legal_event` and `node_relation`
(PRD §35.2, §35.3). This ticket **imports and re-exports** them; it must not redefine, widen or copy
a field. PRD §45.2 gives `pipelines` "Official-source acquisition/build/evaluation" and gives
`schemas` the "Versioned contract roots".

**Ports, not implementations (sub-PRD D1).** `INGF-02`…`INGF-06` each supply one implementation of
a port declared here. Declaring all ports at wave 1 is what gives this module its two-lane profile
(plan §7): `INGF-03`/`INGF-06` and `INGF-04`/`INGF-05` and `INGF-07`/`INGF-09` run as concurrent
pairs precisely because none of them needs a sibling's internals. PRD §39.1 states the same rule for
the TypeScript side: "`packages/infrastructure` adapters → `packages/domain` ports".

**Autoload, not a manifest (sub-PRD D5, ADR candidate M5).** Plan §2.1 **A1** settles the identical
question for HTTP routes: registration is "by **directory convention** (autoload), never a shared
central manifest … Without it every product module edits one `routes/index.ts` and the vertical cut
collapses." The same argument applies with 52× the force to adapters. This ticket fixes the
convention; if it proves impractical, the writeback path is in *Feedback obligation* below.

**Failure codes are area-local (sub-PRD D4).** `INGF-05` (quarantine) and `INGF-06` (parsing) are
concurrent siblings; a shared enum module would be a write conflict between them and, later, between
52 adapter tickets. This ticket therefore fixes a **registry**, not an enum.

**Language.** PRD §18.2: "Ingestion/build/evaluation | Local Python pipeline". PRD §20.1 places the
member at `pipelines/ingestion`. PRD §45.3 lists `uv sync --frozen` and `uv run pytest` as the entry
commands.

**Carried caveat.** The import root of `pipelines/ingestion` is whatever `FND-01`'s committed
`pipelines/ingestion/pyproject.toml` declares (plan §1.1: `FND-01` creates the manifest for every
PRD §20.1 member). This ticket reads that file and follows it; only if it declares no package name
does the ticket choose `aer_ingestion`. Documented as sub-PRD open question **M4**, not re-litigated
here.

## Goal

Create the ingestion framework's contract layer under
`pipelines/ingestion/src/<root>/adapter/**`: a `SourceAdapter` protocol with exactly the eight PRD
§40.7 boundaries, the ingestion-side data types those boundaries consume and produce, the nine
framework ports that `INGF-02`…`INGF-06` implement, the versioned intermediate-record envelope
carrying source URL + artifact hash + tool versions, the adapter-location convention, and the
area-local failure-code registry — such that (a) `uv run pytest` proves the protocol is structurally
complete and the `CRPS-01` records are re-exported by identity rather than copied, and (b) an
architecture test proves no module under `pipelines/adapters/**` imports a corpus-database, HTTP or
parser library.

## Non-goals

- **No implementation of any port.** `Fetcher` → `INGF-02`; `ArtifactStore` → `INGF-03`;
  `LicenceGate` → `INGF-04`; `QuarantineSink`/`RunRecorder`/`RunHistoryPort` → `INGF-05`;
  `ParserHost` → `INGF-06`. This ticket ships protocol declarations plus in-memory fakes for its own
  tests only.
- **No normalised-record payload types.** Owned by `CRPS-01` (A4). Redefining them here breaks the
  corpus builder's ability to be tested from contract fixtures alone.
- **No `corpus.sqlite` access of any kind.** PRD §18.3 makes it release-specific and production
  read-only; the ingestion working store is `INGF-05`'s (`ingestion.sqlite`, sub-PRD D6).
- **No individual source adapter.** All 52 groups belong to modules `06`–`10`.
- **No stage orchestration.** The §40.9 runner is `INGF-05` (sub-PRD D7).
- **No registry, licence or conformance file schemas.** `registry.yaml` → `INGF-07`;
  `allowlist.yaml` → `INGF-02`; `licence.yaml` → `INGF-04`; `conformance.yaml` → `INGF-09`
  (sub-PRD D3).
- **No tenant, customer or app-database concept enters this package.** PRD §39.1: "Python pipeline
  code never imports tenant/customer packages." Standing rule, not a deferral.

## File-scope (write-owns)

- `pipelines/ingestion/src/<root>/adapter/**` — where `<root>` is the import root of sub-PRD D11
  (default `aer_ingestion`). Plan §5.6 writes this scope as `pipelines/ingestion/src/adapter/**`;
  under Python src-layout the area directory `adapter/` sits under the import root. The area name and
  its one-to-one mapping to this ticket are unchanged.
- `pipelines/ingestion/tests/adapter/**` — unit tests and architecture tests for this area
  (plan §1.1: "Unit/integration tests live inside the owning package … and belong to that module's
  tickets").
- `pipelines/ingestion/pyproject.toml` — **append-only**, shared with the other eight `INGF` tickets
  (plan §1.1). Append only the dependencies this ticket declares; resolve conflicts by re-running
  `uv lock`, never by hand-merge (PRD §44.3).
- Does not touch: `pipelines/corpus-builder/**` and `schemas/corpus-manifest/**` — `04-corpus-contract`
  (`CRPS-01`, `CRPS-02`).
- Does not touch: `pipelines/adapters/**` — modules `06-sources-legislation`,
  `07-sources-instruments`, `08-sources-cases`, `09-sources-adjacent`, `10-sources-future`. This
  ticket *reads* that tree in an architecture test and creates its own synthetic fixture groups
  under `pipelines/ingestion/tests/adapter/fixtures/`.
- Does not touch: `pipelines/ingestion/src/<root>/{fetch,artifacts,licensing,quarantine,runs,parsing,registry,discovery,conformance}/**`
  — `INGF-02`…`INGF-09` respectively.
- Does not touch: `packages/**`, `apps/**`, `services/**`, `tests/**`, `schemas/**`, `evals/**`,
  `infra/**`, root manifests other than the module `pyproject.toml`.

**Serial safety.** This is the first decomposition of `docs/PRD.md`; nothing is merged and no ticket
is in flight, so no prior ticket has touched these paths. Sibling tickets in this module own disjoint
area directories under `src/<root>/` and matching `tests/` directories — see the sub-PRD work
breakdown. This ticket is wave 1 and runs alone; `INGF-02` is `blocked_by` it, so no `INGF` ticket
can be concurrent with it.

## Deliverables

Names below are **binding**: 52 adapter tickets in modules `06`–`10` are written against them
without reading this module's source. Internal organisation inside `adapter/` is the Builder's
choice; the public surface is not.

1. **Package skeleton.** `pipelines/ingestion/src/<root>/__init__.py` exporting
   `FRAMEWORK_VERSION: str` (semantic version of the ingestion framework, `"0.1.0"`) and
   `INTERMEDIATE_SCHEMA_VERSION: str` (`"1"`). Read the import root from the committed
   `pipelines/ingestion/pyproject.toml`; if it declares no package name, use `aer_ingestion` and
   append the declaration.

2. **`<root>.adapter.records` — re-export module (A4/D8).** Import the normalised-record payload
   types from the module `CRPS-01` publishes under `pipelines/corpus-builder/src/contracts/` and
   re-export them **unchanged** under stable local names so every adapter has one import path:
   `SourceArtifactRecord`, `DocumentVersionRecord`, `NodeVersionRecord`, `LegalEventRecord`,
   `NodeRelationRecord`. Resolve the upstream symbol names by reading the merged `CRPS-01` code; do
   not guess and do not create a shim class. If an upstream name differs, alias it — the object
   identity must be preserved (`records.DocumentVersionRecord is <upstream>.<Name>`).

3. **`<root>.adapter.types` — ingestion-side types** (the ones PRD §40.7 names but `CRPS-01` does not
   own). Frozen dataclasses, all timestamps UTC ISO-8601 text, all legal dates `YYYY-MM-DD`
   (PRD §35.1):
   - `RemoteDescriptor(url: str, descriptor_key: str, kind: str, discovered_at: str,
     etag: str | None, last_modified: str | None, declared_content_type: str | None,
     declared_bytes: int | None, hints: Mapping[str, str])` — `descriptor_key` is the adapter's
     stable per-item key used for incremental comparison.
   - `DiscoveryCursor(value: str, page: int | None)` and `DiscoveryFinding` with
     `status: Literal["NEW", "CHANGED", "UNCHANGED", "REMOVED", "UNAVAILABLE"]`.
   - `FetchValidators(etag: str | None, last_modified: str | None,
     expected_content_types: Sequence[str], max_bytes: int | None)` — the `validators` argument of
     PRD §40.7's `fetch`.
   - `ArtifactRef(artifact_id: str, sha256: str, byte_length: int, content_type: str,
     official_url: str, final_url: str, retrieved_at: str, storage_key: str | None)` —
     `storage_key` is `None` when storage is not permitted (PRD §35.3: "object key absent when
     storage is not permitted").
   - `StableDocumentIdentity(stable_source_key: str, document_type: str,
     official_identifier: str | None, neutral_citation: str | None, canonical_title: str,
     employer_abn: str | None)` — mirrors the identity columns of PRD §35.2 `legal_document`.
   - `ParsedDocument(parser_key: str, parser_version: str, text: str,
     blocks: Sequence[ParsedBlock], media_type: str, page_count: int | None,
     ocr_confidence: float | None, warnings: Sequence[str])` and
     `ParsedBlock(path: str, label: str | None, heading: str | None, start_offset: int,
     end_offset: int, ordinal: int, kind: str)`. `start_offset`/`end_offset` index into
     `ParsedDocument.text` and must satisfy the exact-text round-trip
     (`text[start:end]` reproduces the block) — PRD §40.8 item 5, PRD §15.3.
   - `NormalisedDocument(document_version: DocumentVersionRecord,
     node_versions: Sequence[NodeVersionRecord])` — the `DocumentVersion + NodeVersions` return of
     PRD §40.7's `normalise`.
   - `PriorState(document_version: DocumentVersionRecord | None,
     node_versions: Sequence[NodeVersionRecord], last_run: RunSummary | None)`.
   - `ValidationFinding(code: FailureCode, severity: Literal["BLOCK", "FLAG", "INFO"],
     message: str, details: Mapping[str, object])` and
     `ValidationFindings(findings: Sequence[ValidationFinding])` with a `has_blocking` property.

4. **`<root>.adapter.protocol` — the eight boundaries.** A `typing.Protocol`
   (`@runtime_checkable`) named `SourceAdapter` with **exactly** these methods, in this order, and
   no others. Python method names are the snake_case form of PRD §40.7; the mapping is 1:1 and must
   appear as a module-level docstring table:

   | PRD §40.7 | Python |
   |---|---|
   | `discover(cursor, since)` | `discover(self, ctx, cursor, since) -> Iterable[RemoteDescriptor]` |
   | `fetch(descriptor, validators)` | `fetch(self, ctx, descriptor, validators) -> ArtifactRef` |
   | `identify(artifact)` | `identify(self, ctx, artifact) -> StableDocumentIdentity` |
   | `parse(artifact)` | `parse(self, ctx, artifact) -> ParsedDocument` |
   | `normalise(parsed)` | `normalise(self, ctx, parsed, identity) -> NormalisedDocument` |
   | `extractEvents(normalised)` | `extract_events(self, ctx, normalised) -> Sequence[LegalEventRecord]` |
   | `extractRelations(normalised)` | `extract_relations(self, ctx, normalised) -> Sequence[NodeRelationRecord]` |
   | `validate(candidate, priorState)` | `validate(self, ctx, candidate, prior) -> ValidationFindings` |

   Every method takes `ctx: AdapterRunContext` as its first argument — that is the only channel
   through which an adapter reaches the network, the filesystem or any store. The protocol also
   declares `meta: AdapterMeta`.

5. **`AdapterMeta`** (frozen dataclass): `group_id: str` (the uppercase PRD §40.2–40.6 Group ID),
   `adapter_key: str` (the lowercase directory name; invariant `adapter_key == group_id.lower()`),
   `jurisdiction: str`, `authority_id: str`, `adapter_version: str`,
   `supported_content_types: Sequence[str]`, `declared_quarantine_reasons: Sequence[FailureCode]`.
   A validator raises `AdapterMetaError` when the `adapter_key`/`group_id` invariant fails.

6. **`<root>.adapter.ports` — the nine framework ports** (all `Protocol`, all implemented elsewhere):

   ```text
   Fetcher.fetch(request: FetchRequest) -> FetchResult                      # INGF-02
   ArtifactStore.put(result, *, source_id, licence_snapshot_id, storage_permitted) -> ArtifactRef
   ArtifactStore.open(ref: ArtifactRef) -> BinaryIO                         # INGF-03
   LicenceGate.evaluate(group_id: str, use: IntendedUse) -> LicenceDecision # INGF-04
   ParserHost.run(parser_key, ref, limits) -> ParseOutcome                  # INGF-06
   QuarantineSink.quarantine(*, run_id, artifact_id, code, details) -> str  # INGF-05
   RunRecorder.start(*, group_id, mode) -> RunHandle                        # INGF-05
   RunHistoryPort.latest(group_id: str) -> RunSummary | None                # INGF-05
   RecordSink.emit(envelope: IntermediateRecordEnvelope) -> None            # INGF-05
   Clock.now() -> datetime                                                  # INGF-05 (fake in tests)
   ```

   Declare here the small value types the ports pass that are not owned elsewhere: `FetchRequest`,
   `FetchResult`, `IntendedUse` (`STORE_ARTIFACT | INDEX_LEXICAL | EMBED | DISPLAY_TEXT | QUOTE |
   EXPORT`), `LicenceDecision(allowed: bool, reason: FailureCode | None, max_quote_chars: int | None,
   attribution_text: str | None, index_eligibility: str | None)`, `ParserLimits`, `ParseOutcome`,
   `RunMode` (`FULL | INCREMENTAL | DISCOVERY_ONLY | REPLAY`), `RunHandle`, `RunSummary` (carrying
   the five PRD §12.1 dates as separate fields — see `INGF-07`). Every port that a composition root
   leaves unwired is filled with a `NotWiredPort` that raises `PortNotWiredError` naming the port and
   the ticket that implements it — never a silent no-op.

7. **`AdapterRunContext`** (frozen dataclass): `run_id: str`, `group_id: str`, `mode: RunMode`,
   `fetcher: Fetcher`, `artifacts: ArtifactStore`, `licence: LicenceGate`, `parser: ParserHost`,
   `quarantine: QuarantineSink`, `records: RecordSink`, `runs: RunRecorder`,
   `history: RunHistoryPort`, `clock: Clock`, `log: Logger`. Construction helper
   `AdapterRunContext.unwired(group_id)` returns a context whose ports are all `NotWiredPort` — the
   default used by unit tests that only exercise pure adapter logic.

8. **`IntermediateRecordEnvelope`** — PRD §40.7's "versioned intermediate records with source URL,
   artifact hash and tool version". Frozen dataclass with exactly:
   `schema_version: str` (= `INTERMEDIATE_SCHEMA_VERSION`), `record_type: RecordType`
   (`SOURCE_ARTIFACT | DOCUMENT_VERSION | NODE_VERSION | LEGAL_EVENT | NODE_RELATION`),
   `group_id: str`, `run_id: str`, `source_url: str`, `artifact_sha256: str`,
   `tool_versions: Mapping[str, str]` (keys `framework`, `adapter`, `parser`, and any adapter-declared
   extras), `emitted_at: str`, `payload: object` (one of the D8 record types).
   Provide `envelope.to_json()` / `envelope_from_json()` with **deterministic** key ordering so two
   runs over the same artifact produce byte-identical output (required by `INGF-09` DoD item 8's
   count/hash baseline). A missing or empty `source_url`, `artifact_sha256` or `tool_versions`
   raises `EnvelopeError` at construction.

9. **`<root>.adapter.loading` — adapter location by directory convention (D5).**
   `iter_adapter_dirs(adapters_root: Path) -> Iterator[Path]` yields every direct child of
   `pipelines/adapters/` that is not prefixed `_` (so `_shared/**`, owned by `SLEG-01`, `SINS-01`,
   `SCAS-01`, `SFUT-01`, is skipped) and contains `adapter.py`.
   `load_adapter(group_dir: Path) -> SourceAdapter` imports `<group_dir>/adapter.py` and returns its
   module-level `ADAPTER` attribute, raising `AdapterLoadError` when it is missing or fails
   `isinstance(x, SourceAdapter)`. No central manifest file is created or read.

10. **`<root>.adapter.failures` — the failure-code registry (D4).**
    `FailureCode = NewType("FailureCode", str)`;
    `register_failure_codes(area: str, codes: Mapping[FailureCode, str]) -> None` where the value is
    the **operator action** (PRD §40.8 item 10, ADM-001);
    `failure_code_registry() -> Mapping[FailureCode, RegisteredCode]` returning code → (area,
    operator action). Codes must match `^[A-Z][A-Z0-9_]*$` and be unique across areas; a duplicate
    raises `DuplicateFailureCodeError`. Registration is idempotent for identical definitions so
    repeated imports are safe. No shared enum file is created.

11. **Architecture tests** (in `pipelines/ingestion/tests/adapter/`), each an AST/import scan, each
    with a synthetic failing fixture as a negative control:
    - no module under `pipelines/adapters/**` imports `sqlite3`, `better_sqlite3`, any
      `corpus-builder` database module, or any name matching `*app.sqlite*` — PRD §40.7 "The adapter
      never writes active corpus tables directly";
    - no module under `pipelines/adapters/**` imports `requests`, `httpx`, `aiohttp`, `urllib`,
      `urllib3`, `http.client` or `socket` — PRD §37.4 "Adapters use a shared fetcher, not arbitrary
      HTTP libraries" (`INGF-02` extends this test with its own positive control);
    - no module under `pipelines/ingestion/**` or `pipelines/adapters/**` imports any
      `packages/database`, `packages/auth` or tenant/customer module — PRD §39.1 "Python pipeline
      code never imports tenant/customer packages";
    - the scan tolerates an absent `pipelines/adapters/` directory (it is created by module `06`)
      and still runs against the synthetic fixture groups in
      `pipelines/ingestion/tests/adapter/fixtures/`.

12. **Docstring provenance.** Every public symbol's docstring cites the PRD section that fixes it
    (`§40.7`, `§35.1`, `§35.2`, `§35.3`, `§15.3`). A cold-starting adapter Builder must be able to
    read the contract without this ticket.

## Acceptance checklist (classified)

- [ ] `[machine]` `SourceAdapter` declares exactly the eight PRD §40.7 boundaries — a test asserts
      the set of public methods equals the eight snake_case names, no more and no fewer, and that the
      docstring mapping table lists all eight PRD names (PRD §40.7; deliverable 4).
- [ ] `[machine]` A conforming stub adapter satisfies `isinstance(stub, SourceAdapter)`; a stub
      missing any one method or with a wrong arity fails — one negative control per method
      (deliverable 4).
- [ ] `[machine]` `records.DocumentVersionRecord is <CRPS-01 upstream type>` (and the same identity
      assertion for the other four record types): the re-export is an alias, not a copy
      (A4, PRD §40.7; deliverable 2).
- [ ] `[machine]` `IntermediateRecordEnvelope` rejects construction with an empty `source_url`,
      empty `artifact_sha256` or empty `tool_versions`, and `to_json()` is byte-identical across two
      runs for equal input (PRD §40.7; deliverable 8).
- [ ] `[machine]` `AdapterMeta` raises `AdapterMetaError` when `adapter_key != group_id.lower()`
      (deliverable 5).
- [ ] `[machine]` Every port has a `NotWiredPort` counterpart whose every method raises
      `PortNotWiredError` naming the port and the implementing ticket; a parametrised test covers all
      nine ports (deliverable 6).
- [ ] `[machine]` `load_adapter()` returns the module-level `ADAPTER` for a synthetic fixture group,
      raises `AdapterLoadError` for a group without `adapter.py`, for a group whose `ADAPTER` is
      missing, and for one whose `ADAPTER` does not satisfy the protocol; `iter_adapter_dirs()` skips
      `_`-prefixed directories (D5; deliverable 9).
- [ ] `[machine]` `register_failure_codes()` rejects a code not matching `^[A-Z][A-Z0-9_]*$`, rejects
      a duplicate code registered from a different area with a different action, and is idempotent
      for an identical re-registration (D4; deliverable 10).
- [ ] `[machine]` Architecture test: a synthetic adapter fixture importing `httpx` fails the scan; a
      synthetic adapter fixture importing `sqlite3` fails the scan; the clean fixture passes
      (PRD §37.4, §40.7, §39.1; SEC-002 groundwork; deliverable 11).
- [ ] `[machine]` `uv run pytest` green (PRD §45.3, PRD §20.3 "Rust and Python builds/tests").
- [ ] `[machine]` `pnpm test` green — standing suite item; this ticket adds no TypeScript, so the
      expectation is "unchanged and green" (plan §1.1, PRD §45.3).
- [ ] `[human]` PR body states the PRD §45.4 items: requirement IDs (SEC-002 groundwork, ADM-001
      groundwork) and UAT IDs (**none** — no PRD §41.2 row exercises the adapter contract directly;
      the nearest, `UAT-OPS-01`, is owned by `RLSE-07`/`CRPS-06`), schema/API/event compatibility
      (introduces `INTERMEDIATE_SCHEMA_VERSION` = "1"), tenant/PII/security impact (none — no tenant
      or customer data enters this package), source/licence impact (none), cost/memory/latency
      impact (none), rollback path (delete the package; nothing depends on it until `INGF-02`), known
      gaps (M3, M4, M5 from the sub-PRD).
- [ ] `[human]` If the import root chosen by `FND-01` differs from `aer_ingestion`, the sub-PRD's D11
      and M4 rows are updated in the same PR (writeback obligation, plan §1.1).
- **No `[fixture]` criteria** — this ticket replays no recorded source data; the first recorded HTTP
  transcripts arrive with `INGF-02` and the first adapter fixtures with `INGF-09`. Declared absent
  deliberately.

## Test plan

Harness: `pytest` via `uv run pytest pipelines/ingestion/tests/adapter -q`. Everything is offline —
no network, no `pipelines/adapters/**` content required.

1. `uv sync --frozen && uv run pytest pipelines/ingestion/tests/adapter -q` — all green.
2. **Protocol completeness** (`test_protocol_surface.py`): asserts
   `set(public_methods(SourceAdapter)) == EIGHT_BOUNDARIES` and parses the module docstring table to
   assert all eight PRD names appear. Then, for each of the eight, a generated stub class omitting
   exactly that method must fail `isinstance(..., SourceAdapter)`.
3. **Record identity** (`test_records_reexport.py`): imports the `CRPS-01` contracts module directly
   and asserts `is` identity for all five re-exports. If `CRPS-01`'s module path or symbol names
   differ from what this ticket assumed, this test is the failure signal — fix the alias, never copy
   the class.
4. **Envelope determinism** (`test_envelope.py`): builds one envelope twice from equal inputs and
   asserts `to_json()` byte equality; asserts `EnvelopeError` for each of the three mandatory fields
   empty; round-trips `envelope_from_json(to_json(e)) == e`.
5. **Ports** (`test_ports.py`): parametrised over the nine ports; each `NotWiredPort` method raises
   `PortNotWiredError` whose message contains the port name and the implementing ticket id.
6. **Loading** (`test_loading.py`): fixture tree
   `pipelines/ingestion/tests/adapter/fixtures/adapters/{demo-ok,demo-no-adapter-py,demo-no-ADAPTER,demo-bad-protocol,_shared}/`;
   asserts the four outcomes and the `_`-prefix skip.
7. **Failure registry** (`test_failures.py`): the three rules of deliverable 10.
8. **Architecture scan** (`test_architecture.py`): runs the AST scan over
   `fixtures/adapters/**` (which contains one deliberately dirty group importing `httpx` and one
   importing `sqlite3`) and, when `pipelines/adapters/` exists, over the real tree. Asserts the dirty
   fixtures are reported and the clean ones are not. Copy the construction pattern into
   `INGF-02`/`INGF-06`, which extend the same scan.
9. `uv run pytest` (whole repo) and `pnpm test` — green.

## Feedback obligation

**General rule.** If implementation falsifies this ticket, update **this ticket** first (a docs
PR/MR, version note in the sub-PRD changelog, then `publish-tickets.mjs --sync`), and only then
change code. Silent divergence is an incomplete ticket. The ticket wins over any implementation plan
(CLAUDE.md, issue #53).

**Foreseeable frictions and their exact writeback targets:**

1. **`CRPS-01` does not expose one or more of the five record types, or exposes them under a
   different shape** (for example, it publishes a JSON Schema rather than Python dataclasses) →
   update `docs/prd/05-ingestion-framework/README.md` decision **D8** and this ticket's deliverable 2
   **before** writing any adapter-side type. Do **not** define a local copy: that falsifies plan
   §2.1 **A4** and would make `04-corpus-contract` depend on adapter code. If a local *codec* (not a
   type) is genuinely needed, it belongs in this ticket's scope and must be named in D8.
2. **`FND-01` declared a different import root, a flat layout, or no `pipelines/ingestion` member at
   all** → follow `FND-01` and update `docs/prd/05-ingestion-framework/README.md` rows **D11** and
   **M4** in the same PR. If the member is missing entirely, that is a `00-foundation` gap: raise it
   against `FND-01` rather than creating the manifest from scratch here (plan §1.1 gives `FND-01`
   that ownership).
3. **Directory-convention adapter loading (D5) proves impractical** — e.g. the packaging or test
   runner cannot import a module from an arbitrary directory without a central registration → this
   overturns a decomposition-critical choice. Write `docs/adr/NNNN-adapter-autoload-and-failure-code-registry.md`
   (new file, owned by this ticket per plan §2.1 **A9**), record the consequence in
   `docs/prd/05-ingestion-framework/README.md` D5/M5, and add the corresponding row to
   `docs/prd/breakdown-plan.md` §2.1 — *then* implement. A central adapter manifest would serialise
   all 52 adapter tickets and must never be introduced silently.
4. **The eight boundaries cannot be expressed as a single protocol** — for example, discovery is
   genuinely asynchronous for some registers and `Iterable` is wrong → update this ticket's
   deliverable 4 and `docs/prd/05-ingestion-framework/README.md` first. PRD §40.7 fixes the
   *boundaries*, not their Python typing, so this is a ticket change, not a PRD change; but it
   changes the contract 52 tickets are written against and must not change after `INGF-09` merges
   without re-publishing every dependent ticket.
5. **A ninth boundary looks necessary** (e.g. a separate `teardown` or `checkpoint`) → that is a
   change to PRD §40.7's list. Classify per PRD §45.5 and escalate: it is a **product/spec** change
   requiring the PRD to be amended, not a ticket-local addition.

**Escalation rule.** If a decided protocol here is outright falsified — the eight-boundary interface,
A4's record ownership, A1-by-analogy autoload, or the ports-at-wave-1 split (D1) — that overturns a
team decision recorded in the breakdown plan. Stop, escalate for re-review, and never swap the
approach silently inside this ticket: every one of those choices is load-bearing for 52 downstream
tickets across five modules.
