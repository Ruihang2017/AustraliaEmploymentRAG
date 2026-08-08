/**
 * FND-04 deliverable 4 / acceptance item 5 — the OpenAPI document's enum schemas equal FND-03's
 * `ENUM_REGISTRY`.
 *
 * THE ONLY `.ts` FILE UNDER `src/openapi/` (sub-PRD D28b). Everything else here runs from a `node …`
 * CLI and is therefore `.mjs`; this module must import `ENUM_REGISTRY` from TypeScript and is only
 * ever executed by Vitest, which transpiles TypeScript natively. It takes the parsed document as a
 * parameter rather than loading it, so nothing here reaches for `fs` and the negative test can pass
 * a deep copy instead of mutating a repository file.
 *
 * TWO RULES, not one (PRD §35.1, sub-PRD D6):
 *
 *   1. every `components.schemas.<Name>` carrying an `enum` must have `<Name>` registered, and its
 *      members must deep-equal the registry entry IN REGISTRY ORDER; and
 *   2. the `enum` keyword may appear NOWHERE ELSE in the document.
 *
 * Rule 2 is what makes rule 1 worth anything. Without it a member could be inlined at a property and
 * drift silently — "a member can only be added in one place" (FND-04 deliverable 1) would be a
 * comment rather than a constraint. Fixed single values use `const`, which is unaffected.
 */
import { ENUM_REGISTRY } from '../enums/registry.js';

export interface EnumDriftFinding {
  readonly rule: 'unregistered-family' | 'member-drift' | 'inline-enum';
  readonly location: string;
  readonly message: string;
}

type Json = Record<string, unknown>;

function isObject(value: unknown): value is Json {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Every JSON pointer at which the `enum` keyword appears, in document order. */
export function enumLocations(document: unknown): readonly string[] {
  const found: string[] = [];
  const walk = (node: unknown, pointer: string): void => {
    if (Array.isArray(node)) {
      node.forEach((item, index) => walk(item, `${pointer}/${index}`));
      return;
    }
    if (!isObject(node)) return;
    for (const [key, value] of Object.entries(node)) {
      const child = `${pointer}/${key.replace(/~/gu, '~0').replace(/\//gu, '~1')}`;
      if (key === 'enum') found.push(child);
      else walk(value, child);
    }
  };
  walk(document, '');
  return found;
}

/**
 * Findings for both rules. Returns a list and never throws, so one run reports every drifted family
 * instead of stopping at the first — `assertEnumsMatchRegistry` is the throwing wrapper.
 */
export function findEnumDrift(document: unknown): readonly EnumDriftFinding[] {
  const findings: EnumDriftFinding[] = [];
  const root = isObject(document) ? document : {};
  const components = isObject(root['components']) ? root['components'] : {};
  const schemas = isObject(components['schemas']) ? components['schemas'] : {};

  for (const [name, schema] of Object.entries(schemas)) {
    if (!isObject(schema) || !('enum' in schema)) continue;
    const location = `#/components/schemas/${name}`;
    const entry = ENUM_REGISTRY[name];
    if (!entry) {
      findings.push({
        rule: 'unregistered-family',
        location,
        message:
          `${name} declares an enum but is not a family in ENUM_REGISTRY — registered families are ` +
          Object.keys(ENUM_REGISTRY).join(', '),
      });
      continue;
    }
    const declared = schema['enum'];
    const members: readonly unknown[] = Array.isArray(declared) ? declared : [];
    const expected = entry.values;
    const matches =
      members.length === expected.length && expected.every((value, index) => members[index] === value);
    if (!matches) {
      findings.push({
        rule: 'member-drift',
        location,
        message:
          `${name} does not match ENUM_REGISTRY.${name} (PRD ${entry.prdSection}): ` +
          `document ${JSON.stringify(members)} vs registry ${JSON.stringify(expected)}`,
      });
    }
  }

  const allowed = new Set(
    Object.keys(schemas)
      .filter((name) => {
        const schema = schemas[name];
        return isObject(schema) && 'enum' in schema;
      })
      .map((name) => `/components/schemas/${name}/enum`),
  );
  for (const location of enumLocations(document)) {
    if (allowed.has(location)) continue;
    findings.push({
      rule: 'inline-enum',
      location,
      message:
        `an inline enum at ${location}: the enum keyword may appear only directly inside ` +
        'components.schemas.<RegisteredFamilyName> (sub-PRD D6). Use `const` for a fixed single value.',
    });
  }

  return findings;
}

/**
 * Throw naming every drifted family, or return silently.
 *
 * Loud, never convenient — the precedent `getEnumValues` set in FND-03. The offending family name
 * appears in the message because the negative test asserts it does.
 */
export function assertEnumsMatchRegistry(document: unknown): void {
  const findings = findEnumDrift(document);
  if (findings.length === 0) return;
  throw new Error(
    `OpenAPI enum schemas have drifted from ENUM_REGISTRY:\n` +
      findings.map((f) => `  [${f.rule}] ${f.location}: ${f.message}`).join('\n'),
  );
}
