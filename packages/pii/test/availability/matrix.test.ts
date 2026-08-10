import { describe, expect, it } from 'vitest';

import {
  decideOperationAdmission,
  OPERATION_CLASSES,
} from '../../src/availability/index.js';
import type { DetectorAvailabilityState, KillSwitchState } from '../../src/availability/index.js';
import { loadMatrix } from './fixture.js';

const matrix = loadMatrix();

function switchKey(killSwitch: KillSwitchState | null): string {
  if (killSwitch === null) return 'none';
  return killSwitch.piiDetection === true ? 'true' : 'false';
}

describe('the exhaustive PRD availability matrix', () => {
  it('replays every expected decision and preserves the required split', () => {
    for (const row of matrix.rows) {
      const actual = decideOperationAdmission(
        row.operation,
        row.availability,
        row.killSwitch ? row.killSwitch : undefined,
      );
      expect(actual, row.id).toEqual(row.expect);
    }

    const unavailable = matrix.rows.filter(
      (row) => row.availability.state === 'NOT_AUTHORITATIVE',
    );
    expect(
      unavailable
        .filter((row) => row.operation === 'PUBLIC_LEGAL_SEARCH')
        .every((row) => row.expect.outcome === 'PROCEED'),
    ).toBe(true);
    expect(
      unavailable
        .filter((row) => row.operation.startsWith('FREE_TEXT_'))
        .every((row) => row.expect.outcome === 'FAIL_CLOSED'),
    ).toBe(true);
  });

  it('contains each operation, state and switch triple exactly once', () => {
    expect(matrix.rows).toHaveLength(42);
    expect(new Set(matrix.rows.map((row) => row.id)).size).toBe(42);

    const states: readonly DetectorAvailabilityState[] = [
      'AUTHORITATIVE',
      'NOT_AUTHORITATIVE',
    ];
    const switches: readonly (KillSwitchState | null)[] = [
      null,
      { piiDetection: false },
      { piiDetection: true },
    ];
    const expected = new Set<string>();
    for (const operation of OPERATION_CLASSES) {
      for (const state of states) {
        for (const killSwitch of switches) {
          expected.add(`${operation}|${state}|${switchKey(killSwitch)}`);
        }
      }
    }
    const actual = new Set(
      matrix.rows.map(
        (row) => `${row.operation}|${row.availability.state}|${switchKey(row.killSwitch)}`,
      ),
    );
    expect(actual).toEqual(expected);
  });

  it('keeps saved and existing outputs available even when the switch is active', () => {
    const availability = { state: 'NOT_AUTHORITATIVE', affectedStages: ['entity'] } as const;
    for (const operation of [
      'SAVED_RECORD_READ',
      'EXISTING_ANSWER_READ',
      'EXPORT_OF_EXISTING_SNAPSHOT',
    ] as const) {
      expect(decideOperationAdmission(operation, availability)).toEqual({ outcome: 'PROCEED' });
      expect(decideOperationAdmission(operation, availability, { piiDetection: true })).toEqual({
        outcome: 'PROCEED',
      });
    }
  });
});
