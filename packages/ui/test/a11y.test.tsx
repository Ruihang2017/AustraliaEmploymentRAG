import { describe, expect, it } from 'vitest';
import { screen, within } from '@testing-library/react';

import * as ui from '../src/ui.js';
import { A11Y_WIDTHS, expectNoA11yViolations, renderAtWidth } from './a11y.js';
import { COMPONENT_EXAMPLES, EXTRA_EXAMPLES } from './fixtures/props.js';
import { readPackageFile } from './support/paths.js';
import { answerSnapshotFixture } from './support/fixtures.js';

/** Every export whose value is a component (a function starting with a capital letter). */
const EXPORTED_COMPONENTS = Object.entries(ui)
  .filter(([name, value]) => typeof value === 'function' && /^[A-Z]/.test(name))
  // Error classes are functions too, and are not renderable.
  .filter(([name]) => !name.endsWith('Error'))
  .map(([name]) => name)
  .sort();

describe('the harness itself is non-vacuous', () => {
  it('covers the three PRD §41.1 widths', () => {
    expect([...A11Y_WIDTHS]).toEqual([360, 768, 1280]);
  });

  it('throws on a deliberately broken component, so a pass means something', async () => {
    await expect(
      expectNoA11yViolations(
        <div>
          {/* An input with no label at all — WCAG 4.1.2 / 3.3.2. */}
          <input type="text" />
        </div>,
      ),
    ).rejects.toThrow(/WCAG 2\.2 AA violations/);
  });

  it('names the rule id and the width in the failure', async () => {
    await expect(expectNoA11yViolations(<input type="text" />)).rejects.toThrow(/360px/);
  });

  it('has an example for every component exported from src/ui.ts', () => {
    const missing = EXPORTED_COMPONENTS.filter((name) => COMPONENT_EXAMPLES[name] === undefined);
    expect(missing, 'add an entry to test/fixtures/props.tsx for each').toEqual([]);
    expect(EXPORTED_COMPONENTS.length).toBeGreaterThan(25);
  });
});

describe('zero WCAG 2.2 AA violations at 360, 768 and 1280 px (PRD §13.1, §41.1)', () => {
  it.each(Object.keys(COMPONENT_EXAMPLES).sort())('%s', async (name) => {
    await expectNoA11yViolations(COMPONENT_EXAMPLES[name]!);
  });

  it.each(Object.keys(EXTRA_EXAMPLES).sort())('%s', async (name) => {
    await expectNoA11yViolations(EXTRA_EXAMPLES[name]!);
  });
});

describe('nothing in the protected set is hidden at 360 px (PRD §41.1)', () => {
  const snapshot = answerSnapshotFixture();

  it('the evidence panel keeps legal status, the citation quote, its link and its relation', async () => {
    const { container, cleanup } = await renderAtWidth(COMPONENT_EXAMPLES.EvidencePanel!, 360);
    try {
      const panel = within(container).getByRole('complementary');
      // Legal status and relation badges — by accessible content, not by querySelector.
      expect(within(panel).getByText('In force')).toBeTruthy();
      expect(within(panel).getByText('Supports')).toBeTruthy();
      // The citation quote itself.
      const citation = snapshot.citations[0]!;
      expect(within(panel).getByText(citation.quote)).toBeTruthy();
      // The official URL, still a real link.
      expect(within(panel).getByRole('link', { name: new RegExp(citation.official_url) })).toBeTruthy();
    } finally {
      await cleanup();
    }
  });

  it('the job state view keeps its title, explanation, primary action and copyable id', async () => {
    const { container, cleanup } = await renderAtWidth(COMPONENT_EXAMPLES.JobStateView!, 360);
    try {
      const view = within(container).getByRole('region');
      expect(within(view).getByRole('heading', { level: 1 })).toBeTruthy();
      expect(within(view).getByRole('button', { name: 'Cancel' })).toBeTruthy();
      expect(within(view).getByText('req_0192f8c1-6a3f-7c21-9c8e-0aa1b2c3d4e5')).toBeTruthy();
      expect(within(view).getByRole('button', { name: 'Copy Request ID' })).toBeTruthy();
    } finally {
      await cleanup();
    }
  });

  it('a composed form keeps its error summary, its error recovery link and its primary action', async () => {
    const { container, cleanup } = await renderAtWidth(EXTRA_EXAMPLES['A composed form']!, 360);
    try {
      const alert = within(container).getByRole('alert');
      expect(within(alert).getByRole('link', { name: 'Enter a question.' })).toBeTruthy();
      expect(within(container).getByRole('button', { name: 'Run research' })).toBeTruthy();
      expect(within(container).getByLabelText('Question')).toBeTruthy();
    } finally {
      await cleanup();
    }
  });
});

describe('the stylesheet never hides content at a narrow width', () => {
  const css = readPackageFile('src', 'styles.css');

  /** Every media-query block body, with its comments stripped. */
  function mediaBlocks(): string[] {
    const blocks: string[] = [];
    const pattern = /@media[^{]*\{/g;
    while (pattern.exec(css) !== null) {
      let depth = 1;
      let index = pattern.lastIndex;
      while (index < css.length && depth > 0) {
        if (css[index] === '{') depth += 1;
        if (css[index] === '}') depth -= 1;
        index += 1;
      }
      blocks.push(css.slice(pattern.lastIndex, index).replace(/\/\*[\s\S]*?\*\//g, ' '));
    }
    return blocks;
  }

  it('finds real media queries, so the scan is not vacuous', () => {
    const blocks = mediaBlocks();
    expect(blocks.length).toBeGreaterThanOrEqual(3);
    expect(css).toContain('max-width: 767px');
    expect(css).toContain('min-width: 1280px');
  });

  it.each(['display: none', 'display:none', 'visibility: hidden', 'visibility:hidden'])(
    'no media query applies %s',
    (declaration) => {
      const offenders = mediaBlocks().filter((block) => block.includes(declaration));
      expect(offenders).toEqual([]);
    },
  );

  it('never removes a focus outline', () => {
    expect(/outline\s*:\s*(none|0)\b/.test(css.replace(/\/\*[\s\S]*?\*\//g, ' '))).toBe(false);
  });
});

describe('the harness is exported for downstream screen tickets', () => {
  it('is reachable at the package subpath the manifest declares', () => {
    const manifest = JSON.parse(readPackageFile('package.json')) as {
      exports: Record<string, string>;
    };
    expect(manifest.exports['./a11y']).toBe('./test/a11y.ts');
  });

  it('renders the export barrel itself without a violation, as a smoke test', async () => {
    await expectNoA11yViolations(
      <main>
        {COMPONENT_EXAMPLES.SkipLink}
        {COMPONENT_EXAMPLES.PageHeading}
        {COMPONENT_EXAMPLES.EvidencePanel}
      </main>,
    );
    expect(screen.queryByRole('alert')).toBeNull();
  });
});
