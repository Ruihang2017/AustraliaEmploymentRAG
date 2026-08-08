/**
 * Section/citation accumulation with sub-PRD **D6**'s provisional rule (ticket deliverable 7).
 *
 * PRD §34.4, quoted by `FND-05`: *"`answer.section` is provisional UI content until `job.completed`;
 * clients MUST remove it on failure and MUST not represent it as a validated answer."*
 *
 * So:
 *
 * - every `answer.section` is recorded as `{ provisional: true }`;
 * - `sections` returns `[]` once `job.failed` (or `job.cancelled`) has been seen — the content is
 *   dropped, not merely flagged;
 * - `assertNotProvisional` throws unless `job.completed` was seen, and it is the documented gate a
 *   rendering caller puts in front of anything derived from a section.
 *
 * Accumulation is BOUNDED. A stream that never completes must not grow without limit, so both
 * buffers stop at `maxRetained` events and set `truncated`.
 */
import { AerValidationError } from '../errors.js';
import type { AnswerSectionSseEvent, CitationAddedSseEvent } from '../internal/contracts.js';
import type { AerStreamEvent } from './events.js';

/** The default cap on retained section and citation events. */
export const DEFAULT_MAX_RETAINED_EVENTS = 1000;

export interface AccumulatedSection {
  readonly provisional: true;
  readonly event: AnswerSectionSseEvent;
}

export interface AccumulatedCitation {
  readonly event: CitationAddedSseEvent;
}

export interface StreamAccumulator {
  accept(event: AerStreamEvent): void;
  /** Sections seen so far — `[]` after a failure or a cancellation (sub-PRD **D6**). */
  readonly sections: readonly AccumulatedSection[];
  readonly citations: readonly AccumulatedCitation[];
  readonly completed: boolean;
  readonly failed: boolean;
  readonly cancelled: boolean;
  /** The `answer_snapshot_id` from `job.completed`, or `null`. */
  readonly answerSnapshotId: string | null;
  /** `true` when the cap dropped at least one event. */
  readonly truncated: boolean;
}

export function createStreamAccumulator(maxRetained = DEFAULT_MAX_RETAINED_EVENTS): StreamAccumulator {
  const sections: AccumulatedSection[] = [];
  const citations: AccumulatedCitation[] = [];
  let completed = false;
  let failed = false;
  let cancelled = false;
  let answerSnapshotId: string | null = null;
  let truncated = false;

  return {
    accept(event: AerStreamEvent): void {
      switch (event.type) {
        case 'answer.section':
          if (sections.length >= maxRetained) truncated = true;
          else sections.push({ provisional: true, event: event.data as AnswerSectionSseEvent });
          break;
        case 'citation.added':
          if (citations.length >= maxRetained) truncated = true;
          else citations.push({ event: event.data as CitationAddedSseEvent });
          break;
        case 'job.completed': {
          completed = true;
          const id = (event.data as unknown as { readonly answer_snapshot_id?: unknown }).answer_snapshot_id;
          answerSnapshotId = typeof id === 'string' ? id : null;
          break;
        }
        case 'job.failed':
          failed = true;
          break;
        case 'job.cancelled':
          cancelled = true;
          break;
        default:
          break;
      }
    },
    get sections(): readonly AccumulatedSection[] {
      // Sub-PRD D6: provisional content is DISCARDED on failure/cancellation, not merely flagged.
      return failed || cancelled ? [] : sections;
    },
    get citations(): readonly AccumulatedCitation[] {
      return failed || cancelled ? [] : citations;
    },
    get completed(): boolean {
      return completed;
    },
    get failed(): boolean {
      return failed;
    },
    get cancelled(): boolean {
      return cancelled;
    },
    get answerSnapshotId(): string | null {
      return answerSnapshotId;
    },
    get truncated(): boolean {
      return truncated;
    },
  };
}

/**
 * The gate a rendering caller puts in front of anything derived from an `answer.section`.
 *
 * @throws AerValidationError unless `job.completed` was seen for that stream.
 */
export function assertNotProvisional(accumulator: Pick<StreamAccumulator, 'completed'>): void {
  if (!accumulator.completed) {
    throw new AerValidationError(
      'this content is provisional until job.completed (PRD §34.4); it must not be presented as a validated answer',
    );
  }
}
