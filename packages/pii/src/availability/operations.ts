import { deepFreeze } from '../contract/freeze.js';

export const OPERATION_CLASSES = deepFreeze([
  /** PRD Sec10.1: public legal search MAY continue; it admits no customer free text into persistence or a provider call. */
  'PUBLIC_LEGAL_SEARCH',
  /** PRD Sec10.1: free-text Ask MUST fail closed; it admits customer free text into persistence or a provider call. */
  'FREE_TEXT_ASK',
  /** PRD Sec10.1: free-text Compare MUST fail closed; it admits customer free text into persistence or a provider call. */
  'FREE_TEXT_COMPARE',
  /** PRD Sec10.1: free-text Coverage MUST fail closed; it admits customer free text into persistence or a provider call. */
  'FREE_TEXT_COVERAGE',
  /** PRD Sec36.8: "Search and saved records remain available"; this admits no customer free text into persistence or a provider call. */
  'SAVED_RECORD_READ',
  /** PRD Sec36.8: "Search and saved records remain available"; this admits no customer free text into persistence or a provider call. */
  'EXISTING_ANSWER_READ',
  /** PRD Sec36.8: "Search and saved records remain available"; this admits no customer free text into persistence or a provider call. */
  'EXPORT_OF_EXISTING_SNAPSHOT',
] as const);

export type OperationClass = (typeof OPERATION_CLASSES)[number];

export const isOperationClass = (value: unknown): value is OperationClass =>
  typeof value === 'string' && (OPERATION_CLASSES as readonly string[]).includes(value);

/** The sole classification table used by the availability decision. */
export const ADMITS_CUSTOMER_FREE_TEXT: Readonly<Record<OperationClass, boolean>> = deepFreeze({
  PUBLIC_LEGAL_SEARCH: false,
  FREE_TEXT_ASK: true,
  FREE_TEXT_COMPARE: true,
  FREE_TEXT_COVERAGE: true,
  SAVED_RECORD_READ: false,
  EXISTING_ANSWER_READ: false,
  EXPORT_OF_EXISTING_SNAPSHOT: false,
});
