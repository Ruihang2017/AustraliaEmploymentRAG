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
 *
 * # The sink must be synchronous (review round 2, finding 2)
 *
 * `TenantAuditSink` is typed `(event) => void`, and TypeScript's bivariant checking of that shape
 * accepts an `async` function with no error: it returns `Promise<void>`, which is assignable to
 * `void`. Nothing here awaits the return, so a sink installed as `async (event) => { ... }` runs its
 * body on a later microtask, `sink(event)` returns immediately, and the `try/catch` below has already
 * exited by the time an `await`ed store call inside the sink rejects — the rejection surfaces later as
 * an unhandled promise rejection, not as a caught error. For a `*_GRANTED` event that defeats the fail-
 * closed contract above: `crossTenantElevatedContext` would already have returned a live cross-tenant
 * context to its caller before the async sink's failure was even observable. `emitTenantAudit`
 * therefore checks the sink's return value for a thenable and treats that itself as a sink failure,
 * synchronously, before returning — but the sink must still not be a Promise-returning function: the
 * check exists to fail closed on the mistake, not to make async sinks a supported shape.
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

/**
 * `DATA-07` calls {@link setTenantAuditSink} once at bootstrap with the durable writer.
 *
 * The sink MUST be synchronous. `void` return typing does not stop an `async` function being passed
 * here — see the file header, "The sink must be synchronous" — and `emitTenantAudit` treats a thenable
 * return as a sink failure rather than trusting it, but that is a fail-closed backstop, not permission
 * to write an async sink: `emitTenantAudit` never awaits it, so the sink's own asynchronous work still
 * races the caller that installed it.
 */
export type TenantAuditSink = (event: TenantAuditEvent) => void;

const defaultSink: TenantAuditSink = (event) => {
  // Deliberately `warn`: an unwired audit sink is a deployment gap, not routine information.
  console.warn(
    `[tenant-audit] ${event.event} actor=${event.actorId} org=${event.organizationId} ` +
      `request=${event.requestId} (no audit sink installed; DATA-07 wires audit_event)`,
  );
};

let sink: TenantAuditSink = defaultSink;

/**
 * Installs the audit sink. `DATA-07` calls this once at bootstrap.
 *
 * The sink must be synchronous: `emitTenantAudit` never awaits its return, and TypeScript's `void`
 * return type does not reject an `async` function here (see {@link TenantAuditSink}). A sink that
 * returns a thenable is itself treated as a failed sink call — fail-closed for a `*_GRANTED` event,
 * contained for a refusal — but that is a backstop against the mistake, not a supported way to do
 * asynchronous work in the sink.
 */
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
 * `true` for anything that looks like a Promise — a thenable, not necessarily a `Promise` instance.
 * Duplicated from `transaction.ts` rather than shared: both files independently reject an async
 * return from a synchronous-by-contract callback, and the two call sites' failure handling differs
 * enough (this one has grant/refusal asymmetry; that one always throws) that a shared helper would
 * only be the four-line predicate, not the policy around it.
 */
function isThenable(value: unknown): boolean {
  return (
    (typeof value === 'object' || typeof value === 'function') &&
    value !== null &&
    typeof (value as { then?: unknown }).then === 'function'
  );
}

function handleSinkFailure(event: TenantAuditEvent, detail: string): void {
  if (failsClosed(event.event)) {
    throw new TenantAccessError(
      'AUDIT_SINK_FAILED',
      `the audit sink failed while recording ${event.event}, so it was not granted ` +
        `(PRD §21.2 requires an audited path): ${detail}`,
    );
  }
  console.warn(`[tenant-audit] sink threw while recording ${event.event}: ${detail}`);
}

/**
 * Emits one audit event. Package-internal — the public surface is only the setter.
 *
 * A throwing sink must not turn a *refusal* into a different failure (or, worse, swallow the refusal
 * by unwinding before the caller's own throw), so those sink errors are contained here. A throwing
 * sink on a *grant* propagates: the caller must not proceed as if the grant had been recorded.
 *
 * Review round 2, finding 2: an `async` sink is assignable to {@link TenantAuditSink} with no type
 * error (return-type bivariance treats `Promise<void>` as `void`), and its rejection would otherwise
 * surface after this function — and its caller, possibly `crossTenantElevatedContext` itself — has
 * already returned. A thenable return is therefore treated as a synchronous sink failure right here,
 * with the same grant/refusal asymmetry as a thrown error. The eventual settlement of that promise is
 * observed and discarded (`.then(undefined, noop)`) so a later rejection cannot also reach the process
 * as an unhandled rejection — the fail-closed decision was already made synchronously, on the return
 * value, not on how the promise eventually settles.
 */
export function emitTenantAudit(event: TenantAuditEvent): void {
  let result: unknown;
  try {
    result = sink(event);
  } catch (error) {
    handleSinkFailure(event, error instanceof Error ? error.message : String(error));
    return;
  }
  if (isThenable(result)) {
    (result as PromiseLike<unknown>).then(undefined, () => undefined);
    handleSinkFailure(
      event,
      'the sink returned a Promise; setTenantAuditSink requires a synchronous sink',
    );
  }
}
