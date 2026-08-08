/**
 * FND-08 acceptance item 1 — `[fixture]` §32.6 replay.
 *
 * Each of the seven PRD §32.6 rows is asserted, with its actors and conditions, against
 * `prd-32-6-transitions.json`. The fixture, not the implementation, is the assertion target: a
 * reviewer diffs it against docs/PRD.md lines 1674-1682 by hand and this suite proves `TRANSITIONS`
 * agrees with it.
 */
import { describe, expect, it } from 'vitest';

import { WORKFLOW_ACTOR_VALUES } from '../../src/workflow/actors.js';
import {
  MATERIAL_TRIGGER_VALUES,
  WORKFLOW_CONDITION_VALUES,
} from '../../src/workflow/conditions.js';
import { RECORD_WORKFLOW_STATE_VALUES } from '../../src/workflow/contracts.js';
import { TRANSITIONS } from '../../src/workflow/transitions.js';
import { loadFixture, rowOf } from './fixture.js';

const fixture = loadFixture();

describe('PRD §32.6 row replay', () => {
  for (const rowNumber of [1, 2, 3, 4, 5, 6, 7]) {
    it(`replays row ${rowNumber}`, () => {
      const row = rowOf(fixture, rowNumber);
      const entries = TRANSITIONS.filter((transition) => transition.prdRow === rowNumber);

      expect(
        entries.map((transition) => [transition.from, transition.to]),
        `row ${rowNumber} ("${row.fromCell}" -> "${row.toCell}") expands to ${JSON.stringify(row.expandsTo)}`,
      ).toEqual(row.expandsTo.map((pair) => [...pair]));

      for (const transition of entries) {
        expect(
          [...transition.allowedActors],
          `row ${rowNumber} actor cell "${row.actorCell}" -> ${transition.from}->${transition.to}`,
        ).toEqual([...row.actors]);
        expect(
          [...transition.conditions],
          `row ${rowNumber} condition cell "${row.conditionCell}" -> ${transition.from}->${transition.to}`,
        ).toEqual([...row.conditions]);
      }
    });
  }

  it('covers every fixture row and nothing else', () => {
    expect(fixture.rows.map((row) => row.row)).toEqual([1, 2, 3, 4, 5, 6, 7]);
    expect(new Set(TRANSITIONS.map((transition) => transition.prdRow))).toEqual(
      new Set([1, 2, 3, 4, 5, 6, 7]),
    );
  });
});

describe('the twelve-pair expansion', () => {
  it('is exactly twelve ordered pairs, in the ticket order', () => {
    expect(TRANSITIONS).toHaveLength(12);
    expect(fixture.expansion).toHaveLength(12);
    expect(fixture.expansion.map((entry) => entry.n)).toEqual([
      1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12,
    ]);
    expect(TRANSITIONS.map((transition) => [transition.from, transition.to])).toEqual(
      fixture.expansion.map((entry) => [entry.from, entry.to]),
    );
    expect(TRANSITIONS.map((transition) => transition.prdRow)).toEqual(
      fixture.expansion.map((entry) => entry.row),
    );
  });

  it('agrees with each row expandsTo list', () => {
    const fromRows = fixture.rows.flatMap((row) =>
      row.expandsTo.map((pair) => `${pair[0]}->${pair[1]}`),
    );
    expect(new Set(fromRows).size, 'a pair is produced by two §32.6 rows').toBe(12);
    expect(new Set(fromRows)).toEqual(
      new Set(fixture.expansion.map((entry) => `${entry.from}->${entry.to}`)),
    );
  });

  it('contains no self-transition', () => {
    expect(TRANSITIONS.filter((transition) => transition.from === transition.to)).toEqual([]);
  });
});

describe('fixture vocabularies', () => {
  it('lists the same states as the contracts enum', () => {
    expect(fixture.states).toEqual([...RECORD_WORKFLOW_STATE_VALUES]);
  });

  it('maps every condition token to its PRD §32.6 prose', () => {
    expect(Object.keys(fixture.conditionVocabulary)).toEqual([...WORKFLOW_CONDITION_VALUES]);
    for (const [token, prose] of Object.entries(fixture.conditionVocabulary)) {
      expect(prose, `${token} has no PRD prose in the fixture`).not.toBe('');
    }
  });

  it('maps every actor token to its PRD §32.6 prose', () => {
    expect(Object.keys(fixture.actorVocabulary)).toEqual([...WORKFLOW_ACTOR_VALUES]);
  });

  it('maps every material trigger to its PRD §32.6 prose', () => {
    expect(Object.keys(fixture.materialTriggerVocabulary)).toEqual([...MATERIAL_TRIGGER_VALUES]);
  });

  it('uses only known actors and conditions in its rows', () => {
    for (const row of fixture.rows) {
      for (const actor of row.actors) {
        expect(WORKFLOW_ACTOR_VALUES as readonly string[], `row ${row.row}`).toContain(actor);
      }
      for (const condition of row.conditions) {
        expect(WORKFLOW_CONDITION_VALUES as readonly string[], `row ${row.row}`).toContain(
          condition,
        );
      }
    }
  });

  it('records the PRD provenance of the transcription', () => {
    expect(fixture.prdFile).toBe('docs/PRD.md');
    expect(fixture.prdSection).toBe('§32.6');
    expect(fixture.prdLines).toBe('1674-1682');
  });
});
