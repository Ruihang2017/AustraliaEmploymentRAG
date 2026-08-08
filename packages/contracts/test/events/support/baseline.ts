/**
 * The versioning rule of FND-05 deliverable 5, encoded (PRD §16.1).
 *
 * Additive within `v1`, and therefore allowed:
 *   - a new schema file that is registered in `schemas/events/registry.json`;
 *   - a new **optional** property;
 *   - a new `enum` member.
 *
 * Non-additive, and therefore a new version directory (`schemas/events/<transport>/v2/**`) plus a
 * `schema_version` bump — never an edit in place:
 *   - a removed schema;
 *   - a removed or renamed property (a rename is a removal plus an addition);
 *   - a property that was required and is no longer, or was optional and is now required;
 *   - a changed `type` or `const`;
 *   - a removed `enum` member.
 *
 * The baseline is committed alongside the schemas it describes (acceptance item 15), so the first
 * commit is the `v1` publication, and every later commit is checked against it.
 */
import type { JsonObject, JsonValue } from './load.js';

export interface PropertyShape {
  readonly type?: string;
  readonly const?: JsonValue;
  readonly enum?: readonly JsonValue[];
}

export interface SchemaShape {
  readonly required: readonly string[];
  readonly properties: Readonly<Record<string, PropertyShape>>;
}

export type Baseline = Readonly<Record<string, SchemaShape>>;

const isObject = (value: JsonValue | undefined): value is JsonObject =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/**
 * The recorded shape of one schema. Nested objects are flattened with a `/` path (`data/alert_id`) so
 * a removal deep inside `data` is caught with the same code as one at the top level.
 */
export function shapeOf(schema: JsonObject): SchemaShape {
  const required: string[] = [];
  const properties: Record<string, PropertyShape> = {};

  const walk = (node: JsonObject, prefix: string): void => {
    const nodeRequired = Array.isArray(node['required']) ? node['required'] : [];
    const nodeProperties = isObject(node['properties']) ? node['properties'] : undefined;
    if (!nodeProperties) return;
    for (const [name, child] of Object.entries(nodeProperties)) {
      const path = `${prefix}${name}`;
      if (nodeRequired.includes(name)) required.push(path);
      if (!isObject(child)) continue;
      const shape: PropertyShape = {};
      const mutable = shape as { type?: string; const?: JsonValue; enum?: readonly JsonValue[] };
      if (typeof child['type'] === 'string') mutable.type = child['type'];
      if (Object.prototype.hasOwnProperty.call(child, 'const')) mutable.const = child['const'] as JsonValue;
      if (Array.isArray(child['enum'])) mutable.enum = child['enum'] as readonly JsonValue[];
      properties[path] = shape;
      walk(child, `${path}/`);
      const items = child['items'];
      if (isObject(items)) walk(items, `${path}[]/`);
    }
  };

  walk(schema, '');
  required.sort();
  return { required, properties };
}

/** The baseline for a whole schema tree, keyed by registry-relative path. */
export function buildBaseline(schemas: ReadonlyMap<string, JsonObject>): Baseline {
  const out: Record<string, SchemaShape> = {};
  for (const path of [...schemas.keys()].sort()) out[path] = shapeOf(schemas.get(path) as JsonObject);
  return out;
}

/** Every non-additive difference between `baseline` and `current`. Empty means compatible. */
export function compare(baseline: Baseline, current: Baseline): string[] {
  const problems: string[] = [];

  for (const [file, was] of Object.entries(baseline)) {
    const now = current[file];
    if (!now) {
      problems.push(`${file}: schema removed — a removed schema is not additive (PRD §16.1)`);
      continue;
    }
    const wasRequired = new Set(was.required);
    const nowRequired = new Set(now.required);

    for (const [property, wasShape] of Object.entries(was.properties)) {
      const nowShape = now.properties[property];
      if (!nowShape) {
        problems.push(`${file}: property "${property}" was removed or renamed — mint a v2 directory`);
        continue;
      }
      if (wasShape.type !== nowShape.type) {
        problems.push(
          `${file}: property "${property}" changed type from ${String(wasShape.type)} to ${String(nowShape.type)}`,
        );
      }
      if (JSON.stringify(wasShape.const) !== JSON.stringify(nowShape.const)) {
        problems.push(`${file}: property "${property}" changed its const value`);
      }
      const wasEnum = wasShape.enum ?? [];
      const nowEnum = new Set((nowShape.enum ?? []).map((member) => JSON.stringify(member)));
      for (const member of wasEnum) {
        if (!nowEnum.has(JSON.stringify(member))) {
          problems.push(`${file}: property "${property}" dropped enum member ${JSON.stringify(member)}`);
        }
      }
      if (wasRequired.has(property) && !nowRequired.has(property)) {
        problems.push(`${file}: property "${property}" was required and is now optional`);
      }
    }

    for (const property of now.required) {
      if (!wasRequired.has(property) && !Object.prototype.hasOwnProperty.call(was.properties, property)) {
        problems.push(
          `${file}: new property "${property}" is required — a new property must be optional within v1`,
        );
      } else if (!wasRequired.has(property)) {
        problems.push(`${file}: property "${property}" was optional and is now required`);
      }
    }
  }

  return problems;
}
