---
id: INGF-02
title: Safe fetcher (allowlist, DNS/IP denial, redirect/type/size/time)
module: 05-ingestion-framework
lane: 05-ingestion-framework
size: L
agent: builder
status: draft
date: 2026-08-03
blocked_by: [INGF-01]
blocks: [INGF-03, INGF-06, ASSR-02]
---

# INGF-02 — Safe fetcher (allowlist, DNS/IP denial, redirect/type/size/time)

Implements PRD §37.4 and PRD §21.1 <SEC-002> — no ADR — the decision is already made in PRD §37.4;
this is build ticket 2 of 9 against it.
Parent sub-PRD: [05-ingestion-framework README](../README.md). Master spec: [PRD](../../../PRD.md).
Depends on: [INGF-01 — Adapter interface and versioned intermediate records](INGF-01-adapter-interface-and-versioned-intermediate-records.md)
**Why `builder`:** a bounded implementation of one port declared in `INGF-01`, inside this module's
declared file-scope, against limits PRD §37.4 states numerically — not a new subsystem decision.

## Background + basis

**PRD §37.4 fixes this ticket almost line by line:**

> "Adapters use a shared fetcher, not arbitrary HTTP libraries. Each source has an allowlisted
> scheme/domain/path policy. The fetcher resolves DNS and rejects loopback, private, link-local,
> multicast and cloud-metadata addresses before and after redirects. Initial defaults: 5 redirects,
> 30-second fetch timeout, 50 MiB document limit, 250 MiB safely decompressed limit and
> declared/observed type agreement. Larger official bulk artifacts require a source-specific approved
> limit and offline processing."

**PRD §21.1** repeats it as a required control:

> "Source allowlists, HTTPS, redirect/final-domain checks, private/link-local/metadata IP denial,
> DNS-rebinding protection, file/type/time/size/resource limits and isolated parser/OCR processes."

**PRD §21** sets the trust model: "Trust customer input, official source content, customer host pages
and model output as untrusted."

**Requirement SEC-002** (PRD §30.2): *"Source fetches enforce allowlist, DNS/IP/redirect/type/size/
time limits"* — data owner `Source`, primary surface "Ingestion", primary API "adapter fetcher",
minimum acceptance evidence *"SSRF and decompression-bomb suites pass"*.

**Why the allowlist is a per-adapter file.** Plan §2.1 **A2** requires the Source Coverage Registry
to be "composed at build time from per-adapter files (`pipelines/adapters/<group>/registry.yaml` +
licence snapshot + **URL allowlist**), never one shared document", because "one shared file would
serialise all 52 adapter tickets". This ticket therefore owns the *schema and loader* for
`pipelines/adapters/<group-id>/allowlist.yaml`; modules `06`–`10` own the *instances*
(sub-PRD D3). PRD §35.2 also makes it a `source` constraint: "URL official allowlist".

**Why conditional requests belong here.** PRD §12.1: "Critical official collections SHOULD be checked
every 6–12 hours using feeds/APIs/sitemaps/updated listings/manifests and **conditional requests**."
`INGF-08` schedules them; the transport is this ticket's.

**Carried caveat — the numbers are initial defaults.** PRD §1: "**Benchmark-selected** parameters are
intentionally not fixed until representative corpus and evaluation results exist." The five numbers
in §37.4 are stated as "Initial defaults" and PRD §45.1 item 5 forbids silently turning an initial
default into a new product rule. They are therefore named constants with a documented override path
(deliverable 6), not magic numbers.

## Goal

Implement the `Fetcher` port declared by `INGF-01` under
`pipelines/ingestion/src/<root>/fetch/**` so that an adapter can obtain bytes from an official source
**only** through a policy-checked path: HTTPS-only, per-source scheme/host/path allowlist, DNS
resolved once and pinned against a default-deny IP policy re-applied at every redirect hop, at most
5 redirects, 30-second total budget, 50 MiB raw / 250 MiB decompressed caps, declared-vs-observed
content-type agreement, bounded retry, conditional requests, and a stable failure-code taxonomy —
with an offline SSRF and decompression suite that proves each control fires, and an architecture test
that proves no other module can bypass it.

