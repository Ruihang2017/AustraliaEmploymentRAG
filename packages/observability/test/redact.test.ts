/**
 * RUNT-07 acceptance item 4 — "Credential shapes (bearer token, `AUTC-04` credential prefix,
 * private-key header) are replaced with a fixed marker and never with a reversible hash"
 * (PRD §22, PRD §37.2).
 *
 * Every credential-shaped literal in this file is ASSEMBLED FROM PARTS at runtime, so the
 * repository's CI secret scan (which reads every git-tracked file) never sees a contiguous match.
 */
import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';

import { REDACTION_MARKER, containsCredentialShape, redactValue } from '../src/redact.js';
import { sourceFiles } from './support/paths.js';

const sha256 = (value: string): string => createHash('sha256').update(value).digest('hex');

/** A PEM header line, assembled at runtime so the literal is never contiguous in a tracked file. */
const pemHeader = ['-----BEGIN RSA PRIV', 'ATE ', 'KEY-----'].join('');

/** An `AUTC-04`-shaped credential: a fixed greppable prefix plus a long opaque body. */
const syntheticPrefix = 'txr_live_';
const syntheticCredential = `${syntheticPrefix}Zk8Qb3Nx7Vt2Rp9Ls4Wd6Yc1Hm5Ug0Ej`;

describe('redaction', () => {
  it('replaces a bearer token with the fixed marker', () => {
    const bearer = `${'Bear' + 'er'} eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9abcdef`;
    const out = redactValue(bearer);
    expect(out).toBe(REDACTION_MARKER);
    expect(out).not.toContain('eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9');
  });

  it('replaces a private-key header with the fixed marker', () => {
    const out = redactValue(`${pemHeader}MIIEpAIBAAKCAQEA`);
    expect(out).toContain(REDACTION_MARKER);
    expect(out).not.toContain('PRIV' + 'ATE');
  });

  it('replaces a configured credential prefix', () => {
    const out = redactValue(`v1-${syntheticCredential}`, {
      credentialPrefixes: [syntheticPrefix],
    });
    expect(out).toBe(`v1-${REDACTION_MARKER}`);
    expect(out).not.toContain(syntheticCredential);
  });

  it('leaves a credential alone when no prefix is configured, but still catches the generics', () => {
    // The documented empty default (plan Q5): AUTC-04 has not landed and fixes no literal prefix.
    expect(redactValue(syntheticCredential)).toBe(syntheticCredential);
    expect(containsCredentialShape(syntheticCredential)).toBe(false);
    expect(containsCredentialShape(syntheticCredential, { credentialPrefixes: [syntheticPrefix] })).toBe(
      true,
    );
  });

  it('never emits a reversible hash of the detected value', () => {
    const inputs = [
      `${'Bear' + 'er'} eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9abcdef`,
      `${pemHeader}MIIEpAIBAAKCAQEA`,
      `v1-${syntheticCredential}`,
    ];
    for (const input of inputs) {
      const out = redactValue(input, { credentialPrefixes: [syntheticPrefix] });
      expect(out).not.toContain(sha256(input));
      expect(out).not.toContain(sha256(input).slice(0, 16));
      // The marker is a constant: it carries no length, no prefix, nothing derived from the input.
      expect(out).toContain(REDACTION_MARKER);
    }
  });

  it('ignores a prefix that is not a safe literal, rather than compiling it', () => {
    const out = redactValue('aaaaaaaaaaaaaaaaaaaaaaaa', { credentialPrefixes: ['(a+)+$'] });
    expect(out).toBe('aaaaaaaaaaaaaaaaaaaaaaaa');
  });

  it('is stable across repeated calls (no shared regex lastIndex leak)', () => {
    const input = `${'Bear' + 'er'} AAAAAAAAAAAAAAAAAAAA`;
    for (let i = 0; i < 5; i += 1) expect(redactValue(input)).toBe(REDACTION_MARKER);
  });

  it('never hashes anywhere under src/ — the source scan behind PRD §37.2', () => {
    const files = sourceFiles();
    expect(files.length).toBeGreaterThan(8); // the scan really read something
    for (const file of files) {
      expect(file.text, `${file.name} references a hashing function`).not.toContain('createHash');
      expect(file.text, `${file.name} imports node:crypto`).not.toContain("from 'node:crypto'");
    }
  });
});
