/**
 * EVID-01 deliverable 5 — the PRD §37.2 admission pipeline as ordered, named stages with ports.
 *
 * PRD §37.2, quoted, is the spec of this file:
 *
 *     browser hints (not trusted)
 *     -> request byte/field limits
 *     -> deterministic patterns and checksums
 *     -> local entity recognition
 *     -> contextual public-entity allow rules
 *     -> combination/risk rules
 *     -> accept sanitized payload OR reject with offsets/types/replacements
 *     -> only then create logs, persistence, jobs or provider calls
 *
 * The first line is not a stage: browser hints are NOT an input to this module (see `request.ts`).
 *
 * NO PARAMETER SKIPS A STAGE. `admit` takes exactly two parameters, there is no options object, no
 * environment lookup, no role check and no test hook. `stages` is REQUIRED rather than defaulted:
 * `CONSERVATIVE_STAGE_DEFAULTS` is exported and a caller may pass it, but the choice is explicit at
 * every call site, which makes "the placeholder stages were shipped as the detector" impossible to do
 * silently.
 *
 * ONE EARLY RETURN, AND PRD §37.2 MANDATES IT: a limit violation returns before any scanning happens,
 * because "request byte/field limits" precedes "deterministic patterns and checksums". Every other
 * stage always runs.
 *
 * EXACTLY ONE STAGE MAY REMOVE A FINDING — `applyPublicEntityRules`, because that is what an allow
 * rule is. Every other stage appends. A reviewer asking "can a blocking finding be lost?" has one
 * function to read.
 */
import type { PiiFinding } from './finding.js';
import { deepFreeze } from './freeze.js';
import type { PiiAdmissionRequest } from './request.js';
import { STRUCTURED_FIELD_NAMES } from './request.js';
import type { PiiAdmissionResult } from './result.js';
import { hasBlockingFinding } from './result.js';
import { buildScanViews, detectDeterministic } from '../deterministic/detect.js';
import { isValidAbn } from '../deterministic/detectors/checksums.js';
import { enforceLimits } from '../deterministic/limits.js';
import type { ScanView } from '../deterministic/normalise.js';
import { sanitize } from '../deterministic/sanitize.js';

/**
 * What every stage port receives. The views carry the NFC text and the offset map, so `EVID-02` never
 * re-normalises — re-normalising would produce offsets in a different space from the ones already in
 * the finding list. The request itself is included so an allow rule can compare a span against the
 * reserved structured channels.
 */
export interface StageInput {
  readonly request: PiiAdmissionRequest;
  readonly views: ReadonlyMap<string, ScanView>;
}

/**
 * PRD §37.2 stages 4-6, as pure functions. No stage receives the metrics sink, a clock or a mutable
 * accumulator: a stage takes the findings so far and returns the findings after it.
 */
export interface PiiStages {
  /** Stage 4 — local entity recognition (`EVID-02`). Appends findings. */
  readonly recogniseEntities: (
    input: StageInput,
    findings: readonly PiiFinding[],
  ) => readonly PiiFinding[];
  /** Stage 5 — contextual public-entity allow rules (`EVID-02`). The ONLY stage that may remove one. */
  readonly applyPublicEntityRules: (
    input: StageInput,
    findings: readonly PiiFinding[],
  ) => readonly PiiFinding[];
  /** Stage 6 — combination/risk rules (`EVID-02`). Appends findings. */
  readonly applyCombinationRules: (
    input: StageInput,
    findings: readonly PiiFinding[],
  ) => readonly PiiFinding[];
}

/**
 * The conservative defaults the ticket requires so the pipeline is complete and testable before
 * `EVID-02` lands.
 *
 * THESE ARE PLACEHOLDERS, NOT DETECTORS. `recogniseEntities` and `applyCombinationRules` return no
 * findings — they recognise nothing and assess nothing. Reading a green test suite as evidence that
 * entity recognition works would be reading it exactly wrong; that evidence arrives with `EVID-02`.
 */
export const CONSERVATIVE_STAGE_DEFAULTS: PiiStages = deepFreeze({
  /** Placeholder — `EVID-02` implements PRD §37.2 stage 4. Returns no findings; this is NOT a recogniser. */
  recogniseEntities: (_input: StageInput, findings: readonly PiiFinding[]): readonly PiiFinding[] =>
    findings,

  /**
   * The only shipped allow rule, and it is structural (sub-PRD D4, PRD §37.2: exceptions come from
   * the structured fields, *"not a generic 'ignore warning' button"*).
   *
   * A finding is dropped only when ALL of:
   * - its field is one of the three reserved structured channel names (a `freeText` field can never
   *   be named that — `limits.ts` rejects the request first);
   * - its span is the ENTIRE field value, so a public employer name with a phone number appended is
   *   still blocked;
   * - for `structured.abn`, the value passes the mod-89 checksum.
   *
   * Nothing in `freeText` is ever allowed by this default.
   */
  applyPublicEntityRules: (
    input: StageInput,
    findings: readonly PiiFinding[],
  ): readonly PiiFinding[] =>
    findings.filter((finding) => {
      const view = input.views.get(finding.field);
      if (!view) return true;
      const isReserved =
        finding.field === STRUCTURED_FIELD_NAMES.employer ||
        finding.field === STRUCTURED_FIELD_NAMES.abn ||
        finding.field === STRUCTURED_FIELD_NAMES.publicCaseParty;
      if (!isReserved) return true;
      if (finding.start !== 0 || finding.end !== view.nfc.length) return true;
      if (finding.field === STRUCTURED_FIELD_NAMES.abn) {
        const digits = view.scan.replace(/[^0-9]/g, '');
        return !isValidAbn(digits);
      }
      return false;
    }),

  /** Placeholder — `EVID-02` implements PRD §37.2 stage 6. Returns no findings; this is NOT a risk rule. */
  applyCombinationRules: (
    _input: StageInput,
    findings: readonly PiiFinding[],
  ): readonly PiiFinding[] => findings,
});

/**
 * PRD §37.2 step 7 — *"accept sanitized payload OR reject with offsets/types/replacements"*. The only
 * constructor of an `ACCEPT` in the module.
 */
export function decide(
  views: ReadonlyMap<string, ScanView>,
  findings: readonly PiiFinding[],
): PiiAdmissionResult {
  if (hasBlockingFinding(findings)) return { decision: 'REJECT', findings };
  return { decision: 'ACCEPT', sanitizedPayload: sanitize(views, findings), findings };
}

/** The admission boundary. See the file header for why it has exactly these two parameters. */
export function admit(request: PiiAdmissionRequest, stages: PiiStages): PiiAdmissionResult {
  // Stage 1 — request byte/field limits, before a single character is scanned.
  const limitFindings = enforceLimits(request);
  if (limitFindings.length > 0) return { decision: 'REJECT', findings: limitFindings };

  const views = buildScanViews(request);
  const input: StageInput = { request, views };

  // Stage 2 — deterministic patterns and checksums.
  let findings = detectDeterministic(views);
  // Stage 3 (PRD §37.2 line 4) — local entity recognition.
  findings = stages.recogniseEntities(input, findings);
  // Stage 4 — contextual public-entity allow rules.
  findings = stages.applyPublicEntityRules(input, findings);
  // Stage 5 — combination/risk rules.
  findings = stages.applyCombinationRules(input, findings);

  // Stage 6 — accept or reject.
  return decide(views, findings);
}
