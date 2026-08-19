/**
 * DATA-04's typed failures.
 *
 * `TenantAccessErrorCode` (DATA-02, `src/tenant/errors.ts`) is a **closed** union owned by another
 * ticket's file-scope, so this group declares its own error type rather than widening it. Not-found
 * stays `ResourceNotFound` from that module — there is deliberately no second not-found type here,
 * because the cross-tenant matrix compares the other-tenant and absent-id errors by deep equality
 * and two distinct classes could never satisfy it (PRD §16.5, §30.2 AUTH-002).
 *
 * `CONCURRENT_MODIFICATION` is spelled exactly as the canonical `packages/contracts` `ErrorCode`
 * member, so `RCRD-01`/`IDNT-*` map it to HTTP 409 without a translation table (PRD §34.1, §34.9).
 *
 * No parameter properties anywhere: Node's strip-only type mode rejects them, which is why
 * `src/tenant/**` is written this way and why `test/tenant/purity.test.ts` asserts it.
 */

export type TenancyErrorCode =
  /** PRD §10.3, §35.4 — the organisation's closure state blocks writes. */
  | 'ORGANIZATION_CLOSED'
  /** PRD §35.4 — `organization.slug` is unique; surfaced typed, never as a raw driver error. */
  | 'SLUG_CONFLICT'
  /** `user.email_normalized` is globally unique (PRD §35.4). */
  | 'EMAIL_CONFLICT'
  /** PRD §34.1 — a `row_version` compare-and-swap lost. Maps to 409 (PRD §34.9). */
  | 'CONCURRENT_MODIFICATION'
  /** PRD §35.4 — the last `ACTIVE` `OWNER` cannot be demoted, suspended or removed. */
  | 'LAST_OWNER'
  /** `actor` requires exactly one linkage for USER/SERVICE_ACCOUNT and none for SYSTEM. */
  | 'INVALID_ACTOR_LINKAGE'
  /** PRD §38.3, AUTH-005 — enforcement requires a successful, current SSO test. */
  | 'SSO_TEST_REQUIRED'
  /** A `scopes_json` entry that is not a registered `ApiScope` (PRD §16.3). */
  | 'INVALID_SCOPE'
  /** A repository argument that is structurally wrong — e.g. an unknown key on a credential. */
  | 'INVALID_ARGUMENT';

/**
 * A tenancy-layer refusal.
 *
 * `toJSON()` mirrors `ResourceNotFound`'s so a route layer can serialise either without knowing
 * which it caught.
 */
export class TenancyError extends Error {
  readonly code: TenancyErrorCode;
  /** Non-identifying context. Never a token, a secret, a hash or customer text. */
  readonly detail: string | undefined;

  constructor(code: TenancyErrorCode, message: string, detail?: string) {
    super(message);
    this.name = 'TenancyError';
    this.code = code;
    this.detail = detail;
  }

  toJSON(): { name: string; code: TenancyErrorCode; message: string; detail?: string } {
    return this.detail === undefined
      ? { name: this.name, code: this.code, message: this.message }
      : { name: this.name, code: this.code, message: this.message, detail: this.detail };
  }
}

export function isTenancyError(value: unknown): value is TenancyError {
  return value instanceof TenancyError;
}
