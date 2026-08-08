/**
 * The payload-minimisation denylist, made structural (FND-05 deliverable 2).
 *
 * PRD §34.8: *"Full questions, facts, answers and source excerpts are excluded by default."*
 * PRD §8.8: payloads *"MUST avoid complete customer questions/answers by default"*.
 * PRD §16.2: SSE events *"MUST NOT contain hidden reasoning or raw provider payloads"*.
 * PRD §22: logs *"MUST exclude research/evidence content, PII text, credentials, assertions and
 * provider payloads"* — the same content boundary, here enforced on the wire contract.
 *
 * ## The matching rule, and why it is neither substring nor exact
 *
 * A pure **substring** rule denies `answer_snapshot_id`, which PRD §34.4 line 1951 mandates and which
 * is an opaque identifier, not content. A pure **exact** rule waves through `change_summary_text`,
 * which is content wearing a different hat. So:
 *
 * > A property name (lower-cased) is denied when **(a)** it equals a denylisted name, **or (b)** its
 * > last `_`-separated token equals one of the single-word entries.
 *
 * This is a **privacy boundary, not a lint rule**. If a schema genuinely needs a denied field, FND-05
 * Feedback obligation 3 applies: record the field and its justification in
 * `docs/prd/00-foundation/README.md` and escalate it as a product/privacy change (PRD §45.5, §10.2)
 * BEFORE relaxing anything here.
 */
import type { JsonObject, JsonValue } from './load.js';

/** The thirteen names FND-05 deliverable 2 lists, verbatim. */
export const DENYLIST: readonly string[] = Object.freeze([
  'question',
  'facts',
  'answer',
  'short_answer',
  'claim_text',
  'quote',
  'snippet',
  'excerpt',
  'content',
  'prompt',
  'reasoning',
  'provider_payload',
  'text',
]);

/** The single-word entries: those also deny any name whose LAST `_` token equals them (rule b). */
export const DENIED_TOKENS: readonly string[] = Object.freeze(
  DENYLIST.filter((name) => !name.includes('_')),
);

export function isDeniedPropertyName(name: string): boolean {
  const lower = name.toLowerCase();
  if (DENYLIST.includes(lower)) return true;
  const tokens = lower.split('_');
  const last = tokens[tokens.length - 1] as string;
  return DENIED_TOKENS.includes(last);
}

export interface DenylistFinding {
  readonly file: string;
  readonly pointer: string;
  readonly property: string;
}

/** Every denied property name in `schema`, walking `properties` recursively and through `items`. */
export function findDeniedProperties(file: string, schema: JsonObject): DenylistFinding[] {
  const findings: DenylistFinding[] = [];
  const isObject = (value: JsonValue | undefined): value is JsonObject =>
    typeof value === 'object' && value !== null && !Array.isArray(value);

  const walk = (node: JsonValue, pointer: string): void => {
    if (!isObject(node)) return;
    const properties = node['properties'];
    if (isObject(properties)) {
      for (const [name, child] of Object.entries(properties)) {
        const childPointer = `${pointer}/properties/${name}`;
        if (isDeniedPropertyName(name)) findings.push({ file, pointer: childPointer, property: name });
        walk(child, childPointer);
      }
    }
    const items = node['items'];
    if (isObject(items)) walk(items, `${pointer}/items`);
  };

  walk(schema, '#');
  return findings;
}

/** A human-readable line per finding — the message a reviewer sees on a scratch-branch experiment. */
export function describeFinding(finding: DenylistFinding): string {
  return `${finding.file}: property "${finding.property}" at ${finding.pointer} is on the FND-05 payload denylist (PRD §34.8, §8.8, §22)`;
}
