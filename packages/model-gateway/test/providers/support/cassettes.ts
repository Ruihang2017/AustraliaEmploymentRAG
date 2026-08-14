/**
 * EVID-07 — the cassette loader.
 *
 * Reading from disk is TEST-tree work: `src/**` can neither read a file nor open a socket, which is
 * the whole point of the cassette transport taking its recordings as a plain array.
 *
 * `costMicroAud` arrives as a decimal string and is parsed with `BigInt(...)`: `JSON.parse` routes
 * numbers through a double, which is exactly the floating-point money PRD §34.1 forbids.
 *
 * Not a `*.test.*` file.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { PACKAGE_ROOT, readJson } from './fixture.js';
import { SCENARIO_HEADER, createCassetteTransport } from '../../../src/providers/transport/cassette.js';
import type { Cassette } from '../../../src/providers/transport/cassette.js';
import type { Transport } from '../../../src/providers/transport/types.js';

interface CassetteEntry {
  readonly profileId: string;
  readonly scenarioKey: string;
  readonly body?: string;
  readonly bodyFixture?: string;
  readonly status: number;
  readonly headersSubset: Readonly<Record<string, string>>;
  readonly modelVersion: string | null;
  readonly inputTokens: number | null;
  readonly outputTokens: number | null;
  readonly costMicroAud: string | null;
}

interface CassetteIndex {
  readonly packId: string;
  readonly packHash: string;
  readonly instructionTemplateVersion: string;
  readonly providerId: string;
  readonly cassettes: readonly CassetteEntry[];
}

const CASSETTE_DIR = join(PACKAGE_ROOT, 'test', 'providers', 'cassettes');
const SCHEMA_FIXTURE_DIR = join(PACKAGE_ROOT, 'test', 'schema', 'fixtures');

export const CASSETTE_INDEX = readJson<CassetteIndex>(CASSETTE_DIR, 'index.json');

function bodyOf(entry: CassetteEntry): string {
  if (entry.bodyFixture !== undefined) {
    return JSON.stringify(JSON.parse(readFileSync(join(SCHEMA_FIXTURE_DIR, entry.bodyFixture), 'utf8')));
  }
  return entry.body ?? '';
}

export function loadCassettes(): Cassette[] {
  return CASSETTE_INDEX.cassettes.map((entry) => ({
    key: {
      providerId: CASSETTE_INDEX.providerId,
      profileId: entry.profileId,
      instructionTemplateVersion: CASSETTE_INDEX.instructionTemplateVersion,
      packId: CASSETTE_INDEX.packId,
      packHash: CASSETTE_INDEX.packHash,
      scenarioKey: entry.scenarioKey,
    },
    response: {
      status: entry.status,
      headersSubset: entry.headersSubset,
      body: bodyOf(entry),
      modelVersion: entry.modelVersion,
      inputTokens: entry.inputTokens,
      outputTokens: entry.outputTokens,
      costMicroAud: entry.costMicroAud === null ? null : BigInt(entry.costMicroAud),
    },
  }));
}

/** The header that selects which recorded scenario a call replays. */
export const scenarioHeaders = (scenarioKey: string): Readonly<Record<string, string>> => ({
  [SCENARIO_HEADER]: scenarioKey,
});

/**
 * A cassette transport pinned to one recorded scenario.
 *
 * The scenario is chosen by the TEST, not by the gateway: `generate` builds its adapter with an empty
 * `headersSubset` and has no parameter through which a caller could pick a recording — which is the
 * correct shape, because the scenario is a property of the test setup and not of the request.
 */
export function cassetteTransportFor(scenarioKey: string, cassettes: readonly Cassette[]): Transport {
  const replay = createCassetteTransport(cassettes);
  return (request) =>
    replay({ ...request, headersSubset: { ...request.headersSubset, ...scenarioHeaders(scenarioKey) } });
}
