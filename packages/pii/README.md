# `@taxrag/pii` — the server-side PII admission boundary

Implements PRD §10.1, §37.1 and §37.2 — requirement **PII-001**. `EVID-01` ships the admission
contract and PRD §37.2 stages 1-2 (limits, deterministic patterns and checksums) plus the ports the
later stages fill; `EVID-02` implements entity recognition, public-entity context rules and
combination/risk rules; `EVID-03` owns the availability split.

## The PRD §37.2 stage order

```text
browser hints (not trusted)          <- NOT an input to this module
-> request byte/field limits          src/deterministic/limits.ts
-> deterministic patterns/checksums    src/deterministic/detect.ts + detectors/**
-> local entity recognition            stages.recogniseEntities        (port, EVID-02)
-> contextual public-entity allow      stages.applyPublicEntityRules   (port, EVID-02)
-> combination/risk rules              stages.applyCombinationRules    (port, EVID-02)
-> accept sanitized payload OR reject  decide() / sanitize()
-> only then logs, persistence, jobs or provider calls
```

`admit(request, stages)` executes exactly that order. `stages` is **required**, never defaulted:
`CONSERVATIVE_STAGE_DEFAULTS` exists and may be passed, but the choice is explicit at every call
site. Its `recogniseEntities` and `applyCombinationRules` return no findings — **they are documented
placeholders, not detectors**, and a green test suite here is not evidence that entity recognition
works.

## The four rules this package is built around

1. **No bypass exists as a type.** `PiiAdmissionRequest` cannot express `override`, `force`,
   `acknowledge`, `ignoreWarnings`, `bypass`, `skipPii`, `trustedClient` or `clientHints`, and
   `admit` has no third parameter, no options object, no environment lookup and no role check
   (PRD §10.1: *"Customers MUST NOT bypass a positive employee-PII finding"*). Asserted by
   `test/contract/types.test-d.ts`, enforced by `pnpm typecheck`.
