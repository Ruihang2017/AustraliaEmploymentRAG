import { describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';

import {
  DestructiveAction,
  MissingDestructiveDisclosureError,
} from '../src/actions/DestructiveAction.js';

const EFFECT =
  'The record, its answers and its evidence packs are deleted immediately and removed from every export.';
const RECOVERY = 'Ask an administrator to restore it from the retention archive within 30 days.';

describe('DestructiveAction (PRD §41.1)', () => {
  it.each([
    ['exactEffect', { exactEffect: '', recovery: RECOVERY }],
    ['exactEffect (whitespace only)', { exactEffect: '   ', recovery: RECOVERY }],
    ['recovery', { exactEffect: EFFECT, recovery: '' }],
    ['recovery (whitespace only)', { exactEffect: EFFECT, recovery: '\n\t' }],
  ])('refuses to render without %s', (_name, texts) => {
    expect(() =>
      render(
        <DestructiveAction label="Delete this record" onConfirm={vi.fn()} {...texts} />,
      ),
    ).toThrow(MissingDestructiveDisclosureError);
  });

  it('does not render a degraded confirmation instead — it throws', () => {
    try {
      render(
        <DestructiveAction
          label="Delete this record"
          exactEffect=""
          recovery={RECOVERY}
          onConfirm={vi.fn()}
        />,
      );
      expect.unreachable('expected a throw');
    } catch (error) {
      expect((error as Error).name).toBe('MissingDestructiveDisclosureError');
      expect((error as Error).message).toContain('exactEffect');
      expect(screen.queryByRole('dialog')).toBeNull();
    }
  });

  it('names the exact effect and the recovery path in the confirmation', async () => {
    render(
      <DestructiveAction
        label="Delete this record"
        exactEffect={EFFECT}
        recovery={RECOVERY}
        onConfirm={vi.fn()}
      />,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Delete this record' }));
    const dialog = screen.getByRole('dialog', { name: 'Delete this record' });
    expect(within(dialog).getByText(EFFECT)).toBeTruthy();
    expect(within(dialog).getByText(RECOVERY)).toBeTruthy();
  });

  it('puts the exact effect in the confirm button accessible name', async () => {
    const onConfirm = vi.fn();
    render(
      <DestructiveAction
        label="Delete this record"
        exactEffect={EFFECT}
        recovery={RECOVERY}
        onConfirm={onConfirm}
      />,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Delete this record' }));
    const confirm = screen.getByRole('button', { name: new RegExp(`: ${EFFECT}$`) });
    await userEvent.click(confirm);
    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('does not run the action when the confirmation is cancelled', async () => {
    const onConfirm = vi.fn();
    render(
      <DestructiveAction
        label="Delete this record"
        exactEffect={EFFECT}
        recovery={RECOVERY}
        onConfirm={onConfirm}
      />,
    );
    const trigger = screen.getByRole('button', { name: 'Delete this record' });
    await userEvent.click(trigger);
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onConfirm).not.toHaveBeenCalled();
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(document.activeElement).toBe(trigger);
  });

  it('marks the trigger as destructive rather than relying on its wording alone', () => {
    render(
      <DestructiveAction
        label="Delete this record"
        exactEffect={EFFECT}
        recovery={RECOVERY}
        onConfirm={vi.fn()}
      />,
    );
    expect(screen.getByRole('button', { name: 'Delete this record' }).className).toContain(
      'tui-button--destructive',
    );
  });
});
