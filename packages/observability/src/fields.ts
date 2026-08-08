/**
 * The log field ALLOWLIST — RUNT-07 Deliverable 2, and the structural half of PRD §22's
 * "Logs MUST exclude research/evidence content, PII text, credentials, assertions and provider
 * payloads".
 *
 * A field reaches a log record only if its name appears below AND its value passes that name's
 * declared KIND check. There is deliberately no `text`, `message` or `free_string` kind: every kind
 * is either an opaque identifier, a member of a closed vocabulary, a bounded token, a hex digest or
 * a number. A research body, an evidence excerpt, a PII string, an assertion or a provider payload
 * is not spellable as any of them, so it cannot reach a line — that is what "structurally unable"
 * in the ticket's Goal means.
 *
 * ADDING A FIELD IS A TICKET CHANGE, NOT A CODE CHANGE. RUNT-07's Feedback obligation is explicit:
 * a caller who needs a field the allowlist forbids does not get an escape hatch — the named field is
 * added here after this ticket's Deliverable 2 states why it is technical metadata and not content,
 * and the ticket is re-published. A generic `extra` object would falsify the whole guarantee.
 *
 * `exactOptionalPropertyTypes` is on repo-wide, so a caller OMITS a field rather than passing
 * `undefined`: `logger.info('request.completed', { ...(id !== undefined ? { request_id: id } : {}) })`.
 */
import { isErrorCode, isUuidV7, isResourceKind } from './contracts.js';
import type { ErrorCode } from './contracts.js';
import {
  ACTOR_KINDS,
  EVENT_CODES,
  OPERATION_CODES,
  QUEUE_CLASSES,
  STATUS_CODES,
} from './vocabulary.js';
import type { ActorKind, EventCode, OperationCode, QueueClass, StatusCode } from './vocabulary.js';

/** The value grammars a permitted field may have. Note the absence of any free-text kind. */
export type FieldKind =
  /** `<prefix>_<uuidv7>` — an opaque resource id (PRD §34.1); shape-validated, never parsed further. */
  | 'opaque_id'
  /** A member of a named closed vocabulary from src/vocabulary.ts. */
  | 'code'
  /** A member of `packages/contracts`' `ErrorCode` (PRD §34.9). */
  | 'error_code'
  /** A non-negative safe integer. */
  | 'count'
  /** A non-negative safe integer number of milliseconds. */
  | 'duration_ms'
  /** A safe integer of micro-AUD (PRD §34.1: "never floating point"). */
  | 'micro_aud'
  /** A bounded version/release token. */
  | 'version'
  /**
   * A lower-case sha256 hex digest. PERMITTED ONLY FOR PUBLIC, IMMUTABLE ARTIFACT DIGESTS — a
   * corpus release manifest, a build artifact. Never a digest derived from customer content:
   * PRD §37.2 forbids a reversible hash of content, and a hash of a short known string is
   * reversible by enumeration. Note that `hash` is NOT an available metric label kind
   * (src/metrics.ts allows `enum` and `opaque_id` only), so a digest can never become a label.
   */
  | 'hash'
  /** A boolean. */
  | 'bool';

/** A single allowlist row. `basis` is the PRD/ticket citation and is carried into the JSON schema. */
export type FieldSpec =
  | {
      readonly kind: 'opaque_id';
      /**
       * The registered FND-03 resource prefix this id must carry, or `null` when FND-03 registers
       * none for it (`retrieval_id`, `model_call_id` — README §6 QR9). `null` falls back to
       * a generic `<2-8 lower-case letters>_<uuidv7>` shape check; it never relaxes to "any string".
       */
      readonly prefix: string | null;
      readonly basis: string;
    }
  | { readonly kind: 'code'; readonly vocabulary: readonly string[]; readonly basis: string }
  | {
      readonly kind: 'error_code' | 'count' | 'duration_ms' | 'micro_aud' | 'version' | 'hash' | 'bool';
      readonly basis: string;
    };

