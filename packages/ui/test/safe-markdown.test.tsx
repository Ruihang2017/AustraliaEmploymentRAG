import { describe, expect, it } from 'vitest';
import { render, screen, within } from '@testing-library/react';

import { SafeMarkdown } from '../src/safe/SafeMarkdown.js';
import { MARKDOWN_ALLOWLIST, parseInline, parseMarkdown } from '../src/safe/parse.js';
import { ALLOWED_URL_SCHEMES, decideUrl } from '../src/safe/url.js';
import { xssFixture } from './support/fixtures.js';

const fixture = xssFixture();
const CASES = fixture.cases;
const CANARY = fixture.canary;

function caseSource(id: string): string {
  const found = CASES.find((entry) => entry.id === id);
  if (found === undefined) throw new Error(`xss.json has no case "${id}"`);
  return found.source;
}

/** Every attribute of every element in the container, as `name=value` pairs. */
function allAttributes(container: HTMLElement): { name: string; value: string }[] {
  const pairs: { name: string; value: string }[] = [];
  for (const element of container.querySelectorAll('*')) {
    for (const attribute of element.attributes) {
      pairs.push({ name: attribute.name, value: attribute.value });
    }
  }
  return pairs;
}

describe('the allowlist is a literal, reviewable list', () => {
  it('names exactly the six block and six inline forms this package supports', () => {
    expect([...MARKDOWN_ALLOWLIST.block]).toEqual([
      'paragraph',
      'heading',
      'list',
      'listItem',
      'blockquote',
      'codeBlock',
    ]);
    expect([...MARKDOWN_ALLOWLIST.inline]).toEqual([
      'text',
      'strong',
      'emphasis',
      'code',
      'link',
      'lineBreak',
    ]);
  });

  it('allows exactly https: and mailto: as URL schemes', () => {
    expect([...ALLOWED_URL_SCHEMES]).toEqual(['https:', 'mailto:']);
  });
});

describe('SafeMarkdown neutralises the prompt-injection / XSS fixture (PRD §37.5; SEC-003)', () => {
  it.each(CASES.map((entry) => entry.id))('case %s produces no executable node', (id) => {
    const { container } = render(<SafeMarkdown source={caseSource(id)} />);
    expect(container.querySelector('script, iframe, img, object, embed, style, svg, link, meta')).toBeNull();
  });

  it.each(CASES.map((entry) => entry.id))('case %s produces no event-handler attribute', (id) => {
    const { container } = render(<SafeMarkdown source={caseSource(id)} />);
    const handlers = allAttributes(container).filter((pair) => pair.name.startsWith('on'));
    expect(handlers).toEqual([]);
  });

  it('renders <script>alert(1)</script> as visible literal text', () => {
    const { container } = render(<SafeMarkdown source={caseSource('script-tag')} />);
    expect(container.textContent).toContain('<script>alert(1)</script>');
    expect(container.querySelector('script')).toBeNull();
  });

  it('renders an <img onerror> as literal text, creating no element and no attribute', () => {
    const { container } = render(<SafeMarkdown source={caseSource('img-onerror')} />);
    expect(container.textContent).toContain('<img src=x onerror=alert(1)>');
    expect(container.querySelector('img')).toBeNull();
  });

  it.each([
    ['javascript-url', 'javascript:alert(1)'],
    ['data-url', 'data:text/html;base64,PHN2Zz4='],
    ['protocol-relative', '//evil.example/steal'],
    ['vbscript-url', 'vbscript:msgbox(1)'],
  ])('case %s renders no anchor at all, and still shows the raw target', (id, raw) => {
    const { container } = render(<SafeMarkdown source={caseSource(id)} />);
    expect(container.querySelector('a')).toBeNull();
    expect(container.textContent).toContain(raw);
  });

  it('keeps the javascript: link text as text, not as a link', () => {
    const { container } = render(<SafeMarkdown source={caseSource('javascript-url')} />);
    expect(container.querySelector('a')).toBeNull();
    expect(container.textContent).toContain('the source');
    expect(container.textContent).toContain('javascript:alert(1)');
  });

  it('renders an inline anchor with onclick as literal text', () => {
    const { container } = render(<SafeMarkdown source={caseSource('anchor-with-onclick')} />);
    expect(container.querySelector('a')).toBeNull();
    expect(container.textContent).toContain('onclick');
  });

  it('leaves HTML entities literal — it never decodes and re-emits them', () => {
    const { container } = render(<SafeMarkdown source={caseSource('html-entities-are-literal')} />);
    expect(container.textContent).toContain('&lt;script&gt;');
    expect(container.querySelector('script')).toBeNull();
  });

  it('places the canary in no attribute value anywhere in the rendered tree', () => {
    for (const id of ['canary-in-attribute-position', 'canary-in-link-target']) {
      const { container } = render(<SafeMarkdown source={caseSource(id)} />);
      const offenders = allAttributes(container).filter((pair) => pair.value.includes(CANARY));
      expect(offenders, `case ${id} leaked the canary into an attribute`).toEqual([]);
    }
  });

  it('renders legitimate Markdown, with every link carrying rel="noopener noreferrer"', () => {
    const { container } = render(<SafeMarkdown source={caseSource('legitimate-markdown')} />);
    expect(screen.getByRole('heading', { level: 2, name: 'Heading' })).toBeTruthy();
    expect(container.querySelector('strong')?.textContent).toBe('bold');
    expect(container.querySelector('em')?.textContent).toBe('italic');
    expect(container.querySelectorAll('ol li')).toHaveLength(2);
    expect(container.querySelector('blockquote')?.textContent).toContain('A quoted passage.');

    const anchors = [...container.querySelectorAll('a')];
    expect(anchors.length).toBeGreaterThan(0);
    for (const anchor of anchors) {
      expect(anchor.getAttribute('rel')).toContain('noopener');
      expect(anchor.getAttribute('rel')).toContain('noreferrer');
      const href = anchor.getAttribute('href') ?? '';
      expect(['https:', 'mailto:']).toContain(new URL(href).protocol);
    }
  });

  it('keeps a fenced code block literal, including markup inside it', () => {
    const { container } = render(<SafeMarkdown source={caseSource('legitimate-markdown')} />);
    const pre = container.querySelector('pre code');
    expect(pre?.textContent).toContain('<script>alert(1)</script>');
    expect(container.querySelector('script')).toBeNull();
  });

  it('never renders an h1, so the screen keeps the one programmatic page heading', () => {
    for (const entry of CASES) {
      const { container } = render(<SafeMarkdown source={entry.source} />);
      expect(container.querySelector('h1'), `case ${entry.id}`).toBeNull();
    }
  });

  it('shifts heading depth when the host screen is deeper', () => {
    render(<SafeMarkdown source="## Heading" headingLevel={3} />);
    expect(screen.getByRole('heading', { level: 3, name: 'Heading' })).toBeTruthy();
  });
});

