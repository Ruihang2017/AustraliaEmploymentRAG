/**
 * FND-04 deliverable 4 — `checkCompatibility(baseline, candidate)`.
 *
 * PRD §16.1: "Optional fields may be added within v1; breaking changes require v2." The exact rule
 * table lives in `docs/prd/00-foundation/README.md` decision **D25**, NOT here, because the
 * definition of "breaking" is a contract with every SDK consumer (`PLTF-02`, `PLTF-03`) rather than
 * a local heuristic — FND-04 Feedback obligation 5. Changing a rule below requires a writeback to
 * D25 FIRST. The comments on each rule cite the D25 row they implement.
 *
 * Returns `{ breaking, compatible }`, each a list of `{ rule, pointer, message }` sorted by
 * pointer, so a report diffs cleanly between runs.
 */
import { httpMethods, resolvePointer } from './document.mjs';

const METHODS = httpMethods();

function deref(document, node) {
  let current = node;
  const seen = new Set();
  while (current && typeof current === 'object' && typeof current.$ref === 'string') {
    if (seen.has(current.$ref)) return undefined;
    seen.add(current.$ref);
    current = resolvePointer(document, current.$ref);
  }
  return current ?? {};
}

function operationMap(document) {
  const map = new Map();
  for (const [path, pathItem] of Object.entries(document.paths ?? {})) {
    for (const method of METHODS) {
      if (pathItem?.[method]) map.set(`${method.toUpperCase()} ${path}`, { pathItem, operation: pathItem[method] });
    }
  }
  return map;
}

function typeSet(schema) {
  const declared = schema.type;
  if (declared === undefined) return null;
  return new Set(Array.isArray(declared) ? declared : [declared]);
}

/**
 * A closed enum's members may not be extended on the RESPONSE side: a shipped client's exhaustive
 * switch has no arm for a value it has never seen. On the request side an added member cannot break
 * an existing client — a server accepting more input is additive. D25, "Enum member added".
 */
function enumAdditionIsBreaking(schema, side) {
  return side === 'response' && schema['x-closed-enum'] === true;
}

class Diff {
  constructor() {
    this.breaking = new Map();
    this.compatible = new Map();
  }

  add(bucket, rule, pointer, message) {
    const key = `${rule} ${pointer} ${message}`;
    bucket.set(key, { rule, pointer, message });
  }

  break_(rule, pointer, message) {
    this.add(this.breaking, rule, pointer, message);
  }

  ok(rule, pointer, message) {
    this.add(this.compatible, rule, pointer, message);
  }

  result() {
    const sort = (map) =>
      [...map.values()].sort(
        (a, b) => a.pointer.localeCompare(b.pointer) || a.rule.localeCompare(b.rule) || a.message.localeCompare(b.message),
      );
    return { breaking: sort(this.breaking), compatible: sort(this.compatible) };
  }
}

