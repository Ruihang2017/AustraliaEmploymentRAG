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
 */

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
 * Emits one audit event. Package-internal — the public surface is only the setter.
 *
 * A throwing sink must not turn a *refusal* into a different failure (or, worse, swallow the refusal
 * by unwinding before the caller's own throw), so sink errors are contained here.
 */
export function emitTenantAudit(event: TenantAuditEvent): void {
  try {
    sink(event);
  } catch (error) {
    console.warn(
      `[tenant-audit] sink threw while recording ${event.event}: ` +
        (error instanceof Error ? error.message : String(error)),
    );
  }
}
