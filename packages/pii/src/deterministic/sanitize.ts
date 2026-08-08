/**
 * EVID-01 deliverable 9 — sanitisation, for the ACCEPT path only.
 *
 * A `BLOCKING` finding NEVER produces a cleaned payload. PRD §10.1 requires the CUSTOMER to replace
 * the spans (§34.9: *"Replace indicated spans with anonymous placeholders"*, `UAT-PII-01`), and a
 * system that silently cleaned blocked PII would be a bypass wearing a helpful hat: the customer
 * would never learn that they had pasted a TFN. This function is therefore only reachable from
 * `decide()` after `hasBlockingFinding()` has returned false.
 *
 * WHAT IT DOES:
 * - drops the zero-width and bidi control characters (a real formatting normalisation — see
 *   `normalise.ts`);
 * - replaces each ADVISORY finding's span with that category's placeholder, applied RIGHT TO LEFT so
 *   earlier offsets stay valid while later ones are rewritten;
 * - records every replacement in pre-sanitisation NFC offsets, so a caller can map a position back
 *   without holding the original text.
 *
 * WHAT IT DOES NOT DO: folding. The scan view folds full-width digits and Unicode dashes to make
 * MATCHING robust; rewriting the customer's own characters on the way to a provider would change
 * their content, which is not this function's business.
 *
 * NO SHIPPED DETECTOR EMITS `ADVISORY` in EVID-01 — the severity exists for the `EVID-02` stage
 * ports. The path is exercised by a stage double in `test/deterministic/sanitize.test.ts` rather than
 * left dead, and no advisory detector was invented to make it live.
 */
import type { PiiFinding } from '../contract/finding.js';
import type { SanitizationTransformation, SanitizedField, SanitizedPayload } from '../contract/result.js';
import { mintSanitizedPayload } from '../contract/result.js';
import type { ScanView } from './normalise.js';
import { stripFormatting } from './normalise.js';

export function sanitize(
  views: ReadonlyMap<string, ScanView>,
  findings: readonly PiiFinding[],
): SanitizedPayload {
  const fields: SanitizedField[] = [];
  const transformations: SanitizationTransformation[] = [];

  for (const view of views.values()) {
    const advisory = findings
      .filter((finding) => finding.field === view.field && finding.severity === 'ADVISORY')
      .slice()
      .sort((left, right) => right.start - left.start);

    let value = view.nfc;
    for (const finding of advisory) {
      value =
        value.slice(0, finding.start) + finding.suggestedPlaceholder + value.slice(finding.end);
      transformations.push({
        field: view.field,
        start: finding.start,
        end: finding.end,
        replacementLength: finding.suggestedPlaceholder.length,
      });
    }
    fields.push({ field: view.field, value: stripFormatting(value) });
  }

  // Recorded left to right, though applied right to left, so the list reads in text order.
  transformations.sort((left, right) =>
    left.field === right.field
      ? left.start - right.start
      : left.field < right.field
        ? -1
        : 1,
  );
  return mintSanitizedPayload(fields, transformations);
}
