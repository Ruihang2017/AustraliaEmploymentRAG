/**
 * LNCH-01 deliverable 7 — the policy checker.
 *
 * Validates the `docs/policies/**` tree that PRD §11.2 requires: the four documents (Terms of
 * Service, Privacy Policy, Acceptable Use Policy, disclaimer), their frontmatter, their required
 * sections, the machine-readable claim-language rules that implement "It MUST NOT state that a
 * customer is definitely compliant", and the standing `LEGAL_REVIEW_PENDING` register (PRD §26,
 * §27).
 *
 * Node standard library only — no npm dependency, no workspace membership, no JSON Schema or YAML
 * library (sub-PRD D11; adding one would touch the `FND-01`-owned root lockfile).
 *
 * Deliberately has **no shebang**: the repository convention set by `tools/workspace-script.mjs` is
 * that a CRLF `#!...` first line breaks Vite's transform on a Windows checkout (`core.autocrlf=true`).
 *
 * No network access. Reads only; the single write is `--report <path>`, and only when that flag is
 * given. Never `eval`s, `Function`s or `import()`s anything sourced from a policy document, a
 * fixture or a rule file — patterns are compiled with `new RegExp` and nothing else.
 *
 * Usage:
 *   node docs/policies/tools/check-policies.mjs [--root <dir>] [--prd <path>] [--report <path>]
 *
 * Exit code is 0 (clean) or 1 (one or more violations, or a usage error) and nothing else.
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join, resolve, relative, sep } from 'node:path';

/** The four PRD §11.2 documents: frontmatter `id` → filename under `<root>`. */
export const DOCUMENTS = {
  'terms-of-service': 'terms-of-service.md',
  'privacy-policy': 'privacy-policy.md',
  'acceptable-use-policy': 'acceptable-use-policy.md',
  disclaimer: 'disclaimer.md',
};

/**
 * Required `## ` section headings per document, in order, exactly once each.
 * Transcribed from the LNCH-01 ticket, Deliverable 3 — the ticket is the source of truth; if a
 * title here disagrees with the ticket, this table is wrong.
 */
export const REQUIRED_SECTIONS = {
  'terms-of-service': [
    'Parties and definitions',
    'What the service is and is not',
    'Eligibility and invite-only access',
    'Pilot scope and limits',
    'Acceptable use',
    'Customer content, ownership and use',
    'Retention and deletion',
    'Availability and support position',
    'Fees, invoicing and payment',
    'Warranties, liability and indemnity',
    'Suspension, kill switches and termination',
    'Governing law and jurisdiction',
    'Changes to these terms',
    'Contact',
  ],
  'privacy-policy': [
    'What we collect and why',
    'The PII boundary and what customers must not submit',
    'Lawful basis and purpose',
    'Customer content is not training or evaluation data',
    'Model providers, no-training and minimal-retention configuration',
    'Subprocessors and cross-border processing',
    'Data location',
    'Retention schedule',
    'Security summary',
    'Access, correction, deletion and organisation closure',
    'Breach notification',
    'Contact',
  ],
  'acceptable-use-policy': [
    'No employee PII',
    'No use as legal representation',
    'Source material, licensing and redistribution',
    'Credential handling',
    'Sandbox use',
    'Rate, quota and concurrency limits',
    'Security testing',
    'Enforcement',
  ],
  disclaimer: [
    'What this product does',
    'What it does not do',
    'Point-in-time and legal-date limits',
    'Source freshness limits',
    'Source licensing limits',
    'Coverage limits',
    'What to do if something looks wrong',
  ],
};

/** Register rows PRD §11.2 forces to exist: one per document, one per disclaimed surface. */
export const REGISTER_DOCUMENT_ROWS = [
  'LRP-DOC-TERMS-OF-SERVICE',
  'LRP-DOC-PRIVACY-POLICY',
  'LRP-DOC-ACCEPTABLE-USE-POLICY',
  'LRP-DOC-DISCLAIMER',
];
export const REGISTER_SURFACE_ROWS = [
  'LRP-SURFACE-WEB-APP',
  'LRP-SURFACE-WIDGET',
  'LRP-SURFACE-EXPORTS',
];
export const REGISTER_ROW_FIELDS = [
  'id',
  'subject',
  'risk',
  'status',
  'owner',
  'review_trigger',
  'disclosure',
  'prd_ref',
  'first_recorded',
];

/** JSON Schema keywords the hand-written validator implements. Anything else is a violation. */
const SUPPORTED_SCHEMA_KEYWORDS = new Set([
  '$schema',
  '$id',
  'title',
  'description',
  'type',
  'enum',
  'const',
  'pattern',
  'minLength',
  'items',
  'uniqueItems',
  'minItems',
  'required',
  'properties',
  'additionalProperties',
  'if',
  'then',
]);

