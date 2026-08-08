/**
 * FND-05 deliverable 6 / acceptance item 3 — the fixtures really are the PRD's text, and the concrete
 * instances really are derived from it.
 *
 * The PRD's own examples contain placeholders (`evt_...`, `job_...`, `<lowercase hex HMAC-SHA256>`),
 * so a byte-verbatim fixture cannot itself validate or be signed. Two fixtures per artifact:
 *
 *   - the verbatim text, used for key-set and key-ORDER comparison against the schema — which is the
 *     proof that no property was added, renamed or dropped, made against the PRD's own bytes;
 *   - the concrete instance, derived by the committed substitution map, which is validated in full and
 *     signed.
 *
 * The drift guard at the bottom locates the PRD blocks by heading, not by hard-coded line numbers.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { isId } from '../../src/ids/index.js';
import {
  type JsonObject,
  REPO_ROOT,
  fixtureText,
  loadSchema,
  loadSigning,
  parseSseFrame,
  substitute,
} from './support/load.js';
import { validate } from './support/validator.js';

const signing = loadSigning();

const PAIRS: Array<[string, string]> = [
  ['alert-created.prd-34-8.json', 'alert-created.signed.json'],
  ['alert-created.headers.txt', 'alert-created.signed.headers.txt'],
  ['sse-stage-changed.prd-34-4.txt', 'sse-stage-changed.concrete.txt'],
  ['sse-job-completed.prd-34-4.txt', 'sse-job-completed.concrete.txt'],
];

describe('derivation (nothing can be smuggled into a concrete instance)', () => {
  it.each(PAIRS)('%s + placeholders == %s, byte for byte', (verbatim, concrete) => {
    expect(substitute(fixtureText(verbatim), signing.placeholders)).toBe(fixtureText(concrete));
  });

  it('is not vacuous — the substitution really changes the text', () => {
    for (const [verbatim, concrete] of PAIRS) {
      expect(fixtureText(verbatim)).not.toBe(fixtureText(concrete));
    }
    expect(substitute('evt_...', signing.placeholders)).toBe(signing.placeholders['evt_...']);
  });
});

describe('the PRD §34.8 body against its schema (acceptance item 3)', () => {
  const schema = loadSchema('webhook/v1/alert.created.json');
  const verbatim = JSON.parse(fixtureText('alert-created.prd-34-8.json')) as JsonObject;
  const concrete = JSON.parse(fixtureText('alert-created.signed.json')) as JsonObject;

  it('has exactly the schema properties, in the schema order, at every level', () => {
    const properties = schema['properties'] as JsonObject;
    expect(Object.keys(verbatim)).toEqual(Object.keys(properties));
    const dataProperties = ((properties['data'] as JsonObject)['properties']) as JsonObject;
    expect(Object.keys(verbatim['data'] as JsonObject)).toEqual(Object.keys(dataProperties));
  });

  it('declares every one of them required', () => {
    expect(schema['required']).toEqual(Object.keys(verbatim));
    expect((schema['properties'] as JsonObject)['data']).toBeDefined();
  });

  it('validates in full once the placeholders are substituted', () => {
    expect(validate(schema, concrete)).toEqual([]);
  });

  it('carries real FND-03 ids (acceptance item 10)', () => {
    expect(isId('evt', concrete['id'])).toBe(true);
    const data = concrete['data'] as JsonObject;
    expect(isId('alt', data['alert_id'])).toBe(true);
    expect(isId('wat', data['watchlist_id'])).toBe(true);
    for (const recordId of data['affected_research_record_ids'] as string[]) {
      expect(isId('rec', recordId)).toBe(true);
    }
  });

  it('still fails validation while the placeholders are in place (non-vacuity)', () => {
    expect(validate(schema, verbatim).length).toBeGreaterThan(0);
  });
});

describe('the PRD §34.4 frames against their schemas (acceptance item 3)', () => {
  const cases: Array<[string, string, string]> = [
    ['sse-stage-changed.prd-34-4.txt', 'sse-stage-changed.concrete.txt', 'stage.changed'],
    ['sse-job-completed.prd-34-4.txt', 'sse-job-completed.concrete.txt', 'job.completed'],
  ];

  it.each(cases)('%s: the event line, key order and full validation', (verbatimFile, concreteFile, type) => {
    const schema = loadSchema(`sse/v1/${type}.json`);
    const verbatim = parseSseFrame(fixtureText(verbatimFile));
    const concrete = parseSseFrame(fixtureText(concreteFile));

    expect(verbatim.type).toBe(type);
    expect(concrete.type).toBe(type);
    expect(Object.keys(verbatim.data)).toEqual(Object.keys(schema['properties'] as JsonObject));
    expect(schema['required']).toEqual(Object.keys(verbatim.data));
    expect(validate(schema, concrete.data)).toEqual([]);
    expect(validate(schema, verbatim.data).length).toBeGreaterThan(0);
  });

  it('carries real FND-03 ids', () => {
    const stage = parseSseFrame(fixtureText('sse-stage-changed.concrete.txt'));
    const completed = parseSseFrame(fixtureText('sse-job-completed.concrete.txt'));
    expect(isId('job', stage.data['job_id'])).toBe(true);
    expect(isId('job', completed.data['job_id'])).toBe(true);
    expect(isId('ans', completed.data['answer_snapshot_id'])).toBe(true);
  });
});

describe('drift guard: the verbatim fixtures are still the PRD text (Test plan step 1, automated)', () => {
  const prd = readFileSync(join(REPO_ROOT, 'docs', 'PRD.md'), 'utf8').replace(/\r\n/g, '\n');

  /** The `n`-th fenced block after `heading`, without its fences. */
  function fencedBlock(heading: string, index: number): string {
    const start = prd.indexOf(heading);
    expect(start, `${heading} is not in docs/PRD.md`).toBeGreaterThan(-1);
    const after = prd.slice(start);
    const blocks = [...after.matchAll(/```[a-z]*\n([\s\S]*?)```/g)].map((match) => match[1] as string);
    return blocks[index] as string;
  }

  it('matches PRD §34.8 for the body and the headers', () => {
    const headers = fencedBlock('### 34.8 Webhook event', 0);
    const bodyBlock = fencedBlock('### 34.8 Webhook event', 1);
    expect(headers).toBe(fixtureText('alert-created.headers.txt'));
    expect(bodyBlock).toBe(fixtureText('alert-created.prd-34-8.json'));
  });

  it('matches PRD §34.4 for both SSE frames', () => {
    const block = fencedBlock('### 34.4 SSE contract', 0);
    const [stage, completed] = block.split('\n\n');
    expect(stage).toBe(fixtureText('sse-stage-changed.prd-34-4.txt').replace(/\n$/, ''));
    expect(completed).toBe(fixtureText('sse-job-completed.prd-34-4.txt'));
  });
});
