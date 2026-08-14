# `@taxrag/model-gateway`

The hosted-model boundary. It receives **sanitized task facts and selected evidence**, sends them to
an allowlisted provider under a profile whose ceilings are enforced in code, validates the returned
JSON strictly against PRD §36.5, and records one `model_execution` row per attempt. It does nothing
else, and — deliberately — it *can* do nothing else.

Built by `EVID-07`. `src/budget/**` is `EVID-08`; `src/byok/**` is `EVID-09`; neither exists yet.

---

## 1. The six profiles (PRD §14.4)

| Profile | Execution | Ships as | Callable here? |
|---|---|---|---|
| `QUERY_EMBEDDING` | `LOCAL_IN_SEARCH_BOUNDARY` | `CANDIDATE` | **No** — typed error naming `RETR-07` |
| `LOCAL_RERANK` | `LOCAL_IN_SEARCH_BOUNDARY` | `CANDIDATE` | **No** — typed error naming `RETR-07` |
| `QUICK_SYNTHESIS` | `HOSTED` | `CANDIDATE` | Yes |
| `DEEP_SYNTHESIS` | `HOSTED` | `CANDIDATE` | Yes |
| `STRUCTURED_REPAIR` | `HOSTED` | `CANDIDATE` | Yes |
| `EVALUATION_JUDGE` | `HOSTED` | `CANDIDATE` | Yes |

The two local profiles appear in the registry because PRD §14.4's promotion process covers all six.
They execute inside the search boundary (`11-retrieval-engine` / `RETR-07`, PRD §17.3); calling one
through this gateway throws `LocalProfileNotCallableError`. This package loads no local model and
holds no ONNX or tokenizer artefact.

### Everything ships `CANDIDATE`, and here is what that means today

Nothing has passed PRD §14.4's promotion gates: `GOLD-15` measures the candidates and the Founder
approves promotion **after** seeing that report. Shipping `APPROVED` would fake a promotion that
never happened.

**So in `PRODUCTION`, every hosted profile currently resolves to `PROFILE_NOT_APPROVED` →
`GENERATION_UNAVAILABLE` (503).** That is the correct state, not a bug: PRD §8.2 and §34.9 require
Search to remain available while Answer reports explicit generation unavailability (`UAT-ANS-08`).
Tests and the evaluation harness resolve in the `EVALUATION` environment, which is what "candidate"
means. Promotion is a data change to `src/profiles/registry.ts` that follows `GOLD-15`'s report.

Token ceilings are **benchmark-selected configuration** (PRD §14.4), marked `// GOLD-15 writeback` in
`registry.ts`. Do not "improve" one by preference — the value change lands as a docs PR against the
`EVID-07` ticket plus the sub-PRD's **Q1** row.

---

## 2. The no-tool boundary, and how it is tested

PRD §37.5: *"The model gateway exposes no shell, Web, database, email, webhook or arbitrary tool."*

That is enforced by `test/providers/architecture.test.ts`, which reads every file under `src/**` and
asserts:

- every import specifier is **relative** — no npm package, no `node:` built-in;
- exactly two files escape the package: `src/schema/contracts.ts` (towards `packages/contracts/src`)
  and `src/schema/sanitized.ts` (towards `packages/pii/src`), and nothing else;
- no `child_process`, `node:fs`, `node:http`/`https`/`net`, `fetch(`, `XMLHttpRequest`,
  `better-sqlite3`, `kysely`, `nodemailer`, `puppeteer`, `new URL(`, `process.env`, `Date.now`,
  `Math.random` anywhere in the code (comments and string literals stripped first);
- no exported name that reads as an external action (`send`, `webhook`, `promote`, `transition`,
  `credential`, `apiKey`, `execute`, `spawn`, `publish`, …).

Every scanner carries a positive control, and the file walk has a non-vacuity assertion — a scanner
that silently matches nothing is indistinguishable from clean code.

**Consequence:** this package holds no clock, no timer, no socket and no database handle. All four
arrive as ports (§5).

