/**
 * FND-02 — a deliberately restricted YAML reader for `.github/workflows/**`.
 *
 * Why hand-rolled: adding the `yaml` package would mean editing root `package.json` and
 * `pnpm-lock.yaml`, which are FND-01's files and outside this ticket's File-scope. Every check
 * script here therefore uses Node built-ins only.
 *
 * Why *restricted*: this reader supports exactly the YAML subset the workflows in this repository
 * are written in, and **throws** on everything else — tabs, document markers, anchors/aliases, flow
 * collections, merge keys, and any line it cannot classify. A construct the reader cannot model must
 * fail the check, never pass it silently: a parser that shrugs at what it does not understand turns
 * every assertion built on it into a vacuous one. If a workflow needs a construct outside the
 * subset, simplify the YAML — do not widen the reader to make a check go green.
 *
 * Scalars are returned as strings, always: `cancel-in-progress: true` reads back as `'true'`. The
 * checks compare against the literal text, which is what a YAML-inspection assertion is about.
 *
 * Pure text processing. No filesystem access, no network, no environment read (PRD section 20.2).
 */

const BLOCK_SCALAR_HEADER = /^[|>][-+]?$/;

class WorkflowSyntaxError extends Error {}

function fail(message) {
  throw new WorkflowSyntaxError(message);
}

/** Strips a `#` comment that is outside quotes. Leading whitespace is preserved. */
export function stripComment(line) {
  let out = '';
  let quote = null;
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    if (quote !== null) {
      out += char;
      if (char === quote) quote = null;
      continue;
    }
    if (char === '"' || char === "'") {
      quote = char;
      out += char;
      continue;
    }
    if (char === '#' && (index === 0 || /\s/.test(line[index - 1]))) break;
    out += char;
  }
  return out;
}

/** The next significant line, or null at end of input. Does not consume it. */
function peek(state) {
  while (state.index < state.lines.length) {
    const raw = state.lines[state.index];
    const lineNo = state.index + 1;
    if (raw.includes('\t')) fail(`tab character at line ${lineNo} — YAML forbids tabs for indentation`);
    const trimmed = raw.trim();
    if (trimmed === '---' || trimmed === '...') {
      fail(`document marker "${trimmed}" at line ${lineNo} — multi-document workflows are not modelled`);
    }
    const stripped = stripComment(raw).replace(/\s+$/, '');
    if (stripped.trim() === '') {
      state.index += 1;
      continue;
    }
    const indent = stripped.length - stripped.trimStart().length;
    return { indent, content: stripped.slice(indent), lineNo };
  }
  return null;
}

function splitKey(token) {
  const match = /^([^:]+):(?:\s+(.*))?$/.exec(token.content);
  if (match === null) fail(`cannot classify line ${token.lineNo}: ${JSON.stringify(token.content)}`);
  let key = match[1].trim();
  if (key === '<<') fail(`merge key at line ${token.lineNo} — merge keys are not modelled`);
  if ((key.startsWith('"') && key.endsWith('"')) || (key.startsWith("'") && key.endsWith("'"))) {
    key = key.slice(1, -1);
  }
  return { key, rest: match[2] ?? '' };
}

function isKeyLine(text) {
  return /^[^:]+:(\s|$)/.test(text);
}

function scalar(value, token) {
  if (value.startsWith('&') || value.startsWith('*')) {
    fail(`anchor or alias at line ${token.lineNo} — not modelled`);
  }
  if (value.startsWith('{') || value.startsWith('[')) {
    fail(`flow collection at line ${token.lineNo} — write it as a block collection instead`);
  }
  if (value.startsWith('"')) {
    if (!/^"(?:[^"\\]|\\.)*"$/.test(value)) fail(`unterminated double-quoted scalar at line ${token.lineNo}`);
    return JSON.parse(value);
  }
  if (value.startsWith("'")) {
    if (!/^'[^']*'$/.test(value)) fail(`unterminated single-quoted scalar at line ${token.lineNo}`);
    return value.slice(1, -1);
  }
  return value;
}

/** Consumes a `|`/`>` block scalar body verbatim: no comment stripping, no tab check. */
function readBlockScalar(state, keyIndent) {
  const body = [];
  while (state.index < state.lines.length) {
    const raw = state.lines[state.index];
    if (raw.trim() === '') {
      body.push('');
      state.index += 1;
      continue;
    }
    const indent = raw.length - raw.trimStart().length;
    if (indent <= keyIndent) break;
    body.push(raw.replace(/\s+$/, ''));
    state.index += 1;
  }
  while (body.length > 0 && body[body.length - 1] === '') body.pop();
  const strip = Math.min(...body.filter((line) => line !== '').map((line) => line.length - line.trimStart().length));
  return body.map((line) => (line === '' ? '' : line.slice(strip))).join('\n');
}

