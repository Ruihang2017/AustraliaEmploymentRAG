/**
 * FND-07 — the one structural port this module declares (sub-PRD D11, PRD §9.1).
 *
 * The eight-level authority hierarchy and its comparator are FND-10 (`packages/domain/src/legal/**`).
 * This module compares authorities WITHOUT owning the ordering: the caller supplies the comparator and
 * `12-evidence-safety`/EVID-05 wires FND-10's export to it. Neither leaf imports the other (D10).
 *
 * Consequently `src/answers/**` contains no rank constant, no ordered level array and no index lookup
 * of any kind — including an index lookup into the contracts authority-level array, which would be
 * owning the hierarchy by the back door because that array's order IS the §9.1 ordering. A test
 * asserts the absence (and, so that the test can be strict, this comment does not spell the
 * constant's name or the lookup out).
 *
 * Contract: returns `-1` when `a` is LOWER authority than `b`, `0` when equal, `1` when higher — the
 * ordinary comparator convention, and the signature the ticket fixes. The comparator is
 * caller-supplied and therefore untrusted: callers here treat its result through `Math.sign`, call it
 * pairwise only (never through `Array.prototype.sort`, which is implementation-defined for an
 * inconsistent comparator), and let a throwing comparator propagate rather than silently degrading a
 * legal answer to `NOT_SUPPORTED`.
 */
import type { AuthorityLevel } from './types.js';

export type AuthorityComparator = (a: AuthorityLevel, b: AuthorityLevel) => -1 | 0 | 1;
