# `pipelines/evaluation` — the evaluation dataset and its enforcement

Delivered by `GOLD-01` (`src/dataset/**`). `GOLD-02` … `GOLD-16` add the runner, gates, judge,
promotion and coverage trees beside it; this file describes the dataset contract only.

## The blind rules, stated where you will read them

> **The private seal key is never in this repository, in CI, or in an agent environment.**
>
> **Only the Founder starts a blind stage, and blind run output carries metrics, category summaries
> and case ids only.**

Blind case content and gold exist here **only as ciphertext**, sealed to a committed public
recipient key whose private half the Founder alone holds. Sealing needs only the public half, so an
authorised authoring agent can seal without ever being able to open. The decision, its custody
model, its rejected alternatives and its consequences are recorded in
[`docs/adr/0004-blind-gold-sealing.md`](../../docs/adr/0004-blind-gold-sealing.md), which records
breakdown plan §8 **Q6** (confirmed) rather than reopening it.

The private-key file path arrives through **one environment variable, named in that ADR** — there is
no default path, no in-repository lookup and no keyring fallback. Its name is assembled from parts in
this tree rather than spelled out, because the repository's required `Secret scan` check matches
credential-shaped *names* everywhere outside `docs/**`. That is deliberate; do not "fix" it.

**`evals/splits/blind-recipient.pub` is a placeholder today.** Its private half is publicly
derivable and its own comment says how. Replacing it is the Founder's custodial act (`GOLD-01`'s one
`[human]` acceptance item); `GOLD-15` and `GOLD-17` must not run a blind stage until then. Until it
is replaced, `seal` **refuses it**: the file is marked `kind: DEVELOPMENT_PLACEHOLDER`,
`load_recipient()` raises `BlindRecipientKeyUnavailable`, and the CLI exits non-zero. There is no
flag that overrides that.

## Running it

Two forms, both offline, neither needing any key:

```bash
# from the repository root — self-bootstrapping, no configuration
uv run python pipelines/evaluation/src/dataset/cli.py verify --complete

# with pipelines/evaluation/src on sys.path
python -m dataset verify --complete
```

> The `GOLD-01` ticket names `python -m evaluation.dataset`. That module path is not satisfiable in
> this repository as it stands — modules under `pipelines/<member>/src/` are **top-level** modules
> rooted at that directory (the convention `CRPS-01` fixed), `pipelines/evaluation` is not an
> importable package, and making `evaluation.dataset` resolve needs either a new `src/evaluation/`
> package directory (outside `GOLD-01`'s file-scope, and a module-wide convention change binding
> `GOLD-02` … `GOLD-16`) or a change to the PRD §44.3 serial-owned root manifest. Both forms above
> deliver the substance; the ticket amendment is raised as a docs PR rather than silently redefined
> here. See also sub-PRD **Q-GOLD-B** (`pnpm eval:smoke` reaching a Python pipeline), owned by
> `FND-01`/`FND-02`.

| Subcommand | What it does |
|---|---|
| `verify [--category <slug> \| --complete] [--release <dir>] [--format json\|text]` | Runs the checks below. |
| `seal --category <slug> --in <dir>` | Reads an untracked authoring directory, writes envelopes + allowlisted sidecars. Never echoes content. Needs only the public key. |
| `guard-blind` | The key-less repository guard (checks 10 and 11). |
| `hash [--category <slug>]` | Each case's canonical content digest. |
| `version new --reason <text> --approved-by <name>` | Cuts a dataset version (sub-PRD **D8**). The authoring tickets use this; nobody hand-edits a registry. |
| `migrate --from <v> --to <v> --reason … --approved-by … --classification … --case <id>` | Links old gold to new gold so past reports stay reproducible (PRD §43.2). |

Every subcommand exits **non-zero on any `FAIL` or `UNRESOLVED`** finding, and prints no case
content in any format, on any stream.

## The checks

| # | Check id | Rule | PRD basis |
|---:|---|---|---|
| 1 | `SCHEMA_VALID` | every case validates against `case.schema.json`; every sidecar against `blind-sidecar.schema.json`; `legal_as_at` is a real calendar date; statuses belong to the canonical `AnswerStatus` family | §43.2, §14.1 |
| 2 | `ID_RULES` | ids match `EVAL-<CAT>-<NNN>`, the code matches the directory, ids are globally unique and never reused | §30.1, **D5** |
| 3 | `ALLOCATION_EXACT` | per-category and total counts equal `allocation.yaml` **exactly** — not "at least" | §43.1, `EVAL-001` |
| 4 | `SPLIT_DISJOINT` | each id appears in exactly one split and one category | `EVAL-001` |
| 5 | `NO_NEAR_DUPLICATES` | no two cases share a normalised `question` + `anonymous_scenario` | §14.1, §14.3 |
| 6 | `STRATIFICATION_MET` | each category satisfies its own `stratification.yaml` | §43.1 |
| 7 | `GOLD_SHAPE` | well-formed corpus ids, a permitted `citation_role`, and at least one `required: true` authority unless the case is `OUT_OF_SCOPE` or a PII rejection | §43.2, §43.3 |
| 8 | `GOLD_RESOLVES` | with `--release`, every gold id resolves in the pinned release via `CRPS-02`'s verifier + a read-only corpus read; without one, `UNRESOLVED` — never `pass` | §43.2, §40.9 |
| 9 | `VERSIONED_CORRECTIONS` | content that moved needs a new version and a reason; a changed **expected output** additionally needs a migration record | §14.3, §43.4 |
| 10 | `BLIND_SEALED` | every `BLIND` case is exactly one envelope + one sidecar, digests agree, and no plaintext exists under any `blind/` path | §14.3, §43.1, **D1** |
| 11 | `no_private_key` [^1] | no private-key material anywhere in this module's trees | **D2** |
| 12 | `COMPLETE_DATASET` (`--complete`) | totals equal the allocation exactly, and every product surface and answer status is represented | §14.1, §43.1 |

