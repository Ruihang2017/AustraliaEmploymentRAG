# ADR 0001 — Local PII entity-recognition runtime

- **Status:** Accepted
- **Owner:** `12-evidence-safety` (`EVID-02`)
- **Date:** 2026-08-08
- **Resolves:** sub-PRD `docs/prd/12-evidence-safety/README.md` open question **Q-EVID-1**
- **Basis:** PRD §10.1, §17.3, §18.2, §21.1, §37.1, §37.2, §39.2, §45.5; breakdown plan **A9**

## Context

PRD §10.1 requires server detection to combine **deterministic patterns/checksums, local entity
recognition and context-aware public-entity rules**. PRD §17.3 places the recogniser in the
*"online local"* class (*"PII pre-screening"*) and PRD §18.2 asks for a *"small pinned … runtime"*.
Neither names a library, a model or a format. That gap is sub-PRD **Q-EVID-1** and it is an
architecture decision under PRD §45.5 (*"durable technology/dependency/deployment trade-off"*),
because whatever is chosen becomes a dependency, a release-archive artifact and a line in a memory
budget.

Three constraints bound the choice before any option is compared.

1. **`packages/pii/src/**` may import no Node builtin and no package.**
   `packages/pii/test/contract/purity.test.ts` (`EVID-01`, merged) asserts that every module
   specifier under `src/**` is relative, and `EVID-02` may not modify it. A model runtime inside this
   package therefore cannot read a file, hash bytes, read an environment variable or open a socket.
2. **PRD §21.1 forbids *"arbitrary runtime plugin/model/code download"*.** An artifact must be pinned
   by version and digest, verified before load, and present in the release archive — never fetched.
3. **PRD §39.2 gives `app` 320 MiB in total.** `app` is the process admission runs in. A resident NER
   artifact is a budget line competing with everything else in that process, not a free choice.

## Options considered

### Option A — rule/gazetteer recogniser only (**chosen**)

Person-name recognition by structure and context: honorific + capitalised tokens, a capitalised
bigram inside an employment-relation context, a greeting/signature form, a capitalised sequence
adjacent to a detected private contact detail, and a personal-possessive mononym — each rule named,
individually testable, and documented with its false-positive risk, behind an explicit allow
gazetteer of PRD §37.1 public-entity forms.

- **For:** no artifact, no dependency, no download, no memory line, no licence question; every rule
  is auditable and its failure mode is inspectable; CI, and every downstream module's tests, run
  offline with nothing to install. Sub-PRD **Q-EVID-1**'s own "Blocks" cell already anticipates it:
  *"Nothing — `EVID-02` ships a deterministic gazetteer/rule recogniser behind the same port, so CI
  never needs a model."*
- **Against:** recall is bounded by the cues the rules know. It cannot recognise a name in a script
  without case (CJK, Arabic, Hebrew, Thai), an all-lower-case name, or a bare mononym with no
  possessive cue. Those blind spots are named in `packages/pii/README.md`, in the corpus README and
  in the Consequences below, because an unnamed blind spot turns a recall number into a fiction.

### Option B — a small pinned local NER model

A quantised NER model (an ONNX or GGUF artifact in the 15–120 MiB class) loaded in-process behind
the same port.

- **For:** higher recall on unlabelled names, especially non-Anglo and lower-case forms.
- **Against:** constraint 1 means the loading, hashing and inference code cannot live in
  `packages/pii` at all — the impurity has to be injected by the host, so the dependency buys nothing
  this ticket can test, and the runtime would arrive with `EVID-03`/`RUNT-02` rather than here.
  Constraint 3 makes it a real charge against `app`'s 320 MiB. It adds a licence obligation, an SBOM
  entry, a scan target and a release-archive line for `RLSE-01`. Its recall gain is unmeasured today
  and is exactly what **Q-EVID-2** exists to measure.
- **Not rejected — deferred.** The port, the pin format and the verification order are shipped by
  this ticket precisely so this option can be taken later without redesign.

### Option C — a hosted NER/PII service — **rejected outright**

- PRD §17.3 makes this task local. PRD §10.1 requires the PII boundary to run *"before logging,
  persistence or provider calls"*: sending the customer's text to a provider **in order to detect
  the PII in it** would send unadmitted text off-process, which is the exact failure `PII-001`
  exists to prevent. A PII detector that leaks the PII it is detecting is not a detector.
- This is the option the ticket's Falsified protocol says may never be quietly chosen. It is recorded
  here as rejected so that a future reader finds a decision rather than an omission.

## Decision

**Ship the rule/gazetteer recogniser (Option A) as the local entity-recognition runtime for v1.
Define the pinned-model runtime (Option B) as a port plus a pure, hash-verifying loader contract.
Select no artifact and ship none.**

Concretely, in `packages/pii`:

- `src/entity/port.ts` — `EntityRecogniser` (`recognise` + `readiness()`), the single port both
  implementations satisfy;
- `src/entity/deterministic/**` — the shipped default. `readiness()` is `READY` unconditionally
  because it loads nothing and has no failure mode;