function diffSchema(baseDoc, candDoc, rawBase, rawCand, pointer, side, diff, seen) {
  const key = `${pointer} ${rawBase?.$ref ?? ''} ${rawCand?.$ref ?? ''}`;
  if (seen.has(key)) return;
  seen.add(key);

  const base = deref(baseDoc, rawBase);
  const cand = deref(candDoc, rawCand);

  // --- D25: type narrowed --------------------------------------------------------------------
  const baseTypes = typeSet(base);
  const candTypes = typeSet(cand);
  if (baseTypes && candTypes) {
    const dropped = [...baseTypes].filter((type) => !candTypes.has(type));
    if (dropped.length > 0) {
      diff.break_('type-narrowed', pointer, `type no longer accepts ${dropped.join(', ')}`);
    }
    const added = [...candTypes].filter((type) => !baseTypes.has(type));
    if (added.length > 0) diff.ok('type-widened', pointer, `type also accepts ${added.join(', ')}`);
  } else if (baseTypes && !candTypes) {
    diff.ok('type-widened', pointer, 'type constraint removed');
  } else if (!baseTypes && candTypes) {
    diff.break_('type-narrowed', pointer, `type constraint added: ${[...candTypes].join(', ')}`);
  }

  // --- D25: enum member removed / added ---------------------------------------------------------
  if (Array.isArray(base.enum) || Array.isArray(cand.enum)) {
    const baseMembers = base.enum ?? [];
    const candMembers = cand.enum ?? [];
    for (const member of baseMembers) {
      if (!candMembers.includes(member)) {
        diff.break_('enum-member-removed', pointer, `enum member removed: ${JSON.stringify(member)}`);
      }
    }
    for (const member of candMembers) {
      if (baseMembers.includes(member)) continue;
      const message = `enum member added: ${JSON.stringify(member)}`;
      if (enumAdditionIsBreaking(cand, side)) diff.break_('enum-member-added', pointer, message);
      else diff.ok('enum-member-added', pointer, message);
    }
  }

  // --- D25: format added, changed or removed on a request property ------------------------------
  if (base.format !== cand.format) {
    if (side === 'request' && cand.format !== undefined) {
      diff.break_(
        'format-tightened',
        pointer,
        `request format ${base.format === undefined ? 'added' : 'changed'}: ${base.format ?? '(none)'} -> ${cand.format}`,
      );
    } else {
      diff.ok('format-changed', pointer, `format ${base.format ?? '(none)'} -> ${cand.format ?? '(none)'}`);
    }
  }

  // --- D25: bound tightened / loosened ----------------------------------------------------------
  for (const [keyword, direction] of [
    ['minimum', 'up'],
    ['minLength', 'up'],
    ['minItems', 'up'],
    ['minProperties', 'up'],
    ['maximum', 'down'],
    ['maxLength', 'down'],
    ['maxItems', 'down'],
    ['maxProperties', 'down'],
  ]) {
    const before = base[keyword];
    const after = cand[keyword];
    if (before === after) continue;
    const tightened =
      before === undefined
        ? after !== undefined
        : after !== undefined && (direction === 'up' ? after > before : after < before);
    const message = `${keyword} ${before ?? '(none)'} -> ${after ?? '(none)'}`;
    if (tightened) diff.break_('bound-tightened', pointer, message);
    else diff.ok('bound-loosened', pointer, message);
  }

  // --- D25: property removed / added, request property newly required ---------------------------
  const baseProps = base.properties ?? {};
  const candProps = cand.properties ?? {};
  const baseRequired = new Set(base.required ?? []);
  const candRequired = new Set(cand.required ?? []);

  for (const name of Object.keys(baseProps)) {
    if (!(name in candProps)) {
      diff.break_('property-removed', `${pointer}/properties/${name}`, `${side} property removed: ${name}`);
    }
  }
  for (const name of Object.keys(candProps)) {
    if (name in baseProps) continue;
    const childPointer = `${pointer}/properties/${name}`;
    if (candRequired.has(name)) {
      diff.break_('required-property-added', childPointer, `${side} property added as required: ${name}`);
    } else {
      diff.ok('optional-property-added', childPointer, `optional ${side} property added: ${name}`);
    }
  }
  for (const name of candRequired) {
    if (name in baseProps && !baseRequired.has(name)) {
      diff.break_(
        'property-newly-required',
        `${pointer}/properties/${name}`,
        `${side} property is now required: ${name}`,
      );
    }
  }
  for (const name of baseRequired) {
    if (name in candProps && !candRequired.has(name)) {
      diff.ok('property-no-longer-required', `${pointer}/properties/${name}`, `${side} property is now optional: ${name}`);
    }
  }

  for (const name of Object.keys(baseProps)) {
    if (name in candProps) {
      diffSchema(baseDoc, candDoc, baseProps[name], candProps[name], `${pointer}/properties/${name}`, side, diff, seen);
    }
  }
  if (base.items && cand.items) {
    diffSchema(baseDoc, candDoc, base.items, cand.items, `${pointer}/items`, side, diff, seen);
  }
  for (const branch of ['allOf', 'anyOf', 'oneOf']) {
    const baseBranch = base[branch] ?? [];
    const candBranch = cand[branch] ?? [];
    if (candBranch.length < baseBranch.length) {
      diff.break_('type-narrowed', `${pointer}/${branch}`, `${branch} shrank from ${baseBranch.length} to ${candBranch.length} alternatives`);
    }
    const shared = Math.min(baseBranch.length, candBranch.length);
    for (let index = 0; index < shared; index += 1) {
      diffSchema(baseDoc, candDoc, baseBranch[index], candBranch[index], `${pointer}/${branch}/${index}`, side, diff, seen);
    }
  }
}

function contentSchemas(document, holder) {
  const resolved = deref(document, holder);
  return Object.entries(resolved.content ?? {})
    .filter(([, media]) => media?.schema)
    .map(([mediaType, media]) => [mediaType, media.schema]);
}

/**
 * Compare a baseline document with a candidate.
 *
 * Both arguments are documents already loaded by `loadOpenApiDocument()` (or in-memory copies of
 * one). Nothing here mutates either argument, which is what lets the negative tests operate on deep
 * copies rather than on a repository file.
 */
