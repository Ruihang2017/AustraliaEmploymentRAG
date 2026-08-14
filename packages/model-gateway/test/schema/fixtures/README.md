# `test/schema/fixtures` — synthetic schema corpora (EVID-07 deliverable 14)

Everything in this directory is **invented**. Sub-PRD **D22** requires test corpora to be synthetic:
no real customer text, no real legal source text, no real provider response, no credential and
nothing copied from a live system.

- `valid-response.json` — one PRD §36.5-shaped response, the positive control every rejection case is
  mutated from. If this file ever fails to validate, the rejection cases below prove nothing.
- `rejections.json` — one entry per rejected shape, each carrying the `code` and `path`
  `parseModelResponse` must return. Kept as one file rather than twelve so a reviewer can read the
  whole rejection surface in one screen; each entry is independently named and independently asserted.

The canary tokens used by `test/providers/canary.test.ts` are defined once, in
`test/providers/support/doubles.ts` (`CANARY.fact`, `CANARY.evidence`, `CANARY.response`). They are
invented strings of the form `CANARY-<WHAT>-<hex>` and appear in no real document. Their whole
purpose is to be searched for in places they must never reach: a `model_execution` row, an error
message, a returned `detail`, or any string reachable from a gateway result.

Precedent for this file: `packages/pii/test/deterministic/corpora/README.md`.
