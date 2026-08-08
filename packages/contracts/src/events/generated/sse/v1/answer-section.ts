// GENERATED FROM schemas/events/** — DO NOT EDIT (PRD §20.1)
// source: schemas/events/sse/v1/answer.section.json

/** PRD §34.4 calls this "provisional UI content until `job.completed`" but evidences no frame, and PRD §34.8/§8.8/§22 plus this ticket's deliverable 2 forbid a content-bearing property in any event schema. It therefore carries the three common fields only. Open, recorded against sub-PRD Q-F2/D8 and to be decided before RUNT-03 starts; RUNT-03 may not resolve it by defining a payload schema under apps/api/src/sse/** (sub-PRD D8). PRD §34.4 evidences a frame for `stage.changed` and `job.completed` only. Every other allowed type therefore carries exactly the three fields all §34.4 frames share — inventing more would exceed the PRD, and any content-bearing field is forbidden outright (FND-05 deliverable 2; PRD §16.2 "MUST NOT contain hidden reasoning or raw provider payloads"; §22). */
export interface AnswerSectionSseEvent {
  /** The SSE payload schema version, carried on every frame exactly as PRD §34.4 shows (docs/PRD.md lines 1947 and 1951). */
  readonly schema_version: "1.0";
  /** Opaque `job_`-prefixed UUIDv7 the frame belongs to (PRD §34.1, §34.4 line 1947). */
  readonly job_id: string;
  /** RFC 3339 UTC instant, seconds precision, always suffixed `Z` (PRD §34.4 line 1947). */
  readonly occurred_at: string;
}
