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
