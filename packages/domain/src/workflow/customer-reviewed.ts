/**
 * `CUSTOMER_REVIEWED` semantics (FND-08 deliverable 6).
 *
 * PRD §8.7 states what the state means. It is carried here as a constant so every module that has to
 * explain the state quotes one string instead of paraphrasing the PRD.
 *
 * **This is not display copy.** The rendered disclaimer text is `24-launch`/LNCH-01
 * (`docs/policies/**`); this module holds no copy and no wording decision. The acknowledgement itself
 * is the `DISCLAIMER_ACKNOWLEDGED` condition in `conditions.ts`, required by the §32.6
 * `IN_REVIEW → CUSTOMER_REVIEWED` row.
 */
export const CUSTOMER_REVIEWED_SEMANTICS =
  '`CUSTOMER_REVIEWED` means customer-internal review and MUST NOT imply legal verification by the product owner or a lawyer.';