const LEGAL_REVIEW_TOKEN = 'LEGAL_REVIEW_PENDING';
const MARKER_TOKEN = 'FOUNDER_INPUT_REQUIRED';
const MARKER_RE = /<!--\s*FOUNDER_INPUT_REQUIRED\s*:\s*([\s\S]*?)-->/g;
const ANY_COMMENT_RE = /<!--[\s\S]*?-->/g;

// ---------------------------------------------------------------------------------------------
// I/O helpers
// ---------------------------------------------------------------------------------------------

/**
 * The only file reader in this module. Strips a UTF-8 BOM and normalises CRLF/CR to LF, because
 * this repository checks out with `core.autocrlf=true` and every `$`-anchored regex, heading match
 * and `---` frontmatter delimiter below would otherwise break against a stray `\r`.
 */
export function readText(path) {
  return readFileSync(path, 'utf8').replace(/^﻿/, '').replace(/\r\n?/g, '\n');
}

/** Offset → 1-based line number, for a text whose newlines are still intact. */
export function lineIndexer(text) {
  const starts = [0];
  for (let i = 0; i < text.length; i += 1) {
    if (text[i] === '\n') starts.push(i + 1);
  }
  return (offset) => {
    let lo = 0;
    let hi = starts.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (starts[mid] <= offset) lo = mid;
      else hi = mid - 1;
    }
    return lo + 1;
  };
}

// ---------------------------------------------------------------------------------------------
// Frontmatter
// ---------------------------------------------------------------------------------------------

/**
 * Parses the restricted `---` fenced frontmatter grammar documented in docs/policies/README.md.
 *
 * Accepted: `key: value` where the value is a double-quoted string, a bare scalar, `null` or an
 * inline array `[a, b]`; block arrays (`key:` then `  - item` lines); folded scalars (`key: >-`
 * then indented continuation lines joined with single spaces).
 *
 * Anything else — anchors, nested maps, `|` literals, trailing `#` comments, tabs — is reported as
 * `frontmatter-unsupported-syntax` and never silently misparsed.
 *
 * @returns {{ data: object, errors: Array<{line:number, rule:string, message:string}>,
 *             bodyOffset: number, bodyStartLine: number, valueLines: object }}
 */
export function parseFrontmatter(text) {
  const errors = [];
  const data = {};
  const valueLines = {};
  const lines = text.split('\n');

  if (lines[0] !== '---') {
    errors.push({
      line: 1,
      rule: 'frontmatter-unsupported-syntax',
      message: 'file must begin with a `---` frontmatter fence',
    });
    return { data, errors, bodyOffset: 0, bodyStartLine: 1, valueLines };
  }

  let end = -1;
  for (let i = 1; i < lines.length; i += 1) {
    if (lines[i] === '---') {
      end = i;
      break;
    }
  }
  if (end === -1) {
    errors.push({
      line: 1,
      rule: 'frontmatter-unsupported-syntax',
      message: 'unterminated frontmatter: no closing `---` fence',
    });
    return { data, errors, bodyOffset: 0, bodyStartLine: 1, valueLines };
  }

  let i = 1;
  while (i < end) {
    const raw = lines[i];
    const lineNo = i + 1;

    if (raw.trim() === '') {
      i += 1;
      continue;
    }
    if (raw.startsWith('#')) {
      i += 1;
      continue;
    }
    if (raw.includes('\t')) {
      errors.push({ line: lineNo, rule: 'frontmatter-unsupported-syntax', message: 'tab character' });
      i += 1;
      continue;
    }
    const m = /^([A-Za-z_][A-Za-z0-9_]*):(?: (.*))?$/.exec(raw);
    if (!m) {
      errors.push({
        line: lineNo,
        rule: 'frontmatter-unsupported-syntax',
        message: `not a \`key: value\` line: ${JSON.stringify(raw)}`,
      });
      i += 1;
      continue;
    }
    const key = m[1];
    const rest = m[2] === undefined ? '' : m[2];
    if (Object.prototype.hasOwnProperty.call(data, key)) {
      errors.push({
        line: lineNo,
        rule: 'frontmatter-unsupported-syntax',
        message: `duplicate key \`${key}\``,
      });
    }
    valueLines[key] = lineNo;

    if (rest === '>-' || rest === '>') {
      const parts = [];
      let j = i + 1;
      while (j < end && (lines[j].trim() === '' || /^ +\S/.test(lines[j]))) {
        if (lines[j].trim() !== '') parts.push(lines[j].trim());
        j += 1;
      }
      if (parts.length === 0) {
        errors.push({
          line: lineNo,
          rule: 'frontmatter-unsupported-syntax',
          message: `folded scalar \`${key}\` has no continuation lines`,
        });
      }
      data[key] = parts.join(' ');
      i = j;
      continue;
    }

    if (rest === '') {
      const items = [];
      let j = i + 1;
      while (j < end && /^ +- /.test(lines[j])) {
        const item = parseScalar(lines[j].replace(/^ +- /, ''), lineNo + (j - i), errors, key);
        items.push(item);
        j += 1;
      }
      if (items.length === 0) {
        errors.push({
          line: lineNo,
          rule: 'frontmatter-unsupported-syntax',
          message: `key \`${key}\` has neither a value nor a block-array body`,
        });
      }
      data[key] = items;
      i = j;
      continue;
    }

    if (rest.startsWith('[')) {
      if (!rest.endsWith(']')) {
        errors.push({
          line: lineNo,
          rule: 'frontmatter-unsupported-syntax',
          message: `unterminated inline array for \`${key}\``,
        });
        i += 1;
        continue;
      }
      const inner = rest.slice(1, -1).trim();
      data[key] =
        inner === '' ? [] : inner.split(',').map((part) => parseScalar(part.trim(), lineNo, errors, key));
      i += 1;
      continue;
    }

    data[key] = parseScalar(rest, lineNo, errors, key);
    i += 1;
  }

  const bodyStartLine = end + 2;
  let bodyOffset = 0;
  for (let k = 0; k <= end; k += 1) bodyOffset += lines[k].length + 1;

  return { data, errors, bodyOffset, bodyStartLine, valueLines };
}

