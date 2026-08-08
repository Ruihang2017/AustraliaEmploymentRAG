/**
 * FND-09 deliverable 3 — the PRD §38.5 initial rate and concurrency defaults as versioned frozen
 * data, plus PRD §24.4's per-organisation concurrency statement.
 *
 * All three §38.5 columns are transcribed for all seven boundaries, including the
 * "System hard protection" column, which is the one that is easy to drop. Where a PRD cell is prose
 * rather than a number the text is kept verbatim and `count` is `null` — a prose cell is not a limit
 * this module can arithmetic over, and pretending otherwise would invent spec.
 *
 * The §24.4 statement ("two Quick, one Deep and one export") and the §38.5 trial column ("Concurrent
 * Quick: 1") are two different statements in the PRD. They are transcribed as-is and NOT reconciled
 * here; reconciling them would be a product decision (PRD §45.5).
 *
 * The System-hard-protection column is a GLOBAL number. It must never reach a tenant-facing
 * rate-limit metadata payload — see `admit.ts` and PRD §38.5 ("without disclosing other tenants").
 *
 * Pure: no clock, no randomness, no I/O (PRD §39.1, §45.2).
 */
import { deepFreeze } from './frozen.js';

export type LimitBoundary =
  | 'SEARCH_BURST'
  | 'API_CALLS'
  | 'CONCURRENT_QUICK'
  | 'CONCURRENT_DEEP'
  | 'CONCURRENT_EXPORT'
  | 'WEBHOOK_ENDPOINTS'
  | 'WIDGET_SESSION_CREATION';

/** The two commercial tiers PRD §38.5 gives columns for (PRD §24.2, §24.3). */
export type PlanTier = 'TRIAL' | 'PAID_PILOT';

export interface LimitCell {
  /** The PRD §38.5 cell, verbatim. */
  readonly text: string;
  /** The number the cell states, or `null` where the cell is prose. */
  readonly count: number | null;
  /** `1` where the cell says "per minute"; `null` otherwise. */
  readonly perMinutes: number | null;
  /** The period the cell names, or `null`. */
  readonly period: 'TRIAL' | 'MONTH' | null;
  /** The subject the cell scopes the limit to, or `null`. */
  readonly scope: 'ORGANISATION' | 'SERVICE_ACCOUNT' | 'GLOBAL' | null;
}

export interface LimitRow {
  readonly boundary: LimitBoundary;
  /** The PRD §38.5 "Boundary" cell, verbatim. */
  readonly prdLabel: string;
  readonly trial: LimitCell;
  readonly paidPilot: LimitCell;
  readonly systemHardProtection: LimitCell;
}

export interface ConcurrencyDefaults {
  readonly prdSection: '§24.4';
  readonly quick: 2;
  readonly deep: 1;
  readonly export: 1;
}

export interface LimitDefaults {
  readonly version: 'LIMIT_DEFAULTS_V1';
  readonly prdSection: '§38.5';
  /** The seven PRD §38.5 rows, in PRD order. */
  readonly rows: readonly LimitRow[];
  /** PRD §24.4, a separate statement from the §38.5 table. */
  readonly perOrganisationConcurrencyDefaults: ConcurrencyDefaults;
}

