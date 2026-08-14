/**
 * EVID-07 test-plan step 1 — read the registry against the PRD.
 *
 * The fixture is a hand transcription; this suite proves the transcription is faithful (every string
 * occurs verbatim in `docs/PRD.md`) AND that the shipped registry matches the transcription. Neither
 * half is sufficient alone: a fixture that matches the code but not the PRD is a shared delusion.
 */
import { describe, expect, it } from 'vitest';

import '../providers/support/network-stub.js';
import { PACKAGE_ROOT, loadPrd, readJson } from '../providers/support/fixture.js';
import { MODEL_PROFILE_REGISTRY_V1 } from '../../src/profiles/registry.js';
import { MODEL_PROFILE_IDS } from '../../src/profiles/types.js';
import { PROFILE_CALL_CEILINGS } from '../../src/profiles/ceilings.js';
import type { ModelProfileId, ProfileExecution } from '../../src/profiles/types.js';

interface ProfileFixture {
  readonly prdSection: string;
  readonly heading: string;
  readonly profiles: readonly { readonly id: ModelProfileId; readonly execution: ProfileExecution }[];
  readonly promotionSentence: string;
  readonly fallbackSentence: string;
  readonly configurationSentence: string;
  readonly section17_3: {
    readonly prdSection: string;
    readonly onlineLocalLine: string;
    readonly quickLine: string;
    readonly deepLine: string;
    readonly noFallbackSentence: string;
  };
  readonly section36_7: {
    readonly prdSection: string;
    readonly hostedSynthesisCallsRow: string;
    readonly hardElapsedRow: string;
  };
  readonly section10_2Sentence: string;
}

const fixture = readJson<ProfileFixture>(PACKAGE_ROOT, 'test', 'profiles', 'prd-14-4-profiles.json');
const prd = loadPrd();

describe('the fixture is a faithful transcription of docs/PRD.md', () => {
  it('finds the two sections it quotes', () => {
    expect(prd).toContain(fixture.prdSection);
    expect(prd).toContain(fixture.section17_3.prdSection);
    expect(prd).toContain(fixture.section36_7.prdSection);
    expect(prd).toContain(fixture.heading);
  });

  it.each(['QUERY_EMBEDDING', 'LOCAL_RERANK', 'QUICK_SYNTHESIS', 'DEEP_SYNTHESIS', 'STRUCTURED_REPAIR', 'EVALUATION_JUDGE'])(
    'quotes %s as a PRD §14.4 bullet',
    (id) => {
      expect(prd).toContain(`- \`${id}\``);
    },
  );

  it('quotes the promotion, fallback and configuration sentences verbatim', () => {
    expect(prd).toContain(fixture.promotionSentence);
    expect(prd).toContain(fixture.fallbackSentence);
    expect(prd).toContain(fixture.configurationSentence);
  });

  it('quotes PRD §17.3 and PRD §10.2 verbatim', () => {
    expect(prd).toContain(fixture.section17_3.onlineLocalLine);
    expect(prd).toContain(fixture.section17_3.quickLine);
    expect(prd).toContain(fixture.section17_3.deepLine);
    expect(prd).toContain(fixture.section17_3.noFallbackSentence);
    expect(prd).toContain(fixture.section10_2Sentence);
  });

  it('quotes PRD §36.7 rows verbatim', () => {
    expect(prd).toContain(fixture.section36_7.hostedSynthesisCallsRow);
    expect(prd).toContain(fixture.section36_7.hardElapsedRow);
  });

  it('does not vacuously pass on a string the PRD does not contain (positive control)', () => {
    expect(prd).not.toContain('- `INVENTED_PROFILE`');
  });
});

