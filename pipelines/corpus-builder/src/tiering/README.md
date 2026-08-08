# `tiering` — index-tier assignment policy (CRPS-04)

Maps `(source-group initial tier, licence assessment, quarantine state, document/version
attributes)` to exactly one of the five PRD §17.2 index tiers per chunk, with an auditable reason
per decision and a measurable output distribution.

Requirement IDs: `SRCH-003` (eligible-corpus indexing), `ADM-002` (licensing/quarantine gating).
Basis: PRD §17.2, §40.1, §11.1, §35.3, §2.

## What this module never does

- **It never decides a licence.** The licence snapshot/assessment registry and the permitted-use
  gate are `INGF-04` (`pipelines/ingestion/src/licensing/**`). This module *consumes* an
  assessment — it never derives a permit decision from a status, or a status from a permit
  decision. PRD §11.1 requires the storage / indexing / embedding decisions to be stated
  independently, and inferring one from another is precisely what it forbids.
- **It never decides a quarantine.** The quarantine engine is `INGF-05`. This module consumes
  `quarantine_open`.
- **It never defines a source group's initial tier.** That comes from the Source Coverage Registry
  (`INGF-07`, decision A2) / the `source` row, per the PRD §40.2–40.6 roster "Initial tier" column.
- **It holds no memory, cost or hot-vector budget.** The always-hot vector count, the semantic-cache
  limits, the resident allocation and the cold/hot boundary are breakdown plan §8 **Q3**, deferred
  until real-scale measurement and resolved by `RLSE-11`. This module *measures* the distribution
  (`tier_distribution`) so that decision has evidence; it never trims coverage to fit a figure. PRD
  §2: cost is controlled by tiering, "not by silently deleting agreed legal scope".
- **It never embeds, indexes, caches, writes a row or opens a database.** `assign_tier()` is a pure,
  total function with no I/O and no module-level state.

## The five tiers and the ordering

| Tier | Rank | Lexical/metadata eligible | Dense eligible | Dense by default |
| --- | --- | --- | --- | --- |
| `TIER_1_FULL_SEMANTIC` | 3 | yes | yes | **yes** |
| `TIER_2_LEXICAL_AND_SELECTIVE_SEMANTIC` | 2 | yes | yes (selective/on-demand) | no |
| `TIER_3_METADATA_AND_ON_DEMAND` | 1 | yes | no | no |
| `EXCLUDED_LICENSING` | 0 | no | no | no |
| `QUARANTINED_QUALITY` | 0 | no | no | no |

`is_eligible_for_lexical(tier)` is true for Tiers 1–3 — "the complete eligible corpus receives
metadata/lexical/field/citation discovery" (PRD §17.2). `is_eligible_for_dense(tier)` is true for
Tiers 1 and 2. `is_default_dense(tier)` is true for Tier 1 only: Tier 2 is *selective/on-demand*, so
eligibility is permission, not an instruction to embed — `CRPS-05` selects within Tier 2 and must
read `is_default_dense`, not `is_eligible_for_dense`, when deciding what to embed by default. These
are the single definition of "eligible"; `CRPS-05` and `CRPS-06` import them rather than re-deriving
them.

## Precedence order (restrictions always dominate; nothing is ever upgraded)

| # | Rule id | Condition | Effect | Basis |
| --- | --- | --- | --- | --- |
| 1 | `R1_QUARANTINE_OPEN` | `quarantine_open` | **terminal** → `QUARANTINED_QUALITY` | PRD §35.3 |
| 2 | `R2_LICENCE_EXCLUDED` | status `PROHIBITED` **or** `licence_permits_storage is False` | **terminal** → `EXCLUDED_LICENSING` | PRD §11.1 |
| 3 | `R3_LICENCE_METADATA_ONLY` | status in {`METADATA_AND_LINK_ONLY`, `UNCLEAR_RESTRICTED`, `REVIEW_REQUIRED`} **or** `licence_permits_indexing is False` | **terminal** → at most `TIER_3_METADATA_AND_ON_DEMAND` | PRD §11.1 |
| 4 | `R4_LICENCE_NO_EMBEDDING_CAP` | `licence_permits_embedding is False` | **cap** at `TIER_2_…` — dense off, lexical/metadata kept | PRD §2, §11.1, §40.1 |
| 5 | `R5_SOURCE_INITIAL_TIER` | always | the source group's initial tier: `T1→TIER_1`, `T2→TIER_2`, `T3→TIER_3` | PRD §40.1 |
| 6 | `R6_NON_EVIDENCE_STRUCTURAL` | `is_evidence_bearing is False` | **cap** one tier down, floored at `TIER_3_…`; never applied to evidence-bearing text | PRD §17.2 |
| 7 | — | always | no rule may return a tier above the rule-5 tier | PRD §40.1 |