export function checkCompatibility(baseline, candidate) {
  const diff = new Diff();
  const seen = new Set();

  const basePaths = new Set(Object.keys(baseline.paths ?? {}));
  const candPaths = new Set(Object.keys(candidate.paths ?? {}));
  for (const path of basePaths) {
    if (!candPaths.has(path)) diff.break_('path-removed', `/paths${path}`, `path removed: ${path}`);
  }
  for (const path of candPaths) {
    if (!basePaths.has(path)) diff.ok('path-added', `/paths${path}`, `path added: ${path}`);
  }

  const baseOps = operationMap(baseline);
  const candOps = operationMap(candidate);
  for (const name of baseOps.keys()) {
    if (!candOps.has(name)) diff.break_('operation-removed', `/operations/${name}`, `operation removed: ${name}`);
  }
  for (const name of candOps.keys()) {
    if (!baseOps.has(name)) diff.ok('operation-added', `/operations/${name}`, `operation added: ${name}`);
  }

  for (const [name, { operation: baseOperation, pathItem: basePathItem }] of baseOps) {
    const candEntry = candOps.get(name);
    if (!candEntry) continue;
    const { operation: candOperation, pathItem: candPathItem } = candEntry;
    const pointer = `/operations/${name}`;

    // Parameters — request side. A parameter that disappears is a request the server stops honouring.
    const baseParams = new Map(
      [...(basePathItem.parameters ?? []), ...(baseOperation.parameters ?? [])]
        .map((entry) => deref(baseline, entry))
        .map((parameter) => [`${parameter.in}:${parameter.name}`, parameter]),
    );
    const candParams = new Map(
      [...(candPathItem.parameters ?? []), ...(candOperation.parameters ?? [])]
        .map((entry) => deref(candidate, entry))
        .map((parameter) => [`${parameter.in}:${parameter.name}`, parameter]),
    );
    for (const [key, parameter] of baseParams) {
      if (!candParams.has(key)) {
        diff.break_('parameter-removed', `${pointer}/parameters/${key}`, `parameter removed: ${key}`);
        continue;
      }
      const other = candParams.get(key);
      if (!parameter.required && other.required) {
        diff.break_('parameter-newly-required', `${pointer}/parameters/${key}`, `parameter is now required: ${key}`);
      }
      if (parameter.schema && other.schema) {
        diffSchema(baseline, candidate, parameter.schema, other.schema, `${pointer}/parameters/${key}`, 'request', diff, seen);
      }
    }
    for (const [key, parameter] of candParams) {
      if (baseParams.has(key)) continue;
      if (parameter.required) {
        diff.break_('parameter-newly-required', `${pointer}/parameters/${key}`, `required parameter added: ${key}`);
      } else {
        diff.ok('parameter-added', `${pointer}/parameters/${key}`, `optional parameter added: ${key}`);
      }
    }

    // Request bodies — request side.
    const baseBody = new Map(contentSchemas(baseline, baseOperation.requestBody));
    const candBody = new Map(contentSchemas(candidate, candOperation.requestBody));
    for (const [mediaType, schema] of baseBody) {
      if (!candBody.has(mediaType)) {
        diff.break_('media-type-removed', `${pointer}/requestBody/${mediaType}`, `request media type removed: ${mediaType}`);
        continue;
      }
      diffSchema(baseline, candidate, schema, candBody.get(mediaType), `${pointer}/requestBody/${mediaType}`, 'request', diff, seen);
    }

    // Responses — response side.
    const baseResponses = baseOperation.responses ?? {};
    const candResponses = candOperation.responses ?? {};
    for (const status of Object.keys(baseResponses)) {
      if (!(status in candResponses)) {
        diff.break_('response-removed', `${pointer}/responses/${status}`, `response removed: ${status}`);
        continue;
      }
      const baseContent = new Map(contentSchemas(baseline, baseResponses[status]));
      const candContent = new Map(contentSchemas(candidate, candResponses[status]));
      for (const [mediaType, schema] of baseContent) {
        if (!candContent.has(mediaType)) {
          diff.break_('media-type-removed', `${pointer}/responses/${status}/${mediaType}`, `response media type removed: ${mediaType}`);
          continue;
        }
        diffSchema(baseline, candidate, schema, candContent.get(mediaType), `${pointer}/responses/${status}/${mediaType}`, 'response', diff, seen);
      }
    }
    for (const status of Object.keys(candResponses)) {
      if (!(status in baseResponses)) {
        diff.ok('response-added', `${pointer}/responses/${status}`, `response added: ${status}`);
      }
    }
  }

  return diff.result();
}