function parseValue(state, indent, rest, token) {
  const value = rest.trim();
  if (value === '') {
    const next = peek(state);
    if (next === null || next.indent < indent) return null;
    if (next.indent === indent) {
      if (next.content === '-' || next.content.startsWith('- ')) return parseSequence(state, indent);
      return null; // a sibling key follows: this key's value is empty (e.g. `pull_request:`)
    }
    return parseNode(state, next.indent);
  }
  if (BLOCK_SCALAR_HEADER.test(value)) return readBlockScalar(state, indent);
  return scalar(value, token);
}

function parseMapping(state, indent, seed) {
  const map = {};
  if (seed !== undefined) map[seed.key] = seed.value;
  for (;;) {
    const token = peek(state);
    if (token === null || token.indent < indent) break;
    if (token.indent > indent) fail(`unexpected indentation at line ${token.lineNo}`);
    if (token.content === '-' || token.content.startsWith('- ')) break;
    state.index += 1;
    const { key, rest } = splitKey(token);
    if (Object.prototype.hasOwnProperty.call(map, key)) {
      fail(`duplicate key "${key}" at line ${token.lineNo}`);
    }
    map[key] = parseValue(state, indent, rest, token);
  }
  return map;
}

function parseSequence(state, indent) {
  const items = [];
  for (;;) {
    const token = peek(state);
    if (token === null || token.indent !== indent) break;
    if (token.content !== '-' && !token.content.startsWith('- ')) break;
    if (/^-\s\s/.test(token.content)) {
      fail(`sequence item at line ${token.lineNo} uses more than one space after "-"`);
    }
    state.index += 1;
    const rest = token.content === '-' ? '' : token.content.slice(2);
    if (rest.trim() === '') {
      const next = peek(state);
      if (next === null || next.indent <= indent) fail(`empty sequence item at line ${token.lineNo}`);
      items.push(parseNode(state, next.indent));
      continue;
    }
    if (isKeyLine(rest)) {
      const itemIndent = indent + 2;
      const { key, rest: valueRest } = splitKey({ content: rest, lineNo: token.lineNo });
      const value = parseValue(state, itemIndent, valueRest, token);
      items.push(parseMapping(state, itemIndent, { key, value }));
      continue;
    }
    items.push(scalar(rest.trim(), token));
  }
  return items;
}

function parseNode(state, indent) {
  const token = peek(state);
  if (token === null) return null;
  if (token.content === '-' || token.content.startsWith('- ')) return parseSequence(state, indent);
  return parseMapping(state, indent);
}

/** Parses one workflow document into plain objects/arrays/strings, or throws. */
export function parseWorkflow(text) {
  const state = { lines: text.split(/\r?\n/), index: 0 };
  const first = peek(state);
  if (first === null) return {};
  if (first.indent !== 0) fail(`document does not start at column 0 (line ${first.lineNo})`);
  const doc = parseMapping(state, 0);
  const trailing = peek(state);
  if (trailing !== null) fail(`unparsed content at line ${trailing.lineNo}: ${JSON.stringify(trailing.content)}`);
  return doc;
}

/** Raw source lines — for comment and trailing-comment assertions the object model cannot make. */
export function sourceLines(text) {
  return text.split(/\r?\n/);
}

export function jobIds(doc) {
  return Object.keys(doc.jobs ?? {});
}

export function triggers(doc) {
  const on = doc.on;
  if (on === null || on === undefined) return [];
  if (typeof on === 'string') return [on];
  if (Array.isArray(on)) return on.map(String);
  return Object.keys(on);
}

/** Depth-first walk over every key in the model. `fn(key, value, path)`. */
export function walk(node, fn, path = []) {
  if (Array.isArray(node)) {
    node.forEach((item, index) => walk(item, fn, [...path, String(index)]));
    return;
  }
  if (node !== null && typeof node === 'object') {
    for (const [key, value] of Object.entries(node)) {
      fn(key, value, [...path, key]);
      walk(value, fn, [...path, key]);
    }
  }
}

/** Every `uses:` reference with its line number and trailing `# version` comment, from raw text. */
export function usesReferences(text) {
  const references = [];
  sourceLines(text).forEach((line, index) => {
    const match = /^\s*(?:-\s+)?uses:\s*(\S+)\s*(?:#\s*(.*?))?\s*$/.exec(line);
    if (match !== null) {
      references.push({ line: index + 1, value: match[1], trailingComment: match[2] ?? null });
    }
  });
  return references;
}

export { WorkflowSyntaxError };
