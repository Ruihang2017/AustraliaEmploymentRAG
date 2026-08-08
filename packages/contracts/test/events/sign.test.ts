/**
 * FND-05 deliverable 3 and acceptance items 1, 2, 4, 5, 12 — the PRD §34.8 signing contract.
 *
 * The signature assertions compare against the **committed** `expectedSignature` in
 * `fixtures/signing.json`, never against a `verify(sign(x))` round trip: a self-consistent pair would
 * pass even with the wrong signing input (ticket Test plan step 2).
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { signWebhook, verifyWebhook } from '../../src/events/sign.js';
import { PACKAGE_ROOT, fixtureText, loadSigning, rawBody } from './support/load.js';

const signing = loadSigning();
const fixtureSecret = signing.secret;
const rotatedSecret = signing.rotatedSecret;
const timestampSeconds = signing.timestampSeconds;
const body = rawBody('alert-created.signed.json');
const eventId = signing.placeholders['evt_...'] as string;

/** `Name: value` lines -> a header record, exactly as a receiver framework would present them. */
function parseHeaders(text: string): Record<string, string> {
  const header: Record<string, string> = {};
  for (const line of text.split('\n')) {
    const at = line.indexOf(': ');
    if (at > 0) header[line.slice(0, at)] = line.slice(at + 2);
  }
  return header;
}

const deliveredHeaders = parseHeaders(fixtureText('alert-created.signed.headers.txt'));

describe('PRD §34.8 replay (acceptance item 1)', () => {
  it('reproduces the committed signature from the committed body, secret and timestamp', () => {
    expect(signWebhook({ secret: fixtureSecret, timestampSeconds, rawBody: body })).toBe(
      signing.expectedSignature,
    );
  });

  it('carries that same signature in the committed header fixture', () => {
    expect(deliveredHeaders['X-AER-Signature']).toBe(signing.expectedSignature);
    expect(deliveredHeaders['X-AER-Timestamp']).toBe(String(timestampSeconds));
    expect(deliveredHeaders['X-AER-Event-Id']).toBe(eventId);
  });

  it('verifies OK, echoing the event id for the caller dedupe store', () => {
    const result = verifyWebhook({
      secret: fixtureSecret,
      header: deliveredHeaders,
      rawBody: body,
      nowSeconds: timestampSeconds + 1,
    });
    expect(result).toEqual({
      ok: true,
      reason: 'OK',
      eventId,
      timestampSeconds,
      secretIndex: 0,
    });
  });

  it('signs the same bytes whether they arrive as a string or as raw bytes', () => {
    const bytes = new TextEncoder().encode(body);
    expect(signWebhook({ secret: fixtureSecret, timestampSeconds, rawBody: bytes })).toBe(
      signing.expectedSignature,
    );
  });

  it('rejects a non-integer or negative timestamp rather than signing a wrong input', () => {
    expect(() =>
      signWebhook({ secret: fixtureSecret, timestampSeconds: timestampSeconds + 0.5, rawBody: body }),
    ).toThrow(TypeError);
    expect(() => signWebhook({ secret: fixtureSecret, timestampSeconds: -1, rawBody: body })).toThrow(
      TypeError,
    );
  });
});

