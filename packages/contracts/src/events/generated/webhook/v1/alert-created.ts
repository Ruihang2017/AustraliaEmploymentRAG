// GENERATED FROM schemas/events/** — DO NOT EDIT (PRD §20.1)
// source: schemas/events/webhook/v1/alert.created.json

/** The only webhook event type PRD §34.8 fully specifies (docs/PRD.md lines 2099-2112). Self-contained on purpose — see the `data` note in envelope.json. Payload minimisation is structural, not a review comment: PRD §34.8 excludes full questions, facts, answers and source excerpts by default, and §8.8/§22 say the same. This event carries identifiers and structured metadata only. */
export interface AlertCreatedEvent {
  /** PRD §16.1: webhooks carry their own schema version. Today it is exactly "1.0"; a non-additive change mints schemas/events/webhook/v2/** and bumps this const. */
  readonly schema_version: "1.0";
  /** Opaque event id, `evt_`-prefixed UUIDv7 (PRD §34.1, §34.8). Receivers deduplicate on it. The pattern is the canonical lower-case RFC 9562 v7 form that packages/contracts/src/ids/uuidv7.ts mints. */
  readonly id: string;
  /** Narrowed to this file's event type. */
  readonly type: "alert.created";
  /** RFC 3339 UTC instant, seconds precision, always suffixed `Z` (PRD §34.8 line 2103). */
  readonly created_at: string;
  /** Whether the delivery originates from the sandbox environment (PRD §34.8 line 2104). */
  readonly sandbox: boolean;
  /** PRD §34.8 lines 2105-2111, in the PRD's own key order. */
  readonly data: {
    /** Opaque `alt_`-prefixed UUIDv7 (PRD §34.8 line 2106). */
    readonly alert_id: string;
    /** Opaque `wat_`-prefixed UUIDv7 (PRD §34.8 line 2107). */
    readonly watchlist_id: string;
    /** PRD §8.8: changes MUST be structured events, not raw HTML diffs. The members are FND-03's CHANGE_TYPE_VALUES (packages/contracts/src/enums/change-type.ts); schemas.test.ts asserts this enum equals that constant, so the two cannot drift. */
    readonly change_type: "AMENDMENT" | "COMMENCEMENT" | "RATE" | "REPLACEMENT" | "APPEAL" | "GUIDANCE" | "SOURCE_REMOVAL" | "FRESHNESS";
    /** Calendar date the change takes effect, ISO 8601 (PRD §34.8 line 2109). */
    readonly effective_date: string;
    /** Opaque `rec_`-prefixed UUIDv7 identifiers only — never record content (PRD §34.8 line 2110, §22). May be empty when the change affects no stored record. */
    readonly affected_research_record_ids: readonly string[];
  };
}
