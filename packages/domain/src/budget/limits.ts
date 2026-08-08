/**
 * FND-09 deliverable 3 — PRD §38.5's initial rate and concurrency defaults as versioned frozen data,
 * with ALL THREE columns, plus PRD §24.4's per-organisation concurrency defaults.
 *
 * The "System hard protection" column is modelled, not dropped: three of its seven cells are prose
 * ("bounded by worker/provider", "token-bucket and request-size limits", "abuse/IP/origin protection"),
 * so a cell is a tagged union and every cell — numeric or not — carries its PRD text verbatim.
 *
 * These are *initial defaults* (PRD §38.5's own words). Changing one is `LIMIT_DEFAULTS_V2` plus a
 * changelog line in `docs/prd/00-foundation/README.md` (ticket obligation 1), never an edited literal.
 *
 * Enforcement of these limits at the HTTP boundary is `RUNT-02`, and worker concurrency is `RUNT-04`;
 * this file is the single place the numbers live so neither invents its own.
 */
import { deepFreeze } from './deep-freeze.js';
import type { ConcurrencyBoundary, OperationClass, QuotaLedgerKind } from './types.js';

export type LimitScope = 'ORGANISATION' | 'GLOBAL' | 'SERVICE_ACCOUNT';

export type LimitValue =
  | { readonly kind: 'PER_MINUTE'; readonly count: bigint; readonly scope: LimitScope; readonly prdText: string }
  | { readonly kind: 'PER_TRIAL'; readonly count: bigint; readonly prdText: string }
  | { readonly kind: 'PER_MONTH'; readonly count: bigint; readonly prdText: string }
  | { readonly kind: 'CONCURRENT'; readonly count: bigint; readonly prdText: string }
  | { readonly kind: 'COUNT'; readonly count: bigint; readonly prdText: string }
  /** A cell PRD §38.5 states as prose rather than as a number. Kept, never approximated by a number. */
  | { readonly kind: 'QUALITATIVE'; readonly prdText: string };

export type LimitBoundary =
  | 'SEARCH_BURST'
  | 'API_CALLS'
  | 'CONCURRENT_QUICK'
  | 'CONCURRENT_DEEP'
  | 'CONCURRENT_EXPORT'
  | 'WEBHOOK_ENDPOINTS'
  | 'WIDGET_SESSION_CREATION';

export interface LimitRow {
  readonly boundary: LimitBoundary;
  /** PRD §38.5 "Boundary" cell, verbatim. */
  readonly label: string;
  readonly trial: LimitValue;
  readonly paidPilot: LimitValue;
  readonly systemHardProtection: LimitValue;
}

export interface LimitDefaults {
  readonly version: string;
  readonly prdSection: string;
  readonly rows: readonly LimitRow[];
  /** PRD §38.5's closing paragraph, sentence by sentence, unwrapped. */
  readonly closingRules: readonly string[];
}

export const LIMIT_DEFAULTS_V1: LimitDefaults = deepFreeze({
  version: 'LIMIT_DEFAULTS_V1',
  prdSection: '§38.5',
  rows: [
    {
      boundary: 'SEARCH_BURST',
      label: 'Search burst',
      trial: { kind: 'PER_MINUTE', count: 20n, scope: 'ORGANISATION', prdText: '20/min/organisation' },
      paidPilot: { kind: 'PER_MINUTE', count: 60n, scope: 'ORGANISATION', prdText: '60/min/organisation' },
      systemHardProtection: { kind: 'PER_MINUTE', count: 100n, scope: 'GLOBAL', prdText: '100/min global initial' },
    },
    {
      boundary: 'API_CALLS',
      label: 'API calls',
      trial: { kind: 'PER_TRIAL', count: 500n, prdText: '500/trial' },
      paidPilot: { kind: 'PER_MONTH', count: 10_000n, prdText: '10,000/month' },
      systemHardProtection: { kind: 'QUALITATIVE', prdText: 'token-bucket and request-size limits' },
    },
    {
      boundary: 'CONCURRENT_QUICK',
      label: 'Concurrent Quick',
      trial: { kind: 'CONCURRENT', count: 1n, prdText: '1' },
      paidPilot: { kind: 'CONCURRENT', count: 2n, prdText: '2' },
      systemHardProtection: { kind: 'QUALITATIVE', prdText: 'bounded by worker/provider' },
    },
    {
      boundary: 'CONCURRENT_DEEP',
      label: 'Concurrent Deep',
      trial: { kind: 'CONCURRENT', count: 1n, prdText: '1' },
      paidPilot: { kind: 'CONCURRENT', count: 1n, prdText: '1' },
      systemHardProtection: { kind: 'CONCURRENT', count: 1n, prdText: '1 initial global worker execution' },
    },
    {
      boundary: 'CONCURRENT_EXPORT',
      label: 'Concurrent export',
      trial: { kind: 'CONCURRENT', count: 1n, prdText: '1' },
      paidPilot: { kind: 'CONCURRENT', count: 1n, prdText: '1' },
      systemHardProtection: { kind: 'CONCURRENT', count: 1n, prdText: '1 initial' },
    },
    {
      boundary: 'WEBHOOK_ENDPOINTS',
      label: 'Webhook endpoints',
      trial: { kind: 'COUNT', count: 2n, prdText: '2' },
      paidPilot: { kind: 'COUNT', count: 10n, prdText: '10' },
      systemHardProtection: { kind: 'QUALITATIVE', prdText: 'delivery queue isolated from research' },
    },
    {
      boundary: 'WIDGET_SESSION_CREATION',
      label: 'Widget session creation',
      trial: { kind: 'PER_MINUTE', count: 30n, scope: 'SERVICE_ACCOUNT', prdText: '30/min/service account' },
      paidPilot: { kind: 'PER_MINUTE', count: 120n, scope: 'SERVICE_ACCOUNT', prdText: '120/min/service account' },
      systemHardProtection: { kind: 'QUALITATIVE', prdText: 'abuse/IP/origin protection' },
    },
  ],
  closingRules: [
    'Rate-limit responses include `Retry-After`, limit, remaining and reset metadata without disclosing other tenants.',
    'Search, answer credits, advanced-task credits, API calls and provider cost are separate ledgers; exhausting one does not misreport the others.',
  ],
});