2. **A finding never carries the value.** `PiiFinding` is `{ field, start, end, category, severity,
   suggestedPlaceholder }` and nothing else — no `value`, `text`, `match`, `hash`, `fingerprint`,
   `redactedValue` or `context`, and no accessor that could return one (PRD §37.2: *"never echoes the
   detected value"*, *"not content or reversible hash"*).
3. **Any `BLOCKING` finding forces `REJECT`, with no payload.** A blocked request is never "cleaned"
   for the customer: PRD §34.9 asks the CUSTOMER to *"replace indicated spans with anonymous
   placeholders"*, and a system that silently sanitised blocked PII would be a bypass wearing a
   helpful hat.
4. **Browser hints are advisory and never satisfy `PII-001`.** PRD §37.2 lists them as untrusted and
   sub-PRD D1 recomputes everything server-side, so they are not an input to this module at all.

## Offsets

`[start, end)` is **half-open, in JS string indices into `value.normalize('NFC')`** — so
`value.normalize('NFC').slice(start, end)` is the detected span. Detection runs on a separate *scan
view* (`src/deterministic/normalise.ts`) with zero-width and bidi controls dropped and look-alikes
folded, alongside an index map back to NFC, so an evasion never moves an offset. A span boundary
always falls on a code-point boundary; a finding never splits a surrogate pair.

## Observability

The only surface is an injected sink:

```ts
emitAdmissionMetrics(result, sink, requestId); // sink.record({ category, count, result, requestId })
```

The event type is closed — no `message`, no `detail`, no `tags` — so content cannot be passed through
it even by accident. `admit` does **not** take the sink: emission is a separate, explicit call by
`RUNT-02`/`ASK-01`, which also keeps `admit` pure. The package imports **no Node builtin and no
dependency at all**: no logger, no file, no socket, no database
(`test/contract/purity.test.ts` asserts the import graph).

## The reserved structured channel

Public-entity exceptions come only from `structured.employer`, `structured.abn` and
`structured.publicCaseParty` (PRD §37.2, sub-PRD D4) — *"not a generic 'ignore warning' button"*.
Those values are still scanned, failing closed; the conservative allow rule drops a finding only when
the field is one of the three reserved names, the span covers the WHOLE value, and (for `abn`) the
mod-89 checksum passes.

A `freeText` field **cannot** be named `structured.anything`: `enforceLimits` rejects the request
before any scanning. That closes the one structural bypass this design could have had.

**Consequence worth knowing:** an eleven-digit ABN pasted into *free text* is not guaranteed to be
admitted — a Medicare-shaped eleven-digit run may fire there and the module fails closed. The
supported channel for a public ABN is `structured.abn`, which is what `UAT-PII-02` requires.

## Limits (open question OQ-2)

`PII_ADMISSION_LIMITS` v1: **8,000** characters per field, **16** fields, **65,536** total bytes,
**64** characters per field name. The PRD sets no number (§21.1 says "size limits" and stops); these
are conservative initial values, exported as versioned frozen data. `RUNT-02`'s HTTP body limit and
`ASK-01`'s question length must be **at least** these, or the API rejects before admission and the
§37.2 order is never exercised end to end. Exceeding a limit is a `REJECT` with a
`REQUEST_LIMIT_EXCEEDED` finding — **never** a truncation.

## Importing this package (open question OQ-1)

`@taxrag/pii` exports nothing: `src/index.ts` is held byte-exactly `export {};` by the FND-01
skeleton guard (`tools/workspace-assertions.mjs`), which every branch asserts. Consumers deep-import
the leaf barrels, the same relative style `packages/domain` already uses:

```ts
import { admit, CONSERVATIVE_STAGE_DEFAULTS } from '../../../pii/src/contract/index.js';
import { isValidAbn } from '../../../pii/src/deterministic/index.js';
```

Resolving this belongs to a follow-up ticket that owns every package barrel — `FND-03` (plan Q1) and
`FND-07` (plan OQ-3) raised the same item.

## Measurement

`test/deterministic/recall-report.json` is committed and recomputed by the test run
(`test/deterministic/recall-report.test.ts`). Floors: **100% recall** for `TAX_FILE_NUMBER`,
`MEDICARE_NUMBER` and `BANK_OR_CARD_DETAIL` (deliverable 12). Every other category is *recorded*, not
floored — the target is sub-PRD **Q-EVID-2**, a Founder risk decision.
`IDENTIFYING_COMBINATION` (PRD §37.1 blocked row 7) is reported at **0%** with its cases listed under
`deferred`, owner `EVID-02`: it is the combination/risk stage, which EVID-01's Non-goals assign
there. Regenerate deliberately with `PII_UPDATE_RECALL_REPORT=1 pnpm --filter @taxrag/pii test`.

## What this package does NOT do

- It does not store, log or echo anything. Blocked bodies live only in request memory (PRD §37.2,
  §37.3 — *"Blocked raw PII: Never"* in all four columns).
- It does not map to an HTTP status. `422 EMPLOYEE_PII_DETECTED` (PRD §34.9) is the API's job
  (`RUNT-02`, `ASK-01`).
- It does not scan corpus text. Public official sources are public (PRD §37.3); this boundary governs
  **customer input** only.
- **An `ACCEPT` does not mean there was content.** An empty request is a well-defined `ACCEPT` with
  no findings; callers must not read that as "checked and non-empty".

---

# Stages 4–6 — local entity recognition, public-entity rules, combination risk (`EVID-02`)

PRD §37.2's stages 4, 5 and 6, behind `EVID-01`'s frozen ports. Callers pass **`PII_STAGES`** where
they previously passed `CONSERVATIVE_STAGE_DEFAULTS`:

```ts
import { admit } from '../../../pii/src/contract/index.js';
import { PII_STAGES } from '../../../pii/src/context/index.js';

const result = admit(request, PII_STAGES);
```

`src/index.ts` stays `export {};` (see *Importing this package* above), so `src/entity/index.js` and
`src/context/index.js` are deep-imported the same way.

## Stage 4 — local entity recognition (`src/entity/**`)

A rule/gazetteer recogniser behind the `EntityRecogniser` port. It detects person-name-shaped spans
by **structure and context**, never from a list of names. Every rule needs a cue; a sentence-initial
capital is never a candidate on its own.

| Rule | Trigger | Severity | Documented false-positive risk |
|---|---|---|---|
| `HONORIFIC_NAME` | `Mr`/`Mrs`/`Ms`/`Miss`/`Dr`/`Prof`/`Sir`/`Dame`/`Rev` + 1–3 capitalised tokens | `BLOCKING` | place names carrying an honorific ("Dr Martin Place") |
| `EMPLOYMENT_RELATION_NAME` | 2–3 capitalised tokens inside an employment-relation context (`my employee`, `the worker`, `works for`, `reports to`, `dismissed`, `terminated`, `resigned`, `on leave`, …), before **or** after | `BLOCKING` | an employer name in the same sentence — mitigated by the organisation-head test |
| `SIGNATURE_OR_GREETING_NAME` | `Hi`/`Hello`/`Dear`/`Regards`/`Thanks`/`Sincerely` + capitalised token(s), or a trailing `--`/`—` sign-off | `BLOCKING` | "Dear Fair Work Commission" — mitigated by the gazetteer |
| `ADJACENT_CONTACT_NAME` | 2–3 capitalised tokens within 48 characters of a span already carrying a private email, phone, social handle or address | `BLOCKING` | a business name beside a published business line |
| `POSSESSIVE_PERSONAL_MONONYM` | one capitalised token in a personal-possessive employment context (`X's roster`, `X was rostered`) | `ADVISORY` | the highest of the five; held to zero false positives across every `EVID-01` negative by the differential replay |

The **allow gazetteer** (`src/entity/deterministic/gazetteer.ts`) prevents candidates, and can never
remove a finding another stage produced: legal/organisation heads (`Pty Ltd`, `Group`, `Council`, …),
named regulators, courts and tribunals, the PRD §37.1 placeholder forms (`Employee A`, `the worker`),
state/territory names, calendar vocabulary, and a case-citation guard so
`Smith v Example Widgets Pty Ltd [2024] FWC 123` is public material.

**Documented blind spots** — named because an unnamed blind spot turns a recall number into a
fiction:

- **scripts without case** — CJK, Arabic, Hebrew and Thai names are **not covered**: every rule keys
  on `\p{Lu}`;
- an all-lower-case name, and a bare mononym with no possessive cue;
- a name inside a sentence that also carries a citation-shaped reference (the citation guard is
  sentence-scoped; it suppresses only *name candidates*, never a deterministic finding).

## Stage 5 — contextual public-entity allow rules (`src/context/publicEntity.ts`)

**The only stage that removes a finding, and the whole reason it may.** Suppression happens only when
`isExplainedByStructuredChannel(finding, structured)` is true, which requires **all** of:

1. the finding's field is one of the three reserved channels **and** that channel is present;
2. the span covers the **whole** channel value, modulo leading/trailing whitespace — an employer name
   with a phone number appended is still blocked;
3. the finding's category is one this channel actually explains
   (`employer`/`publicCaseParty` → `EMPLOYEE_OR_PRIVATE_INDIVIDUAL_NAME`; `abn` → `TAX_FILE_NUMBER`,
   `MEDICARE_NUMBER`, `EMPLOYEE_OR_PAYROLL_IDENTIFIER`). A personal email pasted into the `employer`
   field is **not** cleared;
4. for `structured.abn`, the digits pass the mod-89 checksum; for `structured.publicCaseParty`, the
   value itself carries a citation-shaped reference — a bare "Smith" is not public material.

The predicate takes **exactly two parameters** and always will: no role, header, flag, environment
variable, acknowledgement or permission can reach it (PRD §37.2, sub-PRD **D4**), asserted at the type
level in `test/context/types.test-d.ts`. Nothing in `freeText` is ever suppressed, and a `freeText`
field named `structured.*` is rejected by the limits stage before any scanning.

`src/context/necessaryFacts.ts` is a **candidate filter**, not a suppressor: anonymous role/duty,
employment type, award/classification language, approximate wage facts, state/territory location and
age bands are prevented from becoming candidates, and are never used to clear a finding. It is
deliberately not imported by `publicEntity.ts`, and a test asserts that import edge is absent.

## Stage 6 — combination/risk rules (`src/context/combination.ts`)

`COMBINATION_RULE_V1` is **frozen, versioned data** — a threshold and two dimension sets, never a
number inside an `if`:

| Field | Value |
|---|---|
| `threshold` | 2 distinct dimensions |
| `required` | `PERSONAL_EVENT` |
| `narrowing` | at least one of `ROLE_SPECIFICITY`, `SMALL_WORKPLACE`, `RESIDUAL_IDENTIFIER` |
| `dimensions` | `ROLE_SPECIFICITY`, `SMALL_WORKPLACE`, `PERSONAL_EVENT`, `PRECISE_TIME_OR_PLACE`, `RESIDUAL_IDENTIFIER` |

**Why those numbers, derived rather than chosen.** Of `EVID-01`'s twenty deferred cases only nine
carry an explicit headcount, so a plain threshold of 3 would miss eleven of them; and a plain
threshold of 2 would block *"The dismissal took effect on 12/03/2024 after the meeting."*
(`PERSONAL_EVENT` + `PRECISE_TIME_OR_PLACE`), an ordinary question PRD §10.1 says MAY be accepted.
Hence: a personal event is required, and its partner must be identity-**narrowing**; a precise time
or place counts toward the total but can never be the only partner. Changing this ships a
`COMBINATION_RULE_V2` with a new `version`, recorded in `docs/prd/12-evidence-safety/README.md` —
never an edit in place.

The fired dimensions are returned by `evaluateCombination(input, findings)` as **names**, alongside
the finding, because `PiiFinding` has exactly six members and `EVID-01`'s type test asserts that list
exhaustively. The assessment carries names, a field name and offsets — never text.

## Running with a model runtime enabled

The pinned-model runtime is **off by default, and there is no switch to leave on**: `PII_STAGES`
always holds the deterministic recogniser, and a model arrives only by being passed in.

```ts
import { createPiiStages } from '../../../pii/src/context/index.js';
import { createRuntimeRecogniser, loadPinnedArtifact } from '../../../pii/src/entity/index.js';

// The host supplies the impurity: this package imports no builtin and no dependency.
const outcome = loadPinnedArtifact(pin, { read: () => readModelBytesOrNull() }, sha256Hex);
const stages = createPiiStages({ recogniser: createRuntimeRecogniser(model, outcome) });
```

`loadPinnedArtifact` verifies in a fixed, tested order — read → size → digest → `READY` — and has no
"warn and continue" branch. A failure yields `readiness() === 'UNAVAILABLE'`, the recogniser appends
nothing, and the deterministic recogniser continues. **No artifact is selected or shipped today**:
see `docs/adr/0001-local-pii-entity-runtime.md`, which also records the measured memory and latency
against the PRD §39.2 `app` 320 MiB limit.

## Measurement (stages 4–6)

`test/entity/recall-report.json` is committed and recomputed by the test run. It records recall,
precision and **which stage made each detection** (derived by running every case under
`CONSERVATIVE_STAGE_DEFAULTS` and under `PII_STAGES` and diffing), plus a **named** reason for the
skipped runtime-enabled row. Regenerate deliberately with
`PII_UPDATE_ENTITY_REPORT=1 pnpm --filter @taxrag/pii test`.

`EVID-01`'s `IDENTIFYING_COMBINATION` deferral is closed here:
`test/context/stages-regression.test.ts` replays `EVID-01`'s entire corpus under both stage sets and
asserts that the ONLY decision changes are the twenty deferred cases, named by id.

The canary manifest `test/deterministic/corpora/canaries.json` gained a second key, `stageCanaries`,
for the stage-4/6 paths — the same file, so `ASSR-03` reads one manifest and the two suites cannot
drift.

## The PRD Sec10.1 availability split (EVID-03)

PRD Sec10.1 says: "If authoritative detection is unavailable, public legal search MAY continue but
free-text Ask/Compare/Coverage MUST fail closed."

| Operation | Detector availability | Decision |
|---|---|---|
| Public legal search | Not authoritative | Continue |
| Free-text Ask | Not authoritative | Fail closed |
| Free-text Compare | Not authoritative | Fail closed |
| Free-text Coverage | Not authoritative | Fail closed |

The Sec37.2 health inputs are `limits`, `deterministic`, `entity`, and `context`. PRD Sec10.1's
"MUST combine" basis means there is no middle grade: all four must be `READY` for an
`AUTHORITATIVE` result; one `DEGRADED` or `UNAVAILABLE` stage makes the result
`NOT_AUTHORITATIVE`. This conservative rule is a writeback candidate for
`docs/prd/12-evidence-safety/README.md` D5; EVID-03 does not edit that document.

Three distinct causes map to `GENERATION_UNAVAILABLE` (503): `PII_DETECTION_UNAVAILABLE` is owned
here, `BUDGET_UNAVAILABLE` belongs to EVID-08, and `PROVIDER_UNAVAILABLE` belongs to EVID-07. The
reason remains distinct even though the public error code and status are shared.

The probe is a contract, not a scheduler. It never scans sample text, opens no file or socket, and
makes no network call. The host supplies observations and any transition timestamp.

```ts
import { DEFAULT_ENTITY_RECOGNISER } from './src/context/stages.js';
import {
  aggregateDetectorHealth,
  createDetectorProbe,
  decideOperationAdmission,
} from './src/availability/index.js';

const probe = createDetectorProbe(DEFAULT_ENTITY_RECOGNISER);
const availability = aggregateDetectorHealth(probe.check());
const decision = decideOperationAdmission('FREE_TEXT_ASK', availability);
```
