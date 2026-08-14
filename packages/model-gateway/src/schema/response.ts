/**
 * EVID-07 deliverable 9 — strict PRD §36.5 validation.
 *
 * WHAT THIS IS NOT: there is no salvage path, no partial acceptance, no "retry with a nudge" and no
 * coercion. A response either matches §36.5 exactly or it is a schema failure, and a schema failure
 * becomes `Unavailable{reason: 'SCHEMA_INVALID'}` (PRD §37.5: *"Returned JSON is schema-validated"*).
 * `EVID-05` re-validates independently against the pack; this is the gateway's own gate, not a
 * substitute for it.
 *
 * UNKNOWN PROPERTIES ARE REJECTED AT EVERY LEVEL. That is how PRD §9.4 (*"Hidden chain-of-thought
 * MUST NOT be requested, stored or displayed"*, sub-PRD D14) is enforced: a `reasoning`, `thinking`,
 * `chain_of_thought`, `scratchpad` or `analysis` member is a FAILURE, never a dropped extra. Dropping
 * it would mean the field was received and handled, which is exactly what §9.4 forbids — and a
 * silently-dropped field is a field somebody will later be tempted to log.
 *
 * FAILURES CARRY A PATH, NEVER A VALUE. `{ path: 'claims[0].reasoning' }` and nothing else. Echoing
 * the offending text would put provider output — which may contain customer facts or source text —
 * into an error message, a log line or a recorded row (PRD §37.3, §35.6; plan §6 risk 6).
 *
 * Hand-written on purpose. A schema library would be a new npm dependency, would regenerate
 * `pnpm-lock.yaml`, and would put a non-relative import into `src/**`, weakening the strongest
 * available form of the no-tool architecture test for a closed, ~200-line shape.
 */
import {
  isAnswerStatus,
  isCitationRole,
  isClaimSupport,
} from './contracts.js';
import type { AnswerStatus, CitationRole, ClaimSupport } from './contracts.js';
import { isClaimKind } from './kinds.js';
import type { ClaimKind } from './kinds.js';

export interface ModelCitation {
  readonly evidence_id: string;
  readonly role: CitationRole;
  readonly quote_start: number;
  readonly quote_end: number;
}

export interface ModelClaim {
  readonly kind: ClaimKind;
  readonly text: string;
  readonly support: ClaimSupport;
  readonly evidence: readonly ModelCitation[];
  readonly assumption_refs: readonly number[];
}

export interface ModelAssumption {
  readonly text: string;
  /**
   * PRD §36.5's example carries `"source": "USER_NOT_CONFIRMED"`. The PRD does not fix a closed list,
   * so this is validated as a non-empty string rather than against an enum invented here — baking a
   * vocabulary the spec does not state would be spec written in code (CLAUDE.md, issue #53).
   */
  readonly source: string;
  readonly impact_if_false: string;
}

export interface ModelResponse {
  readonly proposed_status: AnswerStatus;
  readonly short_answer: string;
  readonly claims: readonly ModelClaim[];
  readonly assumptions: readonly ModelAssumption[];
  readonly missing_facts: readonly string[];
  readonly next_checks: readonly string[];
  readonly limitations: readonly string[];
}

export type SchemaFailureCode =
  | 'EMPTY_BODY'
  | 'MALFORMED_JSON'
  | 'NOT_AN_OBJECT'
  | 'MISSING_PROPERTY'
  | 'UNKNOWN_PROPERTY'
  | 'REASONING_FIELD_REJECTED'
  | 'WRONG_TYPE'
  | 'NOT_IN_ENUM'
  | 'NOT_AN_INTEGER'
  | 'DANGLING_REFERENCE';

export interface SchemaOk {
  readonly ok: true;
  readonly value: ModelResponse;
}

export interface SchemaFailure {
  readonly ok: false;
  readonly code: SchemaFailureCode;
  /** JSON-pointer-ish path to the offending position, e.g. `claims[0].evidence[1].role`. Never a value. */
  readonly path: string;
}

