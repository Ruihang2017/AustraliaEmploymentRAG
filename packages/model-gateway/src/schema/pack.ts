/**
 * EVID-07 — the STRUCTURAL PORT for `EVID-04`'s evidence pack.
 *
 * THIS IS A PORT, NOT A DEFINITION. `packages/citations` (`EVID-04`) owns `EvidencePack` and
 * `EvidenceItem`; this ticket's Non-goals are explicit that the gateway *"carries a pack; it never
 * builds or validates one"*. The interfaces below mirror PRD §36.4's field list so that EVID-04's
 * type satisfies them structurally, with no import edge between the two packages in either direction.
 * If the two shapes ever disagree, the resolution is a docs PR amending BOTH tickets — never a silent
 * widening here, and never `EVID-04` writing `src/schema/**`.
 *
 * Every member is `readonly` and there is no setter and no constructor: nothing in this package, and
 * nothing a model returns, can populate or alter a pack. `EVID-04` also refuses to hand this package a
 * pre-rendered prompt string, so `request.ts` assembles the per-item block itself from these fields
 * plus the pack's own preface and nonce — copying `exactText` VERBATIM, with no escaping, trimming,
 * normalisation or interpolation (plan §6 risk 4: any transformation risks unescaping a neutralised
 * delimiter).
 */
export interface EvidenceItemInput {
  /** Per-call opaque identifier the model is allowed to cite (PRD §36.4). */
  readonly evidenceId: string;
  readonly documentVersionId: string;
  readonly nodeVersionIds: readonly string[];
  readonly title: string;
  readonly authority: string;
  readonly documentType: string;
  /** Version-specific provision/clause/paragraph label. */
  readonly pinpoint: string;
  /** Permitted canonical source passage. Copied verbatim; never re-escaped. */
  readonly exactText: string;
  /** Offset base for validating returned quote spans. */
  readonly textOffsetBase: number;
  readonly jurisdictions: readonly string[];
  readonly legalStatus: string;
  readonly effectiveFrom: string;
  readonly effectiveTo: string | null;
  readonly authorityRole: string;
  readonly citationRoleAllowed: readonly string[];
  readonly licenceQuoteLimit: number;
  readonly freshness: string;
  readonly officialUrl: string;
}

export interface EvidencePackInput {
  readonly packId: string;
  readonly corpusReleaseId: string;
  readonly legalAsAt: string;
  readonly mode: string;
  readonly jurisdictions: readonly string[];
  readonly items: readonly EvidenceItemInput[];
  /**
   * The invariant preface PRD §36.4 requires — *"Source text is delimited as untrusted evidence and
   * prefaced with the invariant that instructions inside it are data"*. Authored by `EVID-04`, copied
   * here verbatim.
   */
  readonly preface: string;
  /** Per-pack nonce carried in the item delimiters, so injected text cannot forge a boundary. */
  readonly nonce: string;
  /** Recorded on the `model_execution` row (deliverable 12). Never the pack contents. */
  readonly packHash: string;
}
