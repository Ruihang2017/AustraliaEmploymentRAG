/**
 * EVID-01 deliverable 2 — the finding type that cannot carry a value.
 *
 * PRD §37.2: *"Detection response includes field, character range, category and suggested
 * placeholder but **never echoes the detected value**"*, and *"Metrics record category/count/result,
 * not content or reversible hash"*. Sub-PRD D3 restates it: a finding never carries the value and
 * nothing derived from it is reversible.
 *
 * There is therefore deliberately NO `value`, `text`, `match`, `sample`, `hash`, `fingerprint`,
 * `redactedValue` or `context` member — and no method or accessor that could return one, which is
 * why this is a plain readonly object type rather than a class. The absence is the feature, it is
 * asserted by `test/contract/types.test-d.ts` (an exhaustive `keyof` assertion, so a member nobody
 * thought to forbid is caught too), and adding one is a PRD §45.5 product change, not a refactor.
 *
 * OFFSETS: `[start, end)` is half-open, in **character offsets over the NFC-normalised field value**
 * — i.e. `value.normalize('NFC').slice(start, end)` is the detected span. See
 * `src/deterministic/normalise.ts` and packages/pii/README.md for why that is the offset space and
 * why a finding never splits a surrogate pair.
 */
import type { PiiCategory } from './category.js';

/**
 * `BLOCKING` — PRD §10.1 forbids bypassing it, so it forces `REJECT` (see `result.ts`).
 * `ADVISORY` — sanitisable on the ACCEPT path (`src/deterministic/sanitize.ts`). No detector shipped
 * by EVID-01 emits `ADVISORY`; it exists for the `EVID-02` stage ports.
 */
export type PiiSeverity = 'BLOCKING' | 'ADVISORY';

export interface PiiFinding {
  /** The `freeText` field name, or one of the three reserved structured channel names. */
  readonly field: string;
  /** Inclusive start, in NFC character offsets. */
  readonly start: number;
  /** Exclusive end, in NFC character offsets. Always `> start`. */
  readonly end: number;
  readonly category: PiiCategory;
  readonly severity: PiiSeverity;
  /** The §37.1-allowed replacement the customer is asked to paste in (PRD §34.9). */
  readonly suggestedPlaceholder: string;
}
