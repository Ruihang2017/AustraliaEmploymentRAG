/**
 * Shared loader for test/enums/prd-enums.fixture.json (FND-03 deliverable 5).
 *
 * Not a test file (vitest collects only `*.test.*`); it exists so every enum suite reads the fixture
 * through one typed accessor instead of re-parsing it with its own ad-hoc shape.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const TEST_ENUMS_DIR = dirname(fileURLToPath(import.meta.url));
/** packages/contracts */
export const PACKAGE_ROOT = join(TEST_ENUMS_DIR, '..', '..');
export const FIXTURE_RELATIVE_PATH = 'test/enums/prd-enums.fixture.json';

export interface FixtureProvenanceEntry {
  readonly value: string;
  readonly prdText?: string;
  readonly prdSpelling?: string;
  readonly prdSection?: string;
}

export interface FixtureFamily {
  readonly prdSection: string;
  readonly values: readonly string[];
  readonly ordered?: boolean;
  readonly provenance?: readonly FixtureProvenanceEntry[];
}

export interface FixtureCrossFamilyMember {
  readonly member: string;
  readonly families: readonly string[];
  readonly prdSections: readonly string[];
}

export interface EnumFixture {
  readonly $comment: readonly string[];
  readonly families: Readonly<Record<string, FixtureFamily>>;
  readonly intentionalCrossFamilyMembers: readonly FixtureCrossFamilyMember[];
}

export function parseFixture(json: string): EnumFixture {
  return JSON.parse(json) as EnumFixture;
}

export function loadFixture(): EnumFixture {
  return parseFixture(readFileSync(join(PACKAGE_ROOT, FIXTURE_RELATIVE_PATH), 'utf8'));
}

/** The fixture's family, or a failing lookup that names the family instead of throwing on `undefined`. */
export function familyOf(fixture: EnumFixture, name: string): FixtureFamily {
  const family = fixture.families[name];
  if (!family) throw new Error(`family ${name} is missing from ${FIXTURE_RELATIVE_PATH}`);
  return family;
}
