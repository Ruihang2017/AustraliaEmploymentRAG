/**
 * FND-04 deliverable 4 — the document-wide convention scans behind acceptance items 9-13.
 *
 * Every scan RETURNS a list of findings and never throws, so one test run reports every violation
 * at once instead of stopping at the first. A finding is `{ rule, location, message }`.
 *
 * The scans are driven by the `x-` markers sub-PRD D26 makes mandatory. The point of "EVERY
 * PATCH/PUT/DELETE must declare `x-mutable-resource`" is that a MISSING marker is a finding: a new
 * operation cannot slip past a check by omitting the annotation, which is the vacuous-green failure
 * mode FND-01's `known_failing` bounce (sub-PRD D18) is this repository's precedent for.
 */
import { httpMethods, operations, resolvePointer } from './document.mjs';

const WRITE_METHODS = ['post', 'put', 'patch', 'delete'];
const MUTATION_METHODS = ['put', 'patch', 'delete'];

/** PRD §16.2, quoted verbatim; `POST /v1/search`'s description must contain it. */
export const SEARCH_READ_ONLY_SENTENCE =
  'Search is read-only despite POST and MUST not consume generation credits.';

export const defaultSecretShapedResponseFields = [
  'secret',
  'client_secret',
  'password',
  'private_key',
  'signing_secret',
  'credential_value',
];

function finding(rule, location, message) {
  return { rule, location, message };
}

/** Follow a single `$ref` hop, if the node is a reference. */
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

/**
 * Path-item plus operation parameters, each as `{ name, in, ref }` where `ref` is the component
 * name when the parameter was `$ref`'d and `null` when it was inlined. Both levels are read: a leak
 * hidden in a path-level parameter is still a leak.
 */
export function parametersOf(document, pathItem, operation) {
  const raw = [...(pathItem.parameters ?? []), ...(operation.parameters ?? [])];
  return raw.map((entry) => {
    const ref = typeof entry.$ref === 'string' ? entry.$ref.split('/').pop() : null;
    const resolved = deref(document, entry) ?? {};
    return { name: resolved.name, in: resolved.in, ref, schema: resolved.schema };
  });
}

/**
 * Every PRD §34.9 code an operation declares, across single-code and composite responses.
 *
 * HTTP status is not one-to-one with code (three codes are 400, two 403, two 409, two 429, three
 * 503) and a `responses` map has one entry per status, so a composite response carries
 * `x-error-codes`. Collapsing both forms here is what lets the rules below talk about CODES rather
 * than about statuses, which is the thing the PRD actually specifies.
 */
export function declaredErrorCodes(document, operation) {
  const codes = new Set();
  for (const response of Object.values(operation.responses ?? {})) {
    const resolved = deref(document, response);
    if (!resolved) continue;
    if (typeof resolved['x-error-code'] === 'string') codes.add(resolved['x-error-code']);
    for (const code of resolved['x-error-codes'] ?? []) codes.add(code);
  }
  return codes;
}

/** Response entries whose media type is `application/json` and whose status is 2xx. */
function successJsonResponses(document, operation) {
  const found = [];
  for (const [status, response] of Object.entries(operation.responses ?? {})) {
    if (!/^2\d\d$/.test(status)) continue;
    const resolved = deref(document, response);
    const schema = resolved?.content?.['application/json']?.schema;
    if (schema) found.push({ status, schema });
  }
  return found;
}

// ------------------------------------------------------------------------------------------------
// Acceptance item 10 — ETag / If-Match / 409 CONCURRENT_MODIFICATION on mutable resources.
// PRD §16.2: "Editable resources MUST use ETag/version + `If-Match`; conflicts return
// `409 CONCURRENT_MODIFICATION`."
// ------------------------------------------------------------------------------------------------
export function scanMutableResources(document) {
  const findings = [];
  for (const { path, method, operation, pathItem } of operations(document)) {
    if (!MUTATION_METHODS.includes(method)) continue;
    const location = `${method.toUpperCase()} ${path}`;
    const marker = operation['x-mutable-resource'];
    if (typeof marker !== 'boolean') {
      findings.push(
        finding('mutable-resource-marker', location, 'declares no boolean `x-mutable-resource`'),
      );
      continue;
    }
    if (!marker) continue;

    const params = parametersOf(document, pathItem, operation);
    if (!params.some((parameter) => parameter.ref === 'IfMatch')) {
      findings.push(
        finding('mutable-resource-if-match', location, 'is `x-mutable-resource` but does not $ref the shared `IfMatch` parameter'),
      );
    }
    if (!declaredErrorCodes(document, operation).has('CONCURRENT_MODIFICATION')) {
      findings.push(
        finding('mutable-resource-409', location, 'is `x-mutable-resource` but declares no `CONCURRENT_MODIFICATION` response'),
      );
    }
    const read = pathItem.get;
    if (!read) {
      findings.push(
        finding('mutable-resource-etag', location, 'is `x-mutable-resource` but its path item has no GET to carry the `ETag` header'),
      );
    } else {
      const carriesEtag = Object.entries(read.responses ?? {}).some(
        ([status, response]) => /^2\d\d$/.test(status) && (deref(document, response)?.headers ?? {}).ETag,
      );
      if (!carriesEtag) {
        findings.push(
          finding('mutable-resource-etag', `GET ${path}`, 'reads an `x-mutable-resource` resource but declares no `ETag` response header'),
        );
      }
    }
  }
  return findings;
}