export type SchemaResult = SchemaOk | SchemaFailure;

/**
 * The reasoning family, named so the rejection is legible rather than incidental. Any unknown property
 * fails; these fail with their own code so a test — and a reviewer — can see §9.4 being enforced.
 */
export const REASONING_FIELD_NAMES = Object.freeze([
  'reasoning',
  'reasoning_content',
  'thinking',
  'thought',
  'thoughts',
  'chain_of_thought',
  'chainOfThought',
  'scratchpad',
  'analysis',
  'deliberation',
  'inner_monologue',
  'rationale_trace',
] as const);

const REASONING_SET: ReadonlySet<string> = new Set(REASONING_FIELD_NAMES);

export const isReasoningFieldName = (name: string): boolean => REASONING_SET.has(name);

const RESPONSE_KEYS = [
  'proposed_status',
  'short_answer',
  'claims',
  'assumptions',
  'missing_facts',
  'next_checks',
  'limitations',
] as const;
const CLAIM_KEYS = ['kind', 'text', 'support', 'evidence', 'assumption_refs'] as const;
const CITATION_KEYS = ['evidence_id', 'role', 'quote_start', 'quote_end'] as const;
const ASSUMPTION_KEYS = ['text', 'source', 'impact_if_false'] as const;

const fail = (code: SchemaFailureCode, path: string): SchemaFailure => ({ ok: false, code, path });

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Missing keys first, then unknown keys — so a truncated object reports what it lacks, not what it has. */
function checkKeys(
  object: Record<string, unknown>,
  allowed: readonly string[],
  path: string,
): SchemaFailure | null {
  for (const key of allowed) {
    if (!Object.prototype.hasOwnProperty.call(object, key)) {
      return fail('MISSING_PROPERTY', `${path}.${key}`);
    }
  }
  for (const key of Object.keys(object)) {
    if (allowed.includes(key)) continue;
    return fail(
      isReasoningFieldName(key) ? 'REASONING_FIELD_REJECTED' : 'UNKNOWN_PROPERTY',
      `${path}.${key}`,
    );
  }
  return null;
}

function checkStringArray(value: unknown, path: string): SchemaFailure | null {
  if (!Array.isArray(value)) return fail('WRONG_TYPE', path);
  for (const [index, entry] of value.entries()) {
    if (typeof entry !== 'string') return fail('WRONG_TYPE', `${path}[${String(index)}]`);
  }
  return null;
}

function checkCitation(value: unknown, path: string): SchemaFailure | null {
  if (!isPlainObject(value)) return fail('NOT_AN_OBJECT', path);
  const keyProblem = checkKeys(value, CITATION_KEYS, path);
  if (keyProblem) return keyProblem;
  if (typeof value.evidence_id !== 'string' || value.evidence_id.length === 0) {
    return fail('WRONG_TYPE', `${path}.evidence_id`);
  }
  if (typeof value.role !== 'string') return fail('WRONG_TYPE', `${path}.role`);
  if (!isCitationRole(value.role)) return fail('NOT_IN_ENUM', `${path}.role`);
  for (const key of ['quote_start', 'quote_end'] as const) {
    const offset = value[key];
    if (typeof offset !== 'number') return fail('WRONG_TYPE', `${path}.${key}`);
    if (!Number.isInteger(offset) || offset < 0) return fail('NOT_AN_INTEGER', `${path}.${key}`);
  }
  if ((value.quote_end as number) < (value.quote_start as number)) {
    return fail('NOT_AN_INTEGER', `${path}.quote_end`);
  }
  return null;
}

