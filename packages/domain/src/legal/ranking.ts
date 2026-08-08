/**
 * FND-10 deliverable 6 — the PRD §36.3 ranking feature ORDER and the "no filtered item reintroduced"
 * invariant.
 *
 * PRD §36.3: *"The versioned ranker considers, in this order of safety precedence: 1. exact identifier
 * and pinpoint match; 2. hard applicability pass; 3. authority level and binding/persuasive role;
 * 4. direct subject/topic match; 5. lexical rank; 6. dense/rerank relevance; 7. relationship relevance
 * (amends, applies, interprets, replaces); 8. source freshness and parser quality."* and *"No learned
 * score may reintroduce a filtered item or turn regulator guidance into higher authority than the
 * operative legislation/instrument it explains."*
 *
 * ORDER ONLY, NO NUMBERS. `RANKING_FEATURE_ORDER` is an array of string identifiers: the position IS
 * the data. Every retrieval profile constant — lexical and dense candidate counts, rank-fusion weights,
 * rerank depth, evidence-node counts — is breakdown plan §8 Q4, a benchmark-selected parameter owned by
 * `11-retrieval-engine` and recorded through `RETR-10`/`GOLD-15`. Freezing one here would fix a
 * measured value in the wrong module; if `RETR-10` asks for one to live here, the answer is no (ticket
 * Feedback obligation 7). The verbatim §36.3 prose for each feature lives in
 * `test/legal/prd-36-3-features.json`, not in this constant.
 */
import { deepFreeze } from './deep-freeze.js';

/**
 * The eight §36.3 features in the PRD's order of SAFETY PRECEDENCE. Assert this as an ARRAY, never as
 * a set: a reordered copy silently deletes the rule it encodes.
 */
export const RANKING_FEATURE_ORDER = deepFreeze([
  'EXACT_IDENTIFIER_AND_PINPOINT_MATCH',
  'HARD_APPLICABILITY_PASS',
  'AUTHORITY_LEVEL_AND_BINDING_ROLE',
  'DIRECT_SUBJECT_TOPIC_MATCH',
  'LEXICAL_RANK',
  'DENSE_RERANK_RELEVANCE',
  'RELATIONSHIP_RELEVANCE',
  'SOURCE_FRESHNESS_AND_PARSER_QUALITY',
] as const);

export type RankingFeature = (typeof RANKING_FEATURE_ORDER)[number];

export interface Violation {
  /** The id that appears after ranking but was not in the eligible set. */
  readonly id: string;
  /** 0-based position of that id in `postRankIds`. */
  readonly position: number;
}

/**
 * PRD §36.3 *"No learned score may reintroduce a filtered item"* — `11-retrieval-engine` calls this
 * after fusion and rerank.
 *
 * `preFilterIds` is the ELIGIBLE set: what survived the PRD §36.2 hard filter. Every `postRankIds`
 * entry absent from it is a violation, reported in post-rank order with its 0-based position.
 *
 * EXACT, CASE-SENSITIVE string comparison, and deliberately no normalisation: no trim, no case fold,
 * no unicode normalisation. This is the last line of defence against a learned score smuggling an
 * ineligible item into an evidence pack, and a "helpful" normalisation here is an id-collision
 * vulnerability — `'doc_A'` would be admitted on the strength of `'doc_a'` having passed.
 *
 * An empty `preFilterIds` with a non-empty `postRankIds` yields one violation per post-rank id. That is
 * the correct answer (nothing was eligible, so everything ranked is a reintroduction), not an edge case
 * to special-case away. Total: never throws; non-string entries are reported as violations.
 */
export function assertNoFilteredItemReintroduced(
  preFilterIds: readonly string[],
  postRankIds: readonly string[],
): Violation[] {
  const violations: Violation[] = [];
  if (!Array.isArray(postRankIds)) return violations;
  const eligible = new Set<string>(
    Array.isArray(preFilterIds) ? preFilterIds.filter((id) => typeof id === 'string') : [],
  );
  for (let position = 0; position < postRankIds.length; position += 1) {
    const id = postRankIds[position];
    if (typeof id !== 'string') {
      violations.push({ id: String(id), position });
      continue;
    }
    if (!eligible.has(id)) violations.push({ id, position });
  }
  return violations;
}