function parseScalar(raw, lineNo, errors, key) {
  if (raw === 'null') return null;
  if (raw.startsWith('"')) {
    try {
      const parsed = JSON.parse(raw);
      if (typeof parsed !== 'string') throw new Error('not a string');
      return parsed;
    } catch {
      errors.push({
        line: lineNo,
        rule: 'frontmatter-unsupported-syntax',
        message: `\`${key}\`: malformed double-quoted string`,
      });
      return '';
    }
  }
  if (raw === '') {
    errors.push({
      line: lineNo,
      rule: 'frontmatter-unsupported-syntax',
      message: `\`${key}\`: empty bare scalar`,
    });
    return '';
  }
  // Reject every YAML sigil the parser does not implement — anchors (`&`), aliases (`*`), tags
  // (`!`), flow maps (`{`), literal blocks (`|`), folded scalars in a position that is not handled,
  // directives (`%`) and single-quoted strings. Misparsing one of these silently would be worse
  // than refusing it.
  if (
    raw.includes('#') ||
    / : |: /.test(raw) ||
    raw.endsWith(':') ||
    /^[-&*!{}[\]|>%@`'"]/.test(raw.slice(0, 1)) ||
    raw.includes('\t')
  ) {
    errors.push({
      line: lineNo,
      rule: 'frontmatter-unsupported-syntax',
      message: `\`${key}\`: unsupported bare scalar ${JSON.stringify(raw)} — it may not contain \`#\` or \`: \`, or begin with a YAML sigil; use a double-quoted string`,
    });
    return raw;
  }
  return raw;
}

// ---------------------------------------------------------------------------------------------
// JSON Schema subset validator
// ---------------------------------------------------------------------------------------------

/** Walks a schema and reports every keyword the validator below does not implement. */
export function unsupportedSchemaKeywords(schema, pointer = '#', out = []) {
  if (schema === null || typeof schema !== 'object' || Array.isArray(schema)) return out;
  for (const key of Object.keys(schema)) {
    if (!SUPPORTED_SCHEMA_KEYWORDS.has(key)) {
      out.push(`${pointer}/${key}`);
      continue;
    }
    if (key === 'properties') {
      for (const [name, sub] of Object.entries(schema.properties)) {
        unsupportedSchemaKeywords(sub, `${pointer}/properties/${name}`, out);
      }
    } else if (key === 'items' || key === 'if' || key === 'then') {
      unsupportedSchemaKeywords(schema[key], `${pointer}/${key}`, out);
    } else if (key === 'additionalProperties' && typeof schema[key] === 'object') {
      unsupportedSchemaKeywords(schema[key], `${pointer}/additionalProperties`, out);
    }
  }
  return out;
}

function typeOf(value) {
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'array';
  return typeof value;
}

