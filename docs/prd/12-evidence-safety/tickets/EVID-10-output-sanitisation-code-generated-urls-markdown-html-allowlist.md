---
id: EVID-10
title: "Output sanitisation: code-generated URLs, Markdown/HTML allowlist"
module: 12-evidence-safety
lane: 12-evidence-safety
size: M
agent: builder
status: draft
date: 2026-08-03
blocked_by: [EVID-05]
blocks: [ASSR-02]
---

# EVID-10 — Output sanitisation: code-generated URLs, Markdown/HTML allowlist

Implements PRD §36.6 (rows 11–12), §37.5 and §21.1 — requirement **SEC-003**; epic `E21-ANSWER`.
No ADR — the decision is already made in PRD §37.5 (*"Markdown is rendered through an allowlist and
HTML is sanitised"*) and PRD §36.6 (*"Replace model URL; reject unknown URL"*, *"Escape/remove unsafe
output"*); this is build ticket 10 of 10 against it.
Parent sub-PRD: [12-evidence-safety README](../README.md). Master spec: [PRD](../../../PRD.md).
Depends on: [EVID-05 — Deterministic claim/citation validator and bounded repair](EVID-05-deterministic-claim-citation-validator-and-bounded-repair.md) (mirrors `blocked_by`)
**Why `builder`:** a bounded change inside one module's declared file-scope against a fixed contract —
`EVID-05` froze the `SanitiserPort`; this fills it with the allowlist and URL policy PRD §37.5
specifies.

## Background + basis

**PRD §37.5 model and rendering boundary, quoted verbatim:**

> The model gateway exposes no shell, Web, database, email, webhook or arbitrary tool. It receives only
> sanitized task facts and selected evidence. Returned JSON is schema-validated; **all links and source
> metadata are constructed from system records. Markdown is rendered through an allowlist and HTML is
> sanitised.** Generated text never directly triggers an email, webhook, corpus promotion, record
> transition, credential use or external action.

**PRD §36.6, the two rows this ticket owns:**

| Check | Failure consequence |
|---|---|
| URL is code-generated official URL | **Replace model URL; reject unknown URL** |
| Rendered Markdown/HTML passes sanitisation | **Escape/remove unsafe output** |

**PRD §21.1 required controls**, the matching lines: *"Secure HttpOnly SameSite cookies, CSRF, strict
CSP, encoding/sanitisation and exact widget origins"*; *"Output schema, citations, URLs and
Markdown/HTML validated/sanitised; **suggestions do not execute automatically**"*. PRD §21's opening
posture: *"Trust customer input, official source content, customer host pages and **model output** as
untrusted."*

**PRD §9.4:** *"Code MUST create source titles, links, pinpoints and status badges."* Every link a
customer can click therefore originates in `EVID-04`'s pack (`officialUrl`), never in model text.

**Requirement `SEC-003`** (PRD §30.2): *"Model output is schema/citation/licence/sanitisation validated
before display | Answer worker | validator | App | **Prompt-injection/XSS/invalid-URL fixtures pass**"*.
`UAT-ANS-04` (PRD §41.2): *"Inject instruction in an official-source fixture → Instruction treated as
evidence text; **no tool/URL/scope change**."*

**Where this sits in the sequence.** PRD §9.4:
`retrieve → evidence pack → structured claims → deterministic validation → **render** → final status
check`. This ticket is the `render` stage's safety half: it turns validated claim text into a safe
representation. `EVID-04` neutralises delimiters in *source* text on the way **in**; this ticket
neutralises markup and links in *model* text on the way **out**.

**What `EVID-05` already fixed.** Its check 11 removes and counts any URL not identical to a pack
`officialUrl`, its check 12 calls the `SanitiserPort`, and its `STRICT_PORT_DEFAULTS` reject all raw
HTML, all markup beyond paragraphs/emphasis/lists and every non-pack URL. This ticket replaces those
defaults with the full allowlist implementation and must be **no more permissive** for any input where
the default rejected.

**Sub-PRD decisions carried forward:** **D20** (unknown links are removed, never rewritten; raw HTML is
removed outright rather than sanitised-and-kept), **D14** (no reasoning field survives to render),
**D22** (fixtures are synthetic and authored here).

**Accepted caveats carried forward:**

- **This is not a React component.** `packages/citations` must stay framework-free (PRD §45.2 gives
  `packages/ui` the components). The output is a safe AST plus a safe plain-text/HTML-string projection
  that `packages/ui` (`RUNT-06`) and the exporters (`XPRT-02`/`XPRT-03`) consume.
- **CSP, cookies and widget origins are not this ticket.** PRD §21.1 lists them alongside sanitisation,
  but they are `03-app-runtime` (`RUNT-01`, `RUNT-02`) and `20-developer-platform` (`PLTF-05`).
  Sanitisation must hold even where a CSP does not exist — an export has no CSP.
- **`ASSR-02` is the cross-boundary suite**, `blocked_by` this ticket. Its XSS corpus is separate; this
  ticket's fixtures live in this package and are exported so the two do not drift.

## Goal

Produce `packages/citations/src/render/**`: a Markdown allowlist renderer that emits a closed, safe node
set; outright removal of raw HTML and of every URL that is not byte-identical to a pack `officialUrl`;
an autolink-free, scheme-restricted link policy; and the `SanitiserPort` implementation `EVID-05`
declared — plus an XSS/invalid-URL fixture corpus exported for `ASSR-02`. Completion is mechanically
checkable: no fixture in the corpus produces an executable construct, an unknown link or a raw HTML
node, and a property test proves the renderer's output node types are a subset of the allowlist for
arbitrary input.

## Non-goals

- **No changes to the validator, its checks, its counters or its repair loop** — `EVID-05` (merged;
  this ticket's blocker). This ticket implements the port `EVID-05` declared.
- **No evidence-pack construction or source-text delimitation** — `EVID-04`. That is the inbound
  direction; this is outbound.
- **No licence quotation limits, trimming or attribution** — `EVID-06` (a wave-3 sibling in the same
  package, different directory). Trimming happens before rendering; the caller composes them.
- **No React components, styling, focus management or accessibility behaviour** — `03-app-runtime`
  (`RUNT-06` `packages/ui`) and `15-answer-product` (`ASK-07`). PRD §41.1's UI rules are theirs.
- **No PDF/DOCX layout** — `19-exports` (`XPRT-02`, `XPRT-03`). They consume the safe representation.
- **No CSP, CORS, cookie policy, widget origin validation or iframe sandboxing** — `03-app-runtime`
  (`RUNT-01`, `RUNT-02`) and `20-developer-platform` (`PLTF-05`).
- **No provider call, prompt or schema mode** — `EVID-07`. This ticket never sees a provider.
- **No cross-boundary security suite** — `23-assurance` (`ASSR-02`, `blocked_by` this ticket).
- **No sanitisation of *source* text for display** — source text reaches display as a quoted excerpt
  through `EVID-06`; it is data, and it is escaped, not interpreted, by the same renderer's text path.

## File-scope (write-owns)

Owned by this ticket:

- `packages/citations/src/render/**`
- `packages/citations/test/render/**` (sub-PRD **D21**)
- `packages/citations/package.json`, `packages/citations/src/index.ts` — **append-only**, own entries
  only

Does not touch:

- `packages/citations/src/pack/**` — `EVID-04`; `src/validator/**` — `EVID-05`; `src/licensing/**` —
  `EVID-06` (a wave-3 sibling — disjoint directory, no shared file).
- `packages/pii/**` — `EVID-01`…`EVID-03`; `packages/model-gateway/**` — `EVID-07`…`EVID-09`.
- `packages/contracts/**`, `packages/domain/**` — `00-foundation` (PRD §44.3 serial-owned).
  `packages/ui/**` — `03-app-runtime`. `packages/database/**` — `01-app-data`.
- `apps/**`, `services/**`, `pipelines/**`, `infra/**`, `tests/**` (including
  `tests/security/{xss,injection}/**` — `23-assurance`/`ASSR-02`), `evals/**`, `docs/adr/**` — other
  modules per breakdown plan §4 and A9. `docs/PRD.md` — frozen.
- Root manifests and lockfiles — `FND-01`.

**Serial-safety analysis.** First decomposition: nothing merged, no in-flight contention (breakdown
plan §1 header). `packages/citations/src/render/**` is written by no other ticket in the plan (plan
§5.13). This is a wave-3 ticket; its concurrent siblings are `EVID-06` (`src/licensing/**` — same
package, **different directory**), `EVID-03` (`packages/pii/**`) and `EVID-09`
(`packages/model-gateway/**`). `EVID-04` and `EVID-05` are merged before this ticket starts. Shared
append-only files: `packages/citations/package.json` and `src/index.ts`.

## Deliverables

1. **`src/render/allowlist.ts` — the closed node allowlist**, versioned frozen data
   (`MARKDOWN_ALLOWLIST_V1`): `paragraph`, `text`, `emphasis`, `strong`, `orderedList`, `unorderedList`,
   `listItem`, `blockquote`, `inlineCode`, `lineBreak`, `officialLink` and `citationRef`. Everything
   else — raw HTML nodes, `image`, `htmlBlock`, `htmlInline`, `table`, `codeBlock` with a language
   directive, `footnote`, `definition`, autolink and reference-style links — is **removed** and counted.
   The list is an allowlist, not a blocklist: an unknown node type produced by a parser upgrade is
   removed by default. Basis: PRD §37.5 (*"Markdown is rendered through an allowlist"*); §21.1.
2. **`src/render/sanitise.ts::sanitiseAnswerText(text, pack, options): SafeRendering`** returning
   `{ ast, plainText, findings, counters }` where `ast` contains only allowlisted nodes. The function
   is **total**: any input, including deliberately malformed Markdown, produces a `SafeRendering` — it
   never throws a parser error into the answer path and never falls back to emitting the raw string.
3. **Raw HTML is removed, not sanitised-and-kept** (sub-PRD **D20**). Any HTML block or inline node is
   dropped and its **text content** is retained as escaped text, so a customer still reads what the
   model wrote without any markup being interpreted. There is no configuration that enables raw HTML,
   and a type-level test proves `options` has no such member. Basis: PRD §37.5; §36.6 row 12
   (*"Escape/remove unsafe output"*); `SEC-003`.
4. **`src/render/urls.ts` — the URL policy, in full.** A link survives only if its href is
   **byte-identical after NFC normalisation** to an `officialUrl` present in the supplied pack. Every
   other URL — including one that differs only in case, trailing slash, query, fragment, port,
   punycode/unicode-confusable host, percent-encoding or protocol-relative form — is **removed and
   counted**, never rewritten into a "corrected" URL (sub-PRD **D20**). Additionally rejected
   unconditionally, wherever they appear: `javascript:`, `data:`, `vbscript:`, `file:`, `blob:`,
   `about:`, any non-`https` scheme, and any bare-text URL that a renderer might autolink (autolinking
   is disabled). Basis: PRD §36.6 row 11; §9.4 (*"Code MUST create … links"*); §37.5 (*"all links …
   constructed from system records"*).
5. **`citationRef` is the only pointer the model may express.** Where model text references evidence, it
   becomes a `citationRef` node carrying the pack `evidence_id`; the resolver (`EVID-04` deliverable 5)
   turns it into a title, pinpoint, badge and official link **at render time in `packages/ui`**. A
   `citationRef` naming an id absent from the pack is removed and counted — the same treatment as an
   unknown URL. Basis: PRD §9.4; §36.4; §32.3 (claim↔citation interaction).
6. **`src/render/escape.ts` — text-path escaping** for the quoted-source path: source excerpts arriving
   from `EVID-06` are inserted as `text` nodes with all Markdown-significant characters escaped, so a
   statute containing `*`, `_`, `#`, `[` or `<` cannot become markup or a link. A round-trip test proves
   the displayed characters equal the source characters. Basis: PRD §21 (*"official source content …
   untrusted"*); §36.4.
7. **No executable or actionable output.** A test asserts the produced AST contains no event handler,
   no `srcdoc`, no `style` attribute, no `iframe`, no `object`, no `form` and no scheme-bearing
   attribute other than an allowlisted `officialLink` href; and that nothing in the rendering path can
   trigger a navigation, fetch, email, webhook or state change. Basis: PRD §21.1 (*"suggestions do not
   execute automatically"*); §37.5 (*"Generated text never directly triggers an email, webhook, corpus
   promotion, record transition, credential use or external action"*).
8. **`src/render/html.ts` — an optional safe HTML-string projection** for the exporters, produced
   **from the AST only** (never from the original string), with every text node escaped and only the
   allowlisted elements emitted (`p`, `em`, `strong`, `ol`, `ul`, `li`, `blockquote`, `code`, `br`,
   `a` with an `officialUrl` href plus `rel="noopener noreferrer"`). A test asserts the projection of
   every fixture is free of `<script`, `on*=`, `javascript:`, `data:` and `<iframe`.
9. **`SanitiserPort` implementation** matching the signature `EVID-05` deliverable 8 declared, plus a
   **monotonicity test**: for every fixture where `EVID-05`'s `STRICT_PORT_DEFAULTS` rejected, this
   implementation also rejects or removes. A sanitiser that is more permissive than the strict default
   would silently widen check 12. Basis: PRD §36.6; sub-PRD D8.
10. **Counters, no content.** `removedHtmlNodes`, `removedUrls`, `removedCitationRefs`,
    `removedDisallowedNodes`, `escapedSpans` — plain numbers, fed into `EVID-05`'s counter set so
    `ASSR-02` and `RLSE-08` can alert on spikes (PRD §22 *"citation-validator spikes"*). No counter,
    finding or error message carries answer text. Basis: PRD §22.
11. **`test/render/fixtures/**` — the XSS and invalid-URL corpus** (synthetic per sub-PRD D22), exported
    from a `./testing` subpath for `ASSR-02` and `packages/ui`'s tests so the two never diverge. At
    minimum: `<script>` in several encodings; an `<img onerror=…>`; an `<iframe srcdoc=…>`; a
    `javascript:` link; a `data:text/html` link; a protocol-relative `//evil.example`; a punycode and a
    unicode-confusable look-alike of an official domain; an official domain with an appended path or
    query; a Markdown reference-style link and an autolink; a nested-emphasis parser-confusion case; an
    HTML comment containing markup; a `style` attribute with `expression(...)`; an SVG payload; a
    `citationRef` naming a non-existent `evidence_id`; and a source excerpt containing Markdown
    metacharacters.
12. **`README.md` update in `packages/citations`** — append the allowlist, the URL identity rule, the
    "remove, never rewrite" principle, the escaping contract for source excerpts, the counter names and
    how to consume `./testing` fixtures.

## Acceptance checklist (classified)

- [ ] `[fixture]` **XSS corpus produces nothing executable**: every fixture in deliverable 11 renders to
      an AST containing only allowlisted nodes and to an HTML projection free of `<script`, `on*=`,
      `javascript:`, `data:`, `<iframe`, `<object`, `<svg` and `style=`. (PRD §37.5; §21.1;
      **`SEC-003`** *"Prompt-injection/XSS/invalid-URL fixtures pass"*)
- [ ] `[fixture]` **Invalid-URL corpus**: every non-identical, confusable, punycode, encoded,
      protocol-relative or non-`https` URL is **removed and counted**; none is rewritten into a
      plausible official URL. (PRD §36.6 row 11; sub-PRD D20)
- [ ] `[machine]` **Only pack URLs survive**: a property test over generated links asserts a link
      survives if and only if its href is byte-identical (post-NFC) to a pack `officialUrl`; a case-,
      slash-, query- or fragment-differing variant does not survive. (PRD §9.4; §37.5)
- [ ] `[machine]` **Allowlist is closed**: a property test over arbitrary Markdown asserts every output
      node type is in `MARKDOWN_ALLOWLIST_V1`; an injected unknown node type from a stubbed parser is
      removed. (PRD §37.5)
- [ ] `[machine]` **Raw HTML is removed, text retained**: an HTML block's markup is gone and its text
      content survives escaped; a type-level test proves no option enables raw HTML.
      (PRD §36.6 row 12; §37.5; sub-PRD D20)
- [ ] `[machine]` **Autolinking is off**: a bare URL in text stays text and does not become a link.
      (PRD §9.4; §37.5)
- [ ] `[machine]` **`citationRef` integrity**: a ref naming an id absent from the pack is removed and
      counted; a valid ref survives carrying only the `evidence_id`. (PRD §36.4; §9.4)
- [ ] `[machine]` **Source excerpts are escaped, not interpreted**: a statute excerpt containing `*`,
      `_`, `#`, `[`, `<` and `&` displays those characters literally — round-trip asserted.
      (PRD §21; §36.4)
- [ ] `[machine]` **No executable or actionable output**: the AST and HTML projection contain no event
      handler, scheme-bearing attribute (other than an allowlisted href), `form`, `iframe` or `object`;
      nothing in the render path performs navigation, fetch, email, webhook or state change.
      (PRD §21.1; §37.5)
- [ ] `[machine]` **Totality**: malformed Markdown, unterminated constructs, deeply nested input and a
      10 MB string all return a `SafeRendering` without throwing and without emitting the raw string.
      (PRD §37.5; §21.1 resource limits)
- [ ] `[machine]` **Monotonic against the strict default**: for every fixture rejected by `EVID-05`'s
      `STRICT_PORT_DEFAULTS`, this implementation also rejects or removes. (PRD §36.6; `EVID-05`
      deliverable 8)
- [ ] `[machine]` **Counters carry no content**: a canary in model text never appears in a counter,
      finding or error message. (PRD §22)
- [ ] `[machine]` **Framework-free**: an import-graph test asserts no React, DOM or browser-only
      dependency, and no network, file or database access. (PRD §45.2 — `packages/ui` owns components;
      §39.1)
- [ ] `[machine]` `pnpm lint`, `pnpm typecheck` and `pnpm test` green (standing item, PRD §45.3).
- [ ] `[machine]` `pnpm generate && pnpm generated:check` clean. (PRD §20.1, §45.3)
- [ ] `[machine]` No Rust or Python surface — `cargo test --workspace` / `uv run pytest` unaffected;
      declared not applicable. (PRD §45.3)
- [ ] `[machine]` PR states the PRD §45.4 items: requirement/UAT IDs (**SEC-003**; `UAT-ANS-04` is run
      end to end by `15-answer-product` and `23-assurance`/`ASSR-02`), user-visible change and
      non-goals, schema/API/event compatibility impact (`SafeRendering` is consumed by `RUNT-06`,
      `ASK-07`, `XPRT-02`, `XPRT-03`), **tenant/PII/security impact — the substance of this ticket**,
      source/licence impact (source excerpts are escaped; limits are `EVID-06`'s), cost/memory/latency
      impact (report p95 rendering time for a full answer and the input size cap), rollback path
      (revert to `EVID-05`'s strict defaults — which fail closed, not open), known gaps (the documented
      confusable-domain coverage list).

Absent classes: no `[human]` criteria — sanitisation is verified mechanically against a fixture corpus.
Its human-facing acceptance is `UAT-ANS-04` at Gate 2 through `15-answer-product`, with the
cross-boundary XSS/injection suite in `23-assurance`/`ASSR-02`. The `[fixture]` items are synthetic
attack corpora authored here (sub-PRD D22) — the PRD §14/§43 evaluation replays are
`21-evaluation-600`.

## Test plan

Every step runs offline: no network, no provider key, no browser.

1. **Read the allowlist against the PRD.** Compare `MARKDOWN_ALLOWLIST_V1` with PRD §37.5's
   *"Markdown is rendered through an allowlist and HTML is sanitised"* and §36.6 rows 11–12. Confirm it
   is an allowlist (unknown → removed), not a blocklist.
2. **Run the suite.** `pnpm --filter @<scope>/citations test`, then `pnpm test`, `pnpm typecheck`,
   `pnpm lint` and `pnpm generate && pnpm generated:check` from the repository root. Construction
   pattern to copy: `EVID-05`'s `test/validator/fixtures/**` (one directory per rule, positive and
   negative cases).
3. **XSS corpus.** Run every fixture; for each, assert the AST node types are a subset of the allowlist
   and the HTML projection matches none of the forbidden patterns. Print the removal counters.
4. **Allowlist negative test.** On a scratch branch add `htmlInline` to the allowlist; assert the XSS
   corpus fails; discard.
5. **URL matrix.** For a known pack `officialUrl`, submit: the exact URL (survives); the same URL with a
   trailing slash, differing case, an appended query, an appended fragment, a different port, a punycode
   host and a unicode-confusable host (all removed); `javascript:`, `data:`, `vbscript:`, `file:`,
   `//host`, `http:` (all removed). Assert `removedUrls` increments and no output href differs from a
   pack value.
6. **Rewrite negative test.** On a scratch branch make the URL policy "correct" a near-miss URL to the
   nearest official one; assert the invalid-URL corpus fails; discard. (Rewriting is how a look-alike
   becomes a trusted link.)
7. **Raw-HTML test.** Feed an HTML block with inner text; assert markup gone, text retained escaped,
   `removedHtmlNodes` incremented.
8. **Escaping round-trip.** Feed a source excerpt containing every Markdown metacharacter; assert the
   rendered text equals the source characters.
9. **Totality and resource bounds.** Feed malformed Markdown, 10,000-deep nesting and a 10 MB string;
   assert a `SafeRendering` is returned within the documented bound and nothing throws into the answer
   path.
10. **Monotonicity.** Replay the fixtures `EVID-05`'s `STRICT_PORT_DEFAULTS` reject; assert this
    implementation rejects or removes each.
11. **Canary and purity.** Inject a canary in model text; assert it reaches no counter or error. Import
    graph: no React, no DOM, no `fetch`, no `fs`.
12. **Append-only manifest.** `git diff packages/citations/package.json packages/citations/src/index.ts`
    shows additions only; confirm no file under `src/{pack,validator,licensing}/**` changed.
13. **Reviewer focus.** Confirm the allowlist really is closed under an unknown node type; confirm no
    near-miss URL is ever repaired into an official one; confirm autolinking is disabled in the parser
    configuration, not merely post-filtered; confirm the HTML projection is built from the AST and never
    from the original string; confirm the fixture corpus is exported so `ASSR-02` and `packages/ui`
    reuse it rather than forking.

## Feedback obligation

1. **General rule.** If implementation falsifies this ticket, update **this ticket** (docs PR →
   merge → `publish-tickets.mjs --sync`) and, where module context changes,
   `docs/prd/12-evidence-safety/README.md` (version +0.1 with a changelog line) **before** changing
   code. Silent divergence is an incomplete ticket.
2. **Foreseeable frictions, each with its exact writeback target:**
   - *An answer genuinely needs a construct the allowlist lacks* (a table for a rate comparison, a
     heading for the §8.4 sections) → add it **to the allowlist in this ticket** in a docs PR with its
     escaping rules and new fixtures, then `--sync`. Never let a caller pass raw HTML or bypass the
     renderer, and never add a construct without a fixture proving it cannot carry an attribute.
   - *A legitimate official URL is rejected because the pack's form differs* (trailing slash, canonical
     host) → the fix is in the **pack's URL construction** (`EVID-04` deliverable 6 / `RETR-08`
     deliverable 6), not a fuzzy match here. Record it in
     `docs/prd/12-evidence-safety/README.md` and raise the docs PR against the owning ticket. A fuzzy
     URL match here would make a confusable domain reachable.
   - *`packages/ui` or an exporter wants the raw model string* "for fidelity" → refuse. PRD §21 treats
     model output as untrusted and PRD §37.5 requires the allowlist. Record the request in
     `docs/prd/12-evidence-safety/README.md`; the supported path is the AST or the HTML projection.
   - *`ASSR-02` finds a bypass this corpus does not contain* → add the case to **this ticket's** corpus
     (it is the exported source of truth) and record it in `docs/prd/12-evidence-safety/README.md`;
     `23-assurance` must not maintain a divergent fork.
   - *Rendering exceeds its latency budget on long answers* → tighten the input size cap and report it;
     never disable a check to gain speed. Record the measurement in
     `docs/prd/12-evidence-safety/README.md`.
3. **Falsified protocol.** If allowlist rendering proves impossible to keep safe — i.e. a fixture shows
   an executable construct or an unknown link reaching a rendered answer or an export — that falsifies
   PRD §37.5 and **`SEC-003`**, and the failure is customer-visible XSS or a phishing link inside a
   legal answer. Stop, escalate for re-review, raise an ADR under `docs/adr/`, and write back to
   `docs/prd/12-evidence-safety/README.md` **and** `docs/prd/breakdown-plan.md` before any code. Never
   compensate with CSP alone: an export has no CSP, and PRD §8.9 sends the same content into a PDF.
