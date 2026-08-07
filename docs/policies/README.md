# `docs/policies/` — the canonical policy source

This directory is the **single source** of the four documents PRD §11.2 requires: Terms of Service,
Privacy Policy, Acceptable Use Policy and the disclaimer. Policy text exists here and nowhere else
(sub-PRD `24-launch` decision **D2**).

Two tickets compile this directory and neither one restates its content:

- `LNCH-02` — the in-product legal feature (`apps/web/src/features/legal/**`);
- `LNCH-03` — the public static site (`apps/web/public-site/**`).

Both read `disclaimer.md`'s `short_form` / `export_form` and
`claim-language/required-strings.json`; neither invents its own disclaimer wording or its own list of
required strings.

## Ownership: content is the Founder's, structure is the module's

PRD §45.5 classifies any change to customer behaviour, scope, promise, price or limit, data use or a
release gate as a **Product change** requiring founder approval and a PRD update. Terms, liability,
governing law, pricing and data-use promises are all of those.

So (sub-PRD **D1**):

- The **Founder** authors or approves every substantive legal statement.
- This module ships the **structure**, the machine-readable rules, the risk register and the checker.
- A coding agent may transcribe a **product fact fixed by the PRD**, and must cite the PRD section
  inline so the Founder can verify it.
- Everything else is exactly one marker:
  `<!-- FOUNDER_INPUT_REQUIRED: <what is needed and why> -->`.
  A convincing placeholder that reads like a real clause is **worse** than an empty one. Unfilled
  sections are machine-detectable by design.

A section is **either** prose **or** exactly one marker — never both, never neither. `check-policies.mjs`
fails on a section that is both (`section-both-prose-and-marker`) or neither (`section-empty`).

## Status lifecycle

```
DRAFT_PENDING_FOUNDER_CONTENT  ->  DRAFT_FOUNDER_APPROVED  ->  PUBLISHED
```

- `DRAFT_PENDING_FOUNDER_CONTENT` — structure exists; at least one section is still a marker.
- `DRAFT_FOUNDER_APPROVED` — the Founder has authored or approved every section.
- `PUBLISHED` — live on a customer surface.

PRD §11.2: the four documents **MUST be drafted before paid access**. Drafting is what this directory
delivers; when a draft becomes `PUBLISHED` is a Founder decision (sub-PRD open question **QL3**) and no
ticket decides it.

All four documents are currently `DRAFT_PENDING_FOUNDER_CONTENT`.

## `LEGAL_REVIEW_PENDING` is never closed here

PRD §11.2 requires it to "remain an explicit launch risk and be revisited when revenue permits", and
PRD §27 fixes the mitigation as draft policies plus a retained risk. Paid legal review is **not** a
release blocker.

- Every document frontmatter carries `legal_review: LEGAL_REVIEW_PENDING`.
- [`legal-review-register.md`](./legal-review-register.md) and
  [`legal-review-register.json`](./legal-review-register.json) hold one `OPEN` row per document and
  one per PRD §11.2 surface (`web-app`, `widget`, `exports`).
- **No ticket may set a row to anything other than `OPEN`.** Only the Founder closes one, as a docs
  change recorded in [`CHANGELOG.md`](./CHANGELOG.md).
- The disclosure is **internal** (PRD §26). The literal string `LEGAL_REVIEW_PENDING` must never reach
  a customer surface; the checker enforces that with `legal-review-pending-leak`.

## Running the checker

```
node docs/policies/tools/check-policies.mjs
```

Exit code 0 means the tree is valid; 1 means at least one violation, one line each, formatted
`<path>:<line>: <rule-id>: <message>`. Options:

| Flag | Default | Purpose |
|---|---|---|
| `--root <dir>` | this directory | point the checker at a fixture tree |
| `--prd <path>` | `docs/PRD.md` | the read-only PRD used to resolve `prd_basis` |
| `--report <path>` | none | write a machine-readable summary for `LNCH-05` |

The checker is Node-standard-library only (no npm dependency, no workspace membership — sub-PRD
**D11**), reads no network, and writes nothing unless `--report` is given an explicit path.