/** A bounded release/schema version token. Anchored and length-capped; no whitespace, no punctuation runs. */
export const VERSION_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._+-]{0,63}$/;

/** A lower-case sha256 hex digest. */
export const HASH_PATTERN = /^[0-9a-f]{64}$/;

/** Generic opaque-id shape for kinds FND-03 has not registered a prefix for. */
export const GENERIC_ID_PATTERN = /^[a-z]{2,8}_[0-9a-f-]{36}$/;

/** The longest an opaque id can be: an 8-character prefix, the separator and a 36-character uuid. */
export const MAX_ID_LENGTH = 45;

/** The longest a version token can be (`VERSION_PATTERN` allows 1 + 63 characters). */
export const MAX_VERSION_LENGTH = 64;

const SPECS = {
  // --- Correlation ids: PRD §22 bullet 1 and PRD §42.2 ------------------------------------------
  request_id: { kind: 'opaque_id', prefix: 'req', basis: 'PRD §22 b1, §42.2 — request correlation' },
  job_id: { kind: 'opaque_id', prefix: 'job', basis: 'PRD §22 b1, §42.2 — job correlation' },
  retrieval_id: {
    kind: 'opaque_id',
    prefix: null,
    basis: 'PRD §22 b1, §42.2 — retrieval correlation (no FND-03 prefix; README §6 QR9)',
  },
  model_call_id: {
    kind: 'opaque_id',
    prefix: null,
    basis: 'PRD §22 b1, §42.2 — model-metadata correlation (no FND-03 prefix; README §6 QR9)',
  },
  answer_snapshot_id: {
    kind: 'opaque_id',
    prefix: 'ans',
    basis: 'PRD §22 b1, §42.2 — answer correlation',
  },

  // --- Tenancy and actor -------------------------------------------------------------------------
  organization_id: { kind: 'opaque_id', prefix: 'org', basis: 'RUNT-07 D2 — tenant attribution' },
  actor_kind: {
    kind: 'code',
    vocabulary: ACTOR_KINDS,
    basis: 'RUNT-07 D2 — actor KIND only, never an actor identity',
  },

  // --- Versions: PRD §22 b2 "versions", PRD §34.1 -------------------------------------------------
  release_id: { kind: 'version', basis: 'RUNT-07 D2 — application release (PRD §22 b2)' },
  schema_version: { kind: 'version', basis: 'RUNT-07 D2 — record schema version (PRD §34.1)' },
  corpus_release_id: { kind: 'opaque_id', prefix: 'cr', basis: 'PRD §22 b2 "versions" — active corpus release' },

  // --- What happened: PRD §22 b2 "operation, status" ---------------------------------------------
  event: { kind: 'code', vocabulary: EVENT_CODES, basis: 'RUNT-07 D3 — the bounded event code' },
  operation: { kind: 'code', vocabulary: OPERATION_CODES, basis: 'PRD §22 b2 "operation"' },
  status: { kind: 'code', vocabulary: STATUS_CODES, basis: 'PRD §22 b2 "status"' },
  error_code: { kind: 'error_code', basis: 'PRD §22 b2 "status"; PRD §34.9 error catalogue' },
  queue_class: { kind: 'code', vocabulary: QUEUE_CLASSES, basis: 'PRD §22 "job queues"; PRD §39.5' },

  // --- Measurements: PRD §22 b2 "latency, cost" ---------------------------------------------------
  latency_ms: { kind: 'duration_ms', basis: 'PRD §22 b2 "latency"' },
  cost_micro_aud: { kind: 'micro_aud', basis: 'PRD §22 b2 "cost"; PRD §34.1 integer micro-AUD' },
  attempt: { kind: 'count', basis: 'PRD §22 b2 — technical metadata (retry attempt)' },
  count: { kind: 'count', basis: 'PRD §22 b2 — technical metadata (result cardinality)' },
  degraded: { kind: 'bool', basis: 'PRD §22 — degradation is observable (OPS-002)' },

  // --- Hashes: PRD §22 b2 "hashes" ----------------------------------------------------------------
  artifact_sha256: {
    kind: 'hash',
    basis: 'PRD §22 b2 "hashes" — PUBLIC, IMMUTABLE artifact digests only (see FieldKind.hash)',
  },
} satisfies Record<string, FieldSpec>;