/**
 * PRD §24.4: *"Default per-organisation concurrency: two Quick, one Deep and one export"*.
 *
 * NOTE (plan OQ-4): §24.4 says **two** Quick per organisation while §38.5's trial column says **one**.
 * Both are transcribed; neither is reconciled here. `RUNT-02` selects the applicable one per tier — an
 * averaged or silently-picked value would hide a real difference between two PRD sections.
 */
export const ORGANISATION_CONCURRENCY_DEFAULTS: Readonly<Record<ConcurrencyBoundary, bigint>> = deepFreeze({
  QUICK: 2n,
  DEEP: 1n,
  EXPORT: 1n,
});

/** PRD §24.4's sentence, verbatim, so the constant above is checkable against its source. */
export const ORGANISATION_CONCURRENCY_PRD_TEXT =
  'Customer variable cost MUST be prepaid or BYOK; the system MUST NOT create unsecured founder liability. Default per-organisation concurrency: two Quick, one Deep and one export, with separate API/search burst limits and webhook queues.';

/**
 * The operations that consume model funding, and therefore the only ones a funding-ledger state can
 * ever deny. `SEARCH` is deliberately ABSENT: PRD §8.2 (*"Search MUST remain usable when the AI budget
 * is exhausted"*) and §36.8's final row are enforced by this absence — structurally, not by a comment.
 */
export const OPERATIONS_REQUIRING_MODEL_FUNDING: ReadonlySet<OperationClass> = Object.freeze(
  new Set<OperationClass>(['QUICK', 'DEEP']),
);

export const BOUNDARY_FOR_OPERATION: Readonly<Record<OperationClass, LimitBoundary>> = deepFreeze({
  SEARCH: 'SEARCH_BURST',
  QUICK: 'CONCURRENT_QUICK',
  DEEP: 'CONCURRENT_DEEP',
  EXPORT: 'CONCURRENT_EXPORT',
  API_CALL: 'API_CALLS',
  WIDGET_SESSION: 'WIDGET_SESSION_CREATION',
  WEBHOOK_ENDPOINT: 'WEBHOOK_ENDPOINTS',
} as const);

/**
 * Which of PRD §38.5's five separate ledgers an operation draws on.
 *
 * Module-local and deliberately explicit: `PROVIDER_COST` is never mapped from an operation, because
 * it is the *cost* ledger, drawn by the funding side of `admit`, not by an operation count. Quick and
 * Deep both produce an Answer and draw `ANSWER_CREDITS`; exports draw `ADVANCED_TASK_CREDITS`
 * (PRD §24.3's "advanced Compare/Coverage tasks").
 */
export const QUOTA_KIND_FOR_OPERATION: Readonly<Record<OperationClass, QuotaLedgerKind>> = deepFreeze({
  SEARCH: 'SEARCH',
  QUICK: 'ANSWER_CREDITS',
  DEEP: 'ANSWER_CREDITS',
  EXPORT: 'ADVANCED_TASK_CREDITS',
  API_CALL: 'API_CALLS',
  WIDGET_SESSION: 'API_CALLS',
  WEBHOOK_ENDPOINT: 'API_CALLS',
} as const);

/** The concurrency boundary an operation occupies, or `null` when it occupies none (PRD §24.4). */
export const CONCURRENCY_BOUNDARY_FOR_OPERATION: Readonly<
  Record<OperationClass, ConcurrencyBoundary | null>
> = deepFreeze({
  SEARCH: null,
  QUICK: 'QUICK',
  DEEP: 'DEEP',
  EXPORT: 'EXPORT',
  API_CALL: null,
  WIDGET_SESSION: null,
  WEBHOOK_ENDPOINT: null,
} as const);

/** The §38.5 row, looked up by boundary rather than by index — a missing row must fail by name. */
export function limitRow(defaults: LimitDefaults, boundary: LimitBoundary): LimitRow {
  const found = defaults.rows.find((row) => row.boundary === boundary);
  if (!found) throw new Error(`limit boundary ${boundary} is missing from ${defaults.version}`);
  return found;
}
