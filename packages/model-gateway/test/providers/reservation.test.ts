/**
 * EVID-07 acceptance item "No call without a reservation" — the runtime half (sub-PRD D17, PRD §42.6).
 *
 * The compile half is `types.test-d.ts`. The source-scan at the bottom is the property that matters
 * most: this package must contain NO function that returns a `HeldReservation`. The token type is
 * declared here and minted by `EVID-08` alone; if a mint ever appears in `src/**`, the whole
 * precondition becomes decorative.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import './support/network-stub.js';
import { PACKAGE_ROOT, SRC_ROOT } from './support/fixture.js';
import { codeOnly, named, sourceFiles } from './support/source-scan.js';
import { forgeReservation } from './support/reservation-double.js';
import { gatewayCall, harness, respondWith, spyOnTransport } from './support/harness.js';
import { generate } from '../../src/providers/generate.js';
import { readJson } from './support/fixture.js';

const validBody = JSON.stringify(
  readJson<unknown>(PACKAGE_ROOT, 'test', 'schema', 'fixtures', 'valid-response.json'),
);

describe('a call without a usable reservation is refused before the provider is touched', () => {
  it('refuses a missing token (a JavaScript caller, or a cast)', async () => {
    const spy = spyOnTransport(respondWith({ body: validBody }));
    const { deps } = harness({ transport: spy.transport });
    const result = await generate(gatewayCall(), undefined as never, deps);

    expect(result.outcome).toBe('UNAVAILABLE');
    if (result.outcome !== 'UNAVAILABLE') throw new Error('unreachable');
    expect(result.reason).toBe('NO_RESERVATION');
    expect(result.detail).toBe('RESERVATION_MISSING');
    expect(spy.calls).toHaveLength(0);
  });

  it('refuses an expired token, measured against the INJECTED clock', async () => {
    const spy = spyOnTransport(respondWith({ body: validBody }));
    const { deps, clock } = harness({ transport: spy.transport });
    const expired = forgeReservation({ expiresAt: clock.now() - 1 });
    const result = await generate(gatewayCall(), expired, deps);

    expect(result.outcome).toBe('UNAVAILABLE');
    if (result.outcome !== 'UNAVAILABLE') throw new Error('unreachable');
    expect(result.reason).toBe('NO_RESERVATION');
    expect(result.detail).toBe('RESERVATION_EXPIRED');
    expect(spy.calls).toHaveLength(0);
  });

  it('refuses a token that expires exactly now (the boundary is not inclusive)', async () => {
    const spy = spyOnTransport(respondWith({ body: validBody }));
    const { deps, clock } = harness({ transport: spy.transport });
    const result = await generate(gatewayCall(), forgeReservation({ expiresAt: clock.now() }), deps);

    expect(result.outcome).toBe('UNAVAILABLE');
    if (result.outcome !== 'UNAVAILABLE') throw new Error('unreachable');
    expect(result.detail).toBe('RESERVATION_EXPIRED');
  });

  it('refuses a token held for a different profile', async () => {
    const spy = spyOnTransport(respondWith({ body: validBody }));
    const { deps } = harness({ transport: spy.transport });
    const wrong = forgeReservation({ profileId: 'DEEP_SYNTHESIS' });
    const result = await generate(gatewayCall({ profileId: 'QUICK_SYNTHESIS' }), wrong, deps);

    expect(result.outcome).toBe('UNAVAILABLE');
    if (result.outcome !== 'UNAVAILABLE') throw new Error('unreachable');
    expect(result.detail).toBe('RESERVATION_WRONG_PROFILE');
    expect(spy.calls).toHaveLength(0);
  });

  it('proceeds with a valid token (the refusals above are not simply always-refusing)', async () => {
    const spy = spyOnTransport(respondWith({ body: validBody }));
    const { deps, clock } = harness({ transport: spy.transport });
    const result = await generate(gatewayCall(), forgeReservation({ expiresAt: clock.now() + 60_000 }), deps);

    expect(result.outcome, JSON.stringify(result)).toBe('OK');
    expect(spy.calls).toHaveLength(1);
  });
});

describe('this package mints no reservation (sub-PRD D17)', () => {
  const files = sourceFiles(SRC_ROOT);

  it('walks the whole src tree (non-vacuity)', () => {
    expect(files.length).toBeGreaterThanOrEqual(20);
  });

  it('declares HeldReservation in exactly one file', () => {
    const declaring = files.filter((file) =>
      /export\s+type\s+HeldReservation/.test(readFileSync(file, 'utf8')),
    );
    expect(declaring.map((file) => named(PACKAGE_ROOT, file))).toEqual(['src/providers/reservation.ts']);
  });

  it('has no function, method or arrow anywhere in src/** that returns a HeldReservation', () => {
    const offenders: string[] = [];
    for (const file of files) {
      const source = codeOnly(readFileSync(file, 'utf8'));
      for (const [index, line] of source.split('\n').entries()) {
        // A return-type annotation, or a Promise of one.
        if (/\)\s*:\s*(Promise<)?HeldReservation[>\s;,)]/.test(line)) {
          offenders.push(`${named(PACKAGE_ROOT, file)}:${String(index + 1)}`);
        }
      }
    }
    expect(offenders, `a mint appeared:\n${offenders.join('\n')}`).toEqual([]);
  });

  it('the mint scan fires on a synthetic mint (positive control)', () => {
    const control = 'export function mint(): HeldReservation { return x; }';
    expect(/\)\s*:\s*(Promise<)?HeldReservation[>\s;,)]/.test(control)).toBe(true);
    const asyncControl = 'async function mint(): Promise<HeldReservation> {';
    expect(/\)\s*:\s*(Promise<)?HeldReservation[>\s;,)]/.test(asyncControl)).toBe(true);
    expect(
      /\)\s*:\s*(Promise<)?HeldReservation[>\s;,)]/.test('function f(r: HeldReservation): void {'),
    ).toBe(false);
  });

  it('exports the brand as a declaration only, so it carries no runtime value', () => {
    const source = readFileSync(join(SRC_ROOT, 'providers', 'reservation.ts'), 'utf8');
    expect(source).toContain('export declare const heldReservationBrand: unique symbol;');
    expect(source).not.toMatch(/export\s+const\s+heldReservationBrand\s*=/);
  });
});
