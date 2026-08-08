/**
 * EVID-01 — the four checksums, as pure functions over a digit string.
 *
 * They live in one file, separate from the detectors that use them, so
 * `test/deterministic/checksums.test.ts` can mutate a single digit at every position of a known-valid
 * synthetic value and assert rejection, without going through a detector, a scan view or an offset
 * map. PRD §37.2 calls the stage *"deterministic patterns and checksums"*: this file is the
 * "checksums" half and it has no dependency at all.
 *
 * Single-digit mutation is the right mutation class for all four: mod-11, mod-89 and Luhn all detect
 * every single-digit change by construction, so a surviving mutation is a real defect and never an
 * artefact of the test.
 */

function digitsOf(value: string): number[] | null {
  const out: number[] = [];
  for (let i = 0; i < value.length; i += 1) {
    const code = value.charCodeAt(i) - 48;
    if (code < 0 || code > 9) return null;
    out.push(code);
  }
  return out;
}

/** ATO TFN weighted modulus-11 check (PRD §37.1 "TFN"). Exactly nine digits. */
export function isValidTfn(value: string): boolean {
  const digits = digitsOf(value);
  if (!digits || digits.length !== 9) return false;
  const weights = [1, 4, 3, 7, 5, 8, 6, 9, 10];
  let sum = 0;
  for (let i = 0; i < 9; i += 1) sum += (digits[i] ?? 0) * (weights[i] ?? 0);
  return sum % 11 === 0;
}

/**
 * ABN modulus-89 check: subtract 1 from the first digit, weight, sum, and require `% 89 === 0`
 * (PRD §37.1 allowed column; §34.9 `INVALID_ABN`; `UAT-SRCH-04`). Exactly eleven digits.
 *
 * NOTE FOR THE NEXT MODULE THAT NEEDS THIS. `14-search-product` needs the same check for
 * `INVALID_ABN`. It is exported from `src/deterministic/index.ts` so there is something to depend on
 * — do not write a second copy. The shared need is recorded in
 * docs/prd/12-evidence-safety/README.md per the ticket's Feedback obligation; the resolution is one
 * owner plus an edge, not two implementations.
 */
export function isValidAbn(value: string): boolean {
  const digits = digitsOf(value);
  if (!digits || digits.length !== 11) return false;
  const weights = [10, 1, 3, 5, 7, 9, 11, 13, 15, 17, 19];
  let sum = ((digits[0] ?? 0) - 1) * 10;
  for (let i = 1; i < 11; i += 1) sum += (digits[i] ?? 0) * (weights[i] ?? 0);
  return sum % 89 === 0;
}

/**
 * Medicare card number check digit: digits 1-8 weighted `[1,3,7,9,1,3,7,9]`, `sum % 10` equals the
 * ninth digit. The first digit is 2-6 on a real card. The tenth (and, on some transcriptions, an
 * eleventh) digit is the ISSUE NUMBER, is 1-9, and is NOT protected by the check digit — mutating it
 * yields another valid card number, which is why `checksums.test.ts` mutates only the first nine
 * positions for this algorithm.
 *
 * Length is 10 or 11, matching the ticket's *"10/11-digit Medicare number with its check digit"*.
 */
export function isValidMedicare(value: string): boolean {
  const digits = digitsOf(value);
  if (!digits || digits.length < 10 || digits.length > 11) return false;
  const first = digits[0] ?? 0;
  if (first < 2 || first > 6) return false;
  const weights = [1, 3, 7, 9, 1, 3, 7, 9];
  let sum = 0;
  for (let i = 0; i < 8; i += 1) sum += (digits[i] ?? 0) * (weights[i] ?? 0);
  if (sum % 10 !== (digits[8] ?? -1)) return false;
  // Issue numbers, when present, are 1-9.
  for (let i = 9; i < digits.length; i += 1) {
    const issue = digits[i] ?? 0;
    if (issue < 1 || issue > 9) return false;
  }
  return true;
}

/** Luhn (mod-10) — payment card numbers, PRD §37.1 "bank/card details". */
export function isValidLuhn(value: string): boolean {
  const digits = digitsOf(value);
  if (!digits || digits.length < 12) return false;
  let sum = 0;
  let double = false;
  for (let i = digits.length - 1; i >= 0; i -= 1) {
    let digit = digits[i] ?? 0;
    if (double) {
      digit *= 2;
      if (digit > 9) digit -= 9;
    }
    sum += digit;
    double = !double;
  }
  return sum % 10 === 0;
}
