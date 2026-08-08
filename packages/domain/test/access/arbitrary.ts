/**
 * Seeded generators for the FND-06 property tests.
 *
 * WHY NOT A PROPERTY-TESTING LIBRARY: `tools/tests/skeleton.test.mjs` asserts that every pnpm member
 * manifest declares `dependencies == {}` and `devDependencies == {}` (sub-PRD D2/D16), so a library
 * cannot be declared in `packages/domain/package.json` without breaking a repository-wide `FND-01`
 * invariant. Recorded as sub-PRD decision **D22**, with the ticket's Test-plan harness sentence
 * amended in the same writeback.
 *
 * The generators are a `mulberry32` PRNG over a constant exported `SEED`, so a run is deterministic
 * and any counterexample is reproducible from `SEED` plus the printed case index. Not a test file —
 * vitest collects only `*.test.*`.
 */
import {
  API_SCOPE_VALUES,
  PERMISSION_VALUES,
  ROLE_VALUES,
} from '../../../contracts/src/enums/index.js';
import type { ApiScope, Permission, Role } from '../../../contracts/src/enums/index.js';
import type {
  AuditView,
  EvaluationContext,
  Grant,
  Intent,
  Principal,
  Resource,
  UsageView,
} from '../../src/access/index.js';

/** Change this and every property test re-explores a different, still deterministic, case space. */
export const SEED = 0x5eedf06;

export type Rng = () => number;

/** Deterministic, dependency-free 32-bit PRNG. */
export function mulberry32(seed: number): Rng {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const rngFor = (label: string): Rng =>
  mulberry32(SEED + [...label].reduce((sum, character) => sum + character.charCodeAt(0), 0));

export function pick<T>(rng: Rng, values: readonly T[]): T {
  const value = values[Math.floor(rng() * values.length)];
  if (value === undefined) throw new Error('pick() called with an empty list');
  return value;
}

export function subset<T>(rng: Rng, values: readonly T[]): readonly T[] {
  return values.filter(() => rng() < 0.4);
}

export const MEMBER_IDS: readonly string[] = ['member-1', 'member-2', 'member-3'];
export const RESOURCE_IDS: readonly string[] = ['record-1', 'record-2'];

export const randomAction = (rng: Rng): Permission => pick(rng, PERMISSION_VALUES);
export const randomRole = (rng: Rng): Role => pick(rng, ROLE_VALUES);
export const randomScopes = (rng: Rng): readonly ApiScope[] => subset(rng, API_SCOPE_VALUES);

export function randomGrants(rng: Rng): readonly Grant[] {
  const count = Math.floor(rng() * 3);
  const grants: Grant[] = [];
  for (let index = 0; index < count; index += 1) {
    const permission = randomAction(rng);
    grants.push(
      rng() < 0.5 ? { permission } : { permission, resourceId: pick(rng, RESOURCE_IDS) },
    );
  }
  return grants;
}

export interface PrincipalOptions {
  /** Force the principal kind; otherwise a service account turns up about a third of the time. */
  readonly kind?: Principal['kind'];
  readonly role?: Role;
}

/**
 * A **valid** principal: a real role (or a service account with none), a non-empty id and
 * organisation, real grants and real scopes. Validity is the point — a generator that emits garbage
 * principals makes every property vacuously true at the membership step.
 */
export function randomPrincipal(
  rng: Rng,
  organizationId: string,
  options: PrincipalOptions = {},
): Principal {
  const kind = options.kind ?? (rng() < 0.35 ? 'SERVICE_ACCOUNT' : 'USER');
  const base = {
    id: pick(rng, MEMBER_IDS),
    organizationId,
    grants: randomGrants(rng),
    scopes: randomScopes(rng),
  };
  if (kind === 'SERVICE_ACCOUNT') return { kind, ...base };
  return { kind: 'USER', role: options.role ?? randomRole(rng), ...base };
}

export function randomResource(rng: Rng, organizationId: string): Resource {
  const resource: {
    organizationId: string;
    id?: string;
    ownerId?: string;
    sharedWith?: readonly string[];
    assignedReviewerId?: string;
  } = { organizationId };
  if (rng() < 0.9) resource.id = pick(rng, RESOURCE_IDS);
  if (rng() < 0.7) resource.ownerId = pick(rng, MEMBER_IDS);
  if (rng() < 0.6) resource.sharedWith = subset(rng, MEMBER_IDS);
  if (rng() < 0.5) resource.assignedReviewerId = pick(rng, MEMBER_IDS);
  return resource;
}

const INTENTS: readonly Intent[] = ['READ', 'WRITE'];
const USAGE_VIEWS: readonly UsageView[] = ['ORGANIZATION', 'OWN', 'API_SERVICE'];
const AUDIT_VIEWS: readonly AuditView[] = ['FULL', 'LIMITED', 'CREDENTIAL_ONLY'];

export function randomContext(rng: Rng): EvaluationContext {
  const context: {
    intent: Intent;
    ownerCount?: number;
    target?: { memberId: string; role: Role };
    usageView?: UsageView;
    auditView?: AuditView;
  } = { intent: pick(rng, INTENTS) };
  if (rng() < 0.8) context.ownerCount = Math.floor(rng() * 4);
  if (rng() < 0.7) context.target = { memberId: pick(rng, MEMBER_IDS), role: randomRole(rng) };
  if (rng() < 0.8) context.usageView = pick(rng, USAGE_VIEWS);
  if (rng() < 0.8) context.auditView = pick(rng, AUDIT_VIEWS);
  return context;
}

/** Printed on failure so a counterexample is reproducible from `SEED` + the case index. */
export const caseLabel = (index: number, detail: unknown): string =>
  `seed ${SEED}, case ${index}: ${JSON.stringify(detail)}`;