**If a workflow ever needs the gateway to call a tool — refuse.** The ticket's Feedback obligation §3
applies: stop, do not add the tool, escalate and raise an ADR first. A model-selected source is not a
system-supplied evidence id, and adding one overturns PRD §37.5, §21.1 and §9.4 simultaneously.

---

## 3. The reservation requirement (sub-PRD D17, PRD §42.6)

`generate(call, reservation, deps)` takes the reservation **positionally and required**: omitting it
is a compile error. `HeldReservation` is branded, so a caller cannot write one — and **this package
mints none**: the brand is exported as a `declare const` so `EVID-08`'s `src/budget/**` can mint
inside the same package, and a source scan asserts no function in `src/**` returns one.

At runtime a missing, expired or wrong-profile token yields `NO_RESERVATION` **before any provider
call**.

A reservation covers **one profile**. If the resolved profile carries an `approvedFallbackProfileId`,
the fallback attempt needs **its own** token, passed as the optional fourth argument
`generate(call, reservation, deps, fallbackReservation)`. Without it — or with a token for the wrong
profile, or an expired one — the original failure is returned unchanged and **no second call is
made**. The gateway never promotes a token minted for one profile into budget for another, differently
priced model.

**Known limitation, stated rather than implied.** The brand on `HeldReservation` is a compile-time
guarantee. At runtime the gateway checks what it can see — presence, expiry against the injected clock,
and that the token names the profile being called — but a structurally well-formed, unexpired,
correct-profile token that was cast rather than minted will be accepted. Neither this ticket's nor
`EVID-08`'s token design carries a signature, so runtime unforgeability is not available here; the
in-process boundary between `src/budget/**` and this leaf is what the guarantee rests on. If a
cryptographic check is wanted, it is a token-shape change in a docs PR amending both tickets
(this ticket's Feedback obligation §2), never a local addition.

---

## 4. The failure matrix (deliverable 10, `ANS-007`)

| Condition | Result |
|---|---|
| Provider connection / 5xx / non-2xx | `PROVIDER_FAILURE` |
| Provider 429 | `PROVIDER_RATE_LIMITED` (honours numeric `Retry-After`) |
| Schema-invalid, truncated or empty response | `SCHEMA_INVALID` + `failingPath` |
| Elapsed ceiling exceeded | `PROFILE_TIMEOUT` |
| Profile not `APPROVED`, unknown, or provider retention unacceptable | `PROFILE_NOT_APPROVED` |
| Kill switch on profile or provider | `KILL_SWITCH` (zero provider calls) |
| Missing / expired / wrong-profile reservation | `NO_RESERVATION` (zero provider calls) |
| A local profile invoked here | **throws** `LocalProfileNotCallableError` — not a matrix cell |

Every cell carries `errorCode: 'GENERATION_UNAVAILABLE'` and `httpStatus: 503`, both **consumed** from
`packages/contracts` and never written as literals. `detail` is a fixed enum-ish string and never
provider text.

**No unvalidated fallback** (PRD §17.3). A fallback is attempted only when the resolved profile
carries `approvedFallbackProfileId` **and** that profile itself resolves as `APPROVED`, and only for
provider-side failures — never for a schema failure — and only when the caller supplied a reservation
for that fallback profile (§3). No shipped profile carries one, so today every failure path calls
exactly one profile, one provider and one model.

---

## 5. The ports the host must supply

`GatewayDeps` has **no defaults**. A default would reintroduce impurity here and would be the thing
that quietly reaches the network in production.

| Port | Why it is a port |
|---|---|
| `transport` | This package cannot open a socket. In tests it is the cassette transport or the stub. |
| `clock: { now(): number }` | Reservation expiry and latency. No `Date.now` in `src/**`. |
| `timer: (ms) => Promise<void>` | The elapsed-ceiling race, made deterministic instead of wall-clock-flaky. |
| `modelExecutions` + `modelExecutionTx` | `DATA-02`'s TenantContext repository, satisfied structurally. |
| `killSwitch` | State from `DATA-07`/`INTL-09`. This package only reads it. |
| `environment` | `PRODUCTION` or `EVALUATION`. |

If `modelExecutions.insert` throws, **the error propagates**. Losing the row is an accounting-integrity
failure (PRD §35.8, §42.6), and rewriting the outcome to hide it would be worse than the outage.

---

## 6. Cassettes and the stub

- `createCassetteTransport(cassettes)` replays by fingerprint and **throws `CassetteMissError` on a
  miss**. It has no `inner`, no `fallback` and no `onMiss` parameter — there is nothing to fall
  through to. The fingerprint covers identifiers and versions only, never the assembled payload, so
  no evidence text or customer fact ever enters a committed artefact.
- `recordingTransport(inner, sink)` is a decorator: the host must supply both a live transport and a
  sink. "Off by default" is not a flag here; it is the absence of anything to flip.
- `createStubProvider({ mode })` (exported from the **`./testing`** subpath) is the one deterministic
  stub `EVID-05`, `ASK-02`, `GOLD-15` and `ASSR-04` share. A `VALID` response cites real
  `evidence_id`s from the supplied pack with offsets inside that item's `exact_text`. Eleven modes,
  split into transport-level ones this gateway's matrix is tested against and content-level ones it
  accepts by design — catching a fabricated id, an invented URL, embedded HTML or a prohibited
  certainty phrase is `EVID-05`'s deterministic validator (PRD §36.6), and a gateway that
  second-guessed content would put two disagreeing validators in the product.

The whole suite runs with `fetch`, `XMLHttpRequest`, `WebSocket` and `EventSource` globally stubbed to
throw and every `PROVIDER_*`-shaped environment variable deleted.

---

## 7. No raw payload is ever persisted or logged

PRD §35.6 and §37.3. A `model_execution` row carries exactly:

```
jobId · profile · providerId · actualModelVersion · inputTokens · outputTokens · latencyMs ·
costMicroAud · schemaStatus · retentionMode · instructionTemplateVersion · packHash
```

and nothing else — no index signature, and `buildModelExecutionRecord` copies field by field rather
than spreading, so an extra member on the caller's object cannot ride along. Schema failures carry a
**path** (`$.claims[0].reasoning`), never the offending value. Provider bodies, rate-limit messages
and parser excerpts are never echoed into a `detail`, an `Error` or a row.

`test/providers/canary.test.ts` puts three distinct canaries — in a sanitized fact, in the pack's
`exact_text`, and in the provider's response — and asserts none reaches a repository call, a thrown
error, a returned `detail`, or (for the two input canaries) the returned result at all.

---

## 8. Importing it

`src/index.ts` is byte-exactly `export {};` — the FND-01 skeleton rule, asserted on every branch by
`tools/tests/skeleton.test.mjs`. The public surface is the **leaf barrels**, and until workspace links
exist downstream tickets deep-import them relatively, exactly as `EVID-02` and `ASK-06` do for
`packages/pii`:

```ts
import { generate } from '../../model-gateway/src/providers/index.js';
import { createStubProvider } from '../../model-gateway/src/providers/stub/index.js';
```

The `exports` map in `package.json` (`./profiles`, `./providers`, `./schema`, `./testing`) is declared
for when those links exist.

## 9. Known gaps

- **Q-EVID-4** (Founder): which providers meet PRD §10.2's no-training / zero-or-approved-minimal
  retention terms. The requirement is encoded as a resolution precondition; no vendor is named, and
  `PROVIDER_REGISTRY_V1` declares no external origin.
- **Q1 / OQ-1** (`GOLD-15` measures, Founder approves): the exact model per profile and the token
  ceilings. A pending measurement, not a gap in this package.
- **OQ-4**: `EvidencePackInput` is a structural port mirroring `EVID-04`'s shape. If the two ever
  disagree, the resolution is a docs PR amending both tickets — never a silent widening here.
