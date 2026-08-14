/**
 * A deterministic Markdown SUBSET parser producing a small node tree (ticket Deliverable 5;
 * PRD §37.5; `SEC-003`, render layer).
 *
 * WHY A PARSER AND NOT A SANITISER. The requirement is "Markdown is rendered through an allowlist
 * and HTML is sanitised". The strongest form of that is to never construct an HTML string at all:
 * this module emits a typed tree, `SafeMarkdown.tsx` turns the tree into React elements, and React
 * escapes every text node it renders. There is therefore no sanitiser to bypass, no
 * `dangerouslySetInnerHTML` anywhere in this package (asserted by `test/source-scan.test.ts`), and
 * no third-party parser on the render path of a security-relevant surface.
 *
 * WHAT THE ALLOWLIST IS. `MARKDOWN_ALLOWLIST` below, and nothing else. Raw HTML, image syntax,
 * reference links, autolinks and HTML entities are NOT in it and are emitted as LITERAL TEXT — this
 * module never inspects, rewrites or reconstructs a tag. `<script>alert(1)</script>` becomes the
 * seven visible characters-worth of text it looks like, because that is what a `<` in model output
 * is: a character.
 *
 * WIDENING IT IS A `SEC-003` CHANGE. If legitimate model output is blocked, raise it on
 * `packages/citations` (`EVID-02`, `12-evidence-safety`) — see the ticket's Feedback obligation.
 * Never widen it locally to make a fixture render.
 */

/** The complete allowlist, exported so the tests read the same literal the parser implements. */
export const MARKDOWN_ALLOWLIST = Object.freeze({
  block: Object.freeze([
    'paragraph',
    'heading',
    'list',
    'listItem',
    'blockquote',
    'codeBlock',
  ] as const),
  inline: Object.freeze(['text', 'strong', 'emphasis', 'code', 'link', 'lineBreak'] as const),
});

export type InlineNode =
  | { readonly kind: 'text'; readonly value: string }
  | { readonly kind: 'strong'; readonly children: readonly InlineNode[] }
  | { readonly kind: 'emphasis'; readonly children: readonly InlineNode[] }
  | { readonly kind: 'code'; readonly value: string }
  | { readonly kind: 'lineBreak' }
  | { readonly kind: 'link'; readonly href: string; readonly children: readonly InlineNode[] };

export type BlockNode =
  | { readonly kind: 'paragraph'; readonly children: readonly InlineNode[] }
  | { readonly kind: 'heading'; readonly depth: 2 | 3 | 4; readonly children: readonly InlineNode[] }
  | {
      readonly kind: 'list';
      readonly ordered: boolean;
      readonly items: readonly { readonly children: readonly InlineNode[] }[];
    }
  | { readonly kind: 'blockquote'; readonly children: readonly InlineNode[] }
  | { readonly kind: 'codeBlock'; readonly value: string };

const text = (value: string): InlineNode => ({ kind: 'text', value });

/**
 * Inline parse.
 *
 * Single left-to-right pass with no backtracking and no regular expression over untrusted input
 * that could run away: every branch either consumes at least one character or falls through to
 * emitting the current character as text, so the loop is bounded by the input length.
 */
export function parseInline(source: string): readonly InlineNode[] {
  const nodes: InlineNode[] = [];
  let buffer = '';
  let index = 0;

  const flush = (): void => {
    if (buffer !== '') {
      nodes.push(text(buffer));
      buffer = '';
    }
  };

  while (index < source.length) {
    const rest = source.slice(index);

    // `**strong**`
    if (rest.startsWith('**')) {
      const end = rest.indexOf('**', 2);
      if (end > 2) {
        flush();
        nodes.push({ kind: 'strong', children: parseInline(rest.slice(2, end)) });
        index += end + 2;
        continue;
      }
    }

    // `*emphasis*` — checked after `**` so the longer marker wins.
    if (rest.startsWith('*')) {
      const end = rest.indexOf('*', 1);
      if (end > 1) {
        flush();
        nodes.push({ kind: 'emphasis', children: parseInline(rest.slice(1, end)) });
        index += end + 1;
        continue;
      }
    }

    // `` `code` `` — the span's content is never parsed further, so markup inside it stays literal.
    if (rest.startsWith('`')) {
      const end = rest.indexOf('`', 1);
      if (end > 1) {
        flush();
        nodes.push({ kind: 'code', value: rest.slice(1, end) });
        index += end + 1;
        continue;
      }
    }

    // `[label](url)` — the ONLY link form. No reference links, no autolinks, no bare URLs, and the
    // `!` of image syntax is not special, so `![alt](url)` renders the `!` then this link, whose URL
    // is scheme-checked at render time like any other.
    if (rest.startsWith('[')) {
      const close = rest.indexOf(']');
      if (close > 0 && rest[close + 1] === '(') {
        const end = rest.indexOf(')', close + 2);
        if (end > close + 1) {
          const href = rest.slice(close + 2, end);
          // A label may not itself contain a link; parsing it inline would allow nesting.
          if (!href.includes(' ') && !href.includes('\n')) {
            flush();
            nodes.push({ kind: 'link', href, children: [text(rest.slice(1, close))] });
            index += end + 1;
            continue;
          }
        }
      }
    }

    // A hard line break inside a paragraph.
    if (source[index] === '\n') {
      flush();
      nodes.push({ kind: 'lineBreak' });
      index += 1;
      continue;
    }

    buffer += source[index] ?? '';
    index += 1;
  }

  flush();
  return nodes;
}

