/**
 * DATA-02 deliverable 2 — `TenantContext` and the four named factories that are the only way to
 * obtain one.
 *
 * PRD §16.5 fixes the order of operations: authenticate → resolve organisation → verify membership →
 * evaluate permission → perform the tenant-scoped lookup. This file owns only the third and fourth
 * steps' *result*: a context is the token that says "the first four steps happened, and this is who
 * for". Authentication is `02-auth-core`'s; the permission matrix is `packages/domain`'s (FND-06) and
 * is reached through `./domain.js` alone.
 *
 * A `TenantContext` is a structural type, so in TypeScript any object literal satisfies it. That is
 * why every context is **branded** (`context-internal.ts`) and why every entry point that accepts one
 * from outside this module calls {@link assertTenantContext}. Without the runtime check, one
 * `as TenantContext` cast anywhere in the future codebase yields an arbitrary-organisation context —
 * which is precisely the boundary SEC-001 exists to hold.
 */
import { emitTenantAudit } from './audit.js';
import { brandTenantContext, hasTenantContextBrand } from './context-internal.js';
import type { Permission, Principal } from './domain.js';
import { principalColumn } from './domain.js';
import { TenantAccessError } from './errors.js';

export type ActorType = 'USER' | 'SERVICE_ACCOUNT' | 'SYSTEM';

/**
 * The ticket declares `permissions: PermissionSet` "from `packages/domain` (FND-06)".
 *
 * `packages/domain/src/access` exports no `PermissionSet` type — only `Permission` — so the set type
 * is declared here over the domain's element type (plan §7 Q1). No permission *rule* is defined in
 * this package; `Permission` and every predicate over it stay FND-06's.
 */
export type PermissionSet = ReadonlySet<Permission>;

/** The break-glass grant recorded on an elevated context (PRD §21.2). */
export interface CrossTenantElevation {
  readonly reason: string;
  readonly incidentId: string;
  /** Epoch milliseconds of the operator's most recent strong authentication. */
  readonly recentAuthAt: number;
}

export interface TenantContext {
  readonly organizationId: string;
  readonly actorId: string;
  readonly actorType: ActorType;
  readonly permissions: PermissionSet;
  readonly requestId: string;
  /** Present only on the PRD §21.2 break-glass path. */
  readonly elevation?: CrossTenantElevation;
}

/**
 * The organisation a `systemContext` reports.
 *
 * A system context has no tenant, but `organizationId` is not optional on the type — so it carries a
 * sentinel that every tenant factory rejects and that no tenant repository will ever accept. Making
 * it a visible reserved value beats `''`, which would silently satisfy a sloppy truthiness check.
 */
export const SYSTEM_ORGANIZATION_ID = '__system__';

/**
 * How recent "recent-MFA" must be for the PRD §21.2 break-glass path.
 *
 * PRD §21.2 says "recent-MFA" without a number. Five minutes is provisional and deliberately
 * exported so the consumer that eventually owns the real MFA path (`02-auth-core` / `RUNT-02`) can
 * see and change one value rather than hunt a literal (plan §7 Q4).
 */
export const ELEVATION_MAX_AGE_MS = 5 * 60 * 1000;

/** Single source of "now", so tests control the window by offsetting `recentAuthAt`, not the clock. */
function now(): number {
  return Date.now();
}

function requireNonEmpty(value: unknown, what: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new TenantAccessError('MISSING_CONTEXT', `${what} must be a non-empty string`);
  }
  return value;
}

function requireTenantOrganization(organizationId: unknown): string {
  const value = requireNonEmpty(organizationId, 'organizationId');
  if (value === SYSTEM_ORGANIZATION_ID) {
    throw new TenantAccessError(
      'SCOPE_MISMATCH',
      `${SYSTEM_ORGANIZATION_ID} is reserved for systemContext() and is not a tenant organisation`,
    );
  }
  return value;
}

/**
 * A genuinely immutable `ReadonlySet<Permission>`.
 *
 * `Object.freeze(new Set(...))` does **not** work: freezing a `Set` leaves its internal slots
 * writable, so `.add()` and `.delete()` still mutate it. The only reliable answer is a facade over a
 * backing set that is never handed out.
 */
function permissionSet(permissions: Iterable<Permission>): PermissionSet {
  const backing = new Set<Permission>(permissions);
  const facade: PermissionSet = {
    get size(): number {
      return backing.size;
    },
    has: (permission: Permission): boolean => backing.has(permission),
    forEach: (callback, thisArg?: unknown): void => {
      backing.forEach((value) => {
        callback.call(thisArg, value, value, facade);
      });
    },
    keys: (): SetIterator<Permission> => backing.keys(),
    values: (): SetIterator<Permission> => backing.values(),
    entries: (): SetIterator<[Permission, Permission]> => backing.entries(),
    [Symbol.iterator]: (): SetIterator<Permission> => backing.values(),
  };
  return Object.freeze(facade);
}

