/**
 * DATA-02 deliverable 4 — the two error kinds the tenant layer is allowed to raise.
 *
 * `ResourceNotFound` is the *caller-visible* one and is deliberately almost empty. PRD §16.5 and
 * §34.9 require that "other-tenant and absent opaque IDs return the same not-found response", so this
 * value carries the resource **kind** and nothing else: no requested id, no owning organisation, no
 * SQL, no `cause` that could smuggle either back out. `RUNT-02` maps it to `404 RESOURCE_NOT_FOUND`.
 *
 * The indistinguishability is not enforced by this class — it is enforced by the repository, whose
 * every read/update/delete is one `WHERE id = ? AND organization_id = ?`. Both cases return zero rows
 * on the same line of the same function, so there is no branch in which they could diverge. This
 * class only makes sure the *value* that leaves the layer says nothing either.
 *
 * `TenantAccessError` is the other half: a programming or authorisation fault rather than a lookup
 * miss. It never crosses the HTTP boundary, so it is allowed to be informative — a developer holding
 * an unscoped statement needs to be told which rule they broke.
 *
 * Neither class uses a TypeScript **parameter property** (`constructor(readonly code: X)`). Node runs
 * `.ts` in strip-only mode, which rejects that syntax outright, and `test/tenant/tx-worker.mjs` loads
 * these modules in a plain Node process — the same constraint DATA-01's `src/migrate/cli.mjs` lives
 * under. Assign in the body instead; `test/tenant/purity.test.ts` asserts nothing under
 * `src/tenant/**` reintroduces one.
 */

/** Codes for {@link TenantAccessError}. Closed union: a new failure mode gets a name here. */
export type TenantAccessErrorCode =
  /** A context was required and was missing, not a `TenantContext`, or forged (brand absent). */
  | 'MISSING_CONTEXT'
  /** A `TENANT` repository was handed a system context, or a `GLOBAL` one a tenant context. */
  | 'SCOPE_MISMATCH'
  /** A statement reached the chokepoint without a bound `organization_id` predicate. */
  | 'UNSCOPED_STATEMENT'
  /** A statement's bound `organization_id` is not the context's organisation. */
  | 'ORGANIZATION_MISMATCH'
  /** A repository or table spec is malformed; thrown at construction time, never per query. */
  | 'INVALID_SPEC'
  /** Two organisations in one transaction without elevation, or a cross-tenant write. */
  | 'ELEVATION_REQUIRED'
  /** `crossTenantElevatedContext` was called without a reason/incident/recent authentication. */
  | 'INVALID_ELEVATION'
  /** A `Tx` handle is missing, closed, forged, or belongs to another database handle. */
  | 'INVALID_TRANSACTION'
  /** `SQLITE_BUSY` outlasted `APP_SQLITE_BUSY_TIMEOUT_MS`. */
  | 'TX_CONFLICT'
  /** A pre-commit invariant id was registered twice. */
  | 'DUPLICATE_INVARIANT'
  /** The audit sink threw while recording a grant, so the grant was not made (PRD §21.2). */
  | 'AUDIT_SINK_FAILED';

/**
 * A fault in how the tenant layer was *used*. Safe to log in full; never returned to a client.
 */
export class TenantAccessError extends Error {
  override readonly name = 'TenantAccessError';
  readonly code: TenantAccessErrorCode;

  constructor(code: TenantAccessErrorCode, message: string) {
    super(message);
    this.code = code;
  }
}

/**
 * The single not-found value. Two instances for the same `kind` are deeply equal — the cross-tenant
 * acceptance matrix asserts exactly that, for "another tenant's id" against "an id that never
 * existed".
 *
 * The field set is fixed and tiny on purpose. If a future consumer wants more context for a log, it
 * belongs in the audit event (deliverable 8), not on this object: this one is the value that crosses
 * the boundary.
 */
export class ResourceNotFound extends Error {
  override readonly name = 'ResourceNotFound';
  readonly code = 'RESOURCE_NOT_FOUND';
  readonly kind: string;

  constructor(kind: string) {
    // The message repeats the kind and nothing else. A kind is a table/resource name, which is
    // already public API surface; an id or an organisation is not.
    super(`${kind} not found`);
    this.kind = kind;
  }

  /**
   * The structured payload, for assertions and for `RUNT-02`'s response mapping.
   *
   * Deep-equality on two `Error` instances is runner-dependent (some compare `stack`), so the
   * acceptance matrix compares this instead of weakening the error itself.
   */
  toJSON(): { readonly name: string; readonly code: string; readonly kind: string } {
    return { name: this.name, code: this.code, kind: this.kind };
  }
}

/** `true` when `value` is the indistinguishable not-found value (PRD §16.5). */
export function isResourceNotFound(value: unknown): value is ResourceNotFound {
  return value instanceof ResourceNotFound;
}
