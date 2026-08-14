/**
 * EVID-07 — the one provider id this package ships.
 *
 * It lives in `src/profiles/**` rather than in `src/providers/**` so the profile registry can name it
 * without the profile leaf depending on the transport leaf. `src/providers/registry.ts` imports the
 * same constant, so there is exactly one spelling of it in the package.
 *
 * There is deliberately no second entry. Which real providers meet PRD §10.2's no-training /
 * zero-or-approved-minimal retention terms is sub-PRD **Q-EVID-4**, an open Founder decision, and
 * naming a vendor here would pre-empt it. `test/providers/origin.test.ts` asserts the shipped registry
 * declares no external origin at all.
 */
export const STUB_PROVIDER_ID = 'STUB_DETERMINISTIC';
