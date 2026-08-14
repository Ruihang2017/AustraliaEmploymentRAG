/**
 * EVID-07 deliverable 7 — the deterministic stub.
 *
 * The two properties downstream tickets will rely on, and which are therefore asserted here rather
 * than assumed: a `VALID` response cites REAL evidence ids from the supplied pack with offsets inside
 * that item's `exact_text`, and the stub is a pure function of its input.
 */
import { describe, expect, it } from 'vitest';

import './support/network-stub.js';
import { evidenceItem, evidencePack, sanitizedFacts } from './support/doubles.js';
import { forgeReservation } from './support/reservation-double.js';
import { gatewayCall, harness } from './support/harness.js';
import { generate } from '../../src/providers/generate.js';
import { buildProviderRequest, INSTRUCTION_TEMPLATE_VERSION } from '../../src/schema/request.js';
import { parseModelResponse } from '../../src/schema/response.js';
import { MODEL_PROFILE_REGISTRY_V1 } from '../../src/profiles/registry.js';
import { MODEL_PROFILE_IDS } from '../../src/profiles/types.js';
import {
  CONTENT_LEVEL_MODES,
  STUB_MODEL_VERSION,
  STUB_MODES,
  createStubProvider,
  exactTextOf,
  isStubMode,
} from '../../src/providers/stub/index.js';
import { PROVIDER_GENERATE_PATH } from '../../src/providers/adapter.js';
import type { ModelProfileId } from '../../src/profiles/types.js';
import type { TransportRequest } from '../../src/providers/transport/types.js';

const HOSTED: readonly ModelProfileId[] = MODEL_PROFILE_IDS.filter(
  (id) => MODEL_PROFILE_REGISTRY_V1[id].execution === 'HOSTED',
);
const reservation = (profileId: ModelProfileId) =>
  forgeReservation({ profileId, expiresAt: 1_000_000 });

function transportRequestFor(profileId: ModelProfileId, itemCount = 1): TransportRequest {
  const pack = evidencePack({
    items: Array.from({ length: itemCount }, (_entry, index) =>
      evidenceItem({ evidenceId: `ev_0${String(index + 1)}` }),
    ),
  });
  const payload = buildProviderRequest(
    MODEL_PROFILE_REGISTRY_V1[profileId],
    sanitizedFacts([{ field: 'question', value: 'a synthetic question' }]),
    pack,
    { requestId: 'rq_1', jobId: 'jb_1' },
  );
  return {
    providerId: 'STUB_DETERMINISTIC',
    path: PROVIDER_GENERATE_PATH,
    method: 'POST',
    body: payload,
    headersSubset: {},
  };
}

describe('the mode vocabulary', () => {
  it('lists exactly the modes the ticket names', () => {
    expect([...STUB_MODES]).toEqual([
      'VALID',
      'SCHEMA_INVALID',
      'FABRICATED_EVIDENCE_ID',
      'INVENTED_URL',
      'EMBEDDED_HTML',
      'PROHIBITED_CERTAINTY_PHRASE',
      'TIMEOUT',
      'RATE_LIMITED_429',
      'SERVER_ERROR_500',
      'TRUNCATED_JSON',
      'EMPTY_BODY',
    ]);
    expect(isStubMode('VALID')).toBe(true);
    expect(isStubMode('MADE_UP')).toBe(false);
  });
});

describe('exactTextOf', () => {
  it('recovers the exact_text from a rendered block', () => {
    const text = 'A synthetic provision, with\nnewlines and a trailing space. ';
    const pack = evidencePack({ items: [evidenceItem({ exactText: text })] });
    const payload = buildProviderRequest(
      MODEL_PROFILE_REGISTRY_V1.QUICK_SYNTHESIS,
      sanitizedFacts([]),
      pack,
      { requestId: 'rq_1', jobId: 'jb_1' },
    );
    const segment = payload.evidence.items[0];
    if (segment === undefined) throw new Error('no segment');
    expect(exactTextOf(segment)).toBe(text);
  });
});

