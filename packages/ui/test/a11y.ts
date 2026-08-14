/**
 * The reusable accessibility harness (ticket Deliverable 12).
 *
 * Exported from this package as `@taxrag/ui/a11y`, so every downstream screen ticket runs the
 * IDENTICAL check at the identical widths rather than each inventing its own threshold.
 *
 * KNOWN LIMITATION, stated rather than hidden: jsdom performs no layout and applies no cascade, so
 * axe's `color-contrast` rule cannot be evaluated here and true responsive reflow cannot be
 * observed. What this harness IS a real gate on is roles, accessible names, labels, structure,
 * relationships and DOM order at all three PRD §41.1 widths — the machine-decidable majority of
 * WCAG 2.2 AA. Contrast and reflow are covered by the two `[human]` acceptance rows and by
 * `23-assurance` (`ASSR-07`). Do NOT lower any assertion threshold here to make a rule pass; a
 * shortfall is a recorded limitation (PRD §1, §45.4), not a relaxed check.
 */
import axe from 'axe-core';
import type { ReactElement } from 'react';
import { act } from 'react';
import { createRoot } from 'react-dom/client';

import { setViewportWidth } from './setup.js';

/** The three PRD §41.1 widths. */
export const A11Y_WIDTHS = [360, 768, 1280] as const;

/** WCAG 2.2 AA, expressed as axe's tag set. */
export const WCAG_22_AA_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'] as const;

export type A11yOptions = {
  /** Widths to test. Defaults to all three. */
  readonly widths?: readonly number[];
  /**
   * Rules to disable, each with a reason. Use only for a rule jsdom CANNOT evaluate, never to make
   * a real violation go away.
   */
  readonly disableRules?: Readonly<Record<string, string>>;
};

/** Sets the width every layout-sensitive surface reads, at all three of jsdom's knobs. */
function applyWidth(width: number): void {
  Object.defineProperty(window, 'innerWidth', { configurable: true, writable: true, value: width });
  Object.defineProperty(document.documentElement, 'clientWidth', {
    configurable: true,
    writable: true,
    value: width,
  });
  setViewportWidth(width);
}

/**
 * Renders `ui` at each width and throws on the first WCAG 2.2 AA violation, naming the rule id, the
 * width, the impact and the offending HTML.
 */
export async function expectNoA11yViolations(
  ui: ReactElement,
  options: A11yOptions = {},
): Promise<void> {
  const widths = options.widths ?? A11Y_WIDTHS;
  const disabled = options.disableRules ?? {};

  for (const width of widths) {
    applyWidth(width);
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);
    try {
      await act(async () => {
        root.render(ui);
      });
      const results = await axe.run(container, {
        runOnly: { type: 'tag', values: [...WCAG_22_AA_TAGS] },
        rules: Object.fromEntries(Object.keys(disabled).map((id) => [id, { enabled: false }])),
      });
      if (results.violations.length > 0) {
        const detail = results.violations
          .map(
            (violation) =>
              `${violation.id} (${violation.impact ?? 'unknown impact'}) at ${width}px: ` +
              `${violation.help}\n${violation.nodes.map((node) => node.html).join('\n')}`,
          )
          .join('\n\n');
        throw new Error(`WCAG 2.2 AA violations at ${width}px:\n${detail}`);
      }
    } finally {
      await act(async () => {
        root.unmount();
      });
      container.remove();
    }
  }
  applyWidth(1280);
}

/**
 * The rendered container at one width, for assertions about what remains reachable when the
 * viewport is narrow (PRD §41.1 "works at 360 px … without hiding legal status, citations, primary
 * actions or error recovery").
 *
 * The caller is given a cleanup function; the element is NOT auto-removed, because the assertions
 * run against it after this returns.
 */
export async function renderAtWidth(
  ui: ReactElement,
  width: number,
): Promise<{ readonly container: HTMLElement; readonly cleanup: () => Promise<void> }> {
  applyWidth(width);
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  await act(async () => {
    root.render(ui);
  });
  return {
    container,
    cleanup: async () => {
      await act(async () => {
        root.unmount();
      });
      container.remove();
      applyWidth(1280);
    },
  };
}