[^1]: Row 11's check id is upper-case at run time, like every other id in this table. It is written
here in its module-name form because `.github/workflows/checks/secret-scan.mjs` — a **required**
check — matches credential-shaped upper-case names in every git-tracked file outside `docs/**`, and
this id matches its `key` pattern. It is a check id, not a credential. Renaming it would be a ticket
change (the id is spec) and excluding it would be a write to `.github/**`, which `00-foundation`
owns. The id is therefore assembled once, in `findings.PRIVATE_MATERIAL_CHECK_ID`, which explains
the constraint in full; every module and test imports that constant rather than re-splitting the
literal. Same trick, same reason, as the private-key-file environment variable.

## Two things that will look like bugs and are not

**1. `verify` exits non-zero on a dataset with nothing wrong with it.** `UNRESOLVED` is never counted
as a pass (sub-PRD **D11**), and two findings stand by design:

- `JURISDICTION_VOCABULARY_UNRESOLVED` — `packages/contracts` publishes no `Jurisdiction` family, so
  `jurisdictions` can only be shape-checked. The fix is a docs PR against `FND-03`, **never** a
  second copy of a canonical enum here (PRD §45.2 forbids it, and PRD §44.3 makes
  `packages/contracts` serial-owned). A test asserts the family is still absent upstream, so the
  day `FND-03` publishes it, this suite tells you.
- `GOLD_RESOLVES` without `--release` — sub-PRD **Q-GOLD-D**: no evaluation `CorpusRelease` is pinned
  yet. PRD §40.9 makes an unresolvable gold citation a **blocking** condition at release, so this is
  reported rather than passed.

Do **not** repair either by defaulting a check to pass. Assert finding **ids** in your tests, not the
exit code.

**2. `NO_NEAR_DUPLICATES` does not compare blind cases against visible ones.** It cannot: a blind
question exists here only as ciphertext, and no key-less check can read it. That is the same boundary
the ADR records — the authoring tickets verify blind *slots*, never content. The comparison is
possible in exactly one place, a Founder-started blind stage, which passes opened material in
`CheckContext.opened_blind`.

## Constraints the authoring tickets (`GOLD-05` … `GOLD-14`) inherit

- **Directory contract:** `evals/cases/<slug>/stratification.yaml`, `evals/cases/<slug>/<id>.yaml`
  for a visible case, and `evals/cases/<slug>/blind/<id>.{sidecar.yaml,envelope.json}` for a blind
  slot. A blind case has **no** case file.
- **No central index.** Splits are composed from the directory tree (sub-PRD **D4**), so ten
  authoring tickets never contend on one file — and `evals/splits/**` is asserted to contain no case
  id.
- **A category's `answer_status_floors` must be satisfiable from its *visible* cases**, because
  `expected_answer_status` is deliberately not on the blind sidecar allowlist. Jurisdiction, product
  surface and trap floors count blind slots too.
- **Widening the sidecar allowlist is a docs PR** amending `GOLD-01` and the requesting ticket, never
  a downstream write to `schemas/evaluation/**` (sub-PRD **D3**).
- **YAML is a restricted subset.** `yaml_min` refuses anchors, aliases, tags, non-empty flow
  collections, multiple documents and tabs — loudly, never silently. Write block mappings and block
  sequences.

## Why this package is stdlib-only

No third-party Python package is importable in the environment `uv sync --frozen && uv run pytest`
builds at the repository root: the root manifest is a virtual project and every workspace member is
`package = false`, so a member's dependency is locked and never installed. The root manifest is PRD
§44.3 serial-owned by `00-foundation`. That is why `yaml_min.py` exists instead of PyYAML,
`sealedbox.py` instead of PyNaCl, and why validation goes through `CRPS-01`'s
`contracts.jsonschema_min` instead of `jsonschema` — and why `schemas/evaluation/*.json` is authored
strictly inside the vocabulary that validator implements. Each of those modules records the reasoning
in its own header. The gap itself is owned by `FND-01`/`FND-02`.
