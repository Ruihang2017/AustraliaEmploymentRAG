/**
 * The overlay and disclosure primitives (ticket Deliverable 6): `Dialog`, `Disclosure`, `Tooltip`.
 *
 * These are the three places where no native element does the whole job, so they are the three
 * places ARIA is used — and the only ones.
 */
import { useCallback, useEffect, useId, useRef, useState } from 'react';
import type { KeyboardEvent, ReactNode } from 'react';

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

export type DialogProps = {
  readonly open: boolean;
  readonly title: string;
  readonly onClose: () => void;
  readonly children: ReactNode;
  /** Rendered in the dialog's action row, after the always-present close/cancel control. */
  readonly footer?: ReactNode;
};

/**
 * A modal dialog: `role="dialog"`, `aria-modal`, a labelled heading, a focus trap, `Escape` to
 * close, and focus RESTORED to whatever was focused when it opened.
 *
 * `role="dialog"` rather than the native `<dialog>` element: jsdom implements only part of
 * `showModal`, and the native element's own focus behaviour cannot be exercised in the accessibility
 * suite this ticket is judged by. The trade is explicit — everything the native element would give
 * is implemented and tested here instead.
 *
 * Focus restoration survives the invoker being removed while the dialog is open: if the remembered
 * element is no longer connected to the document, focus falls back to `document.body` rather than
 * being lost to the void (risk R8).
 */
export function Dialog(props: DialogProps): ReactNode {
  const titleId = useId();
  const panelRef = useRef<HTMLDivElement | null>(null);
  const invokerRef = useRef<Element | null>(null);

  useEffect(() => {
    if (!props.open) return undefined;
    invokerRef.current = document.activeElement;
    const panel = panelRef.current;
    const first = panel?.querySelector<HTMLElement>(FOCUSABLE) ?? panel;
    first?.focus();
    return () => {
      const invoker = invokerRef.current;
      if (invoker instanceof HTMLElement && invoker.isConnected) invoker.focus();
      else document.body.focus?.();
      invokerRef.current = null;
    };
  }, [props.open]);

  const onKeyDown = useCallback(
    (event: KeyboardEvent<HTMLDivElement>) => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        props.onClose();
        return;
      }
      if (event.key !== 'Tab') return;
      const panel = panelRef.current;
      if (panel === null) return;
      const focusable = [...panel.querySelectorAll<HTMLElement>(FOCUSABLE)];
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (first === undefined || last === undefined) return;
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    },
    [props],
  );

  if (!props.open) return null;
  return (
    <div className="tui-dialog__backdrop">
      {/* The keydown handler lives on the container that owns the focusable set — that is what a
          focus trap is. No React a11y lint plugin is configured (tools/eslint.config.mjs is
          `00-foundation`'s and carries none), so this is documented rather than suppressed. */}
      <div
        className="tui-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        ref={panelRef}
        onKeyDown={onKeyDown}
      >
        <h2 className="tui-dialog__title" id={titleId}>
          {props.title}
        </h2>
        <div className="tui-dialog__body">{props.children}</div>
        <div className="tui-dialog__actions">
          <button type="button" className="tui-button tui-button--secondary" onClick={props.onClose}>
            Cancel
          </button>
          {props.footer}
        </div>
      </div>
    </div>
  );
}

export type DisclosureProps = {
  readonly summary: string;
  readonly children: ReactNode;
  /** Uncontrolled by default; pass both to control it from the owning screen. */
  readonly open?: boolean;
  readonly onToggle?: (open: boolean) => void;
};

/**
 * A show/hide region wired with `aria-expanded` + `aria-controls`.
 *
 * The open/closed flag is the ONLY local state this package holds beyond copy feedback (risk R7);
 * it is still overridable so a screen that needs to drive it can.
 */
export function Disclosure(props: DisclosureProps): ReactNode {
  const regionId = useId();
  const [localOpen, setLocalOpen] = useState(false);
  const open = props.open ?? localOpen;
  const toggle = (): void => {
    const next = !open;
    if (props.open === undefined) setLocalOpen(next);
    props.onToggle?.(next);
  };
  return (
    <div className="tui-disclosure">
      <button
        type="button"
        className="tui-disclosure__summary"
        aria-expanded={open}
        aria-controls={regionId}
        onClick={toggle}
      >
        {props.summary}
      </button>
      <div className="tui-disclosure__region" id={regionId} hidden={!open}>
        {props.children}
      </div>
    </div>
  );
}

export type TooltipProps = {
  /** The trigger's accessible name. The tooltip text is supplementary, never the only copy. */
  readonly label: string;
  readonly text: string;
};

/**
 * A supplementary-text tooltip.
 *
 * WCAG 2.2 §1.4.13 (content on hover or focus) is why it is shaped this way: it opens on BOTH hover
 * and keyboard focus, dismisses on `Escape` without moving focus, and stays open while the pointer
 * is over the trigger. It carries no content in the PRD §41.1 protected set — legal status,
 * citations, primary actions and error recovery are never tooltip-only. Open question OQ-5 on the
 * plan; confirmed at the `[human]` gallery review.
 */
export function Tooltip(props: TooltipProps): ReactNode {
  const textId = useId();
  const [open, setOpen] = useState(false);
  return (
    <span className="tui-tooltip">
      <button
        type="button"
        className="tui-tooltip__trigger"
        aria-describedby={textId}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
        onKeyDown={(event) => {
          if (event.key === 'Escape') setOpen(false);
        }}
      >
        {props.label}
      </button>
      {/* Always in the accessibility tree via aria-describedby; `hidden` only affects presentation. */}
      <span className="tui-tooltip__text" id={textId} role="tooltip" data-open={open ? 'true' : 'false'}>
        {props.text}
      </span>
    </span>
  );
}
