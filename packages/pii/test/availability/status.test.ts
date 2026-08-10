import { describe, expect, it } from 'vitest';

import { aggregateDetectorHealth, projectDetectionStatus } from '../../src/availability/index.js';
import { PII_STAGES } from '../../src/context/stages.js';
import { admit } from '../../src/contract/pipeline.js';
import { loadCanaries } from '../contract/fixture.js';

describe('content-free system-status projection', () => {
  it('contains only status metadata and cannot leak a meaningful canary', () => {
    const canary = loadCanaries()[0];
    expect(canary).toBeDefined();
    if (!canary) throw new Error('the canary fixture must not be empty');

    const admission = admit(
      { freeText: [{ field: canary.field, value: canary.value }] },
      PII_STAGES,
    );
    expect(admission.decision).toBe('REJECT');
    expect(admission.findings.some((finding) => finding.severity === 'BLOCKING')).toBe(true);

    const availability = aggregateDetectorHealth({
      limits: 'READY',
      deterministic: 'READY',
      entity: 'UNAVAILABLE',
      context: 'READY',
    });
    const status = projectDetectionStatus(availability, '2026-01-01T00:00:00.000Z');
    expect(JSON.stringify(status)).not.toContain(canary.token);
    expect(Object.keys(status).sort()).toEqual(['affectedStages', 'component', 'since', 'state']);
  });
});
