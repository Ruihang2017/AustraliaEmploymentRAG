/**
 * FND-09 — the budget, quota and funding-ledger module's public surface (PRD §24.1, §24.4, §38.5,
 * §42.6; requirement OPS-003, epic `E03-DOMAIN`).
 *
 * Consumers (`RUNT-02`, `EVID-08`) deep-import THIS barrel, not `packages/domain/src/index.ts`: the
 * package entry file is held byte-exactly `export {};` by `tools/tests/skeleton.test.mjs` and is
 * outside this ticket's file-scope.
 *
 * What is deliberately ABSENT from this surface is part of the specification: no cross-debit function
 * between the five PRD §38.5 ledgers, no aggregate "spend a credit from wherever" helper, and no
 * mutable state. `test/budget/ledgers.test.ts` pins the export set against an allow-list so an
 * addition of that shape fails the suite rather than passing review.
 */
export * from './admit.js';
export * from './budget-profile.js';
export * from './frozen.js';
export * from './ledgers.js';
export * from './limit-defaults.js';
export * from './micro-aud.js';
export * from './pricing.js';
export * from './reserve.js';
export * from './reserve-order.js';
export * from './settle.js';
export * from './warning.js';
