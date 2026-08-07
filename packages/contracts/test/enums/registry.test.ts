/**
 * FND-03 acceptance items 2 and 3 — registry <-> barrel completeness, the accessor, and PRD
 * traceability.
 *
 * The directory scan is what makes *"a family added to the source but not the registry fails"* true:
 * without it, an unregistered family is invisible to every other test in this suite.
 */
import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import * as barrel from '../../src/enums/index.js';
import { ENUM_REGISTRY, getEnumValues } from '../../src/enums/index.js';
import { PACKAGE_ROOT } from './fixture.js';

/** The naming derivation the family files apply without exception: Pascal -> SCREAMING_SNAKE. */
const screaming = (family: string): string =>
  family.replace(/([a-z0-9])([A-Z])/g, '$1_$2').toUpperCase();

/** kebab-case file stem -> Pascal family name. */
const pascal = (stem: string): string =>
  stem
    .split('-')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join('');

const exported = barrel as unknown as Record<string, unknown>;
const registryFamilies = Object.keys(ENUM_REGISTRY).sort();

describe('registry <-> barrel', () => {
  it('exports a values list and a guard from the barrel for every registered family', () => {
    expect(registryFamilies).toHaveLength(20);
    for (const family of registryFamilies) {
      expect(exported[`${screaming(family)}_VALUES`], `${family}: no *_VALUES export`).toBeDefined();
      expect(typeof exported[`is${family}`], `${family}: no is${family} guard export`).toBe(
        'function',
      );
    }
  });

  it('registers every *_VALUES export the barrel publishes', () => {
    const exportedValueLists = Object.keys(exported)
      .filter((name) => name.endsWith('_VALUES'))
      .sort();
    expect(exportedValueLists).toEqual(
      registryFamilies.map((family) => `${screaming(family)}_VALUES`).sort(),
    );
  });

  it('makes each barrel guard accept exactly its own registered members', () => {
    for (const family of registryFamilies) {
      const guard = exported[`is${family}`] as (value: unknown) => boolean;
      for (const member of ENUM_REGISTRY[family]?.values ?? []) {
        expect(guard(member), `is${family}(${member}) should be true`).toBe(true);
      }
      expect(guard(`${family}__NOT_A_MEMBER`)).toBe(false);
      expect(guard(42)).toBe(false);
      expect(guard(null)).toBe(false);
      expect(guard(undefined)).toBe(false);
    }
  });
});

describe('source directory <-> registry', () => {
  // registry.ts and index.ts are the only non-family files in src/enums; everything else is a family.
  const NON_FAMILY_FILES = ['index.ts', 'registry.ts'];

  const familyStems = readdirSync(join(PACKAGE_ROOT, 'src/enums'))
    .filter((name) => name.endsWith('.ts') && !NON_FAMILY_FILES.includes(name))
    .map((name) => name.replace(/\.ts$/, ''));

  it('finds one source file per registered family and no unregistered family file', () => {
    expect(familyStems.map(pascal)).toContain('LegalStatus'); // non-vacuity
    expect(familyStems.map(pascal).sort()).toEqual(registryFamilies);
    expect(familyStems).toHaveLength(20);
  });
});

describe('getEnumValues', () => {
  it('returns the registered members', () => {
    expect(getEnumValues('LegalStatus')).toEqual(ENUM_REGISTRY.LegalStatus?.values);
  });

  it('throws naming the unknown family rather than returning undefined', () => {
    // A silent `undefined` here would let DATA-01 emit a table with no CHECK constraint (PRD §35.1).
    expect(() => getEnumValues('NotAFamily')).toThrow(/NotAFamily/);
    expect(() => getEnumValues('NotAFamily')).toThrow(/LegalStatus/);
  });
});

describe('PRD traceability', () => {
  const SECTION = /^§\d+(\.\d+)?$/;

  it('records a PRD section reference on every entry', () => {
    for (const family of registryFamilies) {
      expect(ENUM_REGISTRY[family]?.prdSection, `${family} has no usable PRD section`).toMatch(
        SECTION,
      );
    }
  });

  it('uses a pattern that actually rejects a malformed reference', () => {
    expect(SECTION.test('6.7')).toBe(false);
    expect(SECTION.test('§')).toBe(false);
    expect(SECTION.test('§8.4 and §8.5')).toBe(false);
    expect(SECTION.test('§8.4')).toBe(true);
    expect(SECTION.test('§7')).toBe(true);
  });
});

describe('immutability', () => {
  it('freezes the registry, its entries and the value arrays (ESM is strict mode)', () => {
    expect(Object.isFrozen(ENUM_REGISTRY)).toBe(true);
    expect(Object.isFrozen(ENUM_REGISTRY.LegalStatus)).toBe(true);
    expect(Object.isFrozen(ENUM_REGISTRY.LegalStatus?.values)).toBe(true);
    expect(() => (ENUM_REGISTRY.LegalStatus?.values as string[]).push('X')).toThrow();
    expect(() => {
      (ENUM_REGISTRY as Record<string, unknown>).Injected = {};
    }).toThrow();
  });
});
