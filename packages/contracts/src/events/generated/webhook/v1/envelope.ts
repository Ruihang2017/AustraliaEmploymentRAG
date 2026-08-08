// GENERATED FROM schemas/events/** — DO NOT EDIT (PRD §20.1)
// source: schemas/events/webhook/v1/envelope.json

/** The signed webhook envelope of PRD §34.8 (docs/PRD.md lines 2099-2112). Webhooks carry their own schema version (PRD §16.1), which is why this root is versioned separately from schemas/openapi/**. `data` is deliberately unconstrained here: the per-type schema in this directory constrains it. The $id is a URN, not an http URL — nothing about a schema identifier should imply a resolvable endpoint. */
export interface WebhookEventEnvelope {
  /** PRD §16.1: webhooks carry their own schema version. Today it is exactly "1.0"; a non-additive change mints schemas/events/webhook/v2/** and bumps this const. */
  readonly schema_version: "1.0";
  /** Opaque event id, `evt_`-prefixed UUIDv7 (PRD §34.1, §34.8). Receivers deduplicate on it. The pattern is the canonical lower-case RFC 9562 v7 form that packages/contracts/src/ids/uuidv7.ts mints. */
  readonly id: string;
  /** The registered webhook event type. PRD §34.8 specifies exactly one; a new type is added here, in schemas/events/registry.json and in the per-type schema, never inside the requesting module's own tree (FND-05 Feedback obligation 2). */
  readonly type: "alert.created";
  /** RFC 3339 UTC instant, seconds precision, always suffixed `Z` (PRD §34.8 line 2103). */
  readonly created_at: string;
  /** Whether the delivery originates from the sandbox environment (PRD §34.8 line 2104). */
  readonly sandbox: boolean;
  /** The type-specific payload. Unconstrained at the envelope level and constrained in full by the per-type schema, which spells these envelope members out again rather than $ref-ing this file: `additionalProperties: false` does not see across `allOf`/`$ref`, which is the classic way to ship a schema that silently accepts extra properties. schemas.test.ts asserts the duplicated envelope members stay deep-equal to these, so they cannot drift. */
  readonly data: Readonly<Record<string, unknown>>;
}
