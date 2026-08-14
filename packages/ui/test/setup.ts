/**
 * Vitest setup for the jsdom environment.
 *
 * Fills the two jsdom gaps this package's tests need and nothing else. In particular it does NOT
 * stub `navigator.clipboard`: `CopyableId`'s behaviour when the Clipboard API is absent (jsdom, an
 * insecure context, a denied permission) is a tested behaviour, so the tests install and remove that
 * stub themselves.
 */
import { afterEach } from 'vitest';
import { cleanup } from '@testing-library/react';

/** The widths whose media queries the a11y harness drives. Kept in sync by test/a11y.ts. */
let currentWidth = 1280;

/** Evaluates the tiny media-query subset this package's stylesheet uses: `(max-width: Npx)`. */
function matches(query: string): boolean {
  const max = /\(\s*max-width\s*:\s*(\d+)px\s*\)/.exec(query);
  if (max?.[1] !== undefined) return currentWidth <= Number(max[1]);
  const min = /\(\s*min-width\s*:\s*(\d+)px\s*\)/.exec(query);
  if (min?.[1] !== undefined) return currentWidth >= Number(min[1]);
  return false;
}

/** Used by test/a11y.ts to drive the three PRD §41.1 widths. */
export function setViewportWidth(width: number): void {
  currentWidth = width;
}

Object.defineProperty(window, 'matchMedia', {
  configurable: true,
  writable: true,
  value: (query: string) => ({
    matches: matches(query),
    media: query,
    onchange: null,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
    addListener: () => undefined,
    removeListener: () => undefined,
    dispatchEvent: () => false,
  }),
});

class ResizeObserverStub {
  observe(): void {
    /* jsdom performs no layout; nothing to report. */
  }
  unobserve(): void {
    /* no-op */
  }
  disconnect(): void {
    /* no-op */
  }
}

Object.defineProperty(window, 'ResizeObserver', {
  configurable: true,
  writable: true,
  value: ResizeObserverStub,
});

afterEach(() => {
  cleanup();
});
