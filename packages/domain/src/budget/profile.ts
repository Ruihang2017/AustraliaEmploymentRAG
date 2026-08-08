/**
 * FND-09 deliverable 2 — PRD §24.1's monthly founder-funded budget as versioned frozen data.
 *
 * `prdText` cells are the PRD's own right-hand column, character for character, EN DASH (U+2013)
 * included: `test/budget/prd-24-1-budget.test.ts` asserts each row occurs verbatim in `docs/PRD.md`,
 * so a hyphen here fails, correctly.
 *
 * TWO REPRESENTATIONS OF 90%, ON PURPOSE (sub-PRD D15):
 * `warningThresholdBasisPoints: 9_000n` is the only value any arithmetic reads (`thresholds.ts`);
 * `warningThresholdRatio: 0.9` is a plain `number` that exists because OPS-003 and PRD §22 speak of a
 * "90% warning", and it is never used in a computation. `test/budget/money-purity.test.ts` asserts the
 * identifier appears in no other file in the leaf. That split is what keeps the requirement legible
 * without reintroducing floating-point money.
 *
 * The `version` field makes a change explicit and auditable: a new default is `BUDGET_PROFILE_V2` plus
 * a changelog line in `docs/prd/00-foundation/README.md`, never an edited literal (ticket obligation 1).
 * The A$50 ceiling itself is NOT a tuning knob — changing it is a product decision under PRD §45.5.
 */
import { deepFreeze } from './deep-freeze.js';
import { fromWholeAud, type MicroAud } from './micro-aud.js';

export interface BudgetLineItem {
  /** Stable key for this row; not PRD text. */
  readonly item: string;
  /** PRD §24.1 "Item" cell, verbatim. */
  readonly label: string;
  /** PRD §24.1 "Planning budget" cell, verbatim (en dashes included). */
  readonly prdText: string;
  readonly lowMicroAud: MicroAud;
  readonly highMicroAud: MicroAud;
}

export interface BudgetProfile {
  readonly version: string;
  readonly prdSection: string;
  readonly lineItems: readonly BudgetLineItem[];
  readonly hostedModelHardBudgetMicroAud: MicroAud;
  /**
   * PRD §24.1's Total upper bound (A$50), corroborated by §42.6's *"The monthly A$50 ceiling is an
   * admission-control requirement, not a spreadsheet hope"*. This is the hard stop of OPS-003.
   */
  readonly founderMonthlyCeilingMicroAud: MicroAud;
  readonly totalLowMicroAud: MicroAud;
  readonly totalHighMicroAud: MicroAud;
  /** The only 90% figure any arithmetic reads. */
  readonly warningThresholdBasisPoints: bigint;
  /** Documentation only — never multiplied by a money amount. See the file header. */
  readonly warningThresholdRatio: number;
  /** PRD §24.1's closing paragraph, verbatim. */
  readonly closingRule: string;
}

export const BUDGET_PROFILE_V1: BudgetProfile = deepFreeze({
  version: 'BUDGET_PROFILE_V1',
  prdSection: '§24.1',
  lineItems: [
    {
      item: 'SYDNEY_LIGHTSAIL_2GB',
      label: 'Sydney Lightsail 2 GB',
      prdText: 'A$14–15',
      lowMicroAud: fromWholeAud(14n),
      highMicroAud: fromWholeAud(15n),
    },
    {
      item: 'ATTACHED_STORAGE_32GB',
      label: '32 GB attached storage',
      prdText: 'A$4–5',
      lowMicroAud: fromWholeAud(4n),
      highMicroAud: fromWholeAud(5n),
    },
    {
      item: 'R2_PUBLIC_CORPUS',
      label: 'R2 public corpus',
      prdText: 'A$3–4',
      lowMicroAud: fromWholeAud(3n),
      highMicroAud: fromWholeAud(4n),
    },
    {
      item: 'S3_SYDNEY_BACKUPS_PRIVATE_EXPORTS',
      label: 'S3 Sydney backups/private exports',
      prdText: 'A$1–2',
      lowMicroAud: fromWholeAud(1n),
      highMicroAud: fromWholeAud(2n),
    },
    {
      item: 'CLOUDFLARE_PAGES_TUNNEL_FREE_EDGE',
      label: 'Cloudflare Pages/tunnel/free edge',
      prdText: 'A$0 target',
      lowMicroAud: fromWholeAud(0n),
      highMicroAud: fromWholeAud(0n),
    },
    {
      item: 'HOSTED_MODEL_HARD_BUDGET',
      label: 'Hosted model hard budget',
      prdText: 'approximately A$12',
      lowMicroAud: fromWholeAud(12n),
      highMicroAud: fromWholeAud(12n),
    },
    {
      item: 'DOMAIN_EMAIL_VARIANCE_RESERVE',
      label: 'Domain/email/variance reserve',
      prdText: 'A$8–12',
      lowMicroAud: fromWholeAud(8n),
      highMicroAud: fromWholeAud(12n),
    },
    {
      item: 'TOTAL',
      label: 'Total',
      prdText: 'A$42–50',
      lowMicroAud: fromWholeAud(42n),
      highMicroAud: fromWholeAud(50n),
    },
  ],
  hostedModelHardBudgetMicroAud: fromWholeAud(12n),
  founderMonthlyCeilingMicroAud: fromWholeAud(50n),
  totalLowMicroAud: fromWholeAud(42n),
  totalHighMicroAud: fromWholeAud(50n),
  warningThresholdBasisPoints: 9_000n,
  warningThresholdRatio: 0.9,
  closingRule:
    'Cloudflare Paid Workers is not a default dependency. Actual provider billing MUST be monitored; the system MUST stop before exceeding the founder-funded ceiling.',
});

/** The line item, looked up by key rather than by index — a missing row must fail by name. */
export function budgetLineItem(profile: BudgetProfile, item: string): BudgetLineItem {
  const found = profile.lineItems.find((row) => row.item === item);
  if (!found) throw new Error(`budget line item ${item} is missing from ${profile.version}`);
  return found;
}
