/**
 * EVID-07 acceptance item "Kill switch refuses" (PRD §42.5 row 1, §12.4).
 *
 * The load-bearing assertion in every case is the transport call COUNT: a kill switch that refuses
 * after the request has already left is not a kill switch.
 */
import { describe, expect, it } from 'vitest';

import './support/network-stub.js';
import { PACKAGE_ROOT, readJson } from './support/fixture.js';
import { forgeReservation } from './support/reservation-double.js';
import { gatewayCall, harness, respondWith, spyOnTransport } from './support/harness.js';
import { generate } from '../../src/providers/generate.js';
import { NO_KILL_SWITCH, isSwitchedOff, killSwitchScope } from '../../src/providers/killswitch.js';
import { STUB_PROVIDER_ID } from '../../src/profiles/provider-ids.js';

const validBody = JSON.stringify(
  readJson<unknown>(PACKAGE_ROOT, 'test', 'schema', 'fixtures', 'valid-response.json'),
);

const reservation = forgeReservation({ expiresAt: 1_000_000 });

describe('killSwitchScope', () => {
  it('reports nothing when no switch is set', () => {
    expect(killSwitchScope(NO_KILL_SWITCH, 'QUICK_SYNTHESIS', STUB_PROVIDER_ID)).toBeNull();
    expect(isSwitchedOff(NO_KILL_SWITCH, 'QUICK_SYNTHESIS', STUB_PROVIDER_ID)).toBe(false);
  });

  it('reports the profile scope and the provider scope independently', () => {
    expect(killSwitchScope({ profiles: ['QUICK_SYNTHESIS'] }, 'QUICK_SYNTHESIS', STUB_PROVIDER_ID)).toBe(
      'PROFILE',
    );
    expect(killSwitchScope({ providers: [STUB_PROVIDER_ID] }, 'QUICK_SYNTHESIS', STUB_PROVIDER_ID)).toBe(
      'PROVIDER',
    );
  });

  it('does not fire for a different profile or a different provider', () => {
    expect(killSwitchScope({ profiles: ['DEEP_SYNTHESIS'] }, 'QUICK_SYNTHESIS', STUB_PROVIDER_ID)).toBeNull();
    expect(killSwitchScope({ providers: ['SOMETHING_ELSE'] }, 'QUICK_SYNTHESIS', STUB_PROVIDER_ID)).toBeNull();
  });

  it('is frozen data: NO_KILL_SWITCH cannot be turned into a switch', () => {
    expect(Object.isFrozen(NO_KILL_SWITCH)).toBe(true);
    expect(() => {
      (NO_KILL_SWITCH as { profiles?: string[] }).profiles = ['QUICK_SYNTHESIS'];
    }).toThrow(TypeError);
  });
});

describe('generate refuses with KILL_SWITCH and performs no provider call', () => {
  it('when the profile switch is set', async () => {
    const spy = spyOnTransport(respondWith({ body: validBody }));
    const { deps, port } = harness({
      transport: spy.transport,
      killSwitch: { profiles: ['QUICK_SYNTHESIS'] },
    });
    const result = await generate(gatewayCall(), reservation, deps);

    expect(result.outcome).toBe('UNAVAILABLE');
    if (result.outcome !== 'UNAVAILABLE') throw new Error('unreachable');
    expect(result.reason).toBe('KILL_SWITCH');
    expect(result.detail).toBe('KILL_SWITCH_PROFILE');
    expect(result.errorCode).toBe('GENERATION_UNAVAILABLE');
    expect(result.httpStatus).toBe(503);
    expect(spy.calls).toHaveLength(0);
    expect(port.rows).toHaveLength(0);
  });

  it('when the provider switch is set', async () => {
    const spy = spyOnTransport(respondWith({ body: validBody }));
    const { deps, port } = harness({
      transport: spy.transport,
      killSwitch: { providers: [STUB_PROVIDER_ID] },
    });
    const result = await generate(gatewayCall(), reservation, deps);

    expect(result.outcome).toBe('UNAVAILABLE');
    if (result.outcome !== 'UNAVAILABLE') throw new Error('unreachable');
    expect(result.reason).toBe('KILL_SWITCH');
    expect(result.detail).toBe('KILL_SWITCH_PROVIDER');
    expect(spy.calls).toHaveLength(0);
    expect(port.rows).toHaveLength(0);
  });

  it('does not refuse when the switch names a different profile (not vacuously refusing)', async () => {
    const spy = spyOnTransport(respondWith({ body: validBody }));
    const { deps } = harness({ transport: spy.transport, killSwitch: { profiles: ['DEEP_SYNTHESIS'] } });
    const result = await generate(gatewayCall(), reservation, deps);

    expect(result.outcome, JSON.stringify(result)).toBe('OK');
    expect(spy.calls).toHaveLength(1);
  });
});
