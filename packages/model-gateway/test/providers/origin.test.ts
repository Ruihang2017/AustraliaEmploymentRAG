/**
 * EVID-07 acceptance item "Allowlisted origins only" (PRD §16.4, §37.5, §21.1).
 *
 * The synthetic descriptor uses `provider.invalid` (RFC 2606) rather than any real vendor: which
 * providers this product will use is sub-PRD **Q-EVID-4**, a Founder decision, and a test fixture is
 * not the place to pre-empt it.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import './support/network-stub.js';
import { PACKAGE_ROOT, SRC_ROOT } from './support/fixture.js';
import { codeOnly, named, sourceFiles } from './support/source-scan.js';
import { OriginNotAllowedError, assertAllowedOrigin, isWellFormedHttpsOrigin } from '../../src/providers/origin.js';
import { PROVIDER_REGISTRY_V1, PROVIDER_DESCRIPTORS } from '../../src/providers/registry.js';
import { createProviderAdapter } from '../../src/providers/adapter.js';
import type { ProviderDescriptor } from '../../src/providers/registry.js';

const SYNTHETIC: ProviderDescriptor = Object.freeze({
  providerId: 'SYNTHETIC_HTTPS',
  allowedOrigins: Object.freeze(['https://provider.invalid', 'https://eu.provider.invalid:8443']),
  transportKind: 'HTTPS',
  retention: { noTraining: true, mode: 'ZERO' },
});

describe('isWellFormedHttpsOrigin', () => {
  it.each([
    'https://provider.invalid',
    'https://eu.provider.invalid:8443',
    'https://a-b.c.invalid',
  ])('accepts %s', (origin) => {
    expect(isWellFormedHttpsOrigin(origin)).toBe(true);
  });

  it.each([
    ['http://provider.invalid', 'plain http'],
    ['ftp://provider.invalid', 'another scheme'],
    ['https://provider.invalid/', 'a trailing slash'],
    ['https://provider.invalid/v1/generate', 'a path'],
    ['https://provider.invalid?a=1', 'a query'],
    ['https://user:pw@provider.invalid', 'embedded credentials'],
    ['https://provider.invalid#frag', 'a fragment'],
    ['//provider.invalid', 'a scheme-relative reference'],
    ['provider.invalid', 'a bare host'],
    ['', 'the empty string'],
  ])('rejects %s (%s)', (origin) => {
    expect(isWellFormedHttpsOrigin(origin)).toBe(false);
  });
});

describe('assertAllowedOrigin', () => {
  it('accepts an origin that appears verbatim in the allowlist', () => {
    expect(assertAllowedOrigin(SYNTHETIC, 'https://provider.invalid')).toBe('https://provider.invalid');
    expect(assertAllowedOrigin(SYNTHETIC, 'https://eu.provider.invalid:8443')).toBe(
      'https://eu.provider.invalid:8443',
    );
  });

  it.each([
    'https://other.invalid',
    'https://provider.invalid.attacker.invalid',
    'https://attacker.invalid/https://provider.invalid',
    'https://PROVIDER.invalid',
    'https://provider.invalid:443',
  ])('throws for %s — the match is exact, not a prefix, suffix or normalisation', (origin) => {
    expect(() => assertAllowedOrigin(SYNTHETIC, origin)).toThrow(OriginNotAllowedError);
  });

  it('throws for http, however allowlisted the host looks', () => {
    expect(() => assertAllowedOrigin(SYNTHETIC, 'http://provider.invalid')).toThrow(OriginNotAllowedError);
  });

  it('throws for a descriptor that declares no allowlist at all', () => {
    expect(() =>
      assertAllowedOrigin({ ...SYNTHETIC, allowedOrigins: [] }, 'https://provider.invalid'),
    ).toThrow(OriginNotAllowedError);
  });
});

describe('the origin is validated at CONSTRUCTION', () => {
  it('builds an adapter for an allowlisted origin', () => {
    const adapter = createProviderAdapter(SYNTHETIC, 'https://provider.invalid');
    expect(adapter.origin).toBe('https://provider.invalid');
  });

  it('throws before an adapter exists for an origin outside the allowlist', () => {
    expect(() => createProviderAdapter(SYNTHETIC, 'https://elsewhere.invalid')).toThrow(
      OriginNotAllowedError,
    );
  });

  it('throws when an HTTPS provider is given no origin', () => {
    expect(() => createProviderAdapter(SYNTHETIC)).toThrow(OriginNotAllowedError);
  });

  it('throws when an IN_PROCESS provider is given an origin at all', () => {
    const stub = PROVIDER_DESCRIPTORS[0];
    if (stub === undefined) throw new Error('the shipped registry is empty');
    expect(() => createProviderAdapter(stub, 'https://provider.invalid')).toThrow(OriginNotAllowedError);
  });

  it('builds the in-process adapter with a null origin', () => {
    const stub = PROVIDER_DESCRIPTORS[0];
    if (stub === undefined) throw new Error('the shipped registry is empty');
    expect(createProviderAdapter(stub).origin).toBeNull();
  });
});

describe('the SHIPPED registry declares no external origin (Q-EVID-4 is still open)', () => {
  it('carries exactly one provider, in process, with an empty allowlist', () => {
    expect(Object.keys(PROVIDER_REGISTRY_V1)).toEqual(['STUB_DETERMINISTIC']);
    for (const descriptor of PROVIDER_DESCRIPTORS) {
      expect(descriptor.allowedOrigins).toEqual([]);
      expect(descriptor.transportKind).toBe('IN_PROCESS');
      expect(descriptor.retention).toEqual({ noTraining: true, mode: 'ZERO' });
    }
  });

  it('is deep-frozen', () => {
    expect(Object.isFrozen(PROVIDER_REGISTRY_V1)).toBe(true);
    expect(() => {
      (PROVIDER_REGISTRY_V1.STUB_DETERMINISTIC?.allowedOrigins as string[]).push('https://x.invalid');
    }).toThrow(TypeError);
  });
});

describe('no configuration key can feed an origin (PRD §16.4)', () => {
  const files = sourceFiles(SRC_ROOT);

  it('reads no environment variable anywhere in src/**', () => {
    const offenders: string[] = [];
    for (const file of files) {
      const source = codeOnly(readFileSync(file, 'utf8'));
      for (const token of ['process.env', 'import.meta.env', 'getenv']) {
        if (source.includes(token)) offenders.push(`${named(PACKAGE_ROOT, file)} contains ${token}`);
      }
    }
    expect(offenders, offenders.join('\n')).toEqual([]);
  });

  it('constructs no URL object anywhere in src/**', () => {
    const offenders: string[] = [];
    for (const file of files) {
      const source = codeOnly(readFileSync(file, 'utf8'));
      // `resolve(` is deliberately NOT in this list: `Promise.resolve(` is everywhere and banning it
      // would be a scan nobody could keep green, which is how a guard gets deleted rather than fixed.
      // URL RESOLUTION cannot happen here anyway — `node:url` and `node:path` are unimportable from
      // `src/**` (the relative-specifiers-only assertion in architecture.test.ts).
      for (const token of ['new URL(', 'URLSearchParams', 'URL.parse', 'URL.canParse']) {
        if (source.includes(token)) offenders.push(`${named(PACKAGE_ROOT, file)} contains ${token}`);
      }
    }
    expect(offenders, offenders.join('\n')).toEqual([]);
  });

  it('the environment scan fires on a synthetic read (positive control)', () => {
    expect(codeOnly('const origin = process.env.PROVIDER_BASE_URL;')).toContain('process.env');
  });

  it('names no allowlist entry outside registry.ts', () => {
    const offenders: string[] = [];
    for (const file of files) {
      const name = named(PACKAGE_ROOT, file);
      const source = codeOnly(readFileSync(file, 'utf8'));
      if (/https?:\/\//.test(source)) offenders.push(name);
    }
    expect(offenders, `an origin literal appears in code:\n${offenders.join('\n')}`).toEqual([]);
  });
});
