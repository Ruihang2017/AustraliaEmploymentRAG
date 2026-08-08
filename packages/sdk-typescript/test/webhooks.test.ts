/**
 * Webhook verification (ticket deliverable 9; PRD §34.8; `MON-004`, `UAT-MON-02` replay half).
 *
 * Two things are proved here, and the second is the one that matters most for this ticket:
 *
 * 1. the four `FND-05` cases behave, against the COMMITTED expected hex — never a sign/verify round
 *    trip, which would pass even with the wrong signing input;
 * 2. **this package contains no cryptography of its own.** The source scan runs over `src/**` with
 *    comments and string literals blanked out, so a doc comment that has to NAME a forbidden API (as
 *    `src/webhooks.ts`'s does) cannot make the scan either fail spuriously or, worse, be quietly
 *    reworded until it passes.
 */
import { describe, expect, it } from 'vitest';

import { verifyWebhookSignature } from '../src/sdk.js';
import { sourceCodeOnly } from './support/repo.js';
import { loadHeaders, loadRawBody, loadSigning } from './support/webhook.js';

const signing = loadSigning();
const headers = loadHeaders();
const body = loadRawBody();

describe('verifyWebhookSignature (PRD §34.8)', () => {
  it('replays FND-05’s committed delivery against its committed signature', () => {
    expect(headers['X-AER-Signature']).toBe(signing.expectedSignature);
    const result = verifyWebhookSignature({
      secrets: [signing.secret],
      header: headers,
      rawBody: body,
      nowSeconds: signing.timestampSeconds,
    });
    expect(result.ok).toBe(true);
    expect(result.reason).toBe('OK');
    expect(result.eventId).toBe('evt_0198f3c1-4a20-7c3d-8f11-2b6d5e0a91c4');
    expect(result.timestampSeconds).toBe(signing.timestampSeconds);
    expect(result.ok ? result.secretIndex : -1).toBe(0);
  });

  it('reports SIGNATURE_MISMATCH for a single flipped byte in the body', () => {
    const tampered = body.replace('"sandbox": false', '"sandbox": true');
    expect(tampered).not.toBe(body);
    const result = verifyWebhookSignature({
      secrets: [signing.secret],
      header: headers,
      rawBody: tampered,
      nowSeconds: signing.timestampSeconds,
    });
    expect(result.ok).toBe(false);
    expect(result.reason).toBe('SIGNATURE_MISMATCH');
  });

  it('reports TIMESTAMP_OUT_OF_WINDOW at 301 seconds', () => {
    const stale = verifyWebhookSignature({
      secrets: [signing.secret],
      header: headers,
      rawBody: body,
      nowSeconds: signing.timestampSeconds + 301,
    });
    expect(stale.reason).toBe('TIMESTAMP_OUT_OF_WINDOW');
    // The boundary is inclusive: exactly 300 seconds of skew still verifies.
    expect(
      verifyWebhookSignature({
        secrets: [signing.secret],
        header: headers,
        rawBody: body,
        nowSeconds: signing.timestampSeconds + 300,
      }).ok,
    ).toBe(true);
  });

  it('reports which secret in a rotation list matched', () => {
    const result = verifyWebhookSignature({
      secrets: [signing.rotatedSecret, signing.secret],
      header: headers,
      rawBody: body,
      nowSeconds: signing.timestampSeconds,
    });
    expect(result.ok).toBe(true);
    expect(result.ok ? result.secretIndex : -1).toBe(1);
  });

  it('reports MALFORMED_HEADER when a PRD §34.8 header is missing', () => {
    const withoutSignature: Record<string, string> = { ...headers };
    delete withoutSignature['X-AER-Signature'];
    const result = verifyWebhookSignature({
      secrets: [signing.secret],
      header: withoutSignature,
      rawBody: body,
      nowSeconds: signing.timestampSeconds,
    });
    expect(result.reason).toBe('MALFORMED_HEADER');
  });

  it('honours a caller-supplied tolerance', () => {
    expect(
      verifyWebhookSignature({
        secrets: [signing.secret],
        header: headers,
        rawBody: body,
        nowSeconds: signing.timestampSeconds + 10,
        toleranceSeconds: 5,
      }).reason,
    ).toBe('TIMESTAMP_OUT_OF_WINDOW');
  });

  it('accepts the raw bytes as a Uint8Array, unchanged', () => {
    const bytes = new TextEncoder().encode(body);
    expect(
      verifyWebhookSignature({
        secrets: [signing.secret],
        header: headers,
        rawBody: bytes,
        nowSeconds: signing.timestampSeconds,
      }).ok,
    ).toBe(true);
  });
});

describe('this package computes no HMAC of its own (PRD §20.1)', () => {
  const FORBIDDEN = ['createHmac', 'createHash', 'subtle', 'digest', 'pbkdf2', 'node:crypto'];

  it('names no cryptographic primitive in executable code under src/', () => {
    const offences: string[] = [];
    for (const { path, text } of sourceCodeOnly()) {
      for (const name of FORBIDDEN) {
        if (text.includes(name)) offences.push(`${path}: ${name}`);
      }
    }
    expect(offences).toEqual([]);
  });

  it('compares no signature itself', () => {
    for (const { path, text } of sourceCodeOnly()) {
      expect(/signature\s*[!=]==/i.test(text), `${path} compares a signature`).toBe(false);
    }
  });

  // Positive control: the scan must be able to see a real call, and must NOT see a mention in prose.
  it('sees a call but not a comment', async () => {
    const { stripCommentsAndStrings } = await import('./support/repo.js');
    expect(stripCommentsAndStrings("const h = createHmac('sha256', k);")).toContain('createHmac');
    expect(stripCommentsAndStrings('// never call createHmac here\nconst x = 1;')).not.toContain('createHmac');
    expect(stripCommentsAndStrings('/* createHmac */ const x = 1;')).not.toContain('createHmac');
    expect(stripCommentsAndStrings('const s = "createHmac";')).not.toContain('createHmac');
  });

  it('delegates to FND-05’s verifier, so the delegation is not merely claimed', async () => {
    const contracts = await import('../../contracts/src/events/index.js');
    const boundary = await import('../src/internal/contracts.js');
    expect(boundary.verifyWebhook).toBe(contracts.verifyWebhook);
  });
});