function checkClaim(value: unknown, path: string, assumptionCount: number): SchemaFailure | null {
  if (!isPlainObject(value)) return fail('NOT_AN_OBJECT', path);
  const keyProblem = checkKeys(value, CLAIM_KEYS, path);
  if (keyProblem) return keyProblem;
  if (typeof value.kind !== 'string') return fail('WRONG_TYPE', `${path}.kind`);
  if (!isClaimKind(value.kind)) return fail('NOT_IN_ENUM', `${path}.kind`);
  if (typeof value.text !== 'string') return fail('WRONG_TYPE', `${path}.text`);
  if (typeof value.support !== 'string') return fail('WRONG_TYPE', `${path}.support`);
  if (!isClaimSupport(value.support)) return fail('NOT_IN_ENUM', `${path}.support`);

  if (!Array.isArray(value.evidence)) return fail('WRONG_TYPE', `${path}.evidence`);
  for (const [index, citation] of value.evidence.entries()) {
    const problem = checkCitation(citation, `${path}.evidence[${String(index)}]`);
    if (problem) return problem;
  }

  if (!Array.isArray(value.assumption_refs)) return fail('WRONG_TYPE', `${path}.assumption_refs`);
  for (const [index, reference] of value.assumption_refs.entries()) {
    const at = `${path}.assumption_refs[${String(index)}]`;
    if (typeof reference !== 'number') return fail('WRONG_TYPE', at);
    if (!Number.isInteger(reference) || reference < 0) return fail('NOT_AN_INTEGER', at);
    // A reference to an assumption that was not returned is a dangling reference, not a warning.
    if (reference >= assumptionCount) return fail('DANGLING_REFERENCE', at);
  }
  return null;
}

function checkAssumption(value: unknown, path: string): SchemaFailure | null {
  if (!isPlainObject(value)) return fail('NOT_AN_OBJECT', path);
  const keyProblem = checkKeys(value, ASSUMPTION_KEYS, path);
  if (keyProblem) return keyProblem;
  for (const key of ASSUMPTION_KEYS) {
    const entry = value[key];
    if (typeof entry !== 'string') return fail('WRONG_TYPE', `${path}.${key}`);
  }
  if ((value.source as string).length === 0) return fail('WRONG_TYPE', `${path}.source`);
  return null;
}

/**
 * Parse and validate a model response.
 *
 * Accepts either the raw body as a string (the transport's normal case — malformed or truncated JSON
 * fails at `$`) or an already-parsed value. Nothing about the input is retried, repaired or trimmed.
 */
export function parseModelResponse(input: unknown): SchemaResult {
  let candidate: unknown = input;

  if (typeof input === 'string') {
    if (input.trim().length === 0) return fail('EMPTY_BODY', '$');
    try {
      candidate = JSON.parse(input);
    } catch {
      // The parser's own message can quote the offending text; it is deliberately not carried through.
      return fail('MALFORMED_JSON', '$');
    }
  }

  if (input === undefined || input === null) return fail('EMPTY_BODY', '$');
  if (!isPlainObject(candidate)) return fail('NOT_AN_OBJECT', '$');

  const keyProblem = checkKeys(candidate, RESPONSE_KEYS, '$');
  if (keyProblem) return keyProblem;

  if (typeof candidate.proposed_status !== 'string') return fail('WRONG_TYPE', '$.proposed_status');
  if (!isAnswerStatus(candidate.proposed_status)) return fail('NOT_IN_ENUM', '$.proposed_status');
  if (typeof candidate.short_answer !== 'string') return fail('WRONG_TYPE', '$.short_answer');

  if (!Array.isArray(candidate.assumptions)) return fail('WRONG_TYPE', '$.assumptions');
  for (const [index, assumption] of candidate.assumptions.entries()) {
    const problem = checkAssumption(assumption, `$.assumptions[${String(index)}]`);
    if (problem) return problem;
  }

  if (!Array.isArray(candidate.claims)) return fail('WRONG_TYPE', '$.claims');
  for (const [index, claim] of candidate.claims.entries()) {
    const problem = checkClaim(claim, `$.claims[${String(index)}]`, candidate.assumptions.length);
    if (problem) return problem;
  }

  for (const key of ['missing_facts', 'next_checks', 'limitations'] as const) {
    const problem = checkStringArray(candidate[key], `$.${key}`);
    if (problem) return problem;
  }

  return { ok: true, value: candidate as unknown as ModelResponse };
}