/** Validates `value` against the supported schema subset. Returns an array of message strings. */
export function validateAgainstSchema(value, schema, pointer = '') {
  const out = [];
  if (schema === null || typeof schema !== 'object') return out;
  const at = pointer === '' ? '(root)' : pointer;

  if (schema.type !== undefined) {
    const allowed = Array.isArray(schema.type) ? schema.type : [schema.type];
    const actual = typeOf(value);
    const ok = allowed.some((t) => (t === 'integer' ? Number.isInteger(value) : t === actual));
    if (!ok) {
      out.push(`${at}: expected type ${allowed.join('|')}, got ${actual}`);
      return out;
    }
  }
  if (schema.const !== undefined && value !== schema.const) {
    out.push(`${at}: expected the constant ${JSON.stringify(schema.const)}, got ${JSON.stringify(value)}`);
  }
  if (schema.enum !== undefined && !schema.enum.some((c) => c === value)) {
    out.push(`${at}: ${JSON.stringify(value)} is not one of ${JSON.stringify(schema.enum)}`);
  }
  if (schema.pattern !== undefined && typeof value === 'string') {
    if (!new RegExp(schema.pattern).test(value)) {
      out.push(`${at}: ${JSON.stringify(value)} does not match ${schema.pattern}`);
    }
  }
  if (schema.minLength !== undefined && typeof value === 'string' && value.length < schema.minLength) {
    out.push(`${at}: shorter than minLength ${schema.minLength}`);
  }
  if (Array.isArray(value)) {
    if (schema.minItems !== undefined && value.length < schema.minItems) {
      out.push(`${at}: fewer than minItems ${schema.minItems}`);
    }
    if (schema.uniqueItems === true) {
      const seen = new Set();
      for (const item of value) {
        const k = JSON.stringify(item);
        if (seen.has(k)) out.push(`${at}: duplicate item ${k}`);
        seen.add(k);
      }
    }
    if (schema.items !== undefined) {
      value.forEach((item, idx) => out.push(...validateAgainstSchema(item, schema.items, `${at}[${idx}]`)));
    }
  }
  if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
    for (const key of schema.required || []) {
      if (!Object.prototype.hasOwnProperty.call(value, key)) out.push(`${at}: missing required key \`${key}\``);
    }
    const props = schema.properties || {};
    for (const [key, sub] of Object.entries(props)) {
      if (Object.prototype.hasOwnProperty.call(value, key)) {
        out.push(...validateAgainstSchema(value[key], sub, pointer === '' ? key : `${pointer}.${key}`));
      }
    }
    if (schema.additionalProperties === false) {
      for (const key of Object.keys(value)) {
        if (!Object.prototype.hasOwnProperty.call(props, key)) out.push(`${at}: unexpected key \`${key}\``);
      }
    }
    if (schema.if !== undefined && schema.then !== undefined) {
      if (validateAgainstSchema(value, schema.if, pointer).length === 0) {
        out.push(...validateAgainstSchema(value, schema.then, pointer));
      }
    }
  }
  return out;
}

// ---------------------------------------------------------------------------------------------
// Sections
// ---------------------------------------------------------------------------------------------

/** Extracts `## ` sections from a document body. Offsets/lines are absolute in the file. */
export function extractSections(body, bodyStartLine) {
  const lines = body.split('\n');
  const sections = [];
  let current = null;
  lines.forEach((line, idx) => {
    const m = /^## (.+?)\s*$/.exec(line);
    if (m) {
      if (current) sections.push(current);
      current = { title: m[1], line: bodyStartLine + idx, content: [] };
    } else if (current) {
      current.content.push(line);
    }
  });
  if (current) sections.push(current);
  return sections.map((s) => ({ ...s, content: s.content.join('\n') }));
}

/**
 * A section is either non-placeholder prose or exactly one `FOUNDER_INPUT_REQUIRED` marker.
 * Never both, never neither, never two markers (LNCH-01 ticket, Deliverable 3).
 */
export function classifySection(content) {
  const markers = [...content.matchAll(MARKER_RE)];
  const prose = content.replace(ANY_COMMENT_RE, '').trim();
  return { markerCount: markers.length, markerTexts: markers.map((m) => m[1].trim()), prose };
}

// ---------------------------------------------------------------------------------------------
// Claim-language scan
// ---------------------------------------------------------------------------------------------

/**
 * Length-preserving normalisation applied before every claim match.
 *
 * Typographic characters are folded (a rule containing `don't` must not be defeated by `don’t`),
 * paragraph breaks become a NUL sentinel that no `\s` can match, and every remaining newline
 * becomes a space so a prohibited claim wrapped across two Markdown lines still matches. Because
 * every substitution is one character for one character, offsets stay valid against the original
 * text and reported line numbers stay real.
 */
export function normalizeForScan(text) {
  return text
    .replace(/[‘’‛]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[–—]/g, '-')
    .replace(/ /g, ' ')
    .replace(/\n[ \t]*\n[ \t\n]*/g, (m) => ' '.repeat(m.length))
    .replace(/\n/g, ' ');
}