describe('MODEL_PROFILE_REGISTRY_V1 matches the fixture', () => {
  it('carries exactly the six PRD §14.4 ids, in the PRD order', () => {
    expect([...MODEL_PROFILE_IDS]).toEqual(fixture.profiles.map((entry) => entry.id));
    expect(Object.keys(MODEL_PROFILE_REGISTRY_V1)).toEqual(fixture.profiles.map((entry) => entry.id));
  });

  it.each(['QUERY_EMBEDDING', 'LOCAL_RERANK'] as const)('marks %s as local (PRD §17.3)', (id) => {
    expect(MODEL_PROFILE_REGISTRY_V1[id].execution).toBe('LOCAL_IN_SEARCH_BOUNDARY');
    expect(MODEL_PROFILE_REGISTRY_V1[id].allowedProviderIds).toEqual([]);
  });

  it.each(['QUICK_SYNTHESIS', 'DEEP_SYNTHESIS', 'STRUCTURED_REPAIR', 'EVALUATION_JUDGE'] as const)(
    'marks %s as hosted',
    (id) => {
      expect(MODEL_PROFILE_REGISTRY_V1[id].execution).toBe('HOSTED');
    },
  );

  it('agrees with the fixture execution column for every profile', () => {
    for (const entry of fixture.profiles) {
      expect(MODEL_PROFILE_REGISTRY_V1[entry.id].execution).toBe(entry.execution);
    }
  });

  it('carries NO default fallback on any profile (PRD §14.4)', () => {
    for (const id of MODEL_PROFILE_IDS) {
      expect(
        MODEL_PROFILE_REGISTRY_V1[id].approvedFallbackProfileId,
        `${id} ships a fallback; PRD §14.4 requires independent approval`,
      ).toBeUndefined();
      expect(Object.prototype.hasOwnProperty.call(MODEL_PROFILE_REGISTRY_V1[id], 'approvedFallbackProfileId')).toBe(
        false,
      );
    }
  });

  it('ships every hosted profile as CANDIDATE — nothing here has passed the §14.4 gates', () => {
    for (const id of MODEL_PROFILE_IDS) {
      expect(MODEL_PROFILE_REGISTRY_V1[id].promotionState).toBe('CANDIDATE');
    }
  });

  it('requires no-training with an acceptable retention posture on every profile (PRD §10.2)', () => {
    for (const id of MODEL_PROFILE_IDS) {
      expect(MODEL_PROFILE_REGISTRY_V1[id].retention.noTraining).toBe(true);
      expect(['ZERO', 'APPROVED_MINIMAL']).toContain(MODEL_PROFILE_REGISTRY_V1[id].retention.mode);
    }
  });

  it('turns sampling off on every profile', () => {
    for (const id of MODEL_PROFILE_IDS) {
      expect(MODEL_PROFILE_REGISTRY_V1[id].determinism.temperature).toBe(0);
      expect(MODEL_PROFILE_REGISTRY_V1[id].determinism.topP).toBe(1);
    }
  });
});

describe('PROFILE_CALL_CEILINGS carries PRD §36.7 cells verbatim', () => {
  it('reproduces the hosted-synthesis-call cells', () => {
    expect(fixture.section36_7.hostedSynthesisCallsRow).toContain(
      PROFILE_CALL_CEILINGS.QUICK.hostedSynthesisCalls,
    );
    expect(fixture.section36_7.hostedSynthesisCallsRow).toContain(
      PROFILE_CALL_CEILINGS.DEEP.hostedSynthesisCalls,
    );
    expect(prd).toContain(PROFILE_CALL_CEILINGS.QUICK.hostedSynthesisCalls);
    expect(prd).toContain(PROFILE_CALL_CEILINGS.DEEP.hostedSynthesisCalls);
  });

  it('reproduces the hard-elapsed cells and their millisecond equivalents', () => {
    expect(fixture.section36_7.hardElapsedRow).toContain(PROFILE_CALL_CEILINGS.QUICK.hardElapsedExecution);
    expect(fixture.section36_7.hardElapsedRow).toContain(PROFILE_CALL_CEILINGS.DEEP.hardElapsedExecution);
    expect(PROFILE_CALL_CEILINGS.QUICK.hardElapsedMs).toBe(60_000);
    expect(PROFILE_CALL_CEILINGS.DEEP.hardElapsedMs).toBe(180_000);
  });

  it('agrees with the registry: Quick-tier profiles sit inside the Quick hard elapsed limit', () => {
    expect(MODEL_PROFILE_REGISTRY_V1.QUICK_SYNTHESIS.maxElapsedMs).toBe(
      PROFILE_CALL_CEILINGS.QUICK.hardElapsedMs,
    );
    expect(MODEL_PROFILE_REGISTRY_V1.STRUCTURED_REPAIR.maxElapsedMs).toBeLessThanOrEqual(
      PROFILE_CALL_CEILINGS.QUICK.hardElapsedMs,
    );
    expect(MODEL_PROFILE_REGISTRY_V1.DEEP_SYNTHESIS.maxElapsedMs).toBe(
      PROFILE_CALL_CEILINGS.DEEP.hardElapsedMs,
    );
  });
});