// ------------------------------------------------------------------------------------------------
// Acceptance item 11 — Idempotency-Key on retryable writes.
// PRD §34.1: "Key 16-128 characters; same actor/route/key/body returns original result; changed
// body returns 409."
// ------------------------------------------------------------------------------------------------
export function scanRetryableWrites(document) {
  const findings = [];

  const shared = document.components?.parameters?.IdempotencyKeyHeader;
  if (!shared) {
    findings.push(
      finding('idempotency-parameter', '#/components/parameters/IdempotencyKeyHeader', 'is not declared'),
    );
  } else {
    if (shared.name !== 'Idempotency-Key' || shared.in !== 'header') {
      findings.push(
        finding('idempotency-parameter', '#/components/parameters/IdempotencyKeyHeader', 'is not the `Idempotency-Key` header'),
      );
    }
    if (shared.schema?.minLength !== 16 || shared.schema?.maxLength !== 128) {
      findings.push(
        finding('idempotency-parameter', '#/components/parameters/IdempotencyKeyHeader', `does not constrain the key to 16-128 characters (got ${shared.schema?.minLength}-${shared.schema?.maxLength})`),
      );
    }
  }

  for (const { path, method, operation, pathItem } of operations(document)) {
    if (!WRITE_METHODS.includes(method)) continue;
    const location = `${method.toUpperCase()} ${path}`;
    const marker = operation['x-retryable-write'];
    if (typeof marker !== 'boolean') {
      findings.push(
        finding('retryable-write-marker', location, 'declares no boolean `x-retryable-write`'),
      );
      continue;
    }
    const params = parametersOf(document, pathItem, operation);
    const hasKey = params.some((parameter) => parameter.ref === 'IdempotencyKeyHeader');
    const codes = declaredErrorCodes(document, operation);
    if (marker) {
      if (!hasKey) {
        findings.push(
          finding('retryable-write-key', location, 'is `x-retryable-write` but does not $ref the shared `IdempotencyKeyHeader` parameter'),
        );
      }
      if (!codes.has('IDEMPOTENCY_CONFLICT')) {
        findings.push(
          finding('retryable-write-409', location, 'is `x-retryable-write` but declares no `IDEMPOTENCY_CONFLICT` response'),
        );
      }
    } else if (hasKey) {
      findings.push(
        finding('retryable-write-key', location, 'is not `x-retryable-write` yet accepts `Idempotency-Key`'),
      );
    }
    // PRD §34.1 lists If-Match and Idempotency-Key as separate concurrency contracts, and their two
    // 409s share a status but not a cause. Declaring both on one operation is the silent conflation
    // this rule exists to prevent.
    if (codes.has('IDEMPOTENCY_CONFLICT') && codes.has('CONCURRENT_MODIFICATION')) {
      findings.push(
        finding('conflict-codes-distinct', location, 'declares both `IDEMPOTENCY_CONFLICT` and `CONCURRENT_MODIFICATION`; one status, two causes — pick the one that applies'),
      );
    }
  }
  return findings;
}

// ------------------------------------------------------------------------------------------------
// Acceptance item 12 — pagination declared once and reused.
// PRD §34.1: "`page_size` 1-100, default 25; opaque `next_cursor`."
// ------------------------------------------------------------------------------------------------
const SHARED_PARAMETER_NAMES = new Map([
  ['page_size', 'PageSize'],
  ['cursor', 'Cursor'],
  ['Idempotency-Key', 'IdempotencyKeyHeader'],
  ['If-Match', 'IfMatch'],
]);

