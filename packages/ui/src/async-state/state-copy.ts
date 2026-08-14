/**
 * The default title, plain-language explanation and action label for each of the ten mandatory
 * PRD §31.3 states, so no screen invents its own wording (ticket Deliverable 2).
 *
 * NOT AN ENUM DECLARATION. `STATE_COPY` is a `Record` KEYED BY `JobUiState`, which is
 * `packages/contracts`'s `AsyncState` re-exported. `satisfies` makes a missing or misspelled key a
 * TYPECHECK failure, so the ten states cannot silently shrink here. The source scan in
 * `test/source-scan.test.ts` targets `as const` ARRAYS of UPPER_SNAKE literals — an enum family —
 * and this is deliberately not one. Do not "fix" that.
 *
 * Plain-language English, no jargon: each explanation says what is happening and what happens next.
 */
import type { JobUiState } from '../contracts.js';

export type StateCopy = {
  readonly title: string;
  readonly explanation: string;
  readonly defaultActionLabel: string;
};

export const STATE_COPY = {
  IDLE: {
    title: 'Ready to start',
    explanation: 'Nothing is running yet. Enter your question and start the research run.',
    defaultActionLabel: 'Start',
  },
  VALIDATING: {
    title: 'Checking your request',
    explanation:
      'We are checking that the question and the facts you gave are complete enough to research. This takes a moment.',
    defaultActionLabel: 'Cancel',
  },
  QUEUED: {
    title: 'Waiting to start',
    explanation:
      'Your request is in the queue and will start shortly. You can leave this page open or come back later using the job ID below.',
    defaultActionLabel: 'Cancel',
  },
  RUNNING: {
    title: 'Researching',
    explanation:
      'We are searching the sources and drafting an answer with citations. You can cancel at any time; nothing is charged for a cancelled run beyond the work already done.',
    defaultActionLabel: 'Cancel',
  },
  WAITING_FOR_CLARIFICATION: {
    title: 'We need more detail',
    explanation:
      'The answer depends on something we could not determine from your question. Answer the questions shown and we will continue from where we stopped.',
    defaultActionLabel: 'Answer the questions',
  },
  CANCELLING: {
    title: 'Cancelling',
    explanation:
      'We are stopping the run. This usually takes a few seconds. Nothing further will be produced once it stops.',
    defaultActionLabel: 'Back to your records',
  },
  COMPLETED: {
    title: 'Finished',
    explanation:
      'The answer is ready, with its citations and the date the law was checked as at. Open it to read the result and its evidence.',
    defaultActionLabel: 'Open the answer',
  },
  FAILED: {
    title: 'This run did not finish',
    explanation:
      'Something went wrong and no answer was produced. You can try again; if it keeps failing, quote the request ID below when you contact support.',
    defaultActionLabel: 'Try again',
  },
  CANCELLED: {
    title: 'Cancelled',
    explanation:
      'You stopped this run, so no answer was produced. You can start a new run with the same question.',
    defaultActionLabel: 'Start again',
  },
  EXPIRED: {
    title: 'No longer available',
    explanation:
      'This result is past its retention period and is no longer kept, so it cannot be reopened. Run the question again to get a current answer.',
    defaultActionLabel: 'Run it again',
  },
} satisfies Record<JobUiState, StateCopy>;

/** The states that are still moving. Used to choose a polite live region over an alert. */
export function isTerminalState(state: JobUiState): boolean {
  return (
    state === 'COMPLETED' || state === 'FAILED' || state === 'CANCELLED' || state === 'EXPIRED'
  );
}
