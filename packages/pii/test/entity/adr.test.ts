/**
 * EVID-02 acceptance item 13 — the ADR exists and is COMPLETE.
 *
 * "Complete" is the acceptance item's own list: options (≥3, including the rejected hosted service),
 * decision, consequences, artifact hash/size/licence and the absent-artifact fallback — plus the
 * status/owner/date the ADR convention requires and the measured memory/latency PRD §39.2 asks for.
 * Each is asserted as a HEADING THAT EXISTS AND IS NON-EMPTY, so an ADR cannot be completed by
 * adding empty section titles.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import { ADR_PATH } from './fixture.js';

const text = readFileSync(ADR_PATH, 'utf8');

function sectionBody(heading: string): string {
  const index = text.indexOf(heading);
  if (index < 0) return '';
  const rest = text.slice(index + heading.length);
  const next = rest.search(/\n## /);
  return (next < 0 ? rest : rest.slice(0, next)).trim();
}

describe('docs/adr/0001-local-pii-entity-runtime.md', () => {
  it('records status, owner and date', () => {
    expect(text).toMatch(/\*\*Status:\*\*\s+\S+/);
    expect(text).toMatch(/\*\*Owner:\*\*\s+\S+/);
    expect(text).toMatch(/\*\*Date:\*\*\s+\d{4}-\d{2}-\d{2}/);
  });

  it('names the open question it resolves', () => {
    expect(text).toContain('Q-EVID-1');
  });

  it.each([
    ['## Context', 400],
    ['## Options considered', 800],
    ['## Decision', 300],
    ['## Artifact', 300],
    ['## Measured memory and latency', 300],
    ['## Consequences', 400],
    ['## Fallback when the artifact is absent', 200],
  ])('has a non-empty %s section', (heading, minimumLength) => {
    const body = sectionBody(heading);
    expect(body.length, `${heading} is missing or too short`).toBeGreaterThanOrEqual(minimumLength);
  });

  it('considers at least three options', () => {
    const options = [...text.matchAll(/^### Option [A-Z] —/gm)];
    expect(options.length).toBeGreaterThanOrEqual(3);
  });

  it('names the hosted service as REJECTED, and says why (PRD §10.1)', () => {
    const options = sectionBody('## Options considered');
    expect(options).toMatch(/hosted[^\n]*rejected/i);
    expect(options).toContain('§10.1');
  });

  it('states the artifact’s size, digest and licence — including "not applicable"', () => {
    const artifact = sectionBody('## Artifact');
    expect(artifact).toMatch(/\*\*Size:\*\*/);
    expect(artifact).toMatch(/\*\*Digest:\*\*/);
    expect(artifact).toMatch(/\*\*Licence:\*\*/);
    expect(artifact).toMatch(/verification order/i);
  });

  it('records the PRD §39.2 budget the memory was measured against', () => {
    expect(sectionBody('## Measured memory and latency')).toContain('320 MiB');
  });

  it('names the runtime-ON measurement as skipped, with a reason', () => {
    expect(sectionBody('## Measured memory and latency')).toMatch(/SKIPPED[^\n]*named reason/i);
  });

  it('records the consequence for RLSE-01 and the readiness consumer EVID-03', () => {
    const consequences = sectionBody('## Consequences');
    expect(consequences).toContain('RLSE-01');
    expect(consequences).toContain('EVID-03');
    expect(consequences).toContain('Q-EVID-2');
  });

  it('describes the absent-artifact fallback as UNAVAILABLE plus the deterministic recogniser', () => {
    const fallback = sectionBody('## Fallback when the artifact is absent');
    expect(fallback).toContain('UNAVAILABLE');
    expect(fallback).toMatch(/deterministic recogniser/);
    expect(fallback).toMatch(/appends[\s*]{0,6}nothing/);
  });
});