Its own tests:

```
node --test docs/policies/tools/check-policies.test.mjs
```

## Frontmatter grammar (normative)

`LNCH-02` and `LNCH-03` parse these files too and must not reverse-engineer the grammar from the
checker source. Frontmatter is a `---` fenced block at the top of each document, restricted to:

- `key: value` where the value is a **double-quoted string**, a **bare scalar** (no `#`, no `: `, no
  leading `-`, no single quote), `null`, or an **inline array** `[a, b, c]`;
- **block arrays** — `key:` on its own line, followed by `  - item` lines;
- **folded scalars** — `key: >-` followed by indented continuation lines, joined with single spaces.

Anything else — anchors, nested maps, `|` literal blocks, trailing `#` comments, tabs — is a
violation (`frontmatter-unsupported-syntax`), never a silent misparse. A full-line `#` comment at
column 0 is ignored.

Keys are fixed by [`policy.schema.json`](./policy.schema.json) (JSON Schema draft 2020-12):
`id`, `title`, `version`, `status`, `effective_date`, `owner`, `legal_review`, `last_reviewed`,
`applies_to`, `prd_basis`; `disclaimer.md` additionally requires `short_form` and `export_form`.
`prd_basis` entries are section references of the form `§11.2`, and each must resolve to a heading in
`docs/PRD.md`.

### Schema subset

The checker implements the validator by hand, so the schema may only use keywords it supports:
`type`, `enum`, `const`, `pattern`, `minLength`, `items`, `uniqueItems`, `minItems`, `required`,
`properties`, `additionalProperties`, `if`, `then` (plus the `$schema`, `$id`, `title` and
`description` annotations). An unsupported keyword is reported as `schema-unsupported-keyword` rather
than being silently ignored — a constraint that looks enforced but is not would be worse than no
constraint.

## Claim language

[`claim-language/prohibited-claims.json`](./claim-language/prohibited-claims.json) is the rule set
every customer-facing surface in this module is checked against, with six rule families:
`definite-compliance`, `legal-representation`, `government-endorsement`, `sla-promise`,
`unlimited-capacity`, `complete-coverage`.

Scope: **static policy and marketing copy only.** Generated-answer safety — refusal, status and "no
unsupported definitive claim" — belongs to `FND-07`, `EVID-05` and `ASSR-04`.

`allowed_negations` exists because the required copy must be able to *deny* a claim, and a denial
contains the banned phrasing ("... not legal representation"). Exclusion is span-based: a claim match
is skipped only when it lies **inside** an allowed-negation match.

**If a rule fires on legitimate required copy, do not weaken or delete the rule.** Add an
`allowed_negations` entry whose `why` names the PRD sentence that forces the wording. Changing a rule
changes a contract `LNCH-02` and `LNCH-03` depend on, and is a ticket amendment (LNCH-01 Feedback
obligation 2).

Scan scope is deliberately narrow: the four document bodies, `short_form`, `export_form` and
`required-strings.json`. `README.md`, `CHANGELOG.md` and both register files are **not** scanned —
they exist to describe the risk of unreviewed copy and legitimately quote both the banned phrasings
and the `LEGAL_REVIEW_PENDING` token. Document discovery is an explicit filename map, not a directory
walk, so the seeded violations under `tools/fixtures/**` never reach the real tree's result.

## Files

| Path | What it is |
|---|---|
| `README.md` | this index |
| `CHANGELOG.md` | one line per content change; documents bump their `version` alongside |
| `policy.schema.json` | frontmatter contract |
| `terms-of-service.md`, `privacy-policy.md`, `acceptable-use-policy.md`, `disclaimer.md` | the PRD §11.2 documents |
| `claim-language/prohibited-claims.json` | what copy may not say |
| `claim-language/required-strings.json` | what each surface must carry |
| `legal-review-register.md` / `.json` | the standing `LEGAL_REVIEW_PENDING` risk register |
| `tools/check-policies.mjs` | the checker |
| `tools/check-policies.test.mjs` | its `node --test` suite |
| `tools/fixtures/**` | one valid baseline tree plus five seeded negative trees |
