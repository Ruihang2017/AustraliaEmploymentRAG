/**
 * EVID-07 deliverable 4, second bullet — the transport is INJECTED.
 *
 * A `Transport` is a function. This package never constructs one that can reach a network: it cannot,
 * because `src/**` imports nothing but relative paths and holds no `fetch`, no `node:http` and no
 * socket library (`test/providers/architecture.test.ts`). The cassette transport
 * (`cassette.ts`) is the default in tests; a live transport, if one ever exists, is the HOST's to
 * supply and the host's to audit.
 *
 * `TransportRequest` has NO credential member and no header map a caller could stuff one into —
 * `headersSubset` is a fixed, small, code-supplied set (PRD §35.6 records a *"headers subset"* and
 * nothing more). A credential, if a live transport needs one, is attached by that transport inside
 * the host, where it can be kept out of anything this package records.
 */
export interface TransportRequest {
  readonly providerId: string;
  /** Absent for an `IN_PROCESS` provider; an allowlisted https origin otherwise (`origin.ts`). */
  readonly origin?: string;
  readonly path: string;
  readonly method: 'POST';
  /** The assembled `ProviderRequestPayload`, serialised by the transport, never by this package. */
  readonly body: unknown;
  readonly headersSubset: Readonly<Record<string, string>>;
}

export interface TransportResponse {
  readonly status: number;
  /** Only the headers this package acts on — `retry-after` — and only ever read, never logged. */
  readonly headersSubset: Readonly<Record<string, string>>;
  /** The raw body as text. Handed straight to `parseModelResponse` and never stored or logged. */
  readonly body: string;
  /**
   * The provider-reported model version, which `ANS-004` requires in the snapshot. `null` when the
   * provider reported none — recorded as `null`, never omitted.
   */
  readonly modelVersion: string | null;
  readonly inputTokens: number | null;
  readonly outputTokens: number | null;
  /**
   * Provider-reported cost, where a provider reports one. Authoritative settlement is `EVID-08`'s;
   * this is what the row carries so the accounting has something to reconcile against.
   */
  readonly costMicroAud: bigint | null;
}

export type Transport = (request: TransportRequest) => Promise<TransportResponse>;
