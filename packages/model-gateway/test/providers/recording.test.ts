/**
 * EVID-07 deliverable 12 and the acceptance items "Actual model version recorded" and
 * "TenantContext only" (PRD §35.6, §37.3, §21.2, §45.2; `ANS-004`, `SEC-001`).
 */
import { describe, expect, it } from 'vitest';

import './support/network-stub.js';
import { PACKAGE_ROOT, readJson } from './support/fixture.js';
import { forgeReservation } from './support/reservation-double.js';
import {
  TX_SENTINEL,
  deferredTransport,
  gatewayCall,
  harness,
  immediateTimer,
  respondWith,
  spyOnTransport,
  throwingPort,
  throwingTransport,
} from './support/harness.js';
import { generate } from '../../src/providers/generate.js';
import { MODEL_EXECUTION_FIELDS, buildModelExecutionRecord } from '../../src/providers/recording.js';
import { INSTRUCTION_TEMPLATE_VERSION } from '../../src/schema/request.js';

const validBody = JSON.stringify(
  readJson<unknown>(PACKAGE_ROOT, 'test', 'schema', 'fixtures', 'valid-response.json'),
);
const reservation = forgeReservation({ expiresAt: 1_000_000 });

describe('buildModelExecutionRecord', () => {
  it('produces exactly the deliverable-12 fields and no others', () => {
    const row = buildModelExecutionRecord({
      jobId: 'jb_1',
      profile: 'QUICK_SYNTHESIS',
      providerId: 'STUB_DETERMINISTIC',
      actualModelVersion: 'stub-1',
      inputTokens: 10,
      outputTokens: 20,
      latencyMs: 3,
      costMicroAud: 1n,
      schemaStatus: 'VALID',
      retentionMode: 'ZERO',
      instructionTemplateVersion: INSTRUCTION_TEMPLATE_VERSION,
      packHash: 'sha256:0',
    });
    expect(Object.keys(row).sort()).toEqual([...MODEL_EXECUTION_FIELDS].sort());
  });

  it('copies field by field, so an extra member on the input never reaches the row', () => {
    const smuggled = {
      jobId: 'jb_1',
      profile: 'QUICK_SYNTHESIS',
      providerId: 'STUB_DETERMINISTIC',
      actualModelVersion: null,
      inputTokens: null,
      outputTokens: null,
      latencyMs: 0,
      costMicroAud: null,
      schemaStatus: 'VALID',
      retentionMode: 'ZERO',
      instructionTemplateVersion: INSTRUCTION_TEMPLATE_VERSION,
      packHash: 'sha256:0',
      rawPrompt: 'THIS MUST NOT SURVIVE',
      rawResponse: 'NOR THIS',
    } as unknown as Parameters<typeof buildModelExecutionRecord>[0];
    const row = buildModelExecutionRecord(smuggled);
    expect(JSON.stringify(row)).not.toContain('MUST NOT SURVIVE');
    expect(Object.keys(row)).not.toContain('rawPrompt');
  });
});