/** Block parse. Fenced code first, then the line-prefixed forms, then paragraphs. */
export function parseMarkdown(source: string): readonly BlockNode[] {
  const blocks: BlockNode[] = [];
  const lines = source.replace(/\r\n?/g, '\n').split('\n');
  let index = 0;

  while (index < lines.length) {
    const line = lines[index] ?? '';

    if (line.trim() === '') {
      index += 1;
      continue;
    }

    // Fenced code block. An unterminated fence consumes to the end rather than falling back to
    // paragraph parsing, so its contents can never be reinterpreted as markup.
    if (line.trimStart().startsWith('```')) {
      const body: string[] = [];
      index += 1;
      while (index < lines.length && !(lines[index] ?? '').trimStart().startsWith('```')) {
        body.push(lines[index] ?? '');
        index += 1;
      }
      index += 1;
      blocks.push({ kind: 'codeBlock', value: body.join('\n') });
      continue;
    }

    // ATX headings `##` to `####`. `#` alone is NOT accepted: PRD §41.1 allows exactly one
    // programmatic page heading and that one belongs to the screen, not to model output.
    const heading = /^(#{2,4})\s+(.*)$/.exec(line);
    if (heading !== null) {
      const depth = (heading[1] ?? '##').length as 2 | 3 | 4;
      blocks.push({ kind: 'heading', depth, children: parseInline(heading[2] ?? '') });
      index += 1;
      continue;
    }

    // Blockquote: consecutive `>` lines.
    if (line.startsWith('>')) {
      const body: string[] = [];
      while (index < lines.length && (lines[index] ?? '').startsWith('>')) {
        body.push((lines[index] ?? '').replace(/^>\s?/, ''));
        index += 1;
      }
      blocks.push({ kind: 'blockquote', children: parseInline(body.join('\n')) });
      continue;
    }

    // Lists: `- ` / `* ` unordered, `1. ` ordered. A list is homogeneous — the first marker decides.
    const unordered = /^[-*]\s+(.*)$/.exec(line);
    const ordered = /^\d+\.\s+(.*)$/.exec(line);
    if (unordered !== null || ordered !== null) {
      const isOrdered = ordered !== null;
      const items: { children: readonly InlineNode[] }[] = [];
      while (index < lines.length) {
        const current = lines[index] ?? '';
        const match = isOrdered ? /^\d+\.\s+(.*)$/.exec(current) : /^[-*]\s+(.*)$/.exec(current);
        if (match === null) break;
        items.push({ children: parseInline(match[1] ?? '') });
        index += 1;
      }
      blocks.push({ kind: 'list', ordered: isOrdered, items });
      continue;
    }

    // Paragraph: everything up to the next blank line.
    const body: string[] = [];
    while (index < lines.length && (lines[index] ?? '').trim() !== '') {
      const current = lines[index] ?? '';
      if (
        current.startsWith('>') ||
        current.trimStart().startsWith('```') ||
        /^(#{2,4})\s+/.test(current) ||
        /^[-*]\s+/.test(current) ||
        /^\d+\.\s+/.test(current)
      ) {
        break;
      }
      body.push(current);
      index += 1;
    }
    blocks.push({ kind: 'paragraph', children: parseInline(body.join('\n')) });
  }

  return blocks;
}