## Non-goals

- **No artifact persistence, hashing key scheme or R2 upload** — `INGF-03`. This ticket returns
  bytes plus metadata (including the streaming SHA-256 it computed) and stores nothing durable.
- **No parsing, decompression *of document content*, or type sniffing beyond magic-byte
  verification** — `INGF-06`. This ticket enforces the 250 MiB decompressed limit for *transport*
  encodings (`Content-Encoding: gzip|br|deflate`); archive members are `INGF-06`'s.
- **No licence decision** — `INGF-04`. Fetching is allowed before the gate; PRD §40.9 places the
  licence gate *after* fetch+hash.
- **No quarantine writing** — `INGF-05`. This ticket returns a `FailureCode`; the caller decides.
- **No scheduling, cadence or due-list logic** — `INGF-08`.
- **No `allowlist.yaml` content for any real source group** — modules `06`–`10`. This ticket ships
  the schema, the loader and synthetic fixtures only.
- **No webhook-egress SSRF policy** — that is `WTCH-05`'s outbound-delivery concern
  (PRD §39.4 "outbox deliveries with SSRF-safe webhook policy"), a different egress path in
  `16-monitor-alerts`.
- **No `tests/security/**` suite** — `23-assurance` / `ASSR-02` owns the cross-boundary suite and is
  `blocked_by` this ticket. The module-local suite here must stand on its own.

## File-scope (write-owns)

- `pipelines/ingestion/src/<root>/fetch/**` (plan §5.6 `src/fetch/**`; `<root>` per sub-PRD D11).
- `pipelines/ingestion/tests/fetch/**` — including the SSRF/limits suite and its recorded fixtures.
- `pipelines/ingestion/pyproject.toml` — **append-only** (HTTP client + test-server dependencies);
  conflicts resolve by re-running `uv lock` (plan §1.1, PRD §44.3).
- Does not touch: `pipelines/ingestion/src/<root>/adapter/**` — `INGF-01`. Extend the architecture
  scan by *importing* `INGF-01`'s scanner and adding cases in `tests/fetch/`, never by editing
  `INGF-01`'s files.
- Does not touch: `pipelines/ingestion/src/<root>/{artifacts,licensing,quarantine,runs,parsing,registry,discovery,conformance}/**`
  — `INGF-03`…`INGF-09`.
- Does not touch: `pipelines/adapters/**` — modules `06`–`10`. Synthetic allowlist fixtures live under
  `pipelines/ingestion/tests/fetch/fixtures/adapters/`.
- Does not touch: `tests/security/**` — `23-assurance` (`ASSR-02`).
- Does not touch: `apps/**`, `packages/**`, `services/**`, `infra/**`, `schemas/**`.

**Serial safety.** First decomposition; nothing merged, nothing in flight. `INGF-01` is the only
ticket that has written in this module and it owns `src/<root>/adapter/**` only. This ticket is wave
2 and runs alone (`INGF-03` and `INGF-06` are both `blocked_by` it, so neither can be concurrent).

## Deliverables

1. **`<root>.fetch.policy` — the `allowlist.yaml` schema and loader (sub-PRD D3).** Exact file name
   `pipelines/adapters/<group-id>/allowlist.yaml`. Exact keys:

   ```yaml
   group_id: LEG-CTH               # uppercase PRD §40.2–40.6 Group ID; must equal dir.upper()
   schemes: [https]                # https only; any other value is a load error (PRD §21.1)
   hosts:                          # at least one entry
     - host: www.legislation.gov.au
       include_subdomains: false
       path_prefixes: ["/", "/Latest/", "/Series/"]
       min_request_interval_ms: 1000      # politeness; consumed by INGF-08
       max_concurrent_requests: 2         # politeness; consumed by INGF-08
       approved_max_bytes: null           # null = MAX_DOCUMENT_BYTES; a number here is the
                                          # "source-specific approved limit" of PRD §37.4 and
                                          # REQUIRES the sibling `approved_max_bytes_reason`
       approved_max_bytes_reason: null
   deny_paths: []                  # optional explicit denials, evaluated after path_prefixes
   notes: ""                       # free text, not load-bearing
   ```

   `load_allowlist(group_dir: Path) -> AllowlistPolicy` validates against a committed JSON Schema
   (`<root>/fetch/schema/allowlist.schema.json`), rejects unknown keys, rejects `schemes` other than
   `[https]`, rejects an `approved_max_bytes` without a reason, and rejects a host that is an IP
   literal. `AllowlistPolicy.check(url) -> AllowDecision` returns allow or a `FailureCode`.

