/**
 * EVID-07 deliverable 7 — the stub's switchable failure modes.
 *
 * These are the shapes downstream tickets need to test against, and they are listed once so
 * `EVID-05`, `ASK-02`, `GOLD-15` and `ASSR-04` share one vocabulary instead of inventing four.
 *
 * Two groups, and the difference matters:
 *
 *  - TRANSPORT-LEVEL modes (`TIMEOUT`, `RATE_LIMITED_429`, `SERVER_ERROR_500`, `EMPTY_BODY`,
 *    `TRUNCATED_JSON`, `SCHEMA_INVALID`) are what THIS package's failure matrix is tested against;
 *  - CONTENT-LEVEL modes (`FABRICATED_EVIDENCE_ID`, `INVENTED_URL`, `EMBEDDED_HTML`,
 *    `PROHIBITED_CERTAINTY_PHRASE`) return a response that is VALID against PRD §36.5 and wrong
 *    against the evidence. This gateway accepts them by design — catching them is `EVID-05`'s
 *    deterministic validator (PRD §36.6) and the answer policy's job, and a gateway that also
 *    second-guessed content would put two disagreeing validators in the product.
 */
export const STUB_MODES = Object.freeze([
  'VALID',
  'SCHEMA_INVALID',
  'FABRICATED_EVIDENCE_ID',
  'INVENTED_URL',
  'EMBEDDED_HTML',
  'PROHIBITED_CERTAINTY_PHRASE',
  'TIMEOUT',
  'RATE_LIMITED_429',
  'SERVER_ERROR_500',
  'TRUNCATED_JSON',
  'EMPTY_BODY',
] as const);

export type StubMode = (typeof STUB_MODES)[number];

export const isStubMode = (value: unknown): value is StubMode =>
  typeof value === 'string' && (STUB_MODES as readonly string[]).includes(value);

/** Modes that never produce a §36.5-valid body. */
export const TRANSPORT_LEVEL_MODES: readonly StubMode[] = Object.freeze([
  'SCHEMA_INVALID',
  'TIMEOUT',
  'RATE_LIMITED_429',
  'SERVER_ERROR_500',
  'TRUNCATED_JSON',
  'EMPTY_BODY',
]);

/** Modes that produce a §36.5-VALID body whose CONTENT is wrong — `EVID-05`'s territory. */
export const CONTENT_LEVEL_MODES: readonly StubMode[] = Object.freeze([
  'FABRICATED_EVIDENCE_ID',
  'INVENTED_URL',
  'EMBEDDED_HTML',
  'PROHIBITED_CERTAINTY_PHRASE',
]);
