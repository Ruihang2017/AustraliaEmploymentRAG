/**
 * FND-08 acceptance item 8 and deliverable 6 — `[machine]` immutability predicates and the
 * `CUSTOMER_REVIEWED` semantics constant.
 */
import { describe, expect, it } from 'vitest';

import {
  ASSIGNMENT_FIELDS,
  EDITABLE_FIELDS,
  FORMAL_ARTIFACT_KINDS,
  TIMELINE_IS_APPEND_ONLY,
  assertNotFormalArtifact,
  isEditableField,
} from '../../src/workflow/immutability.js';
import { CUSTOMER_REVIEWED_SEMANTICS } from '../../src/workflow/customer-reviewed.js';

describe('EDITABLE_FIELDS', () => {
  it('contains exactly the three PRD §32.6 categories', () => {
    expect([...EDITABLE_FIELDS]).toEqual(['title', 'tags', 'assignments']);
    expect(EDITABLE_FIELDS).toHaveLength(3);
    expect(Object.isFrozen(EDITABLE_FIELDS)).toBe(true);
  });

  it('expands `assignments` to the PRD §34.7 / §35.4 column names', () => {
    expect([...ASSIGNMENT_FIELDS]).toEqual(['owner_user_id', 'reviewer_user_id']);
    expect(Object.isFrozen(ASSIGNMENT_FIELDS)).toBe(true);
  });

  it('cannot be widened at runtime', () => {
    expect(() => {
      (EDITABLE_FIELDS as unknown as string[]).push('legal_context');
    }).toThrow(TypeError);
  });
});

describe('isEditableField', () => {
  it('is true for title, tags and the assignment fields', () => {
    for (const field of ['title', 'tags', 'owner_user_id', 'reviewer_user_id']) {
      expect(isEditableField(field), `${field} should be editable`).toBe(true);
    }
  });

  it('is false for every other record field', () => {
    for (const field of [
      'workflow_status',
      'legal_context',
      'row_version',
      'created_at',
      'updated_at',
      'id',
      'owner',
      'reviewer',
      'assignments',
      'correction_badge',
      '',
      'TITLE',
      ' title',
    ]) {
      expect(isEditableField(field), `${field} must not be editable`).toBe(false);
    }
  });

  it('is not reachable through the prototype chain', () => {
    for (const key of ['toString', 'hasOwnProperty', '__proto__', 'constructor', 'valueOf']) {
      expect(isEditableField(key), `${key} leaked through the prototype chain`).toBe(false);
    }
  });

  it('is false for non-string input', () => {
    for (const value of [undefined, null, 7, {}, []]) {
      expect(isEditableField(value as unknown as string)).toBe(false);
    }
  });
});

describe('assertNotFormalArtifact', () => {
  it('rejects a research turn and an answer snapshot with IMMUTABLE_RESOURCE', () => {
    expect(assertNotFormalArtifact('RESEARCH_TURN')).toBe('IMMUTABLE_RESOURCE');
    expect(assertNotFormalArtifact('ANSWER_SNAPSHOT')).toBe('IMMUTABLE_RESOURCE');
    expect([...FORMAL_ARTIFACT_KINDS]).toEqual(['RESEARCH_TURN', 'ANSWER_SNAPSHOT']);
  });

  it('returns OK for anything else', () => {
    for (const kind of ['COMMENT', 'RECORD', '', 'research_turn', '__proto__', 'toString']) {
      expect(assertNotFormalArtifact(kind), kind).toBe('OK');
    }
    expect(assertNotFormalArtifact(undefined as unknown as string)).toBe('OK');
  });
});

describe('exported invariants', () => {
  it('states that the Timeline is append-only (PRD §32.6)', () => {
    expect(TIMELINE_IS_APPEND_ONLY).toBe(true);
  });

  it('carries the PRD §8.7 CUSTOMER_REVIEWED meaning verbatim', () => {
    expect(CUSTOMER_REVIEWED_SEMANTICS).toContain('customer-internal review');
    expect(CUSTOMER_REVIEWED_SEMANTICS).toContain('MUST NOT imply legal verification');
    expect(CUSTOMER_REVIEWED_SEMANTICS).toContain('product owner or a lawyer');
  });
});
