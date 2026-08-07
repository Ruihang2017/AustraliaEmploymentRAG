/**
 * Funding ledgers (PRD §24.4, lines 1317-1318).
 *
 * Transcribed verbatim from docs/PRD.md — spelling, underscores and order are the spec. Renaming or
 * removing a member is a breaking change requiring /v2 (PRD §16.1) and a PRD update (PRD §45.5), not a
 * refactor.
 */
export const FUNDING_LEDGER_VALUES = Object.freeze([
  'FOUNDER_PLATFORM_BUDGET',
  'CUSTOMER_PREPAID_OR_BYOK',
] as const);

export type FundingLedger = (typeof FUNDING_LEDGER_VALUES)[number];

/** Runtime guard. Accepts only the members above; any other value, of any type, is `false`. */
export const isFundingLedger = (value: unknown): value is FundingLedger =>
  typeof value === 'string' && (FUNDING_LEDGER_VALUES as readonly string[]).includes(value);