describe('tamper and replay matrix (acceptance item 2)', () => {
  const verify = (overrides: Partial<{ header: Record<string, string>; rawBody: string; nowSeconds: number }>) =>
    verifyWebhook({
      secret: fixtureSecret,
      header: overrides.header ?? deliveredHeaders,
      rawBody: overrides.rawBody ?? body,
      nowSeconds: overrides.nowSeconds ?? timestampSeconds,
    });

  it('flipping one byte of the body is SIGNATURE_MISMATCH', () => {
    const tampered = `${body.slice(0, 40)}X${body.slice(41)}`;
    expect(tampered).not.toBe(body);
    expect(tampered.length).toBe(body.length);
    expect(verify({ rawBody: tampered }).reason).toBe('SIGNATURE_MISMATCH');
  });

  it('changing the timestamp without re-signing is SIGNATURE_MISMATCH, not a window error', () => {
    const header = { ...deliveredHeaders, 'X-AER-Timestamp': String(timestampSeconds + 1) };
    const result = verify({ header, nowSeconds: timestampSeconds + 1 });
    expect(result.reason).toBe('SIGNATURE_MISMATCH');
    expect(result.timestampSeconds).toBe(timestampSeconds + 1);
  });

  it('is TIMESTAMP_OUT_OF_WINDOW at 301 seconds and OK at exactly 300', () => {
    expect(verify({ nowSeconds: timestampSeconds + 301 }).reason).toBe('TIMESTAMP_OUT_OF_WINDOW');
    expect(verify({ nowSeconds: timestampSeconds + 300 }).reason).toBe('OK');
  });

  it('rejects a far-future timestamp too — the window is symmetric', () => {
    expect(verify({ nowSeconds: timestampSeconds - 301 }).reason).toBe('TIMESTAMP_OUT_OF_WINDOW');
    expect(verify({ nowSeconds: timestampSeconds - 300 }).reason).toBe('OK');
  });

  it('honours an explicit tolerance', () => {
    expect(
      verifyWebhook({
        secret: fixtureSecret,
        header: deliveredHeaders,
        rawBody: body,
        nowSeconds: timestampSeconds + 10,
        toleranceSeconds: 5,
      }).reason,
    ).toBe('TIMESTAMP_OUT_OF_WINDOW');
  });

  it('rejects an equal-length wrong signature (acceptance item 5)', () => {
    const wrong = `v1=${'a'.repeat(64)}`;
    expect(wrong.length).toBe(deliveredHeaders['X-AER-Signature']?.length);
    expect(verify({ header: { ...deliveredHeaders, 'X-AER-Signature': wrong } }).reason).toBe(
      'SIGNATURE_MISMATCH',
    );
  });
});

describe('raw bytes, not a re-serialised object (acceptance item 4)', () => {
  it('signs the transmitted whitespace: a compacted re-serialisation does not verify', () => {
    const reserialised = JSON.stringify(JSON.parse(body));
    expect(reserialised).not.toBe(body);
    expect(signWebhook({ secret: fixtureSecret, timestampSeconds, rawBody: reserialised })).not.toBe(
      signing.expectedSignature,
    );
    expect(verifyWebhook({
      secret: fixtureSecret,
      header: deliveredHeaders,
      rawBody: reserialised,
      nowSeconds: timestampSeconds,
    }).reason).toBe('SIGNATURE_MISMATCH');
  });

  it('treats a non-ASCII body as UTF-8 bytes, and an escaped re-encoding as different bytes', () => {
    const sent = '{"note":"caveat … ok","order":1}';
    const escaped = '{"note":"caveat \\u2026 ok","order":1}';
    expect(JSON.parse(escaped)).toEqual(JSON.parse(sent));

    const sentSignature = signWebhook({ secret: fixtureSecret, timestampSeconds, rawBody: sent });
    const byteSignature = signWebhook({
      secret: fixtureSecret,
      timestampSeconds,
      rawBody: new TextEncoder().encode(sent),
    });
    expect(byteSignature).toBe(sentSignature);
    expect(signWebhook({ secret: fixtureSecret, timestampSeconds, rawBody: escaped })).not.toBe(
      sentSignature,
    );

    const header = {
      'X-AER-Event-Id': eventId,
      'X-AER-Timestamp': String(timestampSeconds),
      'X-AER-Signature': sentSignature,
    };
    const base = { secret: fixtureSecret, header, nowSeconds: timestampSeconds } as const;
    expect(verifyWebhook({ ...base, rawBody: sent }).reason).toBe('OK');
    expect(verifyWebhook({ ...base, rawBody: escaped }).reason).toBe('SIGNATURE_MISMATCH');
  });
});

describe('secret rotation (deliverable 3, PRD §8.8)', () => {
  it('returns the index of the secret that matched', () => {
    const result = verifyWebhook({
      secret: [rotatedSecret, fixtureSecret],
      header: deliveredHeaders,
      rawBody: body,
      nowSeconds: timestampSeconds,
    });
    expect(result.ok).toBe(true);
    expect(result.ok && result.secretIndex).toBe(1);
  });

  it('rejects when no secret in the list matches', () => {
    expect(
      verifyWebhook({
        secret: [rotatedSecret],
        header: deliveredHeaders,
        rawBody: body,
        nowSeconds: timestampSeconds,
      }).reason,
    ).toBe('SIGNATURE_MISMATCH');
  });

  it('refuses an empty secret list rather than rejecting everything silently', () => {
    expect(() =>
      verifyWebhook({
        secret: [],
        header: deliveredHeaders,
        rawBody: body,
        nowSeconds: timestampSeconds,
      }),
    ).toThrow(TypeError);
  });
});

