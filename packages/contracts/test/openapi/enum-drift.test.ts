/**
 * FND-04 acceptance item 5 — "Enum drift: every enum schema equals its `ENUM_REGISTRY` entry; a
 * member added to the YAML but not the registry fails (PRD §35.1, `FND-03`)."
 *
 * Every negative case runs on a DEEP COPY in memory. Nothing here writes to the repository, so a
 * process killed mid-test cannot leave `git status --porcelain` dirty (acceptance item 6).
 */
import { describe, expect, it } from 'vitest';

import { ENUM_REGISTRY } from '../../src/enums/registry.js';
import { assertEnumsMatchRegistry, enumLocations, findEnumDrift } from '../../src/openapi/enum-drift.js';
import { copyOf, document, type Json } from './fixture.js';

const schemas = () => (document().components as Json).schemas as Record<string, Json>;
const enumFamilies = () =>
  Object.entries(schemas())
    .filter(([, schema]) => Array.isArray(schema.enum))
    .map(([name]) => name)
    .sort();

describe('enum drift (acceptance item 5)', () => {
  it('passes on the real document', () => {
    expect(findEnumDrift(document())).toEqual([]);
    expect(() => assertEnumsMatchRegistry(document())).not.toThrow();
  });

  it('is not vacuous: the document declares real registry families', () => {
    const families = enumFamilies();
    expect(families.length).toBeGreaterThanOrEqual(12);
    for (const family of families) expect(ENUM_REGISTRY[family]).toBeTruthy();
    expect(families).toContain('ErrorCode');
    expect(families).toContain('AnswerStatus');
  });

  it('matches every declared family to its registry entry, in registry order', () => {
    for (const family of enumFamilies()) {
      expect(schemas()[family]?.enum).toEqual([...(ENUM_REGISTRY[family]?.values ?? [])]);
    }
  });

  it('marks every enum schema with `x-enum-usage`, so D25\'s rule is decidable', () => {
    for (const family of enumFamilies()) {
      expect(['request', 'response', 'both']).toContain(schemas()[family]?.['x-enum-usage']);
      expect(typeof schemas()[family]?.['x-closed-enum']).toBe('boolean');
    }
  });

  it('inlines no enum anywhere else in the document', () => {
    const allowed = new Set(enumFamilies().map((family) => `/components/schemas/${family}/enum`));
    expect(enumLocations(document()).filter((location) => !allowed.has(location))).toEqual([]);
  });

  // The negative cases the ticket's test-plan step 6 asks for, all in memory.
  it('fails, naming the family, when a member is added to the YAML but not the registry', () => {
    const drifted = copyOf(document());
    ((drifted.components as Json).schemas as Record<string, Json>).AnswerStatus = {
      ...schemas().AnswerStatus,
      enum: [...(ENUM_REGISTRY.AnswerStatus?.values ?? []), 'INVENTED_MEMBER'],
    };
    const findings = findEnumDrift(drifted);
    expect(findings).toHaveLength(1);
    expect(findings[0]?.rule).toBe('member-drift');
    expect(findings[0]?.message).toContain('AnswerStatus');
    expect(findings[0]?.message).toContain('INVENTED_MEMBER');
    expect(() => assertEnumsMatchRegistry(drifted)).toThrow(/AnswerStatus/);
  });

  it('fails when a member is removed', () => {
    const drifted = copyOf(document());
    ((drifted.components as Json).schemas as Record<string, Json>).CitationRole = {
      ...schemas().CitationRole,
      enum: (ENUM_REGISTRY.CitationRole?.values ?? []).slice(1),
    };
    expect(findEnumDrift(drifted).map((finding) => finding.rule)).toEqual(['member-drift']);
    expect(() => assertEnumsMatchRegistry(drifted)).toThrow(/CitationRole/);
  });

  it('fails when the order is changed, because a registry is ordered', () => {
    const drifted = copyOf(document());
    ((drifted.components as Json).schemas as Record<string, Json>).Role = {
      ...schemas().Role,
      enum: [...(ENUM_REGISTRY.Role?.values ?? [])].reverse(),
    };
    expect(() => assertEnumsMatchRegistry(drifted)).toThrow(/Role/);
  });

  it('fails when a schema declares an enum for an unregistered family', () => {
    const drifted = copyOf(document());
    ((drifted.components as Json).schemas as Record<string, Json>).SearchMode = {
      type: 'string',
      enum: ['QUICK', 'ADVANCED'],
    };
    const findings = findEnumDrift(drifted);
    expect(findings.map((finding) => finding.rule)).toEqual(['unregistered-family']);
    expect(findings[0]?.message).toContain('SearchMode');
  });

  it('fails when an enum is inlined at a property instead of `$ref`ing a family', () => {
    const drifted = copyOf(document());
    const request = ((drifted.components as Json).schemas as Record<string, Json>).SearchRequest as Json;
    (request.properties as Record<string, Json>).sort = { type: 'string', enum: ['RELEVANCE'] };
    const findings = findEnumDrift(drifted);
    expect(findings.map((finding) => finding.rule)).toEqual(['inline-enum']);
    expect(findings[0]?.location).toBe('/components/schemas/SearchRequest/properties/sort/enum');
  });

  it('leaves `const` alone — a fixed single value is not an enum', () => {
    const envelope = schemas().ResponseEnvelope as Json;
    const properties = envelope.properties as Record<string, Json>;
    expect(properties.schema_version?.const).toBe('1.0');
    expect(properties.schema_version?.enum).toBeUndefined();
  });
});
