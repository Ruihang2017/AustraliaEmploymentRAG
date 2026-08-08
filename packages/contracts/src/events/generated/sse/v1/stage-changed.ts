// GENERATED FROM schemas/events/** — DO NOT EDIT (PRD §20.1)
// source: schemas/events/sse/v1/stage.changed.json

/** Emitted on every pipeline stage transition (PRD §34.4 lines 1945-1947, the frame this schema is transcribed from). PRD §34.4 evidences a frame for `stage.changed` and `job.completed` only. Every other allowed type therefore carries exactly the three fields all §34.4 frames share — inventing more would exceed the PRD, and any content-bearing field is forbidden outright (FND-05 deliverable 2; PRD §16.2 "MUST NOT contain hidden reasoning or raw provider payloads"; §22). */
export interface StageChangedSseEvent {
  /** The SSE payload schema version, carried on every frame exactly as PRD §34.4 shows (docs/PRD.md lines 1947 and 1951). */
  readonly schema_version: "1.0";
  /** Opaque `job_`-prefixed UUIDv7 the frame belongs to (PRD §34.1, §34.4 line 1947). */
  readonly job_id: string;
  /** The pipeline stage just entered, UPPER_SNAKE (PRD §34.4 line 1947, "VALIDATING_CITATIONS"). No closed member list: the PRD names one stage and defines no stage vocabulary, and FND-03 registers none, so a premature enum here would be invented spec. Widening this to an enum later is additive only if every value already emitted is a member. */
  readonly stage: string;
  /** Short operator-facing progress label (PRD §34.4 line 1947, "Validating citations"). It is UI chrome describing the pipeline, never research content, an answer, an excerpt or a provider payload — those are excluded by PRD §16.2 and §22 and by this ticket's denylist. */
  readonly message: string;
  /** RFC 3339 UTC instant, seconds precision, always suffixed `Z` (PRD §34.4 line 1947). */
  readonly occurred_at: string;
}
