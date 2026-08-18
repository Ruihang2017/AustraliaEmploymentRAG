/**
 * "Organisation closure blocks writes" (PRD §35.4, §10.3), as one predicate.
 *
 * PRD §10.3 is "export followed by deletion within 30 days", which is why a closed organisation's
 * rows are *kept* and its writes are *refused* rather than the rows being deleted. The check reads
 * `organization.status` **inside the caller's transaction**: a read taken before the transaction
 * opens could observe a status a concurrent close has since changed, and the refusal would then be
 * decided on a stale value.
 *
 * `DATA-05`…`DATA-07` consume **this** predicate (the ticket's Feedback obligation says so
 * explicitly: export the guard, do not duplicate it). It is deliberately NOT registered via
 * `registerPreCommitInvariant` — that registry is `DATA-09`'s to populate, and a guard that only
 * fires at commit time would let a whole transaction's work be built on a refusal.
 */
import type { AppDatabaseHandle } from '../../tenant/connection.js';
import type { TenantContext } from '../../tenant/context.js';
import { ResourceNotFound } from '../../tenant/errors.js';
import { requireOpenTx } from '../../tenant/transaction.js';
import type { Tx } from '../../tenant/tx-internal.js';
import { ORGANIZATION_STATUS_CLOSED } from '../../schema/tenancy.js';

import { TenancyError } from './errors.js';
import { runScopedSelect } from './internal/statement.js';

/**
 * The operations PRD §10.3 keeps available after closure.
 *
 * An explicit, named allowlist rather than a boolean argument: "which operations may still run on a
 * closed organisation" is a product decision from §10.3, and it should be readable in one place
 * instead of being implied by call sites that happen not to call the guard.
 */
export const CLOSURE_EXEMPT_OPERATIONS = Object.freeze([
  /** PRD §10.3 — the export half of "export followed by deletion". */
  'export',
  /** PRD §10.3 — the deletion half, within 30 days. */
  'delete',
  /** Moving the organisation through CLOSING/CLOSED itself; otherwise closure could not complete. */
  'close',
  /**
   * Revoking an API credential (PRD §10.3 + AUTH-006). Shutting access down is a *safety* write and
   * must stay available after closure — but it is exempt **here, by name**, not by a call site
   * quietly not calling the guard. Every other credential write (`create`, `rotate`,
   * `touchLastUsed`) is refused on a closed organisation.
   */
  'api_credential.revoke',
] as const);

export type ClosureExemptOperation = (typeof CLOSURE_EXEMPT_OPERATIONS)[number];

export function isClosureExempt(operation: string): operation is ClosureExemptOperation {
  return (CLOSURE_EXEMPT_OPERATIONS as readonly string[]).includes(operation);
}

/**
 * Throws `TenancyError('ORGANIZATION_CLOSED')` when the context's organisation is closed.
 *
 * A missing organisation row is `ResourceNotFound('organization')` — the same value every other
 * absent-or-other-tenant lookup produces, so a caller cannot distinguish "another tenant's id" from
 * "no such organisation" here either (PRD §16.5).
 */
export function assertOrganizationOpen(
  db: AppDatabaseHandle,
  ctx: TenantContext,
  tx: Tx,
  operation = 'write',
): void {
  // The transaction handle is required, not decorative: it is what proves the status read below and
  // the write it guards observe the same snapshot. `requireOpenTx` rejects a forged, closed or
  // foreign handle.
  requireOpenTx(tx, db);
  if (isClosureExempt(operation)) return;
  const rows = runScopedSelect(db, ctx, {
    table: 'organization',
    where: [{ column: 'id', op: '=', value: ctx.organizationId }],
    limit: 1,
  });
  const row = rows[0];
  if (row === undefined) throw new ResourceNotFound('organization');
  if (row['status'] === ORGANIZATION_STATUS_CLOSED) {
    throw new TenancyError(
      'ORGANIZATION_CLOSED',
      `the organisation is closed; ${operation} is refused (PRD §10.3, §35.4)`,
      operation,
    );
  }
}