2. **`<root>.fetch.ipguard` — default-deny address policy.** `resolve_and_screen(host) ->
   Sequence[ScreenedAddress]` performs DNS resolution (A and AAAA) and **accepts an address only if**
   it is global unicast and matches none of the deny sets:
   - loopback `127.0.0.0/8`, `::1`
   - private `10.0.0.0/8`, `172.16.0.0/12`, `192.168.0.0/16`, `fc00::/7`
   - link-local `169.254.0.0/16`, `fe80::/10`
   - multicast `224.0.0.0/4`, `ff00::/8`
   - unspecified/broadcast `0.0.0.0/8`, `255.255.255.255`, `::`
   - reserved / non-global (`ipaddress.ip_address(x).is_global is False`)
   - an explicit **cloud-metadata deny list**: `169.254.169.254`, `fd00:ec2::254`,
     `169.254.170.2`, `100.100.100.200`, and any host name in
     `{metadata.google.internal, metadata, instance-data}` — belt and braces over the CIDR rules,
     because at least one public cloud publishes a *globally routable* metadata address.

   The five PRD §37.4 categories map one-to-one onto the first four deny sets plus the metadata list;
   the "unspecified/broadcast/reserved" set is a documented defence-in-depth addition, recorded in
   the module docstring as such, not as a PRD requirement.