interface ContextFields {
  organizationId: string;
  actorId: string;
  actorType: ActorType;
  permissions: Iterable<Permission>;
  requestId: string;
  elevation?: CrossTenantElevation;
}

function createContext(fields: ContextFields): TenantContext {
  // Built conditionally rather than with `elevation: undefined`: `exactOptionalPropertyTypes` is on,
  // and an own `elevation` key holding `undefined` would also make `'elevation' in ctx` lie.
  const base = {
    organizationId: fields.organizationId,
    actorId: fields.actorId,
    actorType: fields.actorType,
    permissions: permissionSet(fields.permissions),
    requestId: fields.requestId,
    ...(fields.elevation === undefined ? {} : { elevation: Object.freeze(fields.elevation) }),
  };
  return brandTenantContext<TenantContext>(base);
}

/** `true` only for a context minted by one of this module's factories. */
export function isTenantContext(value: unknown): value is TenantContext {
  if (!hasTenantContextBrand(value)) return false;
  const candidate = value as Partial<TenantContext>;
  return typeof candidate.organizationId === 'string' && typeof candidate.actorId === 'string';
}

/**
 * Throws unless `value` is a genuine context. Called at every boundary that takes one from a caller.
 *
 * Fails closed and says nothing about what was wrong with the value — a forged context is an attack
 * shape, not a typo.
 */
export function assertTenantContext(value: unknown): asserts value is TenantContext {
  if (!isTenantContext(value)) {
    throw new TenantAccessError(
      'MISSING_CONTEXT',
      'a TenantContext minted by this package is required; ' +
        'a plain object, a spread copy or a cast value is not one',
    );
  }
}

/** `true` for the reserved system context (PRD §35.6 `GLOBAL` tables). */
export function isSystemContext(ctx: TenantContext): boolean {
  return ctx.actorType === 'SYSTEM' && ctx.organizationId === SYSTEM_ORGANIZATION_ID;
}

/**
 * PRD §16.5 step 2–4: an authenticated principal, resolved to one organisation.
 *
 * Fails closed twice. A principal whose own organisation is not the requested one is rejected
 * outright — the request never reaches a lookup, so "authorise before lookup" (PRD §21.2) holds
 * structurally. A principal that occupies no §38.1 column (`principalColumn` returns `undefined`:
 * an unknown role, or a service account carrying a role) is rejected for the same reason. Neither
 * rule is a permission decision — the matrix itself stays in FND-06.
 */
export function tenantContextFromSession(
  principal: Principal,
  organizationId: string,
  requestId: string,
): TenantContext {
  const organization = requireTenantOrganization(organizationId);
  requireNonEmpty(requestId, 'requestId');
  requireNonEmpty(principal?.id, 'principal.id');

  if (principal.organizationId !== organization) {
    throw new TenantAccessError(
      'SCOPE_MISMATCH',
      'the principal is not a member of the requested organisation',
    );
  }
  if (principalColumn(principal) === undefined) {
    throw new TenantAccessError(
      'MISSING_CONTEXT',
      'the principal occupies no role/permission column (PRD §38.1); refusing to build a context',
    );
  }

  return createContext({
    organizationId: organization,
    actorId: principal.id,
    actorType: principal.kind === 'SERVICE_ACCOUNT' ? 'SERVICE_ACCOUNT' : 'USER',
    permissions: principal.grants,
    requestId,
  });
}

/**
 * The lease a worker re-authorises from (PRD §18.5 step 3).
 *
 * The grants are carried on the lease rather than re-read from the session because the session is
 * long gone by the time the job runs; the worker's obligation is to re-derive them at lease time and
 * put the result here, not to trust a token minted at enqueue time.
 */
export interface JobLease {
  readonly jobId: string;
  readonly organizationId: string;
  readonly actorId: string;
  readonly actorType: Exclude<ActorType, 'SYSTEM'>;
  readonly grants: readonly Permission[];
}

/** PRD §18.5 step 3 — "reauthorises actor, tenant, resource and budget" before the job body runs. */
export function tenantContextFromJobLease(job: JobLease, requestId: string): TenantContext {
  requireNonEmpty(job?.jobId, 'job.jobId');
  const organization = requireTenantOrganization(job.organizationId);
  requireNonEmpty(job.actorId, 'job.actorId');
  requireNonEmpty(requestId, 'requestId');
  if (job.actorType !== 'USER' && job.actorType !== 'SERVICE_ACCOUNT') {
    throw new TenantAccessError(
      'SCOPE_MISMATCH',
      'a job lease actor is a USER or a SERVICE_ACCOUNT; SYSTEM comes from systemContext()',
    );
  }

  return createContext({
    organizationId: organization,
    actorId: job.actorId,
    actorType: job.actorType,
    permissions: job.grants ?? [],
    requestId,
  });
}