export const LIMIT_DEFAULTS_V1: LimitDefaults = deepFreeze<LimitDefaults>({
  version: 'LIMIT_DEFAULTS_V1',
  prdSection: '§38.5',
  rows: [
    {
      boundary: 'SEARCH_BURST',
      prdLabel: 'Search burst',
      trial: {
        text: '20/min/organisation',
        count: 20,
        perMinutes: 1,
        period: null,
        scope: 'ORGANISATION',
      },
      paidPilot: {
        text: '60/min/organisation',
        count: 60,
        perMinutes: 1,
        period: null,
        scope: 'ORGANISATION',
      },
      systemHardProtection: {
        text: '100/min global initial',
        count: 100,
        perMinutes: 1,
        period: null,
        scope: 'GLOBAL',
      },
    },
    {
      boundary: 'API_CALLS',
      prdLabel: 'API calls',
      trial: { text: '500/trial', count: 500, perMinutes: null, period: 'TRIAL', scope: null },
      paidPilot: {
        text: '10,000/month',
        count: 10000,
        perMinutes: null,
        period: 'MONTH',
        scope: null,
      },
      systemHardProtection: {
        text: 'token-bucket and request-size limits',
        count: null,
        perMinutes: null,
        period: null,
        scope: 'GLOBAL',
      },
    },
    {
      boundary: 'CONCURRENT_QUICK',
      prdLabel: 'Concurrent Quick',
      trial: { text: '1', count: 1, perMinutes: null, period: null, scope: null },
      paidPilot: { text: '2', count: 2, perMinutes: null, period: null, scope: null },
      systemHardProtection: {
        text: 'bounded by worker/provider',
        count: null,
        perMinutes: null,
        period: null,
        scope: 'GLOBAL',
      },
    },
    {
      boundary: 'CONCURRENT_DEEP',
      prdLabel: 'Concurrent Deep',
      trial: { text: '1', count: 1, perMinutes: null, period: null, scope: null },
      paidPilot: { text: '1', count: 1, perMinutes: null, period: null, scope: null },
      systemHardProtection: {
        text: '1 initial global worker execution',
        count: 1,
        perMinutes: null,
        period: null,
        scope: 'GLOBAL',
      },
    },
    {
      boundary: 'CONCURRENT_EXPORT',
      prdLabel: 'Concurrent export',
      trial: { text: '1', count: 1, perMinutes: null, period: null, scope: null },
      paidPilot: { text: '1', count: 1, perMinutes: null, period: null, scope: null },
      systemHardProtection: {
        text: '1 initial',
        count: 1,
        perMinutes: null,
        period: null,
        scope: 'GLOBAL',
      },
    },
    {
      boundary: 'WEBHOOK_ENDPOINTS',
      prdLabel: 'Webhook endpoints',
      trial: { text: '2', count: 2, perMinutes: null, period: null, scope: null },
      paidPilot: { text: '10', count: 10, perMinutes: null, period: null, scope: null },
      systemHardProtection: {
        text: 'delivery queue isolated from research',
        count: null,
        perMinutes: null,
        period: null,
        scope: 'GLOBAL',
      },
    },
    {
      boundary: 'WIDGET_SESSION_CREATION',
      prdLabel: 'Widget session creation',
      trial: {
        text: '30/min/service account',
        count: 30,
        perMinutes: 1,
        period: null,
        scope: 'SERVICE_ACCOUNT',
      },
      paidPilot: {
        text: '120/min/service account',
        count: 120,
        perMinutes: 1,
        period: null,
        scope: 'SERVICE_ACCOUNT',
      },
      systemHardProtection: {
        text: 'abuse/IP/origin protection',
        count: null,
        perMinutes: null,
        period: null,
        scope: 'GLOBAL',
      },
    },
  ],
  perOrganisationConcurrencyDefaults: {
    prdSection: '§24.4',
    quick: 2,
    deep: 1,
    export: 1,
  },
});

/** The PRD §38.5 row for a boundary, or `null` if the boundary is not one of the seven. */
export function limitRowFor(boundary: LimitBoundary): LimitRow | null {
  for (const row of LIMIT_DEFAULTS_V1.rows) {
    if (row.boundary === boundary) return row;
  }
  return null;
}

/**
 * The tenant-facing cell for a boundary and tier. Deliberately reachable only for the `TRIAL` and
 * `PAID_PILOT` columns: the "System hard protection" column is global and must never be surfaced to
 * a tenant (PRD §38.5).
 */
export function limitCellFor(boundary: LimitBoundary, tier: PlanTier): LimitCell | null {
  const row = limitRowFor(boundary);
  if (row === null) return null;
  return tier === 'TRIAL' ? row.trial : row.paidPilot;
}