describe('exactly one row per attempt, on every path that reached the provider', () => {
  it.each([
    ['success', { status: 200, body: validBody }, 'VALID'],
    ['a 500', { status: 500, body: '' }, 'NOT_EVALUATED'],
    ['a 429', { status: 429, body: '' }, 'NOT_EVALUATED'],
    ['a schema failure', { status: 200, body: '{"proposed_status":"SUPPORTED"}' }, 'INVALID'],
  ])('records one row for %s', async (_label, response, schemaStatus) => {
    const { deps, port } = harness({ transport: respondWith(response) });
    await generate(gatewayCall(), reservation, deps);
    expect(port.rows).toHaveLength(1);
    expect(port.rows[0]?.schemaStatus).toBe(schemaStatus);
  });

  it('records one row when the transport throws', async () => {
    const { deps, port } = harness({ transport: throwingTransport() });
    const result = await generate(gatewayCall(), reservation, deps);
    expect(result.outcome).toBe('UNAVAILABLE');
    expect(port.rows).toHaveLength(1);
    expect(port.rows[0]?.schemaStatus).toBe('NOT_EVALUATED');
  });

  it('records ONE row on a timeout, and a LATE transport resolution adds no second row', async () => {
    const deferred = deferredTransport();
    const spy = spyOnTransport(deferred.transport);
    const { deps, port } = harness({ transport: spy.transport, timer: immediateTimer });

    const result = await generate(gatewayCall(), reservation, deps);
    expect(result.outcome).toBe('UNAVAILABLE');
    if (result.outcome !== 'UNAVAILABLE') throw new Error('unreachable');
    expect(result.reason).toBe('PROFILE_TIMEOUT');
    expect(port.rows).toHaveLength(1);

    // The loser of the race now finishes. It must change nothing.
    deferred.settle({ status: 200, body: validBody });
    await Promise.resolve();
    await Promise.resolve();
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(port.rows, 'a late resolution recorded a second row').toHaveLength(1);
    expect(result.reason).toBe('PROFILE_TIMEOUT');
    expect(spy.calls).toHaveLength(1);
  });

  it('records NO row for a refusal that never reached the provider', async () => {
    const spy = spyOnTransport(respondWith({ body: validBody }));
    const { deps, port } = harness({
      transport: spy.transport,
      killSwitch: { profiles: ['QUICK_SYNTHESIS'] },
    });
    await generate(gatewayCall(), reservation, deps);
    expect(port.rows).toHaveLength(0);
    expect(spy.calls).toHaveLength(0);
  });
});

describe('the row content', () => {
  it('records the provider-reported model version (ANS-004)', async () => {
    const { deps, port } = harness({
      transport: respondWith({ body: validBody, modelVersion: 'synthetic-model-2026-07' }),
    });
    await generate(gatewayCall(), reservation, deps);
    expect(port.rows[0]?.actualModelVersion).toBe('synthetic-model-2026-07');
  });

  it('records null — never omits — when the provider reported no version, including on a failure', async () => {
    const { deps, port } = harness({ transport: respondWith({ status: 500, body: '' }) });
    await generate(gatewayCall(), reservation, deps);
    const row = port.rows[0];
    expect(row).toBeDefined();
    expect(Object.prototype.hasOwnProperty.call(row ?? {}, 'actualModelVersion')).toBe(true);
    expect(row?.actualModelVersion).toBeNull();
  });

  it('records the version a FAILING provider still reported', async () => {
    const { deps, port } = harness({
      transport: respondWith({ status: 500, body: '', modelVersion: 'synthetic-model-2026-07' }),
    });
    await generate(gatewayCall(), reservation, deps);
    expect(port.rows[0]?.actualModelVersion).toBe('synthetic-model-2026-07');
  });

  it('records the retention mode, the instruction template version and the pack hash', async () => {
    const call = gatewayCall();
    const { deps, port } = harness({ transport: respondWith({ body: validBody }) });
    await generate(call, reservation, deps);
    const row = port.rows[0];
    expect(row?.retentionMode).toBe('ZERO');
    expect(row?.instructionTemplateVersion).toBe(INSTRUCTION_TEMPLATE_VERSION);
    expect(row?.packHash).toBe(call.pack.packHash);
    expect(row?.jobId).toBe(call.ids.jobId);
    expect(row?.profile).toBe('QUICK_SYNTHESIS');
  });

  it('carries only the deliverable-12 fields', async () => {
    const { deps, port } = harness({ transport: respondWith({ body: validBody }) });
    await generate(gatewayCall(), reservation, deps);
    expect(Object.keys(port.rows[0] ?? {}).sort()).toEqual([...MODEL_EXECUTION_FIELDS].sort());
  });
});

describe('the persistence port', () => {
  it('passes the caller-supplied transaction handle straight through, untouched', async () => {
    const { deps, port } = harness({ transport: respondWith({ body: validBody }) });
    await generate(gatewayCall(), reservation, deps);
    expect(port.transactions).toEqual([TX_SENTINEL]);
  });

  it('does not swallow an insert failure (plan §6 risk 8 — accounting integrity)', async () => {
    const boom = new Error('the model_execution insert failed');
    const { deps } = harness({
      transport: respondWith({ body: validBody }),
      port: throwingPort(boom),
    });
    await expect(generate(gatewayCall(), reservation, deps)).rejects.toThrow(boom);
  });
});
