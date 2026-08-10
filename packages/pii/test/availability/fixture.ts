import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import type {
  AvailabilityDecision,
  DetectorAvailability,
  KillSwitchState,
  OperationClass,
} from '../../src/availability/index.js';

export const TEST_AVAILABILITY_DIR = dirname(fileURLToPath(import.meta.url));
export const MATRIX_PATH = join(TEST_AVAILABILITY_DIR, 'matrix.json');

export interface MatrixRow {
  readonly id: string;
  readonly operation: OperationClass;
  readonly availability: DetectorAvailability;
  readonly killSwitch: KillSwitchState | null;
  readonly expect: AvailabilityDecision;
}

export interface AvailabilityMatrix {
  readonly basis: string;
  readonly rows: readonly MatrixRow[];
}

export function loadMatrix(): AvailabilityMatrix {
  return JSON.parse(readFileSync(MATRIX_PATH, 'utf8')) as AvailabilityMatrix;
}