describe.each(HOSTED)('a VALID response for %s', (profileId) => {
  it('validates against PRD §36.5 and cites real evidence ids with in-range offsets', async () => {
    const request = transportRequestFor(profileId, 2);
    const payload = request.body as { evidence: { items: { evidenceId: string; body: string }[] } };
    const response = await createStubProvider({ mode: 'VALID' })(request);

    const parsed = parseModelResponse(response.body);
    expect(parsed.ok, JSON.stringify(parsed)).toBe(true);
    if (!parsed.ok) throw new Error('unreachable');

    const suppliedIds = payload.evidence.items.map((item) => item.evidenceId);
    for (const claim of parsed.value.claims) {
      expect(claim.evidence.length).toBeGreaterThan(0);
      for (const citation of claim.evidence) {
        expect(suppliedIds, 'the stub cited an id that was not in the pack').toContain(citation.evidence_id);
        const segment = payload.evidence.items.find((item) => item.evidenceId === citation.evidence_id);
        const text = exactTextOf(segment as { kind: 'EVIDENCE_ITEM'; evidenceId: string; body: string });
        expect(citation.quote_start).toBeGreaterThanOrEqual(0);
        expect(citation.quote_end).toBeLessThanOrEqual(text.length);
        expect(citation.quote_end).toBeGreaterThan(citation.quote_start);
      }
    }
  });

  it('reports its model version', async () => {
    const response = await createStubProvider({ mode: 'VALID' })(transportRequestFor(profileId));
    expect(response.modelVersion).toBe(STUB_MODEL_VERSION);
  });
});

describe('determinism', () => {
  it('produces identical bytes for identical input', async () => {
    const stub = createStubProvider({ mode: 'VALID' });
    const first = await stub(transportRequestFor('QUICK_SYNTHESIS'));
    const second = await stub(transportRequestFor('QUICK_SYNTHESIS'));
    expect(second.body).toBe(first.body);
  });

  it('does not drift between two separately constructed stubs (no hidden counter)', async () => {
    const first = await createStubProvider({ mode: 'VALID' })(transportRequestFor('QUICK_SYNTHESIS'));
    const second = await createStubProvider({ mode: 'VALID' })(transportRequestFor('QUICK_SYNTHESIS'));
    expect(second.body).toBe(first.body);
  });

  it('varies only with the pack and the profile', async () => {
    const stub = createStubProvider({ mode: 'VALID' });
    const one = await stub(transportRequestFor('QUICK_SYNTHESIS', 1));
    const two = await stub(transportRequestFor('QUICK_SYNTHESIS', 2));
    expect(two.body).not.toBe(one.body);
    const deep = await stub(transportRequestFor('DEEP_SYNTHESIS', 1));
    expect(deep.body).not.toBe(one.body);
  });
});

describe.each(CONTENT_LEVEL_MODES)('the content-level mode %s', (mode) => {
  it('returns a §36.5-VALID body — catching it is EVID-05’s job, not this gateway’s', async () => {
    const response = await createStubProvider({ mode })(transportRequestFor('QUICK_SYNTHESIS'));
    expect(parseModelResponse(response.body).ok, `${mode} produced an invalid body`).toBe(true);
  });

  it('is accepted by the gateway and reaches the caller', async () => {
    const { deps, port } = harness({ transport: createStubProvider({ mode }) });
    const result = await generate(gatewayCall(), reservation('QUICK_SYNTHESIS'), deps);
    expect(result.outcome, JSON.stringify(result)).toBe('OK');
    expect(port.rows[0]?.schemaStatus).toBe('VALID');
    expect(port.rows[0]?.instructionTemplateVersion).toBe(INSTRUCTION_TEMPLATE_VERSION);
  });
});

describe('the content-level modes actually differ from VALID', () => {
  it('fabricates an evidence id no pack contains', async () => {
    const response = await createStubProvider({ mode: 'FABRICATED_EVIDENCE_ID' })(
      transportRequestFor('QUICK_SYNTHESIS'),
    );
    expect(response.body).toContain('ev_fabricated_00');
  });

  it('invents a URL', async () => {
    const response = await createStubProvider({ mode: 'INVENTED_URL' })(transportRequestFor('QUICK_SYNTHESIS'));
    expect(response.body).toContain('invented.invalid');
  });

  it('embeds markup', async () => {
    const response = await createStubProvider({ mode: 'EMBEDDED_HTML' })(transportRequestFor('QUICK_SYNTHESIS'));
    expect(response.body).toContain('<script>');
  });

  it('uses a prohibited certainty phrase', async () => {
    const response = await createStubProvider({ mode: 'PROHIBITED_CERTAINTY_PHRASE' })(
      transportRequestFor('QUICK_SYNTHESIS'),
    );
    expect(response.body).toContain('guaranteed');
  });
});
