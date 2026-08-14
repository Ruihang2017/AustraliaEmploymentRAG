/**
 * TYPE-LEVEL proof that a spinner without recovery guidance is not representable (PRD §31.3).
 *
 * Compiled by `pnpm typecheck` (the package tsconfig includes `test`), not executed. Each `@ts-expect-`
 * `error` below FAILS THE BUILD if the error it expects stops happening — that is what makes this a
 * guard rather than a comment. The runtime counterpart is `MissingRecoveryGuidanceError`, exercised
 * in `test/async-state.test.tsx`; both are kept.
 */
import type { JobStateAction, JobStateViewProps } from '../../src/async-state/JobStateView.js';

const action: JobStateAction = { id: 'a', label: 'Try again', onAction: () => undefined };

/** The shape the PRD requires: a state, an id, and at least one action. */
const valid: JobStateViewProps = {
  state: 'RUNNING',
  requestId: 'req_0192f8c1-6a3f-7c21-9c8e-0aa1b2c3d4e5',
  actions: [action],
};
void valid;

const emptyActions: JobStateViewProps = {
  state: 'RUNNING',
  requestId: 'req_0192f8c1-6a3f-7c21-9c8e-0aa1b2c3d4e5',
  // @ts-expect-error — an empty tuple; at least one action is mandatory.
  actions: [],
};
void emptyActions;

// @ts-expect-error — `actions` is not optional; a view with no next action cannot be constructed.
const missingActions: JobStateViewProps = {
  state: 'RUNNING',
  requestId: 'req_0192f8c1-6a3f-7c21-9c8e-0aa1b2c3d4e5',
};
void missingActions;

// @ts-expect-error — `requestId` is not optional: PRD §41.1 requires a copyable request id.
const missingRequestId: JobStateViewProps = {
  state: 'RUNNING',
  actions: [action],
};
void missingRequestId;

const inventedState: JobStateViewProps = {
  // @ts-expect-error — the state vocabulary is closed; it comes from packages/contracts.
  state: 'SPINNING',
  requestId: 'req_0192f8c1-6a3f-7c21-9c8e-0aa1b2c3d4e5',
  actions: [action],
};
void inventedState;
