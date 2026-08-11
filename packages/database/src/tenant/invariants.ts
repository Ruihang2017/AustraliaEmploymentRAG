/**
 * DATA-02 deliverable 7 — the pre-commit invariant registry.
 *
 * This is the seam `DATA-09` uses to enforce the PRD §35.8 invariants without owning a migration
 * (sub-PRD D5). Hooks run **inside** the transaction, immediately before `COMMIT`, and abort it by
 * throwing. Running them after commit would only be able to report a violation that had already been
 * durably written, which is not enforcement.
 *
 * The registry is module-level state. That is deliberate — `DATA-09` registers once at import time
 * and every transaction in the process is then covered, with no way for a caller to opt out — but it
 * means tests must reset it; {@link clearPreCommitInvariants} is that seam.
 */
import type { TenantContext } from './context.js';
import { TenantAccessError } from './errors.js';
import type { ChangeSetEntry, Tx } from './tx-internal.js';

export type { ChangeSetEntry } from './tx-internal.js';

/**
 * A hook run before `COMMIT`. Throw to abort the transaction.
 *
 * It receives the live `Tx`, so it can read (through a repository) the rows the transaction has
 * written but not yet committed — which is the only vantage point from which a cross-row invariant is
 * checkable.
 */
export type PreCommitInvariant = (
  tx: Tx,
  ctx: TenantContext,
  changeSet: readonly ChangeSetEntry[],
) => void;

export interface RegisteredInvariant {
  readonly id: string;
  readonly check: PreCommitInvariant;
}

/** Registration order is the run order, and `listPreCommitInvariants()` reports it unchanged. */
const invariants = new Map<string, PreCommitInvariant>();

/**
 * Registers `check` under `id`.
 *
 * A duplicate `id` is an error rather than an overwrite: two modules silently registering the same id
 * means one of the two invariants is not running, and the symptom of that is data that violates a
 * PRD §35.8 rule with every test still green.
 */
export function registerPreCommitInvariant(id: string, check: PreCommitInvariant): void {
  if (typeof id !== 'string' || id.trim().length === 0) {
    throw new TenantAccessError('INVALID_SPEC', 'a pre-commit invariant needs a non-empty id');
  }
  if (typeof check !== 'function') {
    throw new TenantAccessError('INVALID_SPEC', `invariant ${id} is not a function`);
  }
  if (invariants.has(id)) {
    throw new TenantAccessError('DUPLICATE_INVARIANT', `a pre-commit invariant ${id} is already registered`);
  }
  invariants.set(id, check);
}

/** The registered invariants in registration order. Frozen — the run order is not caller-editable. */
export function listPreCommitInvariants(): readonly RegisteredInvariant[] {
  return Object.freeze(
    [...invariants].map(([id, check]) => Object.freeze({ id, check })),
  );
}

/**
 * Removes every registration.
 *
 * **Test seam.** Production code registers at import time and never unregisters; a test that asserts
 * on invocation counts has to start from a known empty registry, and vitest shares a module registry
 * across the tests within one file.
 */
export function clearPreCommitInvariants(): void {
  invariants.clear();
}
