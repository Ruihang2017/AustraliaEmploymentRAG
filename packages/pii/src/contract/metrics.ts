/**
 * EVID-01 deliverable 10 — the module's ONLY observability surface.
 *
 * PRD §37.2: *"Metrics record category/count/result, not content or reversible hash."* PRD §22:
 * *"Logs MUST exclude ... PII text."* Sub-PRD D3: nothing derived from a detected value is
 * reversible.
 *
 * THE EVENT TYPE IS CLOSED. There is no `message`, no `detail`, no `tags`, no
 * `Record<string, unknown>` and no `value` — so a caller cannot pass content through the sink even by
 * accident, and `test/contract/types.test-d.ts` asserts that an extra property fails to compile. This
 * is the whole point of injecting a sink rather than importing a logger: the module declares no
 * logger, opens no file, no socket and no database (asserted by the import-graph test), so the only
 * thing that can leave is what this type permits.
 *
 * `admit` DOES NOT TAKE THE SINK. Its signature is the ticket's two-parameter form and the request
 * type carries no request id; emission is a separate, explicit call by `RUNT-02`/`ASK-01`. That also
 * keeps `admit` pure, which is what makes the determinism test meaningful.
 */
import type { Id } from '../../../contracts/src/ids/index.js';
import type { PiiCategory } from './category.js';
import { PII_CATEGORY_VALUES } from './category.js';
import type { PiiAdmissionResult } from './result.js';

export interface PiiMetricsEvent {
  readonly category: PiiCategory;
  readonly count: number;
  readonly result: 'ACCEPT' | 'REJECT';
  /** `req_<uuidv7>` — the opaque request id from `packages/contracts` (PRD §34.2). */
  readonly requestId: Id<'req'>;
}

export interface PiiMetricsSink {
  record(event: PiiMetricsEvent): void;
}

/**
 * One event per category that actually occurred, with a count. Emitted in `PII_CATEGORY_VALUES`
 * order, so two runs of the same request produce the same call sequence.
 *
 * Reads no field value and no offset — only `finding.category`, and the decision.
 */
export function emitAdmissionMetrics(
  result: PiiAdmissionResult,
  sink: PiiMetricsSink,
  requestId: Id<'req'>,
): void {
  const counts = new Map<PiiCategory, number>();
  for (const finding of result.findings) {
    counts.set(finding.category, (counts.get(finding.category) ?? 0) + 1);
  }
  for (const category of PII_CATEGORY_VALUES) {
    const count = counts.get(category);
    if (count === undefined) continue;
    sink.record({ category, count, result: result.decision, requestId });
  }
}
