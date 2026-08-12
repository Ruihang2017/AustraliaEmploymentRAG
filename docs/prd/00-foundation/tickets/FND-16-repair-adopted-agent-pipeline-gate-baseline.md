---
id: FND-16
title: Repair adopted agent-pipeline gate baseline
module: 00-foundation
lane: 00-foundation
size: S
agent: builder
status: ready
date: 2026-08-12
blocked_by: []
blocks: []
---

# FND-16 — Repair adopted agent-pipeline gate baseline

Repairs the repository test and lint gates that became red when adoption commit `a7e0e47` committed the
three-agent configuration. No ADR — this restores existing gate behaviour and lint conformance; it does
not change the PRD §20.1 layout, the PRD §20.3 gate policy, or pipeline delivery semantics.
Parent sub-PRD: [00-foundation README](../README.md). Master spec: [PRD](../../../PRD.md).
Depends on: none — `FND-01` is already delivered on `main`; it is provenance for the workspace gate and
pinned commands, not an open graph prerequisite.
**Why `builder`:** one bounded baseline repair is required because each symptom makes the other's full
repository acceptance command fail; splitting them would make both tickets undeliverable.

## Background + basis

The root test command runs `tools/tests/layout.test.mjs`. Its `assertLayout()` allowlist is derived from
`tools/fixtures/prd-20-1-layout.json`, whose committed non-PRD top-level entries are only `.claude`,
`.github`, `templates`, and `tools`. Adoption commit `a7e0e47` added committed top-level `.agents/` and
`.codex/` directories, so the test rejects both as unexpected despite their being pipeline configuration,
not PRD §20.1 product directories.

The root lint command delegates to `eslint --config tools/eslint.config.mjs .`; the config intentionally
scans `.codex/scripts/**`. Its direct focused invocation reports ten existing errors in four adopted
scripts: irregular whitespace in `dag-core.mjs` (14:40), `prd-phase.mjs` (100:68), and
`publish-tickets.mjs` (417:53); empty catches in `dag-core.mjs` (41:53), `deliver-ticket.mjs`
(179:11, 452:13), and `publish-tickets.mjs` (78:65, 120:9, 346:68); and an unused assignment in
`deliver-ticket.mjs` (562:7).

Both failures predate `FND-15`, but `FND-15` requires full test and lint success. They must be one
atomic repair: a layout-only ticket cannot pass the mandatory full lint command, while a lint-only ticket
cannot pass the mandatory full test command. Reciprocal dependencies would be a cycle; omitting them
would still cause both Reviewer stages to bounce. The owned paths below are otherwise disjoint, but the
shared repository gates make them a single delivery unit.

## Goal

Restore green root test and lint gates for the adopted repository while keeping the layout guard
fail-closed and keeping the adopted pipeline scripts inside the lint scope.

## Non-goals

- Do not change `fixture.source`, `fixture.directories`, or `topLevelFromLayout`; PRD §20.1 is unchanged.
- Do not add a wildcard, arbitrary dot-directory, or generated artifact to the layout allowlist.
- Do not ignore `.codex/**` in ESLint or weaken any root lint rule.
- Do not change `.agents/**`, root manifests/lockfiles, CI workflows, tracker state, CLI arguments,
  delivery policy, or product source/tests.
- Do not refactor pipeline behaviour. Any repair to an empty catch or polling variable must preserve its
  existing observable success, error, timeout, filesystem, and tracker behaviour.

## File-scope (write-owns)

- `tools/fixtures/prd-20-1-layout.json`
- `tools/tests/layout.test.mjs`
- `.codex/scripts/dag-core.mjs`
- `.codex/scripts/deliver-ticket.mjs`
- `.codex/scripts/prd-phase.mjs`
- `.codex/scripts/publish-tickets.mjs`
- Does not touch: other `tools/**`, any other `.codex/**`, `.agents/**`, `.github/**`, root manifests or
  lockfiles, product packages, or `docs/prd/**` except this ticket and its README registration.

`FND-01` last wrote the layout gate and is delivered; `a7e0e47` introduced all four scripts. No live
ticket owns these six implementation files. The `tools/**` and `.codex/**` portions are disjoint, but
they stay in this one ticket solely because both are necessary for every full-suite delivery gate to pass.

## Deliverables

1. Add exactly `.agents` and `.codex` to `topLevelPreexistingAllowed.entries`, retaining the distinction
   between committed pre-existing directories and ignored build artifacts.
2. Add a focused `layout.test.mjs` regression assertion that pins those two exact fixture entries; retain
   the existing synthetic `vendor` rejection test and filesystem-based `assertLayout()` implementation.
3. Replace only the three flagged literal U+FEFF characters in the named Codex scripts with the ASCII
   `\uFEFF` escape inside each leading-BOM regex, preserving surrounding text and parser/output behaviour.
4. Resolve the six named `no-empty` findings with explicit, behaviour-preserving handling that documents
   why each exception is intentionally ignored; do not make a best-effort probe fatal or swallow an error
   that previously surfaced.
5. Remove the single `no-useless-assignment` finding without changing mergeability polling's reported
   status, timeout, or delivery decision.
6. Keep `.codex/scripts/**` in the root lint scope and prove the focused lint command plus both root gates
   are green.

## Acceptance checklist (classified)

- [ ] `[machine]` `node --input-type=module -e "import { assertLayout } from './tools/workspace-assertions.mjs'; const problems = assertLayout(); if (problems.length) throw new Error(problems.join('\\n'))"` exits 0; the focused layout test also asserts `.agents` and `.codex` are explicit fixture entries and still rejects `vendor`.
- [ ] `[machine]` `node node_modules/vitest/vitest.mjs run tools/tests/layout.test.mjs` exits 0.
- [ ] `[machine]` `node node_modules/eslint/bin/eslint.js --config tools/eslint.config.mjs .codex/scripts` exits 0 without adding `.codex/**` to an ignore list.
- [ ] `[machine]` `corepack pnpm test` and `corepack pnpm lint` both exit 0 using the D17-pinned Node/pnpm toolchain.
- [ ] `[machine]` `node .codex/scripts/dag-scan.mjs docs/prd` exits 0, proving the changed graph parser still loads without publishing or delivering anything.
- [ ] `[human]` No human criterion — the baseline symptoms and their gates are deterministic.

## Test plan

Run the focused layout Vitest file and direct `assertLayout()` command; verify that `vendor` remains a
negative control. Run focused ESLint against `.codex/scripts` and confirm it reports no errors while
still scanning the four owned scripts. Under the `FND-01` / sub-PRD D17 pins, run full `corepack pnpm
test` and `corepack pnpm lint`, then run `dag-scan.mjs`. Do not invoke `deliver-ticket.mjs`; inspect its
changed error/polling paths against the existing CLI contract instead.

## Feedback obligation

If another committed top-level directory must be allowed, record why it is neither a PRD root nor an
ignored build artifact here and create a separately scoped ticket; never add a broad exception. If any
lint finding cannot be fixed without changing pipeline behaviour, stop, record the conflict in this
ticket and the 00-foundation README, and escalate a separate behavioural ticket. Do not silence either
class of future baseline regression through a global ignore.