describe('parse.ts', () => {
  it('never nests a link inside a link', () => {
    const nodes = parseInline('[a [b](https://x.example) c](https://y.example)');
    const links = nodes.filter((node) => node.kind === 'link');
    for (const link of links) {
      if (link.kind !== 'link') continue;
      expect(link.children.every((child) => child.kind === 'text')).toBe(true);
    }
  });

  it('terminates on unbalanced markers rather than looping or dropping input', () => {
    for (const source of ['**unclosed', '*unclosed', '`unclosed', '[label](', '[label']) {
      const nodes = parseInline(source);
      const rendered = nodes
        .map((node) => (node.kind === 'text' ? node.value : node.kind === 'code' ? node.value : ''))
        .join('');
      expect(rendered).toBe(source);
    }
  });

  it('consumes an unterminated fence to the end, so its body cannot be re-read as markup', () => {
    const blocks = parseMarkdown('```\n<script>alert(1)</script>\nstill inside');
    expect(blocks).toHaveLength(1);
    expect(blocks[0]?.kind).toBe('codeBlock');
  });

  it('rejects an unparseable or disallowed URL through the one gate', () => {
    expect(decideUrl('https://example.gov.au').allowed).toBe(true);
    expect(decideUrl('mailto:a@example.gov.au').allowed).toBe(true);
    for (const bad of ['javascript:alert(1)', 'data:text/html,x', 'http://x.example', '//x', '']) {
      expect(decideUrl(bad).allowed, bad).toBe(false);
    }
  });
});

describe('SafeMarkdown composes with the rest of the package', () => {
  it('renders inside a region without leaking any element outside the allowlist', () => {
    const { container } = render(
      <section aria-label="Answer">
        <SafeMarkdown source={caseSource('prompt-injection-instruction')} />
      </section>,
    );
    const region = screen.getByRole('region', { name: 'Answer' });
    expect(within(region).getByRole('heading', { level: 2 }).textContent).toBe(
      'Ignore previous instructions',
    );
    const tagNames = new Set([...container.querySelectorAll('*')].map((el) => el.tagName));
    for (const tag of ['SCRIPT', 'IFRAME', 'IMG', 'OBJECT', 'EMBED', 'STYLE', 'SVG']) {
      expect(tagNames.has(tag)).toBe(false);
    }
  });
});