Rules 1–3 are terminal: the first match wins. Rules 4–6 are **caps** evaluated together and the
lowest wins, which makes rule 7 structural rather than aspirational — a minimum over caps can never
invent a higher tier. When two caps bind at the same tier the lower rule number supplies the reason
(`R4` before `R5` before `R6`), so the answer is deterministic rather than incidental. Rule 7 is
enforced inside `assign_tier()` and raises `TieringError`; it is also a property test.

`downgraded_from` is set **exactly when** the assigned tier differs from the rule-5 tier, and when
set it always *is* that tier. So a rule can fire without a downgrade: `T3` + `UNCLEAR_RESTRICTED`
applies `R3`, stays at Tier 3, and reports `downgraded_from = None`.

## Decision table

Holding the three `licence_permits_*` decisions at `True` (they are independent of the status — PRD
§11.1 — and are exercised separately below):

| Initial | Licence status | Quarantine | Evidence-bearing | Tier | Reason | Rule |
| --- | --- | --- | --- | --- | --- | --- |
| any | any | **open** | any | `QUARANTINED_QUALITY` | `QUARANTINE_OPEN` | `R1` |
| any | `PROHIBITED` | closed | any | `EXCLUDED_LICENSING` | `LICENCE_PROHIBITED` | `R2` |
| any | `METADATA_AND_LINK_ONLY` / `UNCLEAR_RESTRICTED` / `REVIEW_REQUIRED` | closed | any | `TIER_3_…` | `LICENCE_UNCLEAR_DEFAULT_METADATA` | `R3` |
| `T1` | `PERMITTED` / `PERMITTED_WITH_ATTRIBUTION` | closed | yes | `TIER_1_…` | `SOURCE_INITIAL_TIER` | `R5` |
| `T2` | `PERMITTED` / `PERMITTED_WITH_ATTRIBUTION` | closed | yes | `TIER_2_…` | `SOURCE_INITIAL_TIER` | `R5` |
| `T3` | `PERMITTED` / `PERMITTED_WITH_ATTRIBUTION` | closed | yes | `TIER_3_…` | `SOURCE_INITIAL_TIER` | `R5` |
| `T1` | `PERMITTED` / `PERMITTED_WITH_ATTRIBUTION` | closed | no | `TIER_2_…` | `NON_EVIDENCE_STRUCTURAL` | `R6` |
| `T2` | `PERMITTED` / `PERMITTED_WITH_ATTRIBUTION` | closed | no | `TIER_3_…` | `NON_EVIDENCE_STRUCTURAL` | `R6` |
| `T3` | `PERMITTED` / `PERMITTED_WITH_ATTRIBUTION` | closed | no | `TIER_3_…` (floor) | `SOURCE_INITIAL_TIER` | `R5` |

Per-decision booleans, with a `PERMITTED` status and no quarantine:

| Initial | storage | indexing | embedding | Tier | Reason |
| --- | --- | --- | --- | --- | --- |
| any | `False` | any | any | `EXCLUDED_LICENSING` | `LICENCE_NO_STORAGE` |
| any | `True` | `False` | any | `TIER_3_…` | `LICENCE_NO_INDEXING` |
| `T1` | `True` | `True` | `False` | `TIER_2_…` | `LICENCE_NO_EMBEDDING` |
| `T2` | `True` | `True` | `False` | `TIER_2_…` | `SOURCE_INITIAL_TIER` (the cap does not bind) |
| `T3` | `True` | `True` | `False` | `TIER_3_…` | `SOURCE_INITIAL_TIER` (the cap does not bind) |

