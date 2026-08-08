/**
 * FND-04 acceptance item 9 — no operation accepts an organisation/tenant identifier.
 *
 * PRD §34.1: "Tenant | Never accepted in a request body; derived from authenticated
 * session/key/widget token." PRD §16.5: "authenticate -> resolve organisation -> verify
 * membership/service account -> evaluate permission -> perform tenant-scoped lookup."
 *
 * This is a SECURITY-SENSITIVE scan and it is written to be hard to fool:
 *
 *   * it reads path, query, HEADER and COOKIE parameters, at both the path-item and the operation
 *     level, including `$ref`'d ones — a leak hidden in a path-level header is still a leak;
 *   * it walks request-body schemas RECURSIVELY through `$ref`, `allOf`/`anyOf`/`oneOf`,
 *     `items`, `additionalProperties` and `patternProperties`, with cycle protection;
 *   * it reads `apiKey` security schemes, because a scheme whose `name` were an organisation header
 *     would be the same leak by another route.
 *
 * `test/openapi/tenant-leak.test.ts` ships a positive control — a synthetic document with a
 * forbidden name nested three levels inside a request body behind a `$ref` — because a scan that
 * can only fail on a top-level path parameter discharges nothing.
 */
import { operations, resolvePointer } from './document.mjs';

export const REQUEST_LOCATIONS = ['path', 'query', 'header', 'cookie'];

function deref(document, node) {
  let current = node;
  const seen = new Set();
  while (current && typeof current === 'object' && typeof current.$ref === 'string') {
    if (seen.has(current.$ref)) return undefined;
    seen.add(current.$ref);
    current = resolvePointer(document, current.$ref);
  }
  return current;
}

function finding(location, name, why) {
  return { rule: 'tenant-leak', location, name, message: `${why}: \`${name}\`` };
}

/**
 * Every property name reachable from `schema`, as `{ name, path }`.
 *
 * Exported so the test can prove the walker really does reach a nested, `$ref`'d property rather
 * than trusting that the scan below happens to call it.
 */
export function propertyNames(document, schema, base = '', seen = new Set()) {
  const resolved = deref(document, schema);
  if (!resolved || typeof resolved !== 'object') return [];

  if (typeof schema?.$ref === 'string') {
    if (seen.has(schema.$ref)) return [];
    seen.add(schema.$ref);
  }

  const found = [];
  for (const [name, child] of Object.entries(resolved.properties ?? {})) {
    const path = base ? `${base}.${name}` : name;
    found.push({ name, path });
    found.push(...propertyNames(document, child, path, seen));
  }
  for (const branch of ['allOf', 'anyOf', 'oneOf', 'prefixItems']) {
    for (const entry of resolved[branch] ?? []) found.push(...propertyNames(document, entry, base, seen));
  }
  if (resolved.items) found.push(...propertyNames(document, resolved.items, `${base}[]`, seen));
  if (resolved.additionalProperties && typeof resolved.additionalProperties === 'object') {
    found.push(...propertyNames(document, resolved.additionalProperties, `${base}{}`, seen));
  }
  for (const entry of Object.values(resolved.patternProperties ?? {})) {
    found.push(...propertyNames(document, entry, `${base}{}`, seen));
  }
  return found;
}

/**
 * Findings for every operation parameter and request-body property whose name is in `forbidden`,
 * plus every `apiKey` security scheme whose `name` is in `forbiddenSchemeNames`.
 *
 * Returns a list and never throws, so a test reports all violations at once.
 */
export function scanTenantLeaks(document, fixture) {
  const forbidden = new Set((fixture.requestFieldNames ?? []).map((name) => name.toLowerCase()));
  const forbiddenSchemes = new Set((fixture.securitySchemeNames ?? []).map((name) => name.toLowerCase()));
  const findings = [];

  for (const [schemeName, rawScheme] of Object.entries(document.components?.securitySchemes ?? {})) {
    const scheme = deref(document, rawScheme);
    if (!scheme) continue;
    const name = String(scheme.name ?? '');
    if (name && (forbiddenSchemes.has(name.toLowerCase()) || forbidden.has(name.toLowerCase()))) {
      findings.push(
        finding(`#/components/securitySchemes/${schemeName}`, name, 'security scheme reads the tenant from the request'),
      );
    }
  }

  for (const { path, method, operation, pathItem } of operations(document)) {
    const location = `${method.toUpperCase()} ${path}`;

    for (const raw of [...(pathItem.parameters ?? []), ...(operation.parameters ?? [])]) {
      const parameter = deref(document, raw);
      if (!parameter) continue;
      if (!REQUEST_LOCATIONS.includes(parameter.in)) continue;
      const name = String(parameter.name ?? '');
      if (forbidden.has(name.toLowerCase())) {
        findings.push(finding(location, name, `${parameter.in} parameter names the tenant`));
      }
    }

    const body = deref(document, operation.requestBody);
    for (const media of Object.values(body?.content ?? {})) {
      if (!media?.schema) continue;
      for (const { name, path: propertyPath } of propertyNames(document, media.schema)) {
        if (forbidden.has(name.toLowerCase())) {
          findings.push(finding(`${location} body.${propertyPath}`, name, 'request body names the tenant'));
        }
      }
    }
  }

  return findings;
}
