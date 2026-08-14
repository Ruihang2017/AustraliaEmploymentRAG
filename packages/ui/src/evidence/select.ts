/**
 * The pure selection helpers behind `EvidencePanel`.
 *
 * WHY THEY ARE SEPARATE AND PURE (risk R2). "Only evidence relevant to the selected candidate"
 * (PRD §32.4) and "the selected claim's citations" (PRD §32.3) are ABSENCE properties: the wrong
 * record's evidence must not be in the DOM at all. Filtering before render — rather than rendering
 * everything and hiding the rest — makes that structurally true instead of a CSS accident, and makes
 * it unit-testable without a renderer. A hidden node is still in the DOM, still in the copy buffer,
 * and still readable by a screen reader that ignores the wrong attribute.
 */
import type { Citation, Claim, OpaqueId } from '../contracts.js';
import type { CandidateEvidence } from './types.js';

/**
 * The citations a claim cites, in the claim's own `citation_ids` order.
 *
 * An id with no matching citation is DROPPED, never substituted: a claim that references a citation
 * the caller did not supply shows fewer citations, never someone else's.
 */
export function selectClaimEvidence<C extends Citation>(
  claim: Claim | undefined,
  citations: readonly C[],
): readonly C[] {
  if (claim === undefined) return [];
  const byId = new Map(citations.map((citation) => [citation.id, citation]));
  return claim.citation_ids
    .map((id) => byId.get(id))
    .filter((citation): citation is C => citation !== undefined);
}

/**
 * The citations reachable from ONE candidate.
 *
 * Every other candidate's evidence is excluded here, before anything renders. An unknown
 * `candidateId` yields the empty list — never "all of them" and never "the first one".
 */
export function selectCandidateEvidence<C extends Citation>(
  candidateId: OpaqueId | undefined,
  evidence: readonly CandidateEvidence[],
  citations: readonly C[],
): readonly C[] {
  if (candidateId === undefined) return [];
  const entry = evidence.find((item) => item.candidateId === candidateId);
  if (entry === undefined) return [];
  const allowed = new Set(entry.citationIds);
  return citations.filter((citation) => allowed.has(citation.id));
}

/**
 * The selected citation, ONLY IF it is one of `available`.
 *
 * A stale or attacker-influenced `selectedCitationId` that belongs to a different claim or candidate
 * resolves to `undefined`, and the panel renders its labelled empty state (risk R2).
 */
export function selectCitation<C extends Citation>(
  selectedCitationId: OpaqueId | undefined,
  available: readonly C[],
): C | undefined {
  if (selectedCitationId === undefined) return undefined;
  return available.find((citation) => citation.id === selectedCitationId);
}

/** Versions in effective-date order, oldest first, without mutating the caller's array. */
export function orderByEffectiveFrom<T extends { readonly effective_from: string }>(
  versions: readonly T[],
): readonly T[] {
  return [...versions].sort((a, b) =>
    a.effective_from < b.effective_from ? -1 : a.effective_from > b.effective_from ? 1 : 0,
  );
}
