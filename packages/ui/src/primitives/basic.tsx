/**
 * The non-form primitives (ticket Deliverable 6): `Button`, `Link`, `Chip`, `Badge`, `PageHeading`,
 * `SkipLink`, `EmptyState`, `LiveRegion`.
 *
 * Rules that apply to every primitive in this package:
 *  - native semantics first — a `<button>`, an `<a href>`, a real `<label for>`; ARIA only where no
 *    element exists;
 *  - visible focus is a stylesheet concern (`src/styles.css`, `:focus-visible`), never removed;
 *  - NO width-conditional rendering in JavaScript. Nothing here reads `matchMedia`, `innerWidth` or
 *    `ResizeObserver` to decide WHAT to render — responsiveness is CSS-only. That is what makes the
 *    PRD §41.1 "nothing hidden at 360 px" row mechanically assertable, and `test/source-scan.test.ts`
 *    enforces it.
 */
import type { ReactNode } from 'react';

import { SAFE_LINK_REL, decideUrl } from '../safe/url.js';

export type ButtonProps = {
  /** The accessible name. Required: an icon-only button with no name is not representable. */
  readonly label: string;
  readonly onClick: () => void;
  readonly type?: 'button' | 'submit';
  readonly variant?: 'primary' | 'secondary' | 'destructive';
  readonly disabled?: boolean;
  readonly describedBy?: string;
  readonly id?: string;
};

/** A native `<button>`. `Enter` and `Space` activation come free with the element. */
export function Button(props: ButtonProps): ReactNode {
  const variant = props.variant ?? 'secondary';
  return (
    <button
      type={props.type ?? 'button'}
      id={props.id}
      className={`tui-button tui-button--${variant}`}
      onClick={props.onClick}
      disabled={props.disabled === true}
      aria-describedby={props.describedBy}
    >
      {props.label}
    </button>
  );
}

export type LinkProps = {
  readonly href: string;
  readonly label: string;
  /** Opens in a new tab. The accessible name then says so — never a visual-only cue. */
  readonly newTab?: boolean;
};

/**
 * An anchor whose `href` has passed `src/safe/url.ts`.
 *
 * A URL outside the allowlist renders as inert text carrying the raw value plus a visible note, so
 * the reader can see what the source claimed and that it was not made clickable (risk R5).
 */
export function Link(props: LinkProps): ReactNode {
  const decision = decideUrl(props.href);
  if (!decision.allowed) {
    return (
      <span className="tui-link tui-link--blocked">
        {props.label}{' '}
        <span className="tui-link__blocked-note">
          (link not shown as a link — unsupported address: {decision.text})
        </span>
      </span>
    );
  }
  const newTab = props.newTab === true;
  return (
    <a
      className="tui-link"
      href={decision.href}
      rel={SAFE_LINK_REL}
      target={newTab ? '_blank' : undefined}
    >
      {props.label}
      {newTab ? <span className="tui-visually-hidden"> (opens in a new tab)</span> : null}
    </a>
  );
}

export type ChipProps = {
  readonly label: string;
  /** When present the chip is removable and renders a real button; otherwise it is inert text. */
  readonly onRemove?: () => void;
};

/** A compact labelled token, optionally removable (used by `MultiSelect`). */
export function Chip(props: ChipProps): ReactNode {
  return (
    <span className="tui-chip">
      <span className="tui-chip__label">{props.label}</span>
      {props.onRemove === undefined ? null : (
        <button type="button" className="tui-chip__remove" onClick={props.onRemove}>
          {`Remove ${props.label}`}
        </button>
      )}
    </span>
  );
}

export type BadgeProps = {
  /** Always rendered as visible text — a badge is never an icon alone. */
  readonly label: string;
  /**
   * A non-colour signal. Required, not optional: PRD §41.1 "colour is never the only status signal",
   * and an optional shape is a colour-only variant waiting to happen.
   */
  readonly shape: 'square' | 'circle' | 'triangle' | 'diamond' | 'bar';
  /** A longer description read by assistive technology in place of nothing. */
  readonly describedBy?: string;
  readonly tone?: 'neutral' | 'positive' | 'caution' | 'negative';
};

