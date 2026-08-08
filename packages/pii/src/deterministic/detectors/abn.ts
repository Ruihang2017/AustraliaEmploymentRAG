/**
 * EVID-01 detector — Australian Business Number. **This detector emits no finding, by design.**
 *
 * NORMALISATION APPLIED: NFC; zero-width and bidi controls dropped; full-width digits and Unicode
 *                        dashes folded; maximal digit runs with single separators.
 * COVERED EVASIONS:      the same set as `tfn.ts` — this detector's job is to RECOGNISE a valid ABN,
 *                        and it must recognise it in whatever form the customer typed it.
 * NOT COVERED:           an ABN spelled in words; an ABN whose check digits were mistyped (that is
 *                        the point — `INVALID_ABN`, PRD §34.9, is a *search* error, not a PII one).
 * FALSE-POSITIVE POSTURE:emitting a finding here would block a PRD §37.1 ALLOWED value — *"Public
 *                        employer name and ABN"*. So it never emits one. The mod-89 check is used
 *                        (a) by the conservative public-entity allow rule, to accept a valid ABN in
 *                        the reserved `structured.abn` channel (sub-PRD D4), and (b) by
 *                        `14-search-product` for `INVALID_ABN` once it takes the dependency.
 *
 * CONSEQUENCE WORTH KNOWING (packages/pii/README.md repeats it): an eleven-digit ABN pasted into
 * FREE TEXT is not guaranteed to be admitted, because a Medicare-shaped eleven-digit run may fire
 * there and the module fails closed. The supported channel for a public ABN is `structured.abn`,
 * which is exactly what PRD §37.2 and `UAT-PII-02` require.
 */
import type { PiiFinding } from '../../contract/finding.js';
import type { Detector } from './shared.js';
import { asPublicDetector } from './shared.js';

export { isValidAbn } from './checksums.js';

export const detectAbnIn: Detector = (): PiiFinding[] => [];

/** The ticket's public signature (deliverable 7). Always returns `[]` — see the header. */
export const detectAbn = asPublicDetector(detectAbnIn);