/** Compiles the rule set once. A pattern that will not compile is `claim-rule-invalid`. */
export function compileClaimRules(ruleset) {
  const errors = [];
  const rules = [];
  const negations = [];
  for (const rule of ruleset.rules || []) {
    try {
      rules.push({ id: rule.id, re: new RegExp(rule.pattern, 'giu'), rationale: rule.rationale });
    } catch (err) {
      errors.push(`rule \`${rule.id}\`: ${err.message}`);
    }
  }
  for (const neg of ruleset.allowed_negations || []) {
    try {
      negations.push({ id: neg.id, re: new RegExp(neg.pattern, 'giu'), covers: neg.covers || [] });
    } catch (err) {
      errors.push(`allowed_negation \`${neg.id}\`: ${err.message}`);
    }
  }
  return { rules, negations, errors };
}

/**
 * Scans `text` for prohibited claims. Exclusion is span-based: a claim match whose span lies inside
 * an `allowed_negations` match span that covers the rule is skipped. Negation text is never deleted
 * before matching — that would shift offsets and corrupt reported line numbers.
 *
 * @returns {Array<{ ruleId: string, index: number, match: string }>}
 */
export function scanClaims(text, compiled) {
  const normalized = normalizeForScan(text);
  const spans = [];
  for (const neg of compiled.negations) {
    neg.re.lastIndex = 0;
    let m;
    while ((m = neg.re.exec(normalized)) !== null) {
      spans.push({ start: m.index, end: m.index + m[0].length, covers: neg.covers });
      if (m[0].length === 0) neg.re.lastIndex += 1;
    }
  }
  const hits = [];
  for (const rule of compiled.rules) {
    rule.re.lastIndex = 0;
    let m;
    while ((m = rule.re.exec(normalized)) !== null) {
      const start = m.index;
      const end = start + m[0].length;
      if (m[0].length === 0) {
        rule.re.lastIndex += 1;
        continue;
      }
      const excused = spans.some(
        (s) => s.start <= start && end <= s.end && (s.covers.includes('*') || s.covers.includes(rule.id)),
      );
      if (!excused) hits.push({ ruleId: rule.id, index: start, match: m[0] });
    }
  }
  return hits.sort((a, b) => a.index - b.index);
}

// ---------------------------------------------------------------------------------------------
// The check run
// ---------------------------------------------------------------------------------------------

function collectStrings(value, out = []) {
  if (typeof value === 'string') out.push(value);
  else if (Array.isArray(value)) value.forEach((v) => collectStrings(v, out));
  else if (value && typeof value === 'object') Object.values(value).forEach((v) => collectStrings(v, out));
  return out;
}

