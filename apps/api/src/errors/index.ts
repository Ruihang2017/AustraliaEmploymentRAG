/**
 * The public error surface of `apps/api`. Route areas import from here and never deep-import a file.
 */
export type { ApiErrorCode, ErrorCatalogueRow } from './catalogue.js';
export {
  API_ERROR_CODES,
  API_ERROR_CODE_COUNT,
  ERROR_CATALOGUE,
  catalogueRow,
  isApiErrorCode,
} from './catalogue.js';

export type { ApiErrorDetails } from './api-error.js';
export {
  ApiError,
  apiErrorFactories,
  authenticationRequired,
  concurrentModification,
  corpusIncompatible,
  creditLimitReached,
  employeePiiDetected,
  ephemeralContentExpired,
  generationUnavailable,
  idempotencyConflict,
  internalError,
  invalidAbn,
  invalidLegalDate,
  invalidRequest,
  isApiError,
  mfaRequired,
  rateLimited,
  recentAuthRequired,
  resourceNotFound,
  sourceNotCurrent,
} from './api-error.js';

export type { ApiErrorBody, ErrorHandlingOptions, ErrorLogger } from './handler.js';
export {
  INTERNAL_ERROR_MESSAGE,
  NOT_FOUND_MESSAGE,
  VALIDATION_ERROR_MESSAGE,
  classifyError,
  errorBody,
  installErrorHandling,
  sanitiseFieldName,
  silentErrorLogger,
  validationFieldNames,
} from './handler.js';
