/**
 * Renders the allowlisted Markdown subset as React elements (ticket Deliverable 5; PRD §37.5).
 *
 * No HTML string is ever constructed. Every text node goes through React, which escapes it; every
 * URL goes through `src/safe/url.ts`, which allows `https:` and `mailto:` and renders anything else
 * as inert text. There is no attribute pass-through of any kind: the only attributes any element
 * here receives are the literal ones written below.
 */
import type { ReactNode } from 'react';
import { Fragment } from 'react';

import { Link } from '../primitives/basic.js';
import { parseMarkdown } from './parse.js';
import type { BlockNode, InlineNode } from './parse.js';

export type SafeMarkdownProps = {
  readonly source: string;
  /**
   * The heading level a top-level `##` renders at. Defaults to 2, so a screen that already owns its
   * `<h1>` (PRD §41.1 "one programmatic page heading") keeps a correct outline.
   */
  readonly headingLevel?: 2 | 3 | 4;
};

function renderInline(nodes: readonly InlineNode[]): ReactNode {
  return nodes.map((node, index) => {
    const key = `${node.kind}-${index}`;
    switch (node.kind) {
      case 'text':
        return <Fragment key={key}>{node.value}</Fragment>;
      case 'strong':
        return <strong key={key}>{renderInline(node.children)}</strong>;
      case 'emphasis':
        return <em key={key}>{renderInline(node.children)}</em>;
      case 'code':
        return <code key={key}>{node.value}</code>;
      case 'lineBreak':
        return <br key={key} />;
      case 'link': {
        // The label is plain text by construction (parse.ts does not nest links), so a link's
        // accessible name is exactly what the source wrote.
        const label = node.children
          .map((child) => (child.kind === 'text' ? child.value : ''))
          .join('');
        return <Link key={key} href={node.href} label={label === '' ? node.href : label} />;
      }
    }
  });
}

function renderBlock(node: BlockNode, key: string, headingLevel: 2 | 3 | 4): ReactNode {
  switch (node.kind) {
    case 'paragraph':
      return <p key={key}>{renderInline(node.children)}</p>;
    case 'heading': {
      const depth = Math.min(6, headingLevel + (node.depth - 2));
      const children = renderInline(node.children);
      if (depth <= 2) return <h2 key={key}>{children}</h2>;
      if (depth === 3) return <h3 key={key}>{children}</h3>;
      if (depth === 4) return <h4 key={key}>{children}</h4>;
      if (depth === 5) return <h5 key={key}>{children}</h5>;
      return <h6 key={key}>{children}</h6>;
    }
    case 'list': {
      const items = node.items.map((item, index) => (
        <li key={`${key}-${index}`}>{renderInline(item.children)}</li>
      ));
      return node.ordered ? <ol key={key}>{items}</ol> : <ul key={key}>{items}</ul>;
    }
    case 'blockquote':
      return <blockquote key={key}>{renderInline(node.children)}</blockquote>;
    case 'codeBlock':
      return (
        <pre key={key}>
          <code>{node.value}</code>
        </pre>
      );
  }
}

export function SafeMarkdown(props: SafeMarkdownProps): ReactNode {
  const headingLevel = props.headingLevel ?? 2;
  const blocks = parseMarkdown(props.source);
  return (
    <div className="tui-markdown">
      {blocks.map((block, index) => renderBlock(block, `${block.kind}-${index}`, headingLevel))}
    </div>
  );
}
