/**
 * The closed PRD §34.9 error catalogue, as consumed by `apps/api`.
 *
 * The catalogue is NOT re-declared here. `FND-04` generates it from `schemas/openapi/openapi.yaml`
 * into `packages/contracts/src/generated/errors.ts` (`ErrorCode`, `errorHttpStatusByCode`,
 * `errorRetryableByCode`), so this file only re-shapes those maps into the row form the ticket's
 * deliverable 5 specifies. One source of truth: the ticket's fallback ("otherwise it is declared
 * here and the divergence is written back") does not fire.
 *
 * The import is a RELATIVE deep import rather than `@taxrag/contracts` on purpose: a workspace
 * dependency would have to be spelled `workspace:*`, which `tools/tests/skeleton.test.mjs`
 * ("pins every member dependency to an exact version") rejects, and the bare specifier maps at the
 * still-empty `packages/contracts/src/index.ts` barrel. `packages/domain` already consumes
 * `packages/contracts` the same way. See the plan's OQ-4.
 */
import type { ErrorCode } from '../../../../packages/contracts/src/generated/index.js';
import {
  errorCodes,
  errorHttpStatusByCode,
  errorRetryableByCode,
} from '../../../../packages/contracts/src/generated/index.js';

/** A PRD §34.9 error code. Re-exported so no `apps/api` file deep-imports the generated module. */
export type ApiErrorCode = ErrorCode;

/** One catalogue row: the HTTP status PRD §34.9 assigns the code, and its Retry column as a boolean. */
export interface ErrorCatalogueRow {
  readonly status: number;
  readonly retryable: boolean;
}

/** Every PRD §34.9 code, in identifier order. */
export const API_ERROR_CODES: readonly ApiErrorCode[] = Object.freeze([...errorCodes]);

/** The number of rows PRD §34.9 defines. A row appearing or disappearing must fail a test, loudly. */
export const API_ERROR_CODE_COUNT = 17;

function buildCatalogue(): Readonly<Record<ApiErrorCode, ErrorCatalogueRow>> {
  const rows: Partial<Record<ApiErrorCode, ErrorCatalogueRow>> = {};
  for (const code of errorCodes) {
    rows[code] = Object.freeze({
      status: errorHttpStatusByCode[code],
      retryable: errorRetryableByCode[code],
    });
  }
  return Object.freeze(rows as Record<ApiErrorCode, ErrorCatalogueRow>);
}

/**
 * `Readonly<Record<ApiErrorCode, { status, retryable }>>` — exactly the 17 PRD §34.9 rows.
 *
 * Frozen at module load, and frozen per row, so no request path can mutate a status or a
 * retryability under another request.
 */
export const ERROR_CATALOGUE: Readonly<Record<ApiErrorCode, ErrorCatalogueRow>> = buildCatalogue();

/** The row for `code`. Total over `ApiErrorCode` — the catalogue is closed. */
export function catalogueRow(code: ApiErrorCode): ErrorCatalogueRow {
  const row = ERROR_CATALOGUE[code];
  /* c8 ignore next 3 -- unreachable while `code` is an ApiErrorCode; a guard against a bad cast. */
  if (!row) {
    throw new Error(`error code is not in the PRD §34.9 catalogue: ${String(code)}`);
  }
  return row;
}

/** Whether `value` is one of the 17 PRD §34.9 codes. */
export function isApiErrorCode(value: unknown): value is ApiErrorCode {
  return typeof value === 'string' && Object.prototype.hasOwnProperty.call(ERROR_CATALOGUE, value);
}
