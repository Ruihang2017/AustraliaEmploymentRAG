// GENERATED FROM schemas/events/** — DO NOT EDIT (PRD §20.1)
// source: schemas/events/registry.json

/** The `schema_version` every schema in this version directory declares (PRD §16.1). */
export const SCHEMA_VERSION = '1.0';

/** Registered webhook event types, in registry order (PRD §34.8). */
export const WEBHOOK_EVENT_TYPES = [
  "alert.created",
] as const;

export type WebhookEventTypeName = (typeof WEBHOOK_EVENT_TYPES)[number];

/** Allowed public SSE event types, in registry order (PRD §34.4). */
export const SSE_EVENT_TYPES = [
  "job.started",
  "stage.changed",
  "clarification.required",
  "answer.section",
  "citation.added",
  "job.completed",
  "job.failed",
  "job.cancelled",
  "heartbeat",
] as const;

export type SseEventTypeName = (typeof SSE_EVENT_TYPES)[number];