/** Section numbers present in the PRD, e.g. `11`, `11.2`. Read-only: the PRD is frozen. */
export function prdSectionNumbers(prdText) {
  const set = new Set();
  for (const m of prdText.matchAll(/^#{2,4}\s+(\d+(?:\.\d+)?)[.\s]/gm)) set.add(m[1]);
  return set;
}

/**
 * Runs every check against `<root>`.
 *
 * @returns {{ violations: Array<{file:string, line:number, rule:string, message:string}>,
 *             report: object }}
 */
export function runChecks({ root, prdPath }) {
  const violations = [];
  const add = (file, line, rule, message) => violations.push({ file, line, rule, message });

  const readJson = (name) => {
    const path = join(root, name);
    if (!existsSync(path)) {
      add(name, 1, 'document-missing', 'required file is absent');
      return null;
    }
    try {
      return JSON.parse(readText(path));
    } catch (err) {
      add(name, 1, 'json-invalid', err.message);
      return null;
    }
  };

  // --- the four documents: existence, frontmatter, schema (checks 1 and 2) --------------------
  const schema = readJson('policy.schema.json');
  if (schema) {
    for (const kw of unsupportedSchemaKeywords(schema)) {
      add('policy.schema.json', 1, 'schema-unsupported-keyword', `${kw} is not implemented by this checker`);
    }
  }

  const docs = {};
  for (const [id, filename] of Object.entries(DOCUMENTS)) {
    const path = join(root, filename);
    if (!existsSync(path)) {
      add(filename, 1, 'document-missing', `PRD §11.2 document \`${id}\` is absent`);
      continue;
    }
    const text = readText(path);
    const fm = parseFrontmatter(text);
    for (const e of fm.errors) add(filename, e.line, e.rule, e.message);
    const body = text.slice(fm.bodyOffset);
    docs[id] = { id, filename, path, text, body, fm };

    if (fm.data.id !== id) {
      add(filename, fm.valueLines.id || 1, 'document-missing', `frontmatter id \`${fm.data.id}\` does not match filename \`${filename}\``);
    }
    if (schema) {
      for (const message of validateAgainstSchema(fm.data, schema)) {
        add(filename, fm.valueLines[message.split(':')[0]] || 1, 'frontmatter-invalid', message);
      }
    }
  }

  // --- required sections (checks 3 and 4) ----------------------------------------------------
  for (const [id, doc] of Object.entries(docs)) {
    const required = REQUIRED_SECTIONS[id];
    const sections = extractSections(doc.body, doc.fm.bodyStartLine);
    const titles = sections.map((s) => s.title);

    for (const title of required) {
      const count = titles.filter((t) => t === title).length;
      if (count === 0) add(doc.filename, 1, 'section-missing', `required section \`## ${title}\` is absent`);
      else if (count > 1) {
        add(doc.filename, sections.find((s) => s.title === title).line, 'section-duplicate', `section \`## ${title}\` appears ${count} times`);
      }
    }
    for (const s of sections) {
      if (!required.includes(s.title)) {
        add(doc.filename, s.line, 'section-unexpected', `\`## ${s.title}\` is not a required section of \`${id}\``);
      }
    }
    const seen = [];
    for (const t of titles) if (required.includes(t) && !seen.includes(t)) seen.push(t);
    const expectedOrder = required.filter((t) => seen.includes(t));
    for (let i = 0; i < expectedOrder.length; i += 1) {
      if (seen[i] !== expectedOrder[i]) {
        add(doc.filename, sections.find((s) => s.title === seen[i]).line, 'section-out-of-order', `\`## ${seen[i]}\` appears where \`## ${expectedOrder[i]}\` is required`);
        break;
      }
    }

    doc.founderInputRequired = [];
    doc.filledSections = [];
    for (const s of sections) {
      if (!required.includes(s.title)) continue;
      const { markerCount, markerTexts, prose } = classifySection(s.content);
      if (markerCount > 1) {
        add(doc.filename, s.line, 'section-marker-duplicate', `\`## ${s.title}\` carries ${markerCount} ${MARKER_TOKEN} markers; exactly one is permitted`);
      } else if (markerCount === 1 && prose !== '') {
        add(doc.filename, s.line, 'section-both-prose-and-marker', `\`## ${s.title}\` is both prose and a ${MARKER_TOKEN} marker; it must be exactly one of the two`);
      } else if (markerCount === 0 && prose === '') {
        add(doc.filename, s.line, 'section-empty', `\`## ${s.title}\` is empty; write PRD-cited prose or exactly one ${MARKER_TOKEN} marker`);
      }
      if (markerCount === 1 && markerTexts[0] === '') {
        add(doc.filename, s.line, 'section-marker-empty', `\`## ${s.title}\` has a ${MARKER_TOKEN} marker with no description of what is needed`);
      }
      if (markerCount >= 1) doc.founderInputRequired.push(s.title);
      else if (prose !== '') doc.filledSections.push(s.title);
    }
  }

  // --- claim-language scan (check 5) ---------------------------------------------------------
  const claimSet = readJson(join('claim-language', 'prohibited-claims.json'));
  const requiredStringsPath = join(root, 'claim-language', 'required-strings.json');
  const requiredStrings = readJson(join('claim-language', 'required-strings.json'));
  let compiled = { rules: [], negations: [], errors: [] };
  if (claimSet) {
    compiled = compileClaimRules(claimSet);
    for (const message of compiled.errors) {
      add(join('claim-language', 'prohibited-claims.json'), 1, 'claim-rule-invalid', message);
    }
  }

  const scanTarget = (file, text, lineBase) => {
    const toLine = lineIndexer(text);
    for (const hit of scanClaims(text, compiled)) {
      add(file, lineBase + toLine(hit.index) - 1, hit.ruleId, `prohibited claim language: ${JSON.stringify(hit.match)}`);
    }
  };

  for (const doc of Object.values(docs)) {
    // Document bodies only. Frontmatter is excluded (it carries the required `LEGAL_REVIEW_PENDING`
    // token); the two customer-facing disclaimer fields are scanned separately below.
    scanTarget(doc.filename, doc.body, doc.fm.bodyStartLine);
  }
  if (docs.disclaimer) {
    for (const field of ['short_form', 'export_form']) {
      const value = docs.disclaimer.fm.data[field];
      if (typeof value === 'string') {
        scanTarget('disclaimer.md', value, docs.disclaimer.fm.valueLines[field] || 1);
      }
    }
  }
  if (requiredStrings && existsSync(requiredStringsPath)) {
    scanTarget(join('claim-language', 'required-strings.json'), readText(requiredStringsPath), 1);
  }

  // README.md, CHANGELOG.md and both register files are deliberately NOT scanned: they exist to
  // describe the risk of unreviewed copy and legitimately quote both the banned phrasings and the
  // `LEGAL_REVIEW_PENDING` token. Scanning them would make the tree permanently red; scanning the
  // fixtures under tools/ would do the same, which is why discovery is an explicit filename map.

  // --- required-strings resolution -----------------------------------------------------------
  if (requiredStrings) {
    for (const entry of requiredStrings.entries || []) {
      const field = entry.source_field;
      if (typeof field === 'string' && field.startsWith('disclaimer.')) {
        const name = field.slice('disclaimer.'.length);
        const value = docs.disclaimer && docs.disclaimer.fm.data[name];
        if (typeof value !== 'string' || value === '') {
          add(join('claim-language', 'required-strings.json'), 1, 'required-strings-unresolved', `entry \`${entry.id}\` references \`${field}\`, which is absent or empty in disclaimer.md frontmatter`);
        }
      }
    }
  }

  // --- register (checks 6 and 7) -------------------------------------------------------------
  const register = readJson('legal-review-register.json');
  const expectedRows = [...REGISTER_DOCUMENT_ROWS, ...REGISTER_SURFACE_ROWS];
  const openRows = [];
  if (register) {
    const rows = register.rows || [];
    const byId = new Map(rows.map((r) => [r.id, r]));
    for (const id of expectedRows) {
      const row = byId.get(id);
      if (!row) {
        add('legal-review-register.json', 1, 'register-row-missing', `PRD §11.2 requires an ${LEGAL_REVIEW_TOKEN} row \`${id}\``);
        continue;
      }
      for (const f of REGISTER_ROW_FIELDS) {
        if (row[f] === undefined || row[f] === '') {
          add('legal-review-register.json', 1, 'register-row-invalid', `row \`${id}\` is missing field \`${f}\``);
        }
      }
      if (row.status !== 'OPEN') {
        add('legal-review-register.json', 1, 'register-row-not-open', `row \`${id}\` has status \`${row.status}\`; no ticket may set it to anything other than OPEN (PRD §11.2, §27)`);
      } else {
        openRows.push(id);
      }
    }
  }

  const registerMdPath = join(root, 'legal-review-register.md');
  if (!existsSync(registerMdPath)) {
    add('legal-review-register.md', 1, 'document-missing', 'the human view of the register is absent');
  } else if (register) {
    const mdText = readText(registerMdPath);
    const mdRows = new Map();
    const mdLines = mdText.split('\n');
    mdLines.forEach((line, idx) => {
      const m = /^\|\s*`?(LRP-[A-Z-]+)`?\s*\|(.*)$/.exec(line.trim());
      if (m) {
        const cells = m[2].split('|').map((c) => c.trim().replace(/^`|`$/g, ''));
        mdRows.set(m[1], { status: cells.find((c) => /^(OPEN|CLOSED|RESOLVED|DEFERRED)$/.test(c)), line: idx + 1 });
      }
    });
    for (const row of register.rows || []) {
      const md = mdRows.get(row.id);
      if (!md) {
        add('legal-review-register.md', 1, 'register-drift', `row \`${row.id}\` is in legal-review-register.json but not in the Markdown table`);
      } else if (md.status !== row.status) {
        add('legal-review-register.md', md.line, 'register-drift', `row \`${row.id}\` is \`${md.status}\` in Markdown but \`${row.status}\` in JSON`);
      }
    }
    for (const id of mdRows.keys()) {
      if (!(register.rows || []).some((r) => r.id === id)) {
        add('legal-review-register.md', mdRows.get(id).line, 'register-drift', `row \`${id}\` is in the Markdown table but not in legal-review-register.json`);
      }
    }
  }

  for (const doc of Object.values(docs)) {
    if (doc.fm.data.legal_review !== LEGAL_REVIEW_TOKEN) {
      add(doc.filename, doc.fm.valueLines.legal_review || 1, 'register-row-missing', `frontmatter must carry \`legal_review: ${LEGAL_REVIEW_TOKEN}\` (PRD §11.2, §26)`);
    }
  }

  // check 7: the token is an internal disclosure and must not reach a customer surface.
  const leakScan = (file, text, lineBase) => {
    const toLine = lineIndexer(text);
    let idx = text.indexOf(LEGAL_REVIEW_TOKEN);
    while (idx !== -1) {
      add(file, lineBase + toLine(idx) - 1, 'legal-review-pending-leak', `\`${LEGAL_REVIEW_TOKEN}\` is an internal disclosure (PRD §26) and must not appear in customer-facing copy`);
      idx = text.indexOf(LEGAL_REVIEW_TOKEN, idx + 1);
    }
  };
  for (const doc of Object.values(docs)) leakScan(doc.filename, doc.body, doc.fm.bodyStartLine);
  if (docs.disclaimer) {
    for (const field of ['short_form', 'export_form']) {
      const value = docs.disclaimer.fm.data[field];
      if (typeof value === 'string') leakScan('disclaimer.md', value, docs.disclaimer.fm.valueLines[field] || 1);
    }
  }

  // --- disclaimer short/export forms (check 8) -----------------------------------------------
  if (docs.disclaimer) {
    const fm = docs.disclaimer.fm;
    for (const field of ['short_form', 'export_form']) {
      const value = fm.data[field];
      if (typeof value !== 'string' || value.trim() === '') {
        add('disclaimer.md', fm.valueLines[field] || 1, 'disclaimer-short-form-missing', `frontmatter \`${field}\` must be a non-empty string (PRD §11.2, §8.9, §8.10)`);
      } else if (value.includes(MARKER_TOKEN) && fm.data.status !== 'DRAFT_PENDING_FOUNDER_CONTENT') {
        add('disclaimer.md', fm.valueLines[field] || 1, 'disclaimer-placeholder-status', `\`${field}\` is a ${MARKER_TOKEN} placeholder, so \`status\` must be DRAFT_PENDING_FOUNDER_CONTENT`);
      }
    }
  }

  // --- prd_basis resolution (check 9) --------------------------------------------------------
  if (!existsSync(prdPath)) {
    add(relative(root, prdPath).split(sep).join('/'), 1, 'prd-basis-unresolved', 'the PRD could not be read');
  } else {
    const numbers = prdSectionNumbers(readText(prdPath));
    for (const doc of Object.values(docs)) {
      for (const ref of doc.fm.data.prd_basis || []) {
        if (typeof ref !== 'string') continue;
        if (!numbers.has(ref.replace(/^§/, ''))) {
          add(doc.filename, doc.fm.valueLines.prd_basis || 1, 'prd-basis-unresolved', `\`${ref}\` does not resolve to a section heading in the PRD`);
        }
      }
    }
  }

  violations.sort((a, b) => (a.file === b.file ? a.line - b.line : a.file < b.file ? -1 : 1));

  const report = {
    schema_version: 1,
    documents: Object.values(docs).map((doc) => ({
      id: doc.id,
      status: doc.fm.data.status ?? null,
      version: doc.fm.data.version ?? null,
      required_sections: (REQUIRED_SECTIONS[doc.id] || []).length,
      filled_sections: (doc.filledSections || []).length,
      founder_input_required: doc.founderInputRequired || [],
    })),
    register: { open_rows: openRows.length, expected_rows: expectedRows.length },
    violations,
  };

  return { violations, report };
}

// ---------------------------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------------------------

export function parseArgs(argv) {
  const options = {
    root: fileURLToPath(new URL('../', import.meta.url)),
    prdPath: fileURLToPath(new URL('../../PRD.md', import.meta.url)),
    reportPath: null,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    const value = argv[i + 1];
    if (arg === '--root' || arg === '--prd' || arg === '--report') {
      if (value === undefined) throw new Error(`${arg} requires a path`);
      if (arg === '--root') options.root = resolve(value);
      if (arg === '--prd') options.prdPath = resolve(value);
      if (arg === '--report') options.reportPath = resolve(value);
      i += 1;
    } else {
      throw new Error(`unknown argument \`${arg}\``);
    }
  }
  return options;
}

export function main(argv, write = (s) => process.stdout.write(s)) {
  let options;
  try {
    options = parseArgs(argv);
  } catch (err) {
    write(`check-policies: usage-error: ${err.message}\n`);
    return 1;
  }
  if (!existsSync(options.root)) {
    write(`check-policies: usage-error: --root ${options.root} does not exist\n`);
    return 1;
  }

  const { violations, report } = runChecks(options);
  for (const v of violations) {
    write(`${v.file.split(sep).join('/')}:${v.line}: ${v.rule}: ${v.message}\n`);
  }
  if (options.reportPath) writeFileSync(options.reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');

  if (violations.length === 0) {
    write(`check-policies: OK — ${report.documents.length} documents, ${report.register.open_rows} open ${LEGAL_REVIEW_TOKEN} rows, 0 violations\n`);
    return 0;
  }
  write(`check-policies: FAILED — ${violations.length} violation(s)\n`);
  return 1;
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) {
  process.exit(main(process.argv.slice(2)));
}
