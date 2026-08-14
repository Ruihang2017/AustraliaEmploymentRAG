import { describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';

import { ASYNC_STATE_VALUES } from '../src/contracts.js';
import type { JobUiState } from '../src/contracts.js';
import { STATE_COPY, isTerminalState } from '../src/async-state/state-copy.js';
import {
  JobStateView,
  MissingRecoveryGuidanceError,
} from '../src/async-state/JobStateView.js';
import type { JobStateViewProps } from '../src/async-state/JobStateView.js';

/**
 * The ten PRD §31.3 states, WRITTEN OUT HERE and not imported, so the list cannot silently shrink on
 * either side: if `packages/contracts` loses a member, the first assertion fails; if this file loses
 * one, the same assertion fails.
 */
const PRD_31_3_STATES = [
  'IDLE',
  'VALIDATING',
  'QUEUED',
  'RUNNING',
  'WAITING_FOR_CLARIFICATION',
  'CANCELLING',
  'COMPLETED',
  'FAILED',
  'CANCELLED',
  'EXPIRED',
] as const;

const REQUEST_ID = 'req_0192f8c1-6a3f-7c21-9c8e-0aa1b2c3d4e5';
const JOB_ID = 'job_0192f8c1-7b40-7d33-8a11-1bb2c3d4e5f6';

function props(state: JobUiState): JobStateViewProps {
  return {
    state,
    requestId: REQUEST_ID,
    jobId: JOB_ID,
    actions: [{ id: 'next', label: STATE_COPY[state].defaultActionLabel, onAction: vi.fn() }],
  };
}

describe('the ten mandatory states (PRD §31.3)', () => {
  it('matches the contracts vocabulary exactly, in PRD order', () => {
    expect([...ASYNC_STATE_VALUES]).toEqual([...PRD_31_3_STATES]);
    expect(PRD_31_3_STATES).toHaveLength(10);
  });

  it('has default copy for every state and for no other key', () => {
    expect(Object.keys(STATE_COPY).sort()).toEqual([...PRD_31_3_STATES].sort());
    for (const state of PRD_31_3_STATES) {
      expect(STATE_COPY[state].title.trim().length, state).toBeGreaterThan(0);
      expect(STATE_COPY[state].explanation.trim().length, state).toBeGreaterThan(20);
      expect(STATE_COPY[state].defaultActionLabel.trim().length, state).toBeGreaterThan(0);
    }
  });

  it.each(PRD_31_3_STATES)(
    '%s renders a visible title, an explanation, an action and copyable ids',
    (state) => {
      render(<JobStateView {...props(state)} />);
      const view = screen.getByRole('region', { name: new RegExp('^Job status: ') });

      // Visible title.
      expect(within(view).getByRole('heading', { level: 1 }).textContent).toBe(
        STATE_COPY[state].title,
      );
      // Plain-language explanation.
      expect(within(view).getByText(STATE_COPY[state].explanation)).toBeTruthy();
      // At least one allowed next action.
      expect(
        within(view).getByRole('button', { name: STATE_COPY[state].defaultActionLabel }),
      ).toBeTruthy();
      // Request and job id, present as text and with a copy control.
      expect(within(view).getByText(REQUEST_ID)).toBeTruthy();
      expect(within(view).getByText(JOB_ID)).toBeTruthy();
      expect(within(view).getByRole('button', { name: 'Copy Request ID' })).toBeTruthy();
      expect(within(view).getByRole('button', { name: 'Copy Job ID' })).toBeTruthy();
    },
  );

  it('renders without a job id when the job has not been admitted yet', () => {
    const withJobId = props('VALIDATING');
    const rest: JobStateViewProps = {
      state: withJobId.state,
      requestId: withJobId.requestId,
      actions: withJobId.actions,
    };
    render(<JobStateView {...rest} />);
    expect(screen.getByText(REQUEST_ID)).toBeTruthy();
    expect(screen.queryByText(JOB_ID)).toBeNull();
  });
});

describe('a spinner without recovery guidance is not representable', () => {
  it('throws MissingRecoveryGuidanceError when the action list is empty', () => {
    // Cast through `unknown` to defeat the non-empty tuple type: this is the JavaScript caller, or
    // a `any`-typed boundary, that the runtime guard exists for.
    const bad = { ...props('RUNNING'), actions: [] } as unknown as JobStateViewProps;
    expect(() => render(<JobStateView {...bad} />)).toThrow(MissingRecoveryGuidanceError);
  });

  it.each(['', '   ', '\n\t'])(
    'throws when the explanation override is %j (empty or whitespace)',
    (explanation) => {
      expect(() => render(<JobStateView {...props('RUNNING')} explanation={explanation} />)).toThrow(
        MissingRecoveryGuidanceError,
      );
    },
  );

  it('names the component and the prop, and echoes no content, in the error message', () => {
    const bad = { ...props('RUNNING'), actions: [] } as unknown as JobStateViewProps;
    try {
      render(<JobStateView {...bad} />);
      expect.unreachable('expected a throw');
    } catch (error) {
      const message = (error as Error).message;
      expect(message).toContain('JobStateView');
      expect(message).toContain('actions');
      expect(message).toContain('RUNNING');
      expect(message).not.toContain(REQUEST_ID);
    }
  });
});

describe('announcements (risk R4)', () => {
  it('uses exactly one live region per view', () => {
    const { container } = render(<JobStateView {...props('RUNNING')} />);
    // `CopyableId` carries its own copy-feedback region; the state view adds exactly one more.
    const stateRegion = container.querySelector('.tui-job-state > .tui-live-region');
    expect(stateRegion).not.toBeNull();
    expect(container.querySelectorAll('.tui-job-state > .tui-live-region')).toHaveLength(1);
  });

  it.each(PRD_31_3_STATES.filter((state) => state !== 'FAILED'))(
    '%s announces politely, carrying the resolved state text',
    (state) => {
      const { container } = render(<JobStateView {...props(state)} />);
      const region = container.querySelector('.tui-job-state > .tui-live-region');
      expect(region?.getAttribute('aria-live')).toBe('polite');
      expect(region?.textContent).toContain(STATE_COPY[state].title);
      expect(region?.textContent).toContain(STATE_COPY[state].explanation);
    },
  );

  it('FAILED, and only FAILED, announces assertively', () => {
    const { container } = render(<JobStateView {...props('FAILED')} />);
    const region = container.querySelector('.tui-job-state > .tui-live-region');
    expect(region?.getAttribute('aria-live')).toBe('assertive');
    expect(region?.getAttribute('role')).toBe('alert');
  });

  it('classifies the terminal states correctly', () => {
    expect(PRD_31_3_STATES.filter((state) => isTerminalState(state))).toEqual([
      'COMPLETED',
      'FAILED',
      'CANCELLED',
      'EXPIRED',
    ]);
  });
});

describe('EXPIRED (PRD §31.3 "where retention permits")', () => {
  it('says the result is no longer retained and what to do instead, and still shows the ids', () => {
    render(<JobStateView {...props('EXPIRED')} />);
    const explanation = screen.getByText(STATE_COPY.EXPIRED.explanation).textContent ?? '';
    expect(explanation).toMatch(/retention/i);
    expect(explanation).toMatch(/no longer kept/i);
    expect(explanation).toMatch(/run the question again/i);
    expect(screen.getByText(REQUEST_ID)).toBeTruthy();
    expect(screen.getByText(JOB_ID)).toBeTruthy();
  });
});

describe('expiry rendering', () => {
  it('renders the retention date as 3 Aug 2026 and keeps the ISO value in the datetime attribute', () => {
    const { container } = render(<JobStateView {...props('COMPLETED')} expiresAt="2026-08-03" />);
    const time = container.querySelector('time');
    expect(time?.textContent).toBe('3 Aug 2026');
    expect(time?.getAttribute('datetime')).toBe('2026-08-03');
  });
});

describe('destructive actions', () => {
  it('marks a destructive action visually distinct without relying on colour alone in the label', async () => {
    const onAction = vi.fn();
    render(
      <JobStateView
        state="RUNNING"
        requestId={REQUEST_ID}
        actions={[{ id: 'cancel', label: 'Cancel this run', onAction, destructive: true }]}
      />,
    );
    const button = screen.getByRole('button', { name: 'Cancel this run' });
    expect(button.className).toContain('tui-button--destructive');
  });
});
