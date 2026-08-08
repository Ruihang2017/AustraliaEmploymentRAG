/**
 * Fixture drift (ticket deliverable 15; PRD §34 preamble).
 *
 * Two halves, and the pair is what makes the replays non-vacuous:
 *
 * - **runtime** — every recorded body under `test/fixtures/http/` re-derives BYTE-FOR-BYTE from its
 *   source in `schemas/openapi/examples/**` under the committed placeholder map. A contract change
 *   fails here loudly rather than leaving a stale replay behind.
 * - **compile time** — `test/fixtures/typed.ts` annotates the same bodies with the GENERATED types,
 *   so a removed field, a renamed field or a narrowed enum is a `pnpm typecheck` failure. This suite
 *   asserts the typed values deep-equal the recorded JSON, which is what ties the two halves together.
 */
import { describe, expect, it } from 'vitest';

import { fixtureJson, fixtureText, openApiExampleText, readJson } from '../support/repo.js';
import { join } from 'node:path';
import { FIXTURES_DIR } from '../support/repo.js';
import {
  answerJobAccepted,
  answerSnapshot,
  clarificationRequired,
  createAnswerJobRequest,
  searchRequest,
  searchResponse,
} from './typed.js';

interface PlaceholderFile {
  readonly placeholders: Readonly<Record<string, string>>;
  readonly sources: Readonly<Record<string, string>>;
}

const map = readJson<PlaceholderFile>(join(FIXTURES_DIR, 'placeholders.json'));

/** Longest key first, so no key is a prefix-shadow of another. */
function substitute(text: string, placeholders: Readonly<Record<string, string>>): string {
  const keys = Object.keys(placeholders).sort((a, b) => b.length - a.length);
  let out = text;
  for (const key of keys) out = out.split(key).join(placeholders[key] as string);
  return out;
}

describe('recorded HTTP bodies re-derive from schemas/openapi/examples/**', () => {
  it.each(Object.entries(map.sources))('%s derives from %s, byte for byte', (target, source) => {
    expect(fixtureText(`http/${target}`)).toBe(substitute(openApiExampleText(source), map.placeholders));
  });

  it('actually substituted something, so the derivation is not the identity', () => {
    for (const source of Object.values(map.sources)) {
      const original = openApiExampleText(source);
      const derived = substitute(original, map.placeholders);
      if (original.includes('_...') || original.includes('example/...')) expect(derived).not.toBe(original);
    }
    expect(fixtureText('http/answer-job-accepted.json')).not.toContain('job_...');
  });

  it('leaves no placeholder behind in any recorded body', () => {
    for (const target of Object.keys(map.sources)) {
      expect(fixtureText(`http/${target}`), target).not.toContain('_...');
    }
  });
});

describe('typed fixtures equal their recorded bodies', () => {
  it.each([
    ['search-request.json', searchRequest],
    ['search-response.json', searchResponse],
    ['create-answer-job.json', createAnswerJobRequest],
    ['answer-job-accepted.json', answerJobAccepted],
    ['clarification-response.json', clarificationRequired],
    ['answer-snapshot.json', answerSnapshot],
  ] as const)('%s', (name, value) => {
    expect(fixtureJson(`http/${name}`)).toEqual(value);
  });
});