/**
 * A context for `GLOBAL`-scoped tables only — e.g. `detected_change`, which PRD §35.6 calls a
 * "global public-source event, not tenant content".
 *
 * It carries {@link SYSTEM_ORGANIZATION_ID}, which every tenant repository refuses, so it cannot read
 * or write a `TENANT`-scoped table. The `scope` argument is not decoration: passing `'TENANT'` is the
 * mistake this factory exists to make impossible, so it throws.
 */
export function systemContext(scope: 'GLOBAL', requestId: string): TenantContext {
  requireNonEmpty(requestId, 'requestId');
  if (scope !== 'GLOBAL') {
    throw new TenantAccessError(
      'SCOPE_MISMATCH',
      'systemContext() is for GLOBAL-scoped tables only; a TENANT table needs a tenant context',
    );
  }
  return createContext({
    organizationId: SYSTEM_ORGANIZATION_ID,
    actorId: 'system',
    actorType: 'SYSTEM',
    permissions: [],
    requestId,
  });
}

export interface CrossTenantElevationRequest {
  readonly organizationId: string;
  readonly actorId: string;
  readonly reason: string;
  readonly incidentId: string;
  /** Epoch milliseconds of the operator's most recent strong authentication. */
  readonly recentAuthAt: number;
  readonly requestId: string;
  /** Permissions the elevated operator acts with. Defaults to none. */
  readonly permissions?: readonly Permission[];
}

/**
 * PRD §21.2's break-glass path: "Cross-organisation internal access uses a separate recent-MFA,
 * reason-required, audited path."
 *
 * All three conditions are enforced here, and the audit callback fires **synchronously before this
 * function returns** — an elevation that is granted but not recorded is exactly the failure this
 * control exists to prevent, so the record cannot be deferred to the caller. A refusal is audited
 * too: attempts matter as much as grants.
 */
export function crossTenantElevatedContext(request: CrossTenantElevationRequest): TenantContext {
  const organizationId =
    typeof request?.organizationId === 'string' ? request.organizationId : '(unknown)';
  const actorId = typeof request?.actorId === 'string' ? request.actorId : '(unknown)';
  const requestId = typeof request?.requestId === 'string' ? request.requestId : '(unknown)';

  const refuse = (message: string): never => {
    emitTenantAudit({
      event: 'CROSS_TENANT_ELEVATION_REFUSED',
      actorId,
      organizationId,
      requestId,
      reason: message,
    });
    throw new TenantAccessError('INVALID_ELEVATION', message);
  };

  if (typeof request?.reason !== 'string' || request.reason.trim().length === 0) {
    refuse('a cross-tenant elevation requires a non-empty reason (PRD §21.2)');
  }
  if (typeof request.incidentId !== 'string' || request.incidentId.trim().length === 0) {
    refuse('a cross-tenant elevation requires an incidentId (PRD §21.2)');
  }
  if (typeof request.recentAuthAt !== 'number' || !Number.isFinite(request.recentAuthAt)) {
    refuse('a cross-tenant elevation requires recentAuthAt as epoch milliseconds');
  }
  const age = now() - request.recentAuthAt;
  if (age > ELEVATION_MAX_AGE_MS) {
    refuse(
      `the operator's authentication is older than ELEVATION_MAX_AGE_MS (${ELEVATION_MAX_AGE_MS}ms)`,
    );
  }
  if (age < -ELEVATION_MAX_AGE_MS) {
    // A far-future timestamp is a clock fault or a forgery; either way it is not "recent MFA".
    refuse("the operator's authentication timestamp is in the future");
  }

  const organization = requireTenantOrganization(request.organizationId);
  requireNonEmpty(request.actorId, 'actorId');
  requireNonEmpty(request.requestId, 'requestId');

  const ctx = createContext({
    organizationId: organization,
    actorId: request.actorId,
    actorType: 'USER',
    permissions: request.permissions ?? [],
    requestId: request.requestId,
    elevation: {
      reason: request.reason,
      incidentId: request.incidentId,
      recentAuthAt: request.recentAuthAt,
    },
  });

  emitTenantAudit({
    event: 'CROSS_TENANT_ELEVATION_GRANTED',
    actorId: ctx.actorId,
    organizationId: ctx.organizationId,
    requestId: ctx.requestId,
    reason: request.reason,
    incidentId: request.incidentId,
  });

  return ctx;
}