3. **`<root>.fetch.client` — the `Fetcher` implementation.**
   `SafeFetcher(policy_loader, resolver, clock, limits) -> Fetcher` with
   `fetch(request: FetchRequest) -> FetchResult`. Mechanics, in this order, per request:
   1. allowlist check on the requested URL (scheme → host → path prefix → deny paths);
   2. `resolve_and_screen(host)`; **DNS-rebinding protection**: the screened IP is *pinned* and the
      connection is opened to that IP with the original hostname preserved for TLS SNI and the
      `Host` header. Re-resolution between check and connect is not permitted;
   3. TLS verification on, certificate hostname verified against the original hostname, no
      `verify=False` path exists in the module (a test asserts the string is absent);
   4. request sent with `If-None-Match` / `If-Modified-Since` when the `FetchValidators` supply them;
   5. response streamed with a **hard byte ceiling** — the connection is aborted the moment the
      running total exceeds the effective `max_bytes` (per-host `approved_max_bytes`, else
      `MAX_DOCUMENT_BYTES`), never buffered first;
   6. transport decompression bounded by `MAX_DECOMPRESSED_BYTES` **and** a ratio guard
      (`MAX_COMPRESSION_RATIO`), aborting mid-stream;
   7. declared-vs-observed type agreement: the `Content-Type` is compared with magic-byte sniffing
      of the first 512 bytes; disagreement outside a small documented equivalence table
      (`text/plain` ↔ `text/html`, `application/octet-stream` accepted only when the sniff matches an
      expected type) is `FETCH_TYPE_MISMATCH`;
   8. streaming SHA-256 and byte length computed during transfer (consumed by `INGF-03`);
   9. every redirect hop repeats steps 1–3 in full — allowlist, DNS screen, pin — and counts against
      `MAX_REDIRECTS`. A redirect to a host outside the allowlist is `FETCH_REDIRECT_DENIED`, not a
      follow-then-check. The **final URL** is recorded on the result (PRD §21.1 "final-domain
      checks").

4. **`FetchResult`** (the type declared by `INGF-01`) populated with: `status_code`, `official_url`
   (requested), `final_url`, `headers` (a bounded allowlisted subset: `etag`, `last-modified`,
   `content-type`, `content-length`, `content-encoding`, `date`), `body_path` (a per-request temp
   file under an isolated directory, deleted by the caller or by `FetchResult.close()`),
   `byte_length`, `sha256`, `retrieved_at`, `redirect_chain: Sequence[str]`, `not_modified: bool`
   (HTTP 304 → no body), `timings: FetchTimings`. These are exactly the fields PRD §35.3
   `source_artifact` needs (`official_url`, `retrieved_at`, `http_status`, `etag`, `last_modified`,
   `content_type`, `byte_length`, `sha256`).

5. **Retry** — PRD §40.7 assigns retry to the framework. Bounded exponential backoff with jitter:
   at most `MAX_ATTEMPTS = 3` for idempotent GET/HEAD, only on connection errors, timeouts and
   HTTP 429/502/503/504; honours `Retry-After` up to the remaining time budget; **never** retries a
   policy denial, a 4xx other than 429, a type mismatch or a size breach. The total 30-second budget
   covers all attempts of one logical fetch — a retry cannot extend the wall clock.

6. **`<root>.fetch.limits` — named constants, each citing PRD §37.4:**
   `MAX_REDIRECTS = 5`, `FETCH_TIMEOUT_SECONDS = 30`, `MAX_DOCUMENT_BYTES = 50 * 1024**2`,
   `MAX_DECOMPRESSED_BYTES = 250 * 1024**2`, `MAX_COMPRESSION_RATIO = 100`, `MAX_ATTEMPTS = 3`,
   `CONNECT_TIMEOUT_SECONDS = 10`, `READ_TIMEOUT_SECONDS = 30`. All are overridable only via an
   explicit `FetchLimits` value object; there is no environment-variable or global-mutation path.
   The docstring records that these are PRD §37.4 **initial defaults** and that changing one is a
   benchmark-selected configuration change under PRD §45.5, requiring a versioned config record.

7. **Failure codes** registered with `INGF-01`'s `register_failure_codes("fetch", …)`, each with its
   operator action (ADM-001 / PRD §40.8 item 10). Minimum set — these strings are consumed by
   `INGF-05`, `INGF-08`, `INGF-09` and `INTL-03` and are therefore append-only from merge:
   `FETCH_DENIED_SCHEME`, `FETCH_DENIED_HOST`, `FETCH_DENIED_PATH`, `FETCH_DENIED_IP`,
   `FETCH_DENIED_DNS_UNRESOLVED`, `FETCH_REDIRECT_DENIED`, `FETCH_REDIRECT_LIMIT`,
   `FETCH_TIMEOUT`, `FETCH_SIZE_LIMIT`, `FETCH_DECOMPRESSION_LIMIT`, `FETCH_TYPE_MISMATCH`,
   `FETCH_TLS_ERROR`, `FETCH_HTTP_ERROR`, `FETCH_TRANSIENT_FAILURE`.

8. **Architecture enforcement (extends `INGF-01` deliverable 11).** A test in `tests/fetch/` reuses
   `INGF-01`'s scanner to assert that no module in `pipelines/ingestion/**` **outside**
   `src/<root>/fetch/` imports `requests`, `httpx`, `aiohttp`, `urllib.request`, `http.client` or
   `socket`, and that no module under `pipelines/adapters/**` does either — with a positive control
   (a synthetic dirty fixture that must be reported). PRD §37.4: "Adapters use a shared fetcher, not
   arbitrary HTTP libraries."

9. **Observability** — every attempt emits a bounded structured record (`group_id`, `final_url`,
   `status`, `byte_length`, `duration_ms`, `failure_code`, `attempt`) and nothing else. Official
   source URLs are public and permitted; PRD §22 forbids research/evidence content, PII, credentials
   and provider payloads in logs, none of which exist on this path.

10. **Offline test infrastructure** — a local `http.server`-based fixture server bound to
    `127.0.0.1` plus a fake resolver, so the suite runs with **no outbound network**. Because the
    fixture server is on loopback (which the IP guard denies by design), tests use an explicit
    `TestFetchLimits(allow_loopback_for_tests=True)` seam that is (a) only constructible from the
    test package and (b) covered by a test asserting the production constructor cannot enable it.

## Acceptance checklist (classified)

SSRF / limit criteria below are the SEC-002 evidence for the ingestion egress path.

- [ ] `[machine]` A URL whose scheme is not `https` is denied `FETCH_DENIED_SCHEME`; the loader
      rejects an `allowlist.yaml` declaring any other scheme (PRD §21.1, §37.4; SEC-002).
- [ ] `[machine]` A host not in `allowlist.yaml` is denied `FETCH_DENIED_HOST`; a path outside
      `path_prefixes` is denied `FETCH_DENIED_PATH`; `include_subdomains: false` denies
      `sub.host.tld` (PRD §37.4; SEC-002).
- [ ] `[machine]` Every deny set fires: loopback, private (all three IPv4 blocks + `fc00::/7`),
      link-local (v4 and v6), multicast, unspecified/broadcast, and each of the four cloud-metadata
      addresses → `FETCH_DENIED_IP`. Parametrised, one case per address class (PRD §37.4; SEC-002).
- [ ] `[machine]` **DNS-rebinding**: a resolver that returns a public IP on the first call and
      `127.0.0.1` on the second still connects to the pinned first address; a resolver that returns
      a public IP for the screen but whose connection target is swapped is impossible by construction
      (the connection takes the pinned `ScreenedAddress`, not the hostname) (PRD §21.1; SEC-002).
- [ ] `[machine]` **Redirects**: a 302 to a denied host → `FETCH_REDIRECT_DENIED` with **no** request
      issued to that host (asserted on the fixture server's request log); a 302 to an allowed host
      whose DNS screens to `169.254.169.254` → `FETCH_DENIED_IP`; six chained redirects →
      `FETCH_REDIRECT_LIMIT`; `final_url` on a successful two-hop redirect equals the last hop
      (PRD §37.4, §21.1; SEC-002).
- [ ] `[machine]` **Size**: a response of `MAX_DOCUMENT_BYTES + 1` is aborted with
      `FETCH_SIZE_LIMIT` and the fixture server observes an early disconnect (i.e. the body was not
      fully buffered); a host with `approved_max_bytes` above the default succeeds at that size and
      still fails one byte beyond it; an `allowlist.yaml` with `approved_max_bytes` and no reason
      fails to load (PRD §37.4; SEC-002).
- [ ] `[fixture]` **Decompression bomb**: a recorded gzip response that expands beyond
      `MAX_DECOMPRESSED_BYTES` is aborted with `FETCH_DECOMPRESSION_LIMIT` and peak process memory
      stays bounded; a response whose compression ratio exceeds `MAX_COMPRESSION_RATIO` is aborted
      even below the absolute cap. Fixture committed under `tests/fetch/fixtures/bombs/`
      (SEC-002 minimum acceptance evidence: "SSRF and decompression-bomb suites pass").
- [ ] `[machine]` **Time**: a fixture server that stalls past `FETCH_TIMEOUT_SECONDS` yields
      `FETCH_TIMEOUT`; total elapsed time across all retry attempts of one logical fetch never
      exceeds the budget (asserted with a fake clock) (PRD §37.4).
- [ ] `[machine]` **Type**: `Content-Type: application/pdf` with HTML magic bytes →
      `FETCH_TYPE_MISMATCH`; the documented equivalence pairs pass (PRD §37.4 "declared/observed type
      agreement").
- [ ] `[machine]` **Conditional requests**: with `etag`/`last_modified` validators the request
      carries `If-None-Match`/`If-Modified-Since`; a 304 returns `not_modified=True`, no body,
      `byte_length == 0`, and no temp file (PRD §12.1; consumed by `INGF-08`).
- [ ] `[machine]` **Retry**: 503 then 200 succeeds in two attempts; 403 is not retried; a policy
      denial is not retried; `Retry-After: 3600` is clamped to the remaining budget (PRD §40.7
      "Shared framework code performs … retry").
- [ ] `[machine]` `FetchResult` carries every field PRD §35.3 `source_artifact` requires
      (`official_url`, `retrieved_at`, `http_status`, `etag`, `last_modified`, `content_type`,
      `byte_length`, `sha256`); a test asserts the mapping explicitly (PRD §35.3).
- [ ] `[machine]` Architecture: a synthetic module under `pipelines/ingestion/` outside `fetch/` that
      imports `httpx` is reported by the scan; the real tree is clean; the string `verify=False`
      does not occur in `src/<root>/fetch/**` (PRD §37.4, §21.1; deliverable 8).
- [ ] `[machine]` Every failure code in deliverable 7 is registered with a non-empty operator action
      (ADM-001, PRD §40.8 item 10).
- [ ] `[machine]` The whole `tests/fetch` suite runs with outbound network disabled (a
      session-scoped fixture monkeypatches the real resolver and asserts no non-loopback connection
      is attempted) (PRD §20.3 — CI gates must be reproducible).
- [ ] `[machine]` `uv run pytest` green.
- [ ] `[machine]` `pnpm test` green (unchanged — no TypeScript in this ticket).
- [ ] `[human]` PR body states the PRD §45.4 items: requirement ID **SEC-002**; UAT IDs — **none
      directly**; the related `UAT-ANS-04` (source-instruction injection) is owned by `ASSR-02` /
      `EVID-04`; schema/API/event compatibility (introduces the `allowlist.yaml` schema, consumed by
      52 adapter tickets — additive only after merge); tenant/PII/security impact (this *is* the SSRF
      boundary; no tenant data on the path); source/licence impact (none — licence gating is
      `INGF-04`); cost/memory/latency impact (streaming caps bound peak RSS; state the measured peak
      from the bomb fixture); rollback path; known gaps.
- **No `[human]` acceptance criteria beyond the PR contract** — every control here is mechanically
  testable, and PRD §41.2 has no `UAT-*` row for source fetching. Declared absent deliberately.

## Test plan

Harness: `uv run pytest pipelines/ingestion/tests/fetch -q`. Fully offline. Construction pattern to
copy: `INGF-01`'s `tests/adapter/test_architecture.py` for the AST scan;
`tests/fetch/conftest.py` provides the loopback fixture server, the fake resolver and the fake clock.

1. `uv sync --frozen && uv run pytest pipelines/ingestion/tests/fetch -q`.
2. **`test_allowlist.py`** — schema validation table: valid file; unknown key; non-https scheme; IP
   literal host; `approved_max_bytes` without reason; empty `hosts`. Then `AllowlistPolicy.check()`
   over a URL matrix (scheme/host/subdomain/path/deny-path).
3. **`test_ipguard.py`** — parametrised over every address in deliverable 2's deny sets plus three
   public control addresses; asserts allow/deny and the returned `FailureCode`. Includes the four
   metadata addresses and the three metadata hostnames.
4. **`test_ssrf.py`** — the SEC-002 suite. Uses the loopback fixture server plus a scripted fake
   resolver: rebinding, redirect-to-denied-host (asserting the fixture server never received the
   request), redirect-to-metadata, redirect chain overflow, and a `file://`/`gopher://` scheme
   attempt. Every case asserts both the `FailureCode` **and** that no connection was opened to the
   denied target.
5. **`test_limits.py`** — size abort (with an early-disconnect assertion from the server log),
   approved-limit override, timeout with the fake clock, retry matrix, type-mismatch matrix.
6. **`test_bombs.py`** `[fixture]` — replays `tests/fetch/fixtures/bombs/{gzip-10gb.bin.gz,
   ratio-abuse.gz}` through the fetcher; asserts `FETCH_DECOMPRESSION_LIMIT`, that the abort happens
   before `MAX_DECOMPRESSED_BYTES` is materialised, and records peak RSS in the test report for the
   §45.4 memory line. Fixtures are generated by a committed script so they are reproducible and small
   in git.
7. **`test_conditional.py`** — 200-then-304 sequence; asserts request headers and the
   `not_modified` result shape `INGF-08` depends on.
8. **`test_architecture.py`** — extends `INGF-01`'s scanner; positive and negative controls.
9. `uv run pytest` (whole repo) and `pnpm test` — green.

Reviewer focus (security-sensitive path): confirm every policy check is re-applied **after** each
redirect, that the connection target is the pinned address rather than the hostname, that the byte
ceiling aborts the stream rather than truncating a fully-read body, and that no code path constructs
an HTTP client outside `src/<root>/fetch/`.

## Feedback obligation

**General rule.** If implementation falsifies this ticket, update **this ticket** first (docs PR/MR,
sub-PRD changelog line, then `publish-tickets.mjs --sync`), then change code. Silent divergence is
an incomplete ticket.

**Foreseeable frictions and their exact writeback targets:**

1. **A real official source cannot be fetched within the PRD §37.4 defaults** — e.g. a bulk XML
   download exceeds 50 MiB. PRD §37.4 already answers this: "Larger official bulk artifacts require a
   source-specific approved limit and offline processing." Use the `approved_max_bytes` +
   `approved_max_bytes_reason` pair in that group's `allowlist.yaml` (owned by the adapter ticket).
   **Do not** raise `MAX_DOCUMENT_BYTES`. If the *global* default must change, that is a
   benchmark-selected configuration change under PRD §45.5: record it in
   `docs/prd/05-ingestion-framework/README.md` and in this ticket's deliverable 6 **before** touching
   `src/<root>/fetch/limits.py`.
2. **An official source is HTTP-only or has a broken certificate chain** → this collides with PRD
   §21.1's "HTTPS" control. Do not add an insecure escape hatch. Raise it as a source limitation:
   the group's registry status becomes `SOURCE_UNAVAILABLE` or a limited state (PRD §7), recorded in
   its `registry.yaml` (`INGF-07`'s schema) and surfaced by `GOLD-16`. Any change to the HTTPS rule
   itself is a **product/security change** requiring PRD amendment (PRD §45.5).
3. **DNS pinning breaks TLS or HTTP/2 for a real host** (SNI/ALPN issues with connect-by-IP) →
   update this ticket's deliverable 3 mechanic and
   `docs/prd/05-ingestion-framework/README.md` **before** implementing an alternative. The
   requirement that survives is PRD §21.1's "DNS-rebinding protection"; an acceptable alternative
   (e.g. a resolver-level pin inside the client with a post-connect peer-address assertion) must be
   named in the ticket and must keep an explicit assertion that the connected peer is a screened
   address.
4. **The chosen HTTP library cannot abort mid-stream, or cannot expose the connected peer address**
   → that falsifies deliverables 3.5 and 3.9 and therefore the SEC-002 evidence. Change the library,
   or write `docs/adr/NNNN-ingestion-http-client.md` (new file, owned by this ticket per plan §2.1
   **A9**) recording the trade-off, and update
   `docs/prd/05-ingestion-framework/README.md`. Never accept "buffer then check".
5. **`allowlist.yaml` needs a key that only `INGF-08` uses** — the politeness keys
   (`min_request_interval_ms`, `max_concurrent_requests`) are already declared here for exactly this
   reason. If `INGF-08` needs another, the key is added **here** (this file's schema is this ticket's,
   sub-PRD D3) via a ticket update, not by `INGF-08` editing `src/<root>/fetch/**`.

**Escalation rule.** If any PRD §37.4 / §21.1 control turns out to be unimplementable — allowlist,
HTTPS, DNS/IP denial, redirect re-checking, or the size/time/type limits — that overturns SEC-002,
a release requirement with named acceptance evidence in PRD §30.2. Stop and escalate for re-review;
never weaken a control silently inside this ticket, and never leave a control "documented, not
enforced" without a recorded founder decision.
