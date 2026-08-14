/**
 * The single component covering all ten PRD §31.3 states (ticket Deliverable 2).
 *
 * PRD §31.3: "Each state needs a visible title, plain-language explanation, allowed next action and
 * request/job ID. **A spinner without state or recovery guidance is not acceptable.**"
 *
 * A BARE SPINNER IS NOT REPRESENTABLE, at two levels:
 *  - TYPE — `actions` is required and typed as a NON-EMPTY tuple, so `actions={[]}` and a missing
 *    `actions` prop are both compile errors (`test/types/state-view.test-d.ts`);
 *  - RUNTIME — `MissingRecoveryGuidanceError` is thrown if the resolved explanation is empty or the
 *    action list arrives empty anyway (a caller casting through `unknown`, or JavaScript with no
 *    typechecking at all). It throws rather than degrading, because a component that silently
 *    renders a busy indicator is exactly what the PRD forbids.
 *
 * ANNOUNCEMENTS (risk R4). One live region per view, carrying the RESOLVED state text rather than a
 * per-render string, so a job moving `QUEUED → RUNNING → COMPLETED` inside a second announces the
 * text of each state once and never a partial. `FAILED` is the only `role="alert"`; everything else
 * is polite.
 */
import type { ReactNode } from 'react';

import { Button, LiveRegion, PageHeading } from '../primitives/basic.js';
import { CopyableId } from '../primitives/CopyableId.js';
import { formatLegalDate } from '../format/date.js';
import { STATE_COPY } from './state-copy.js';
import type { JobUiState } from '../contracts.js';

export type JobStateAction = {
  readonly id: string;
  readonly label: string;
  readonly onAction: () => void;
  readonly destructive?: boolean;
};

export type JobStateViewProps = {
  readonly state: JobUiState;
  readonly requestId: string;
  readonly jobId?: string;
  readonly title?: string;
  readonly explanation?: string;
  /** Non-empty by type. At least one allowed next action, for every state. */
  readonly actions: readonly [JobStateAction, ...JobStateAction[]];
  /** ISO 8601. Rendered through `formatLegalDate`; the value itself is never rewritten. */
  readonly expiresAt?: string;
};

/**
 * Thrown when a caller reaches the state PRD §31.3 forbids.
 *
 * The message names the component and the prop and NEVER echoes question, claim or quote text
 * (risk R6) — an error string can end up in a log or a browser telemetry payload.
 */
export class MissingRecoveryGuidanceError extends Error {
  constructor(state: JobUiState, missing: 'actions' | 'explanation') {
    super(
      `JobStateView (state ${state}): \`${missing}\` is empty. PRD §31.3 requires a plain-language ` +
        'explanation and at least one allowed next action for every state.',
    );
    this.name = 'MissingRecoveryGuidanceError';
  }
}

export function JobStateView(props: JobStateViewProps): ReactNode {
  const copy = STATE_COPY[props.state];
  const title = props.title ?? copy.title;
  const explanation = props.explanation ?? copy.explanation;

  if (props.actions.length === 0) {
    throw new MissingRecoveryGuidanceError(props.state, 'actions');
  }
  if (explanation.trim() === '') {
    throw new MissingRecoveryGuidanceError(props.state, 'explanation');
  }

  const isFailure = props.state === 'FAILED';

  return (
    <section className="tui-job-state" aria-label={`Job status: ${title}`} data-state={props.state}>
      <PageHeading text={title} />
      <p className="tui-job-state__explanation">{explanation}</p>

      {props.expiresAt === undefined ? null : (
        <p className="tui-job-state__expiry">
          Kept until <time dateTime={props.expiresAt}>{formatLegalDate(props.expiresAt)}</time>
        </p>
      )}

      <div className="tui-job-state__actions">
        {props.actions.map((action) => (
          <Button
            key={action.id}
            label={action.label}
            onClick={action.onAction}
            variant={action.destructive === true ? 'destructive' : 'primary'}
          />
        ))}
      </div>

      <CopyableId label="Request ID" value={props.requestId} />
      {props.jobId === undefined ? null : <CopyableId label="Job ID" value={props.jobId} />}

      {/* The resolved state text, announced once per state — not a per-render string. */}
      <LiveRegion
        message={`${title}. ${explanation}`}
        politeness={isFailure ? 'assertive' : 'polite'}
      />
    </section>
  );
}