/**
 * Text plus a shape. The shape is an `aria-hidden` inline SVG: it carries no information the label
 * does not already carry, so hiding it from assistive technology loses nothing while keeping the
 * sighted, non-colour-perceiving reader a second channel.
 */
export function Badge(props: BadgeProps): ReactNode {
  return (
    <span
      className={`tui-badge tui-badge--${props.tone ?? 'neutral'}`}
      data-shape={props.shape}
      aria-describedby={props.describedBy}
    >
      <svg className="tui-badge__shape" viewBox="0 0 10 10" aria-hidden="true" focusable="false">
        {props.shape === 'circle' ? <circle cx="5" cy="5" r="4" /> : null}
        {props.shape === 'square' ? <rect x="1" y="1" width="8" height="8" /> : null}
        {props.shape === 'triangle' ? <polygon points="5,1 9,9 1,9" /> : null}
        {props.shape === 'diamond' ? <polygon points="5,1 9,5 5,9 1,5" /> : null}
        {props.shape === 'bar' ? <rect x="1" y="4" width="8" height="2" /> : null}
      </svg>
      <span className="tui-badge__label">{props.label}</span>
    </span>
  );
}

export type PageHeadingProps = {
  readonly text: string;
  /** Supplementary text rendered under the heading, inside the same landmark. */
  readonly subtitle?: string;
  readonly id?: string;
};

/**
 * The one programmatic page heading (PRD §41.1 "one programmatic page heading").
 *
 * Always an `<h1>` and never configurable — a screen that needs a second level uses a section
 * heading, not a second `PageHeading`.
 */
export function PageHeading(props: PageHeadingProps): ReactNode {
  return (
    <header className="tui-page-heading">
      <h1 id={props.id}>{props.text}</h1>
      {props.subtitle === undefined ? null : (
        <p className="tui-page-heading__subtitle">{props.subtitle}</p>
      )}
    </header>
  );
}

export type SkipLinkProps = {
  /** The id of the main landmark, without the `#`. */
  readonly targetId: string;
  readonly label?: string;
};

/** The first focusable element on a page; visible on focus, off-screen otherwise. */
export function SkipLink(props: SkipLinkProps): ReactNode {
  return (
    <a className="tui-skip-link" href={`#${props.targetId}`}>
      {props.label ?? 'Skip to main content'}
    </a>
  );
}

export type EmptyStateProps = {
  readonly title: string;
  /** Why it is empty and what to do next — never a bare "No results". */
  readonly explanation: string;
  readonly action?: { readonly label: string; readonly onAction: () => void };
};

/** A labelled nothing-here region. Announced politely so an async result of zero is not silent. */
export function EmptyState(props: EmptyStateProps): ReactNode {
  return (
    <div className="tui-empty-state" role="status">
      <p className="tui-empty-state__title">{props.title}</p>
      <p className="tui-empty-state__explanation">{props.explanation}</p>
      {props.action === undefined ? null : (
        <Button label={props.action.label} onClick={props.action.onAction} />
      )}
    </div>
  );
}

export type LiveRegionProps = {
  /** The resolved message. Empty string means "nothing to announce". */
  readonly message: string;
  readonly politeness?: 'polite' | 'assertive';
  readonly id?: string;
};

/**
 * An ARIA live region for asynchronous status (PRD §41.1 "live regions for asynchronous status").
 *
 * The container is always rendered — a live region created at the same moment its text appears is
 * frequently missed by screen readers. `role="status"` for polite, `role="alert"` for assertive.
 */
export function LiveRegion(props: LiveRegionProps): ReactNode {
  const politeness = props.politeness ?? 'polite';
  return (
    <div
      id={props.id}
      className="tui-live-region"
      role={politeness === 'assertive' ? 'alert' : 'status'}
      aria-live={politeness}
      aria-atomic="true"
    >
      {props.message}
    </div>
  );
}