export function scanPagination(document) {
  const findings = [];
  const pageSize = document.components?.parameters?.PageSize;
  if (!pageSize) {
    findings.push(finding('pagination-declared-once', '#/components/parameters/PageSize', 'is not declared'));
  } else if (
    pageSize.name !== 'page_size' ||
    pageSize.schema?.minimum !== 1 ||
    pageSize.schema?.maximum !== 100 ||
    pageSize.schema?.default !== 25
  ) {
    findings.push(
      finding('pagination-declared-once', '#/components/parameters/PageSize', 'is not `page_size` with minimum 1, maximum 100, default 25'),
    );
  }
  if (!document.components?.parameters?.Cursor) {
    findings.push(finding('pagination-declared-once', '#/components/parameters/Cursor', 'is not declared'));
  }

  const collection = document.components?.schemas?.CollectionResponse;
  const collectionBody = collection?.allOf?.find((entry) => entry.properties?.next_cursor);
  if (!collectionBody) {
    findings.push(
      finding('pagination-next-cursor', '#/components/schemas/CollectionResponse', 'declares no `next_cursor` property'),
    );
  }

  for (const { path, method, operation, pathItem } of operations(document)) {
    const location = `${method.toUpperCase()} ${path}`;
    for (const parameter of parametersOf(document, pathItem, operation)) {
      const expected = SHARED_PARAMETER_NAMES.get(parameter.name);
      if (expected && parameter.ref !== expected) {
        findings.push(
          finding('pagination-reused', location, `inlines the shared parameter \`${parameter.name}\` instead of $ref'ing #/components/parameters/${expected}`),
        );
      }
    }
  }
  return findings;
}

// ------------------------------------------------------------------------------------------------
// Acceptance item 13 — POST /search is read-only and non-charging.
// ------------------------------------------------------------------------------------------------
export function scanSearchReadOnly(document, searchPath = '/search') {
  const findings = [];
  const operation = document.paths?.[searchPath]?.post;
  const location = `POST ${searchPath}`;
  if (!operation) return [finding('search-read-only', location, 'is not declared')];

  if (operation['x-read-only'] !== true) {
    findings.push(finding('search-read-only', location, 'does not declare `x-read-only: true`'));
  }
  if (operation['x-charges-credits'] !== false) {
    findings.push(finding('search-read-only', location, 'does not declare `x-charges-credits: false`'));
  }
  if (operation['x-retryable-write'] !== false) {
    findings.push(finding('search-read-only', location, 'does not declare `x-retryable-write: false`'));
  }
  if (!String(operation.description ?? '').includes(SEARCH_READ_ONLY_SENTENCE)) {
    findings.push(finding('search-read-only', location, 'does not quote PRD §16.2\'s read-only sentence in its description'));
  }
  if (declaredErrorCodes(document, operation).has('CREDIT_LIMIT_REACHED')) {
    findings.push(
      finding('search-non-charging', location, 'declares `CREDIT_LIMIT_REACHED`, which PRD §16.2 forbids on search'),
    );
  }
  return findings;
}

// ------------------------------------------------------------------------------------------------
// Sub-PRD D27 — the response envelope and its two PRD-mandated exemptions.
// ------------------------------------------------------------------------------------------------
export function scanResponseEnvelope(document) {
  const findings = [];
  for (const { path, method, operation } of operations(document)) {
    for (const { status, schema } of successJsonResponses(document, operation)) {
      const location = `${method.toUpperCase()} ${path} -> ${status}`;
      const candidates = schema.oneOf ?? schema.anyOf ?? [schema];
      for (const candidate of candidates) {
        const resolved = deref(document, candidate);
        if (!resolved) continue;
        const carriesEnvelope = (resolved.allOf ?? []).some(
          (entry) => entry.$ref === '#/components/schemas/ResponseEnvelope',
        );
        if (carriesEnvelope) continue;
        if (resolved['x-envelope-exempt'] === true) {
          if (!String(resolved['x-envelope-exempt-reason'] ?? '').trim()) {
            findings.push(
              finding('response-envelope', location, 'is `x-envelope-exempt` with no `x-envelope-exempt-reason`'),
            );
          }
          continue;
        }
        findings.push(
          finding('response-envelope', location, 'neither allOf\'s `ResponseEnvelope` nor declares `x-envelope-exempt` with a reason (PRD §16.1: every response includes `request_id`)'),
        );
      }
    }
  }
  return findings;
}

