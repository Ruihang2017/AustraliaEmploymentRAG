/**
 * Record immutability predicates (FND-08 deliverable 5).
 *
 * PRD §32.6 (docs/PRD.md line 1669-1670): *"The Timeline is append-only. Editable title/tags/
 * assignments use ETag; formal turns/answers are never edited."*
 * PRD §8.7: *"Research turns MUST be immutable; corrections supersede rather than overwrite prior
 * turns."* and *"Formal answers MUST be immutable Answer Snapshots."*
 *
 * Widening `EDITABLE_FIELDS` is a product change (PRD §45.5) and must be raised through FND-08's
 * Feedback obligation 4 — never widened inside `17-records-collab`.
 */

/**
 * The three §32.6 editable categories, exactly as the PRD names them. `assignments` is a category;
 * its concrete columns are `ASSIGNMENT_FIELDS`.
 */
export const EDITABLE_FIELDS = Object.freeze(['title', 'tags', 'assignments'] as const);

export type EditableField = (typeof EDITABLE_FIELDS)[number];

/**
 * The expansion of the `assignments` category, spelled as PRD §34.7's create payload and §35.4's
 * `research_record` columns do, so DATA-06 and RCRD-04 need no second mapping.
 */
export const ASSIGNMENT_FIELDS = Object.freeze(['owner_user_id', 'reviewer_user_id'] as const);

/**
 * The concrete field names an ETag-guarded record edit may target: the two non-category members of
 * `EDITABLE_FIELDS` plus the expansion of `assignments`.
 *
 * A `Set`, never `field in someObject`: an object-literal membership test makes
 * `isEditableField('toString')` and `isEditableField('__proto__')` true through the prototype chain,
 * which would silently authorise a write to a field the PRD forbids editing.
 */
const EDITABLE_FIELD_NAMES: ReadonlySet<string> = new Set<string>([
  'title',
  'tags',
  ...ASSIGNMENT_FIELDS,
]);

export function isEditableField(field: string): boolean {
  return typeof field === 'string' && EDITABLE_FIELD_NAMES.has(field);
}

/** The artifact kinds PRD §8.7 declares immutable. Corrections supersede; they never overwrite. */
export const FORMAL_ARTIFACT_KINDS = Object.freeze(['RESEARCH_TURN', 'ANSWER_SNAPSHOT'] as const);

const FORMAL_ARTIFACT_KIND_NAMES: ReadonlySet<string> = new Set<string>(FORMAL_ARTIFACT_KINDS);

/**
 * `IMMUTABLE_RESOURCE` for a research turn or an answer snapshot, `OK` for anything else.
 *
 * Returns a union rather than throwing, despite the name, so the caller composes it with the other
 * checks in this module. `IMMUTABLE_RESOURCE` is a **local domain reason token**, not a
 * `packages/contracts` `ErrorCode` — PRD §34.9 has no such member (FND-08 open question Q8). RCRD-04
 * chooses the §34.9 code it maps to.
 */
export function assertNotFormalArtifact(kind: string): 'OK' | 'IMMUTABLE_RESOURCE' {
  return typeof kind === 'string' && FORMAL_ARTIFACT_KIND_NAMES.has(kind)
    ? 'IMMUTABLE_RESOURCE'
    : 'OK';
}

/**
 * PRD §32.6 line 1669: *"The Timeline is append-only."*
 *
 * Exported as an invariant that both the record repository (`01-app-data`/DATA-06) and the record
 * screens (`17-records-collab`/RCRD-08) cite, so neither restates the rule in its own words.
 */
export const TIMELINE_IS_APPEND_ONLY = true;
