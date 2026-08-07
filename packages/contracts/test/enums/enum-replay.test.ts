/**
 * FND-03 acceptance item 1 — the `[fixture]` enum replay, asserted in BOTH directions.
 *
 * The fixture is the assertion target: it is the PRD transcription, and the implementation is what
 * gets compared to it. One `it()` per family (ticket test plan step 2: *"one assertion per family,
 * not one aggregate assertion"*), so a failure names the family that drifted.
 */
import { describe, expect, it } from 'vitest';

import { ENUM_REGISTRY } from '../../src/enums/index.js';
import { familyOf, loadFixture } from './fixture.js';

const fixture = loadFixture();
const fixtureFamilies = Object.keys(fixture.families).sort();
const registryFamilies = Object.keys(ENUM_REGISTRY).sort();

describe('PRD enum replay — fixture -> implementation', () => {
  it('transcribes twenty families', () => {
    // Guards the loop below against passing vacuously if the fixture were emptied or truncated.
    expect(fixtureFamilies).toHaveLength(20);
  });

  for (const name of fixtureFamilies) {
    it(`${name}: implementation values equal the PRD fixture exactly, in order`, () => {
      const entry = ENUM_REGISTRY[name];
      expect(entry, `${name} is in the fixture but not in ENUM_REGISTRY`).toBeDefined();
      expect(entry?.values, `${name} drifted from docs/PRD.md ${familyOf(fixture, name).prdSection}`)
        .toEqual(familyOf(fixture, name).values);
    });

    it(`${name}: records the same PRD section as the fixture`, () => {
      expect(ENUM_REGISTRY[name]?.prdSection).toBe(familyOf(fixture, name).prdSection);
    });
  }
});

describe('PRD enum replay — implementation -> fixture', () => {
  it('registers exactly the families the fixture transcribes, and no others', () => {
    expect(registryFamilies).toEqual(fixtureFamilies);
  });

  for (const name of registryFamilies) {
    it(`${name}: no implementation member is absent from the fixture`, () => {
      const fixtureValues = new Set(fixture.families[name]?.values ?? []);
      const extras = (ENUM_REGISTRY[name]?.values ?? []).filter((v) => !fixtureValues.has(v));
      expect(extras, `${name} has members the PRD fixture does not list`).toEqual([]);
    });
  }
});

describe('ordered families', () => {
  it('keeps AuthorityLevel in the PRD §9.1 ranking order, highest authority first', () => {
    const family = familyOf(fixture, 'AuthorityLevel');
    expect(family.ordered).toBe(true);
    expect(family.values).toHaveLength(8);
    expect(family.values[0]).toBe('CONSTITUTION_AND_LEGISLATION');
    expect(family.values[7]).toBe('BILLS_AND_NON_OPERATIVE_FUTURE_MATERIALS');
    // Array position IS the spec, so the replay above already pins the order; this states why.
    expect(ENUM_REGISTRY.AuthorityLevel?.values).toEqual(family.values);
  });
});

describe('provenance', () => {
  const COINED_OR_NORMALISED = ['AuthorityLevel', 'EvidenceQualifier', 'Permission', 'Role'];

  it('records per-member provenance for exactly the coined/normalised families', () => {
    const withProvenance = fixtureFamilies.filter((name) =>
      Boolean(fixture.families[name]?.provenance),
    );
    expect(withProvenance.sort()).toEqual(COINED_OR_NORMALISED);
  });

  for (const name of COINED_OR_NORMALISED) {
    it(`${name}: every member has a provenance entry`, () => {
      const family = familyOf(fixture, name);
      const covered = (family.provenance ?? []).map((entry) => entry.value);
      expect(covered).toEqual([...family.values]);
      for (const entry of family.provenance ?? []) {
        expect(
          Boolean(entry.prdText ?? entry.prdSpelling ?? entry.prdSection),
          `${name}.${entry.value} records no PRD text, spelling or section`,
        ).toBe(true);
      }
    });
  }

  it('records the §9.3 origin of EvidenceQualifier.MODEL_SUGGESTED', () => {
    const family = familyOf(fixture, 'EvidenceQualifier');
    const entry = (family.provenance ?? []).find((p) => p.value === 'MODEL_SUGGESTED');
    expect(entry?.prdSection).toBe('§9.3');
    expect(family.prdSection).toBe('§9.2');
  });
});
