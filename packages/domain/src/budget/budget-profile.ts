/**
 * FND-09 deliverable 2 — the PRD §24.1 monthly founder-funded budget as versioned frozen data.
 *
 * The table is transcribed verbatim (the `item` and `planningBudget` strings are the PRD's own cells,
 * en dash and all) and converted to integer micro-AUD alongside it, so a transcription slip is a test
 * failure rather than a silent budget change. The `version` field exists so a change to any number is
 * an explicit, auditable edit (PRD §45.5 makes a change to the ceiling a product decision).
 *
 * NO PROVIDER NAME, MODEL IDENTIFIER OR HOSTED PRICE LITERAL APPEARS HERE.
 * `hostedModelHardBudgetMicroAud` is a *budget line*, not a price: prices arrive as inputs
 * (see `pricing.ts`). The model behind each profile is breakdown plan §8 **Q1**, benchmark-selected
 * and recorded by `GOLD-15`.
 *
 * Pure: no clock, no randomness, no I/O (PRD §39.1, §45.2).
 */
import { deepFreeze } from './frozen.js';
import { fromWholeAud, type MicroAud } from './micro-aud.js';

/** One row of the PRD §24.1 table. */
export interface BudgetLineItem {
  /** The PRD §24.1 "Item" cell, verbatim. */
  readonly item: string;
  /** The PRD §24.1 "Planning budget" cell, verbatim (en dash included). */
  readonly planningBudget: string;
  readonly minMicroAud: MicroAud;
  readonly maxMicroAud: MicroAud;
  /** `true` only where the PRD cell says "approximately". */
  readonly approximate: boolean;
}

export interface BudgetProfile {
  readonly version: 'BUDGET_PROFILE_V1';
  readonly prdSection: '§24.1';
  /** The seven PRD §24.1 rows, in PRD order. */
  readonly lineItems: readonly BudgetLineItem[];
  /** A$42 — the sum of the row minima. */
  readonly totalMinMicroAud: MicroAud;
  /** A$50 — the sum of the row maxima. */
  readonly totalMaxMicroAud: MicroAud;
  /** Approximately A$12 (PRD §24.1 "Hosted model hard budget"). */
  readonly hostedModelHardBudgetMicroAud: MicroAud;
  /** A$50 — OPS-003's hard stop. Changing it is a product decision (PRD §45.5). */
  readonly founderMonthlyCeilingMicroAud: MicroAud;
  /**
   * OPS-003's "90% warning", declarative only. NO ARITHMETIC IN `src/budget` READS THIS FIELD —
   * `warningThresholdBasisPoints` is used instead so that no floating-point value can enter a money
   * computation (PRD §34.1). The two are asserted to agree in `test/budget/budget-profile.test.ts`.
   */
  readonly warningThresholdRatio: 0.9;
  /** 9,000 basis points = 90%. The value the threshold arithmetic actually uses. */
  readonly warningThresholdBasisPoints: bigint;
}

export const BUDGET_PROFILE_V1: BudgetProfile = deepFreeze<BudgetProfile>({
  version: 'BUDGET_PROFILE_V1',
  prdSection: '§24.1',
  lineItems: [
    {
      item: 'Sydney Lightsail 2 GB',
      planningBudget: 'A$14–15',
      minMicroAud: fromWholeAud(14n),
      maxMicroAud: fromWholeAud(15n),
      approximate: false,
    },
    {
      item: '32 GB attached storage',
      planningBudget: 'A$4–5',
      minMicroAud: fromWholeAud(4n),
      maxMicroAud: fromWholeAud(5n),
      approximate: false,
    },
    {
      item: 'R2 public corpus',
      planningBudget: 'A$3–4',
      minMicroAud: fromWholeAud(3n),
      maxMicroAud: fromWholeAud(4n),
      approximate: false,
    },
    {
      item: 'S3 Sydney backups/private exports',
      planningBudget: 'A$1–2',
      minMicroAud: fromWholeAud(1n),
      maxMicroAud: fromWholeAud(2n),
      approximate: false,
    },
    {
      item: 'Cloudflare Pages/tunnel/free edge',
      planningBudget: 'A$0 target',
      minMicroAud: fromWholeAud(0n),
      maxMicroAud: fromWholeAud(0n),
      approximate: false,
    },
    {
      item: 'Hosted model hard budget',
      planningBudget: 'approximately A$12',
      minMicroAud: fromWholeAud(12n),
      maxMicroAud: fromWholeAud(12n),
      approximate: true,
    },
    {
      item: 'Domain/email/variance reserve',
      planningBudget: 'A$8–12',
      minMicroAud: fromWholeAud(8n),
      maxMicroAud: fromWholeAud(12n),
      approximate: false,
    },
  ],
  totalMinMicroAud: fromWholeAud(42n),
  totalMaxMicroAud: fromWholeAud(50n),
  hostedModelHardBudgetMicroAud: fromWholeAud(12n),
  founderMonthlyCeilingMicroAud: fromWholeAud(50n),
  warningThresholdRatio: 0.9,
  warningThresholdBasisPoints: 9_000n,
});
