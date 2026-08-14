/**
 * The confirmation wrapper for a destructive or security-sensitive action (ticket Deliverable 9).
 *
 * PRD §41.1: "destructive/security-sensitive actions name exact effect and recovery". Both texts are
 * REQUIRED props, and if either arrives empty or whitespace the component throws
 * `MissingDestructiveDisclosureError` rather than rendering a degraded confirmation — a dialog that
 * says "Are you sure?" and nothing else is precisely what that acceptance row exists to prevent.
 *
 * The confirm button's ACCESSIBLE NAME includes the exact effect, so a screen-reader user hears what
 * they are about to do at the moment of committing to it, not only in the body text above it.
 */
import { useState } from 'react';
import type { ReactNode } from 'react';

import { Button } from '../primitives/basic.js';
import { Dialog } from '../primitives/overlay.js';

/** Thrown when a caller omits the exact effect or the recovery path. */
export class MissingDestructiveDisclosureError extends Error {
  constructor(missing: 'exactEffect' | 'recovery') {
    super(
      `DestructiveAction: \`${missing}\` is empty. PRD §41.1 requires a destructive or ` +
        'security-sensitive action to name its exact effect AND the recovery path before it runs.',
    );
    this.name = 'MissingDestructiveDisclosureError';
  }
}

export type DestructiveActionProps = {
  /** The trigger's label, e.g. "Delete this record". */
  readonly label: string;
  /** Exactly what will happen. Required, non-empty. */
  readonly exactEffect: string;
  /** How to undo it, or what to do if it was a mistake. Required, non-empty. */
  readonly recovery: string;
  readonly onConfirm: () => void;
  /** The confirm button's own label. Defaults to the trigger label. */
  readonly confirmLabel?: string;
};

export function DestructiveAction(props: DestructiveActionProps): ReactNode {
  const [open, setOpen] = useState(false);

  if (props.exactEffect.trim() === '') throw new MissingDestructiveDisclosureError('exactEffect');
  if (props.recovery.trim() === '') throw new MissingDestructiveDisclosureError('recovery');

  const confirmLabel = props.confirmLabel ?? props.label;

  return (
    <div className="tui-destructive-action">
      <Button label={props.label} variant="destructive" onClick={() => setOpen(true)} />
      <Dialog
        open={open}
        title={props.label}
        onClose={() => setOpen(false)}
        footer={
          <Button
            label={`${confirmLabel}: ${props.exactEffect}`}
            variant="destructive"
            onClick={() => {
              setOpen(false);
              props.onConfirm();
            }}
          />
        }
      >
        <p className="tui-destructive-action__effect">
          <strong>What this does: </strong>
          {props.exactEffect}
        </p>
        <p className="tui-destructive-action__recovery">
          <strong>If this was a mistake: </strong>
          {props.recovery}
        </p>
      </Dialog>
    </div>
  );
}
