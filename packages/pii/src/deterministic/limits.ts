/**
 * EVID-01 deliverable 6 — PRD §37.2 stage 1: request byte/field limits, applied BEFORE any scanning
 * so a hostile payload cannot exhaust the detector (PRD §21.1 *"file/type/time/size/resource
 * limits"*).
 *
 * THREE RULES THIS FILE EXISTS TO ENFORCE:
 *
 * 1. **Never truncate.** Deliverable 6 is explicit: exceeding a limit is a `REJECT`, not a
 *    truncation. A truncating limit stage would hand a shortened payload to the detectors and admit
 *    the tail unscanned — the worst possible failure mode for a PII boundary.
 * 2. **Collect every violation.** The caller gets one complete answer instead of discovering the
 *    next problem on the next round trip.
 * 3. **Close the reserved-name smuggling path.** The conservative public-entity allow rule (see
 *    `src/contract/pipeline.ts`) may clear a finding on `structured.abn`. If a caller could name a
 *    `freeText` entry `structured.abn`, that allow rule would clear a blocking finding on
 *    attacker-controlled free text. A `freeText` name matching `structured.` is therefore rejected
 *    here, before a single character is scanned. This is the one structural bypass this design could
 *    have had.
 *
 * THE NUMBERS ARE NOT IN THE PRD. §21.1 says "size limits" and stops. These are conservative initial
 * values, exported as versioned frozen data exactly as deliverable 6 requires, and are open question
 * OQ-2 in the EVID-01 plan: `RUNT-02`'s HTTP body limit and `ASK-01`'s question length must be at
 * least this large, or the API rejects before admission and the §37.2 order is never exercised
 * end to end.
 */
import type { PiiAdmissionRequest } from '../contract/request.js';
import { scannedFields } from '../contract/request.js';
import type { PiiFinding } from '../contract/finding.js';
import { deepFreeze } from '../contract/freeze.js';
import { PII_PLACEHOLDERS } from './placeholders.js';

export const PII_ADMISSION_LIMITS = deepFreeze({
  /** Bumped whenever any number below changes; recorded in the recall report. */
  version: 1,
  maxFieldChars: 8_000,
  maxFieldCount: 16,
  maxTotalBytes: 65_536,
  maxFieldNameChars: 64,
});

/** `/^[A-Za-z][A-Za-z0-9_]*$/` — no dots, so `structured.` can never be spelled by a caller. */
const FIELD_NAME = /^[A-Za-z][A-Za-z0-9_]*$/;

/**
 * UTF-8 byte length, computed from code points.
 *
 * NOT `TextEncoder`: the import-graph and purity tests assert this module touches no global beyond
 * `String`, `Object`, `Math` and `RegExp`, and that assertion is worth more than one builtin call.
 */
export function utf8Length(value: string): number {
  let bytes = 0;
  for (const codePoint of value) {
    const code = codePoint.codePointAt(0) ?? 0;
    if (code < 0x80) bytes += 1;
    else if (code < 0x800) bytes += 2;
    else if (code < 0x10000) bytes += 3;
    else bytes += 4;
  }
  return bytes;
}

function limitFinding(field: string, start: number, end: number): PiiFinding {
  return {
    field,
    start,
    end,
    category: 'REQUEST_LIMIT_EXCEEDED',
    severity: 'BLOCKING',
    suggestedPlaceholder: PII_PLACEHOLDERS.REQUEST_LIMIT_EXCEEDED,
  };
}

/** The synthetic field name a whole-request violation (field count, total bytes) is reported under. */
export const REQUEST_SCOPE_FIELD = 'request';

/**
 * Every limit violation in `request`, in a fixed order: field count, then per-field name rules, then
 * per-field length, then total bytes. An empty array means the request may be scanned.
 *
 * A finding's span is the whole NFC value of the offending field (or `[0, 0)` for a whole-request
 * violation, which points at no text because none is at fault).
 */
export function enforceLimits(request: PiiAdmissionRequest): readonly PiiFinding[] {
  const findings: PiiFinding[] = [];
  const fields = scannedFields(request);

  if (fields.length > PII_ADMISSION_LIMITS.maxFieldCount) {
    findings.push(limitFinding(REQUEST_SCOPE_FIELD, 0, 0));
  }

  const seen = new Set<string>();
  for (const entry of request.freeText) {
    const nfcLength = entry.value.normalize('NFC').length;
    const invalidName =
      entry.field.startsWith('structured.') ||
      entry.field.length === 0 ||
      entry.field.length > PII_ADMISSION_LIMITS.maxFieldNameChars ||
      !FIELD_NAME.test(entry.field) ||
      seen.has(entry.field);
    seen.add(entry.field);
    if (invalidName) findings.push(limitFinding(entry.field, 0, nfcLength));
  }

  for (const entry of fields) {
    const nfcLength = entry.value.normalize('NFC').length;
    if (nfcLength > PII_ADMISSION_LIMITS.maxFieldChars) {
      findings.push(limitFinding(entry.field, 0, nfcLength));
    }
  }

  let totalBytes = 0;
  for (const entry of fields) totalBytes += utf8Length(entry.value) + utf8Length(entry.field);
  if (totalBytes > PII_ADMISSION_LIMITS.maxTotalBytes) {
    findings.push(limitFinding(REQUEST_SCOPE_FIELD, 0, 0));
  }

  return findings;
}
