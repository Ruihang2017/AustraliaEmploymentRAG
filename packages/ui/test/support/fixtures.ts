/**
 * Typed loaders for the committed fixtures under `test/fixtures/`.
 *
 * Read from disk rather than `import ... with { type: 'json' }`: the shared `tsconfig.base.json`
 * does not set `resolveJsonModule`, and it is `00-foundation`'s file — outside this ticket's
 * File-scope. Reading the bytes has a second benefit anyway: the committed file is what the test
 * exercises, byte for byte, with no bundler transform in between.
 *
 * Each loader annotates its result with the CONTRACTS type, so a drift in the generated schema
 * breaks `pnpm typecheck` here rather than a render assertion somewhere downstream.
 */
import type {
  AnswerSnapshot,
  Citation,
  CoverageCandidateSummary,
} from '../../src/contracts.js';
import type { CandidateEvidence, SourceDetail } from '../../src/evidence/types.js';
import { readPackageFile } from './paths.js';

function loadJson(name: string): unknown {
  return JSON.parse(readPackageFile('test', 'fixtures', name));
}

export type XssFixture = {
  readonly canary: string;
  readonly cases: readonly { readonly id: string; readonly source: string }[];
};

export function xssFixture(): XssFixture {
  return loadJson('xss.json') as XssFixture;
}

/** PRD §34.5-shaped. Typed as the generated `AnswerSnapshot`, so schema drift is a typecheck error. */
export function answerSnapshotFixture(): AnswerSnapshot {
  return loadJson('answer-snapshot.json') as AnswerSnapshot;
}

export type EvidencePackFixture = {
  readonly evidence_pack_id: string;
  readonly answer_id: string;
  readonly citations: readonly Citation[];
};

/** PRD §36.4-shaped, referencing the same citation ids as the answer snapshot. */
export function evidencePackFixture(): EvidencePackFixture {
  return loadJson('evidence-pack.json') as EvidencePackFixture;
}

/** PRD §32.1 detail-panel data. */
export function searchDetailFixture(): SourceDetail {
  return loadJson('search-detail.json') as SourceDetail;
}

export type CoverageCandidateFixture = {
  readonly candidates: readonly CoverageCandidateSummary[];
  readonly evidence: readonly CandidateEvidence[];
  readonly citations: readonly Citation[];
};

/** PRD §32.4 — deliberately TWO candidates with disjoint citation sets. */
export function coverageCandidateFixture(): CoverageCandidateFixture {
  return loadJson('coverage-candidate.json') as CoverageCandidateFixture;
}