describe('header parsing', () => {
  const verifyWith = (header: Record<string, string | string[] | undefined>) =>
    verifyWebhook({ secret: fixtureSecret, header, rawBody: body, nowSeconds: timestampSeconds });

  it('resolves header names case-insensitively', () => {
    const lower: Record<string, string> = {};
    for (const [name, value] of Object.entries(deliveredHeaders)) lower[name.toLowerCase()] = value;
    expect(verifyWith(lower).reason).toBe('OK');
  });

  it.each([
    ['missing signature', { 'X-AER-Event-Id': eventId, 'X-AER-Timestamp': String(timestampSeconds) }],
    ['missing timestamp', { 'X-AER-Event-Id': eventId, 'X-AER-Signature': signing.expectedSignature }],
    [
      'missing event id',
      { 'X-AER-Timestamp': String(timestampSeconds), 'X-AER-Signature': signing.expectedSignature },
    ],
    [
      'upper-case hex (PRD §34.8 says lowercase)',
      { ...deliveredHeaders, 'X-AER-Signature': signing.expectedSignature.toUpperCase() },
    ],
    ['no v1= prefix', { ...deliveredHeaders, 'X-AER-Signature': signing.expectedSignature.slice(3) }],
    ['wrong version prefix', { ...deliveredHeaders, 'X-AER-Signature': `v2=${signing.expectedSignature.slice(3)}` }],
    ['short signature', { ...deliveredHeaders, 'X-AER-Signature': 'v1=abc' }],
    ['non-integer timestamp', { ...deliveredHeaders, 'X-AER-Timestamp': '1785726012.5' }],
    ['non-numeric timestamp', { ...deliveredHeaders, 'X-AER-Timestamp': 'yesterday' }],
    ['negative timestamp', { ...deliveredHeaders, 'X-AER-Timestamp': '-1' }],
  ])('is MALFORMED_HEADER: %s', (_name, header) => {
    expect(verifyWith(header as Record<string, string>).reason).toBe('MALFORMED_HEADER');
  });

  it('is MALFORMED_HEADER when a name is repeated, under any casing', () => {
    expect(
      verifyWith({ ...deliveredHeaders, 'x-aer-signature': signing.expectedSignature }).reason,
    ).toBe('MALFORMED_HEADER');
    expect(
      verifyWith({
        ...deliveredHeaders,
        'X-AER-Signature': [signing.expectedSignature, signing.expectedSignature],
      }).reason,
    ).toBe('MALFORMED_HEADER');
  });

  it('accepts a single-valued array, as Node presents repeated-capable headers', () => {
    expect(verifyWith({ ...deliveredHeaders, 'X-AER-Signature': [signing.expectedSignature] }).reason).toBe(
      'OK',
    );
  });
});

describe('no leakage in a result (PRD §22)', () => {
  const results = [
    verifyWebhook({ secret: fixtureSecret, header: deliveredHeaders, rawBody: body, nowSeconds: timestampSeconds }),
    verifyWebhook({ secret: fixtureSecret, header: {}, rawBody: body, nowSeconds: timestampSeconds }),
    verifyWebhook({
      secret: fixtureSecret,
      header: deliveredHeaders,
      rawBody: body,
      nowSeconds: timestampSeconds + 999,
    }),
    verifyWebhook({ secret: fixtureSecret, header: deliveredHeaders, rawBody: `${body} `, nowSeconds: timestampSeconds }),
  ];

  it('covers all four reasons', () => {
    expect(results.map((result) => result.reason).sort()).toEqual([
      'MALFORMED_HEADER',
      'OK',
      'SIGNATURE_MISMATCH',
      'TIMESTAMP_OUT_OF_WINDOW',
    ]);
  });

  it('echoes no secret, no signature and no body content', () => {
    // The event id IS echoed, on purpose: PRD §34.8 requires the caller to deduplicate on it, and it
    // is an opaque identifier rather than content. Everything else in the body is off limits.
    const content = body.split(eventId).join('');
    for (const result of results) {
      const serialised = JSON.stringify(result);
      expect(serialised).not.toContain(fixtureSecret);
      expect(serialised).not.toContain(rotatedSecret);
      expect(serialised).not.toContain(signing.expectedSignature.slice(3));
      for (let index = 0; index + 8 <= content.length; index += 1) {
        const window = content.slice(index, index + 8);
        // A window that is itself part of the (legitimately echoed) event id is not extra leakage.
        if (eventId.includes(window)) continue;
        expect(serialised).not.toContain(window);
      }
    }
  });

  it('carries only the declared result keys', () => {
    for (const result of results) {
      const keys = Object.keys(result).sort();
      expect(keys).toEqual(
        result.ok
          ? ['eventId', 'ok', 'reason', 'secretIndex', 'timestampSeconds']
          : ['eventId', 'ok', 'reason', 'timestampSeconds'],
      );
    }
  });
});

