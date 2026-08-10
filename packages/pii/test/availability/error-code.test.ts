import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { ERROR_CODE_VALUES, isErrorCode } from '../../../contracts/src/enums/error-code.js';
import { errorHttpStatusByCode } from '../../../contracts/src/generated/errors.js';
import {
  aggregateDetectorHealth,
  decideOperationAdmission,
} from '../../src/availability/index.js';
import { PACKAGE_ROOT } from '../contract/fixture.js';

function availabilitySources(): readonly { readonly name: string; readonly text: string }[] {
  const dir = join(PACKAGE_ROOT, 'src', 'availability');
  return readdirSync(dir)
    .filter((name) => name.endsWith('.ts'))
    .map((name) => ({ name, text: readFileSync(join(dir, name), 'utf8') }));
}

describe('the fail-closed error maps to the shared catalogue', () => {
  it('uses a real error code and its generated HTTP status', () => {
    const availability = aggregateDetectorHealth({
      limits: 'READY',
      deterministic: 'READY',
      entity: 'UNAVAILABLE',
      context: 'READY',
    });
    const decision = decideOperationAdmission('FREE_TEXT_ASK', availability);
    expect(decision.outcome).toBe('FAIL_CLOSED');
    if (decision.outcome === 'FAIL_CLOSED') {
      expect(isErrorCode(decision.errorCode)).toBe(true);
      expect(decision.httpStatus).toBe(errorHttpStatusByCode[decision.errorCode]);
    }
  });

  it('does not declare a second error-code vocabulary', () => {
    const sources = availabilitySources();
    expect(sources.length).toBe(6);
    expect(sources.filter((source) => /\bERROR_CODE\b/.test(source.text))).toEqual([]);
    for (const source of sources) {
      const mentioned = ERROR_CODE_VALUES.filter((code) => source.text.includes(code));
      expect(mentioned.length, source.name).toBeLessThan(2);
    }
    expect(
      sources.filter((source) => source.text.includes('GENERATION_UNAVAILABLE')).map((source) => source.name),
    ).toEqual(['decide.ts']);
  });
});