// ------------------------------------------------------------------------------------------------
// PRD §16.5 — other-tenant and absent IDs share one not-found response.
//
// A distinct 403 on a tenant-scoped READ would leak the existence of another tenant's resource. The
// only 403s this document may declare are MFA_REQUIRED and RECENT_AUTH_REQUIRED, which are about the
// CALLER's authentication strength, not about whether a resource exists.
// ------------------------------------------------------------------------------------------------
export function scanNotFoundUniformity(document) {
  const findings = [];
  const allowed = new Set(['MFA_REQUIRED', 'RECENT_AUTH_REQUIRED']);
  for (const { path, method, operation, pathItem } of operations(document)) {
    const location = `${method.toUpperCase()} ${path}`;
    const forbidden = deref(document, operation.responses?.['403']);
    if (forbidden) {
      const codes = [
        ...(typeof forbidden['x-error-code'] === 'string' ? [forbidden['x-error-code']] : []),
        ...(forbidden['x-error-codes'] ?? []),
      ];
      const leaky = codes.filter((code) => !allowed.has(code));
      if (leaky.length > 0) {
        findings.push(
          finding('tenant-not-found-uniform', location, `declares a 403 carrying ${leaky.join(', ')}; PRD §16.5 requires other-tenant and absent IDs to share the 404 response`),
        );
      }
    }
    const hasPathParameter = parametersOf(document, pathItem, operation).some(
      (parameter) => parameter.in === 'path',
    );
    if (hasPathParameter && !declaredErrorCodes(document, operation).has('RESOURCE_NOT_FOUND')) {
      findings.push(
        finding('tenant-not-found-uniform', location, 'addresses a resource by opaque ID but declares no `RESOURCE_NOT_FOUND` response'),
      );
    }
  }
  return findings;
}

// ------------------------------------------------------------------------------------------------
// PRD §16.4 BYOK — "Keys are displayed only on entry, decrypted only inside the Model Gateway and
// excluded from logs/exports/support."
// ------------------------------------------------------------------------------------------------
export function scanSecretsInResponses(document, forbiddenNames = defaultSecretShapedResponseFields) {
  const findings = [];
  const denied = new Set(forbiddenNames.map((name) => name.toLowerCase()));
  const seen = new Set();

  const walk = (schema, location) => {
    const resolved = deref(document, schema);
    if (!resolved || typeof resolved !== 'object') return;
    const key = JSON.stringify(schema.$ref ?? null) + location;
    if (schema.$ref) {
      if (seen.has(schema.$ref)) return;
      seen.add(schema.$ref);
    } else if (seen.has(key)) {
      return;
    }
    for (const [name, child] of Object.entries(resolved.properties ?? {})) {
      if (denied.has(name.toLowerCase())) {
        findings.push(
          finding('byok-secret-in-response', location, `response schema declares the secret-shaped property \`${name}\` (PRD §16.4)`),
        );
      }
      walk(child, `${location}.${name}`);
    }
    for (const branch of ['allOf', 'anyOf', 'oneOf']) {
      for (const entry of resolved[branch] ?? []) walk(entry, location);
    }
    if (resolved.items) walk(resolved.items, `${location}[]`);
  };

  for (const { path, method, operation } of operations(document)) {
    for (const { status, schema } of successJsonResponses(document, operation)) {
      walk(schema, `${method.toUpperCase()} ${path} -> ${status}`);
    }
  }
  return findings;
}

// ------------------------------------------------------------------------------------------------
// Sub-PRD D26 — every operation states which PRD section it is transcribed from.
// ------------------------------------------------------------------------------------------------
export function scanPrdBasis(document) {
  const findings = [];
  for (const { path, method, operation } of operations(document)) {
    if (!String(operation['x-prd-basis'] ?? '').trim()) {
      findings.push(
        finding('prd-basis', `${method.toUpperCase()} ${path}`, 'declares no `x-prd-basis`'),
      );
    }
    if (!operation.operationId) {
      findings.push(
        finding('operation-id', `${method.toUpperCase()} ${path}`, 'declares no `operationId`'),
      );
    }
  }
  const ids = operations(document).map(({ operation }) => operation.operationId);
  const duplicates = ids.filter((id, index) => id && ids.indexOf(id) !== index);
  for (const id of new Set(duplicates)) {
    findings.push(finding('operation-id', id, 'is used by more than one operation'));
  }
  return findings;
}

/** Every scan, in one call. `methods` is exported so a caller can assert the scan saw real methods. */
export function scanConventions(document, options = {}) {
  return [
    ...scanPrdBasis(document),
    ...scanMutableResources(document),
    ...scanRetryableWrites(document),
    ...scanPagination(document),
    ...scanSearchReadOnly(document),
    ...scanResponseEnvelope(document),
    ...scanNotFoundUniformity(document),
    ...scanSecretsInResponses(document, options.secretResponseFieldNames ?? defaultSecretShapedResponseFields),
  ];
}

export { httpMethods };
