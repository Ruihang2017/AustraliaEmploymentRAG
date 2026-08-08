/**
 * Regression guard for this ticket's **Feedback obligation** writebacks.
 *
 * `RUNT-01`'s Feedback obligation is not documentation etiquette — it is part of the ticket's spec:
 *
 *  - bullet 3: *"PRD §34.9 turns out to be incomplete (a needed error has no code) → … Raise it as an
 *    open question in `docs/prd/03-app-runtime/README.md` §6 with the Founder as owner and stop at
 *    the nearest existing code."*
 *  - rule 1: *"If implementation falsifies anything in this ticket, update **this ticket file**
 *    first … Silent divergence is an incomplete ticket."*
 *
 * Both frictions fired (413/415 have no PRD §34.9 code; the member script name `dev` is reserved to
 * `00-foundation`'s `tools/fixtures/script-owners.json`). A previous build made the CODE change and
 * recorded the reasoning only in the git-ignored plan and in an ADR — the committed sub-PRD README
 * and the ticket file, which the obligation names explicitly, were never touched. Nothing in the
 * suite caught that, because every other test asserts behaviour and none asserts the writeback.
 *
 * This file closes that gap. It is deliberately COUPLED to the runtime classification: the assertion
 * below reads the code `classifyError` actually returns for a 413/415 and requires the README row to
 * name it. Change the mapping and this test fails until the open question is re-written — which is
 * exactly the "silent divergence" the obligation forbids.
 */
import { readFileSync } from 'node:fs';
import { URL, fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import { ERROR_CATALOGUE } from '../src/errors/catalogue.js';
import { classifyError } from '../src/errors/handler.js';

const REPO_ROOT = fileURLToPath(new URL('../../../', import.meta.url));
const SUB_PRD = `${REPO_ROOT}docs/prd/03-app-runtime/README.md`;
const TICKET = `${REPO_ROOT}docs/prd/03-app-runtime/tickets/RUNT-01-fastify-skeleton-autoloaded-routes-uniform-errors-request-id.md`;
const MANIFEST = `${REPO_ROOT}apps/api/package.json`;

function read(path: string): string {
  return readFileSync(path, 'utf8');
}

/** The `## 6. Open questions` section of the sub-PRD, up to the next `## ` heading. */
function openQuestionsSection(): string {
  const source = read(SUB_PRD);
  const start = source.indexOf('## 6. Open questions');
  expect(start, 'the sub-PRD has no "## 6. Open questions" section').toBeGreaterThan(-1);
  const rest = source.slice(start + 1);
  const end = rest.indexOf('\n## ');
  return end === -1 ? rest : rest.slice(0, end);
}

/** The one §6 table row that raises the 413/415 gap, or `undefined` if the writeback is missing. */
function payloadGapRow(): string | undefined {
  return openQuestionsSection()
    .split(/\r?\n/)
    .filter((line) => line.trimStart().startsWith('|'))
    .find((line) => line.includes('413') && line.includes('415'));
}

/** A Fastify content-type-parser error, shaped as Fastify raises it. */
function fastifyCtpError(statusCode: number, code: string): Error & { statusCode: number; code: string } {
  return Object.assign(new Error('content-type parser rejected the request'), { statusCode, code });
}

describe('PRD §34.9 has no code for 413/415, and the implementation invents none', () => {
  it('stops at the nearest existing code for both statuses', () => {
    const tooLarge = classifyError(fastifyCtpError(413, 'FST_ERR_CTP_BODY_TOO_LARGE'));
    const wrongMedia = classifyError(fastifyCtpError(415, 'FST_ERR_CTP_INVALID_MEDIA_TYPE'));

    for (const result of [tooLarge, wrongMedia]) {
      expect(result.code).toBe('INVALID_REQUEST');
      expect(result.details).toEqual({});
      // The closed catalogue is what makes this a spec gap rather than a coding choice.
      expect(Object.keys(ERROR_CATALOGUE)).toContain(result.code);
    }
  });

  it('has no catalogue row carrying a 413 or 415 status — the gap is real, not imagined', () => {
    const statuses = Object.values(ERROR_CATALOGUE).map((row) => row.status);
    expect(statuses).not.toContain(413);
    expect(statuses).not.toContain(415);
  });
});

describe('Feedback obligation bullet 3 — the sub-PRD §6 writeback', () => {
  it('raises the 413/415 gap as an open question in docs/prd/03-app-runtime/README.md §6', () => {
    expect(
      payloadGapRow(),
      'sub-PRD §6 has no open question for the PRD §34.9 413/415 gap — the ticket mandates one',
    ).toBeDefined();
  });

  it('names the Founder as owner, as the obligation spells out', () => {
    expect(payloadGapRow() ?? '').toMatch(/Founder/);
  });

  it('names the code the implementation actually stops at, so doc and code cannot drift apart', () => {
    const actual = classifyError(fastifyCtpError(413, 'FST_ERR_CTP_BODY_TOO_LARGE')).code;
    expect(payloadGapRow() ?? '').toContain(actual);
  });

  it('names both Fastify error codes so a reader can reproduce the gap', () => {
    const row = payloadGapRow() ?? '';
    expect(row).toContain('FST_ERR_CTP_BODY_TOO_LARGE');
    expect(row).toContain('FST_ERR_CTP_INVALID_MEDIA_TYPE');
  });

  it('records the writeback in the sub-PRD changelog', () => {
    const source = read(SUB_PRD);
    const changelog = source.slice(source.indexOf('## 9. Changelog'));
    expect(changelog).toMatch(/RUNT-01/);
    expect(changelog).toMatch(/413/);
  });
});

describe('Feedback obligation rule 1 — the ticket file records the deviations', () => {
  it('records the 413/415 friction in the ticket file, not only in the git-ignored plan', () => {
    const ticket = read(TICKET);
    expect(ticket).toMatch(/413/);
    expect(ticket).toMatch(/415/);
    expect(ticket).toMatch(/QR11/);
  });

  it('restates deliverable 1 for the dev:api script name and says why dev is unavailable', () => {
    const ticket = read(TICKET);
    expect(ticket).toContain('dev:api');
    expect(ticket).toContain('script-owners.json');
  });

  it('carries a changelog entry for the writeback', () => {
    const ticket = read(TICKET);
    const changelog = ticket.slice(ticket.indexOf('## Changelog'));
    expect(changelog, 'the ticket has no ## Changelog section').not.toBe('');
    expect(changelog).toMatch(/v1\.1/);
  });
});

describe('the manifest matches what the ticket now says', () => {
  it('declares dev:api and does not squat the reserved dev script name', () => {
    const manifest = JSON.parse(read(MANIFEST)) as { scripts?: Record<string, string> };
    const scripts = manifest.scripts ?? {};
    expect(scripts['dev:api'], 'apps/api must provide the watch script as dev:api').toBeDefined();
    expect(scripts['dev'], 'the member script name `dev` is reserved to 00-foundation').toBeUndefined();
  });
});
