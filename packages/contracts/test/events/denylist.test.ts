/**
 * FND-05 deliverable 2 / acceptance item 6 — payload minimisation, made structural.
 *
 * Reviewer step 6 does the on-disk version of the positive control below (add a `question` property to
 * `alert.created.json` on a scratch branch, watch this fail, discard), so the failure message names
 * both the file and the property.
 */
import { describe, expect, it } from 'vitest';

import {
  DENIED_TOKENS,
  DENYLIST,
  describeFinding,
  findDeniedProperties,
  isDeniedPropertyName,
} from './support/denylist.js';
import { type JsonObject, loadAllSchemas } from './support/load.js';

const schemas = loadAllSchemas();

describe('the rule (deliverable 2)', () => {
  it('lists exactly the thirteen names the ticket spells', () => {
    expect(DENYLIST).toEqual([
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
    expect(DENIED_TOKENS).toEqual([
      'question',
      'facts',
      'answer',
      'quote',
      'snippet',
      'excerpt',
      'content',
      'prompt',
      'reasoning',
      'text',
    ]);
  });

  it.each(['question', 'short_answer', 'provider_payload', 'change_summary_text', 'RAW_CONTENT'])(
    'denies %s',
    (name) => {
      expect(isDeniedPropertyName(name)).toBe(true);
    },
  );

  it.each([
    'answer_snapshot_id',
    'affected_research_record_ids',
    'message',
    'stage',
    'data',
    'schema_version',
    'occurred_at',
  ])('allows %s', (name) => {
    expect(isDeniedPropertyName(name)).toBe(false);
  });
});

describe('the corpus (acceptance item 6)', () => {
  it('walked a non-empty set of schemas', () => {
    expect(schemas.size).toBeGreaterThan(10);
  });

  it('declares no denylisted property anywhere under schemas/events/**', () => {
    const findings = [...schemas].flatMap(([file, schema]) => findDeniedProperties(file, schema));
    expect(findings.map(describeFinding)).toEqual([]);
  });

  it('names the file, the pointer and the property when one is injected (positive control)', () => {
    const clone = JSON.parse(
      JSON.stringify(schemas.get('webhook/v1/alert.created.json')),
    ) as JsonObject;
    const data = (clone['properties'] as JsonObject)['data'] as JsonObject;
    (data['properties'] as JsonObject)['question'] = { type: 'string' };
    (data['properties'] as JsonObject)['change_summary_text'] = { type: 'string' };

    const findings = findDeniedProperties('webhook/v1/alert.created.json', clone);
    expect(findings.map((finding) => finding.property).sort()).toEqual([
      'change_summary_text',
      'question',
    ]);
    const message = findings.map(describeFinding).join('\n');
    expect(message).toContain('webhook/v1/alert.created.json');
    expect(message).toContain('#/properties/data/properties/question');
  });

  it('walks through `items` too (positive control)', () => {
    const schema = {
      type: 'object',
      properties: {
        rows: { type: 'array', items: { type: 'object', properties: { excerpt: { type: 'string' } } } },
      },
    } as unknown as JsonObject;
    expect(findDeniedProperties('memory.json', schema).map((finding) => finding.property)).toEqual([
      'excerpt',
    ]);
  });
});
