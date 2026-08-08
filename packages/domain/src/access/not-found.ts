/**
 * FND-06 deliverable 4 — the not-found equivalence class.
 *
 * PRD §16.5: *"Other-tenant and absent opaque IDs return the same not-found response."* The domain
 * must therefore never hand the boundary a reason that distinguishes them, and `RUNT-02` maps this
 * class to the single §34.9 `RESOURCE_NOT_FOUND`.
 *
 * `describeForBoundary` is what makes "identical caller-visible information" mechanically testable
 * rather than a promise: for every member of the class it returns the SAME frozen value, so a test can
 * assert deep equality instead of eyeballing two reasons. It adds no permission rule and hides
 * nothing from the caller of `evaluate()`, which still sees the precise reason for audit (`DATA-07`)
 * and for logs — the projection is what crosses the wire, not what crosses the function boundary.
 */
import type { Permission } from './contracts.js';
import { deepFreeze } from './deep-freeze.js';
import type { Decision, DenyReason } from './evaluate.js';

/** The reasons a caller must not be able to tell apart (PRD §16.5). */
export const INDISTINGUISHABLE_NOT_FOUND_REASONS: readonly DenyReason[] = deepFreeze([
  'CROSS_ORGANIZATION',
  'RESOURCE_ABSENT',
]);

export interface NotFoundProjection {
  readonly outcome: 'NOT_FOUND';
}

export interface DeniedProjection {
  readonly outcome: 'DENIED';
  readonly reason: DenyReason;
}

export interface AllowedProjection {
  readonly outcome: 'ALLOWED';
  readonly via: Permission;
}

export type BoundaryProjection = NotFoundProjection | DeniedProjection | AllowedProjection;

/** One shared frozen value, so every member of the class is byte-for-byte the same answer. */
export const NOT_FOUND_PROJECTION: NotFoundProjection = deepFreeze({ outcome: 'NOT_FOUND' as const });

export function isIndistinguishableNotFound(decision: Decision): boolean {
  if (decision.allowed) return false;
  return INDISTINGUISHABLE_NOT_FOUND_REASONS.includes(decision.reason);
}

/** What the boundary is allowed to learn. Carries no id, no organisation and no cell text. */
export function describeForBoundary(decision: Decision): BoundaryProjection {
  if (decision.allowed) return deepFreeze({ outcome: 'ALLOWED' as const, via: decision.via });
  if (isIndistinguishableNotFound(decision)) return NOT_FOUND_PROJECTION;
  return deepFreeze({ outcome: 'DENIED' as const, reason: decision.reason });
}