A licence that forbids embedding yields **Tier 2, not `EXCLUDED_LICENSING`**: refusing dense
indexing must not delete lexical coverage (PRD §2, §40.1).

## Reason codes

| Code | Basis |
| --- | --- |
| `QUARANTINE_OPEN` | PRD §35.3 — cannot enter a promoted release while open. |
| `LICENCE_PROHIBITED` | PRD §11.1 — assessment state `PROHIBITED`. |
| `LICENCE_NO_STORAGE` | PRD §11.1 — the independently stated storage decision is refused. |
| `LICENCE_UNCLEAR_DEFAULT_METADATA` | PRD §11.1 — unclear rights default to metadata, limited quotation and official links. |
| `LICENCE_NO_INDEXING` | PRD §11.1 — the independently stated indexing decision is refused. |
| `LICENCE_NO_EMBEDDING` | PRD §11.1 / §40.1 — embedding refused; lexical coverage kept. |
| `SOURCE_INITIAL_TIER` | PRD §40.1 — the source group's initial tier applies. |
| `NON_EVIDENCE_STRUCTURAL` | PRD §17.2 — structural material may drop one tier, floored at Tier 3. |

`LICENCE_NO_STORAGE` and `LICENCE_NO_INDEXING` exist because rules 2 and 3 each have **two
independent triggers** (a status *or* a per-decision boolean). PRD §11.1 requires those decisions to
be stated independently, so collapsing the two triggers into one code would destroy the audit answer
to "why is this not indexed?".

## Fail-closed behaviour

| Error | Raised when |
| --- | --- |
| `UnknownLicenceState` | `licence_status` is not a declared member (including `None` / `""` / wrong case), or any `licence_permits_*` decision is not a `bool` (`None` = not assessed). |
| `UnknownSourceTier` | `source_initial_tier` is not `T1` / `T2` / `T3`. |
| `InvalidTieringInput` | `quarantine_open` or `is_evidence_bearing` is not a `bool`, or `node_char_count` is negative. |
| `MissingTieringInput` | `assign_tiers()` meets a chunk whose node has no `TieringInput`. |

All four derive from `TieringError`. None of them has a permissive fallback: unknown evidence is
never "assume `PERMITTED`" and never "assume `T1`".

## Enum provenance (PRD §35.1 / sub-PRD D4)

`IndexTier` and `LicenceStatus` are declared as static `StrEnum`s in `tiers.py` rather than
generated, because a generated enum cannot be type-checked, matched exhaustively, or used in the
literal decision table that *is* this ticket's specification. They are bound to the canonical
`packages/contracts` export by `tests/tiering/test_tier_enum_drift.py`, which asserts tuple
equality — member for member, in order — against `contracts.enums.enum_values("IndexTier")` and
`enum_values("LicenceAssessmentState")`. Drift on either side is a hard test failure, exactly as
`tests/schema/test_enum_drift.py` achieves for the DDL. The binding is a test-time assertion rather
than a runtime import so that `assign_tier()` stays pure and cannot fail because a file is missing.

The canonical family name is `LicenceAssessmentState`; the CRPS-04 ticket names the Python type
`LicenceStatus`, and the ticket is the source of truth for the type name.

## Boundary

`src/tiering/**` imports neither `chunking` (CRPS-03) nor `manifest` (CRPS-02) — the two ran
concurrently with this ticket and must stay decoupled. A chunk is consumed through the structural
`ChunkStructure` protocol (`node_version_id`, `chunk_ordinal`, `char_count`); chunk *text* is
deliberately out of reach, because a policy that needed the text would couple this module to
CRPS-03's output semantics. `tests/tiering/test_module_boundary.py` asserts the boundary both
statically (an AST import scan, which also enforces stdlib-only and no-I/O) and at runtime (a fresh
interpreter importing `tiering` and inspecting `sys.modules`).

## Usage

```python
from tiering import TieringInput, assign_tier, assign_tiers, tier_distribution

decision = assign_tier(node_input)                      # one node version
assignments = assign_tiers(chunks, inputs_by_node)      # a batch, in input order
report = tier_distribution(assignments)                 # counts per tier / group / reason
```