- `src/entity/runtime/**` — `ArtifactPin`, `loadPinnedArtifact` and `createRuntimeRecogniser`. The
  loader is pure: the host injects an `ArtifactSource` and a digest function, which is where
  `node:fs` and `node:crypto` legitimately live;
- `src/context/stages.ts` — `PII_STAGES`, the process-wide default, always holds the deterministic
  recogniser. A model arrives only by being passed to `createPiiStages`. There is no environment
  switch, so there is nothing to leave enabled by mistake.

## Artifact

**None selected.** `ENTITY_ARTIFACT_PINS` is an empty frozen tuple — empty by decision, not by
omission.

- **Size:** not applicable (no artifact).
- **Digest:** not applicable (no artifact). The pin *format* is fixed now:
  `{ id, version, digestAlgorithm: 'sha256', digest, sizeBytes, licence }`, with no field for a URL,
  a mirror, a fallback or an "allow unverified" flag.
- **Licence:** **not applicable — no artifact is selected, so this ticket introduces no new licence
  obligation and no SBOM entry.**
- **Verification order any future artifact must satisfy**, already implemented and tested
  (`test/entity/runtime-loader.test.ts`): read → size check → digest check → only then `READY`. There
  is no "warn and continue" branch; a mismatch returns `UNAVAILABLE` with a closed-union reason code
  (`ARTIFACT_ABSENT` / `SIZE_MISMATCH` / `DIGEST_MISMATCH` / `READ_FAILED`) carrying no path and no
  bytes. The digest is not even computed once the size is already wrong.

## Measured memory and latency

Measured by `packages/pii/test/entity/budget.test.ts` on the delivery run (Node 22, Windows,
developer machine — an order-of-magnitude reading, not a CI gate):

| Row | Measurement |
|---|---|
| Resident memory, runtime **OFF** | RSS **62.5 MiB** for the whole test process with the module loaded and warm; the delta across 20 further maximum-size admissions is **7.9 MiB** (transient per-request scan views, not retention). The recogniser itself adds frozen rule tables only. Against the PRD §39.2 `app` limit of **320 MiB**, admission is not the constraining line. |
| p95 admission latency, runtime **OFF** | **2.7 ms** (p50 1.2 ms) over 200 iterations of a maximum-size request — 16 fields × 8,000 characters, the largest the limits stage admits — through the whole PRD §37.2 pipeline including stages 4–6. |
| Resident memory and latency, runtime **ON** | **SKIPPED, for a named reason:** *no model artifact is selected or shipped — this ADR decides the rule/gazetteer recogniser for v1, so `ENTITY_ARTIFACT_PINS` is empty and there is nothing to load.* The same sentence is written into `packages/pii/test/entity/recall-report.json` under `runtimeOn.skipped`, so the absence is visible in a committed file rather than only in a console line. |

## Consequences

- **`RLSE-01` (release archive) gains nothing.** No model file, no licence text, no SBOM entry, no
  new scan target. If Option B is taken later, that ticket's archive grows and this ADR is amended
  rather than replaced.
- **`EVID-03` consumes `readiness()`.** It is a three-state accessor (`READY` / `DEGRADED` /
  `UNAVAILABLE`) that never defaults to `READY`; the shipped default reports `READY` because it has
  no artifact and no failure mode. What an operation does under `UNAVAILABLE` is `EVID-03`'s decision
  (sub-PRD D5), not this port's.
- **Recall is bounded by rules, and the consequence is raised to the Founder under Q-EVID-2.**
  Measured over this module's synthetic corpus: person names 47/47 recall with 0 false positives
  across 64 PRD §37.1 allowed rows; identifying combinations 22/22 with 0 false positives across 44.
  **Read that as what it is** — recall against a corpus this module authored, not against real-world
  input. The **named blind spots** are: scripts without case (CJK, Arabic, Hebrew, Thai), all
  lower-case names, bare mononyms without a possessive cue, and a name inside a sentence that also
  carries a citation-shaped reference. The *target* remains the Founder's (**Q-EVID-2**); this ADR
  supplies the measurement, not the promise.
- **The public-entity allow rule is narrower than `EVID-01`'s conservative default**, by category and
  by channel: a personal email pasted into the `employer` channel is no longer cleared by a rule
  written for company names.
- **No new dependency, no lockfile change, no network access at any point.**

## Fallback when the artifact is absent

This is the shipped state today and the permanent behaviour, not a degraded mode:

1. `loadPinnedArtifact` returns `UNAVAILABLE` with a reason code;
2. a recogniser built from that outcome reports `readiness() === 'UNAVAILABLE'` and **appends
   nothing** — it never accepts a payload, never suppresses a finding and never falls back to
   silence-as-success;
3. the deterministic recogniser continues to run, because it is what `PII_STAGES` holds;
4. nothing is accepted by default: the deterministic detectors, the public-entity rules and the
   combination rule are unaffected, and any `BLOCKING` finding still forces `REJECT`.

## Revisiting this decision

Take Option B when **Q-EVID-2** sets a recall target the rules cannot meet, measured on a corpus that
is not this module's own (`ASSR-03`, `GOLD-14`). That is an amendment to this ADR plus an amendment
to `EVID-02`/`EVID-03` as a docs PR — never a quiet dependency addition, and never Option C.