/**
 * Static checks over the helper's own sources (acceptance items 5 and 12).
 *
 * Comments are stripped first: the rule is about code, and a prose mention of `===` inside a doc
 * comment is not a timing leak. Each checker is fed a synthetic positive control.
 */
describe('static properties of the implementation', () => {
  const SOURCE_PATHS = [
    'src/events/sign.ts',
    'src/events/bytes.ts',
    'src/events/hmac.ts',
    'src/events/sha256.ts',
  ];
  const sourceOf = (relativePath: string): string =>
    readFileSync(join(PACKAGE_ROOT, relativePath), 'utf8').replace(/\r\n/g, '\n');
  const sources = new Map(SOURCE_PATHS.map((path) => [path, sourceOf(path)]));
  const signSource = sources.get('src/events/sign.ts') as string;
  const bytesSource = sources.get('src/events/bytes.ts') as string;

  function stripComments(text: string): string {
    return text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  }

  /** Lines that apply an equality operator to a signature-ish identifier. */
  function unsafeComparisons(text: string): string[] {
    return stripComments(text)
      .split('\n')
      .filter((line) => /signature|digest|expected|presented/i.test(line))
      .filter((line) => /[=!]==?/.test(line));
  }

  it('compares in constant time and never with an equality operator', () => {
    expect(stripComments(signSource)).toContain('equalsInConstantTime(');
    for (const [path, source] of sources) {
      expect(unsafeComparisons(source), `${path} compares a signature with an operator`).toEqual([]);
    }
  });

  it('guards the length first and never leaves the comparison loop early', () => {
    const guard = /export function equalsInConstantTime[\s\S]*?\n}/.exec(stripComments(bytesSource));
    expect(guard).not.toBeNull();
    const bodyText = guard?.[0] ?? '';
    expect(bodyText.indexOf('a.length !== b.length')).toBeGreaterThan(-1);
    expect(bodyText.indexOf('a.length !== b.length')).toBeLessThan(bodyText.indexOf('for ('));
    // No early exit inside the loop: that is exactly the timing leak the accumulator avoids.
    const loop = bodyText.slice(bodyText.indexOf('for ('), bodyText.lastIndexOf('return'));
    expect(loop).not.toContain('return');
    // The final comparison is on the accumulator, not on a signature or a digest.
    expect(bodyText).toContain('return diff === 0;');
  });

  it('finds an unsafe comparison when one is present (positive control)', () => {
    expect(unsafeComparisons('const x = expectedDigest === presentedDigest;')).toHaveLength(1);
    expect(unsafeComparisons('if (a.signature != b) return false;')).toHaveLength(1);
    expect(unsafeComparisons('// expectedDigest === presented is prose, not code')).toHaveLength(0);
  });

  it('imports nothing at all and sources no secret (acceptance item 12)', () => {
    for (const [path, source] of sources) {
      const code = stripComments(source);
      const specifiers = [...code.matchAll(/\bfrom\s*['"]([^'"]+)['"]/g)].map((match) => match[1]);
      for (const specifier of specifiers) {
        expect(specifier, `${path} imports ${specifier ?? ''}`).toMatch(/^\.\/[a-z0-9-]+\.js$/);
      }
      for (const forbidden of [
        'process.env',
        'node:',
        'fetch(',
        'require(',
        'import(',
        'globalThis.crypto',
      ]) {
        expect(code, `${path} references ${forbidden}`).not.toContain(forbidden);
      }
    }
  });

  it('detects an impure specifier when one is present (positive control)', () => {
    const code = "import { createHmac } from 'node:crypto';\nimport x from 'ajv';";
    const specifiers = [...code.matchAll(/\bfrom\s*['"]([^'"]+)['"]/g)].map((match) => match[1]);
    expect(specifiers).toEqual(['node:crypto', 'ajv']);
    expect(specifiers.filter((s) => /^\.\/[a-z0-9-]+\.js$/.test(s ?? ''))).toEqual([]);
  });

  it('exports exactly the two helpers — no idempotency store grew here', async () => {
    const module = await import('../../src/events/sign.js');
    expect(Object.keys(module).sort()).toEqual(['signWebhook', 'verifyWebhook']);
  });
});