/** Every permitted log field name. Nothing else is a permitted key (RUNT-07 Deliverable 2). */
export type FieldName = keyof typeof SPECS;

/** The frozen allowlist, keyed by field name. */
export const FIELD_SPECS: Readonly<Record<FieldName, FieldSpec>> = Object.freeze(SPECS);

/** Every permitted field name, in declaration order. */
export const FIELD_NAMES: readonly FieldName[] = Object.freeze(
  Object.keys(SPECS) as FieldName[],
);

/** Whether `key` is an allowlisted field name. Own-property test: a prototype key is never a member. */
export function isFieldName(key: unknown): key is FieldName {
  return typeof key === 'string' && Object.hasOwn(SPECS, key);
}

/**
 * The fields a caller may supply, with each field's precise type.
 *
 * Written out rather than derived so a reader can see the whole permitted surface in one place;
 * `test/allowlist.test.ts` asserts these keys are exactly `FIELD_NAMES`, so the two cannot drift.
 *
 * OMIT a field you do not have — `exactOptionalPropertyTypes` rejects `{ request_id: undefined }`.
 */
export interface LogFields {
  readonly request_id?: string;
  readonly job_id?: string;
  readonly retrieval_id?: string;
  readonly model_call_id?: string;
  readonly answer_snapshot_id?: string;
  readonly organization_id?: string;
  readonly actor_kind?: ActorKind;
  readonly release_id?: string;
  readonly schema_version?: string;
  readonly corpus_release_id?: string;
  readonly event?: EventCode;
  readonly operation?: OperationCode;
  readonly status?: StatusCode;
  readonly error_code?: ErrorCode;
  readonly queue_class?: QueueClass;
  readonly latency_ms?: number;
  readonly cost_micro_aud?: number;
  readonly attempt?: number;
  readonly count?: number;
  readonly degraded?: boolean;
  readonly artifact_sha256?: string;
}

/** A value that has passed its kind check. Only these three types are ever serialised. */
export type FieldValue = string | number | boolean;

/** Whether `value` is a well-formed opaque id for `spec`. */
function isOpaqueId(value: unknown, prefix: string | null): boolean {
  if (typeof value !== 'string' || value.length > MAX_ID_LENGTH) return false;
  const at = value.indexOf('_');
  if (at <= 0 || at === value.length - 1) return false;
  const kind = value.slice(0, at);
  const uuid = value.slice(at + 1);
  if (!isUuidV7(uuid)) return false;
  if (prefix !== null) return kind === prefix;
  // No registered prefix (README §6 QR9): still require a registered-looking token, never a free string.
  return GENERIC_ID_PATTERN.test(value) && (isResourceKind(kind) || /^[a-z]{2,8}$/.test(kind));
}

/**
 * Whether `value` satisfies the declared kind of `name`.
 *
 * Returns a boolean and NOTHING derived from `value`: the caller (src/logger.ts) drops the field and
 * counts the drop, and the offending value is never rendered — not into a message, not into a
 * thrown error, not into a counter label.
 */
export function isValidFieldValue(name: FieldName, value: unknown): value is FieldValue {
  const spec = FIELD_SPECS[name];
  switch (spec.kind) {
    case 'opaque_id':
      return isOpaqueId(value, spec.prefix);
    case 'code':
      return typeof value === 'string' && spec.vocabulary.includes(value);
    case 'error_code':
      return isErrorCode(value);
    case 'count':
    case 'duration_ms':
      return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
    case 'micro_aud':
      return typeof value === 'number' && Number.isSafeInteger(value);
    case 'version':
      return typeof value === 'string' && VERSION_PATTERN.test(value);
    case 'hash':
      return typeof value === 'string' && HASH_PATTERN.test(value);
    case 'bool':
      return typeof value === 'boolean';
  }
}
