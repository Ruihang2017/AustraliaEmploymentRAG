/**
 * DATA-02 deliverable 8 — the audit callback seam.
 *
 * `DATA-07` owns the `audit_event` table and will wire the real writer here. Nothing in this file
 * writes a table: the table does not exist yet, and creating it would be inside `DATA-07`'s
 * file-scope.
 *
 * The default sink warns once per event rather than staying silent. A break-glass cross-tenant
 * elevation (PRD §21.2) that produced no record at all because nobody had called
 * `setTenantAuditSink` would be the worst possible default.
 *
 * # Sink failures are handled asymmetrically, on purpose
 *
 * A sink that throws while recording a **refusal** is contained: the refusal is the security outcome,
 * and converting it into a different error — or unwinding before the caller's own `throw` — would
 * turn an audit outage into a behaviour change on the path that is already failing closed.
 *
 * A sink that throws while recording a **grant** (`*_GRANTED`) propagates, so the grant is not made.
 * PRD §21.2 permits cross-organisation access only through an "audited path"; an elevation that is
 * granted while its record is silently lost is exactly the outcome that control exists to prevent, and
 * a `console.warn` is not an audit trail. Sub-PRD **D13** records this so `DATA-07` inherits the
 * contract when it wires the durable `audit_event` writer, rather than "improving" it into a
 * best-effort write.
 */
import { TenantAccessError } from './errors.js';

/** Event names emitted by this layer. Closed union so `DATA-07` can exhaustively map them. */
export type TenantAuditEventName =
  /** A `crossTenantElevatedContext` was successfully minted (PRD §21.2 break-glass). */
  | 'CROSS_TENANT_ELEVATION_GRANTED'
  /** A break-glass request was rejected (missing reason/incident, or stale authentication). */
  | 'CROSS_TENANT_ELEVATION_REFUSED'
  /** A statement was rejected by `assertTenantScoped`. */
  | 'UNSCOPED_STATEMENT_REFUSED'
  /** A repository or transaction refused an access that crossed an organisation boundary. */
  | 'CROSS_TENANT_ACCESS_REFUSED';

export interface TenantAuditEvent {
  readonly event: TenantAuditEventName;
  readonly actorId: string;
  readonly organizationId: string;
  readonly requestId: string;
  readonly reason?: string;
  readonly incidentId?: string;
}

export type TenantAuditSink = (event: TenantAuditEvent) => void;

const defaultSink: TenantAuditSink = (event) => {
  // Deliberately `warn`: an unwired audit sink is a deployment gap, not routine information.
  console.warn(
    `[tenant-audit] ${event.event} actor=${event.actorId} org=${event.organizationId} ` +
      `request=${event.requestId} (no audit sink installed; DATA-07 wires audit_event)`,
  );
};

let sink: TenantAuditSink = defaultSink;

/** Installs the audit sink. `DATA-07` calls this once at bootstrap. */
export function setTenantAuditSink(next: TenantAuditSink): void {
  sink = next;
}

/**
 * Restores the built-in warning sink.
 *
 * Test seam: the sink is module-level state and vitest shares a module registry within a file, so a
 * test that installs a spy must restore it or the next test counts the previous test's events.
 */
export function resetTenantAuditSink(): void {
  sink = defaultSink;
}

/**
 * `true` for the events whose sink failure must fail the operation (see the file header).
 *
 * Matched on the `_GRANTED` suffix rather than an enumerated list so that a future grant event added
 * to {@link TenantAuditEventName} is fail-closed by default: forgetting to add a name to a list is a
 * silent downgrade of a security control, and the naming convention is already the thing that
 * distinguishes a grant from a refusal.
 */
function failsClosed(event: TenantAuditEventName): boolean {
  return event.endsWith('_GRANTED');
}

/**
 * Emits one audit event. Package-internal — the public surface is only the setter.
 *
 * A throwing sink must not turn a *refusal* into a different failure (or, worse, swallow the refusal
 * by unwinding before the caller's own throw), so those sink errors are contained here. A throwing
 * sink on a *grant* propagates: the caller must not proceed as if the grant had been recorded.
 */
export function emitTenantAudit(event: TenantAuditEvent): void {
  try {
    sink(event);
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    if (failsClosed(event.event)) {
      throw new TenantAccessError(
        'AUDIT_SINK_FAILED',
        `the audit sink failed while recording ${event.event}, so it was not granted ` +
          `(PRD §21.2 requires an audited path): ${detail}`,
      );
    }
    console.warn(`[tenant-audit] sink threw while recording ${event.event}: ${detail}`);
  }
}
