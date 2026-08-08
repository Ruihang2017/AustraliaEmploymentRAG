/**
 * FND-05 deliverable 4 / acceptance item 11 — generated bindings are never hand-edited (PRD §20.1).
 *
 * This suite is what makes that guarantee real on every PR. The aggregate `generated:check` root
 * script name cannot be registered by a workspace member yet (sub-PRD **D31**:
 * `tools/tests/scripts.test.mjs` asserts no member provides it, and the repair lives in `tools/**`,
 * outside this ticket's file-scope), so the same emitter-vs-disk comparison runs here, under
 * `pnpm test` and therefore under the CI `ts-type-unit` job.
 *
 * All comparisons normalise CRLF; a separate case asserts the COMMITTED blob is LF (see the CRLF note
 * in `codegen/check.mjs`).
 */
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { GENERATED_DIR, committedGeneratedFiles, emit } from '../../src/events/codegen/emit.mjs';
import { PACKAGE_ROOT, committedBlob } from './support/load.js';

const BANNER = '// GENERATED FROM schemas/events/** — DO NOT EDIT (PRD §20.1)';

const emitted = emit();

/** The comparator, shared by `check.mjs` and this suite, over an in-memory disk image. */
function differences(expected: Map<string, string>, onDisk: Map<string, string>): string[] {
  const problems: string[] = [];
  for (const [path, source] of expected) {
    const actual = onDisk.get(path);
    if (actual === undefined) problems.push(`missing: ${path}`);
    else if (actual !== source) problems.push(`differs: ${path}`);
  }
  for (const path of onDisk.keys()) if (!expected.has(path)) problems.push(`stale: ${path}`);
  return problems;
}

function diskImage(): Map<string, string> {
  return new Map(
    committedGeneratedFiles(PACKAGE_ROOT).map((path) => [
      path,
      readFileSync(join(PACKAGE_ROOT, path), 'utf8').replace(/\r\n/g, '\n'),
    ]),
  );
}

describe('the emitter', () => {
  it('produces a file per schema plus a registry and an index', () => {
    expect(emitted.size).toBe(13);
    expect([...emitted.keys()]).toContain(`${GENERATED_DIR}/webhook/v1/alert-created.ts`);
    expect([...emitted.keys()]).toContain(`${GENERATED_DIR}/sse/v1/job-completed.ts`);
    expect([...emitted.keys()]).toContain(`${GENERATED_DIR}/registry.ts`);
    expect([...emitted.keys()]).toContain(`${GENERATED_DIR}/index.ts`);
  });

  it('is deterministic — two runs render identical text', () => {
    const second = emit();
    expect([...second.keys()]).toEqual([...emitted.keys()]);
    for (const [path, source] of second) expect(source).toBe(emitted.get(path));
  });

  it('embeds no timestamp, absolute path or working directory', () => {
    for (const [path, source] of emitted) {
      expect(source, path).not.toMatch(/[A-Za-z]:\\/);
      expect(source, path).not.toContain(PACKAGE_ROOT);
      expect(source, path).not.toMatch(/\b20\d{2}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z\b/);
    }
  });

  it('starts every file with the do-not-edit banner and its source line', () => {
    for (const [path, source] of emitted) {
      const lines = source.split('\n');
      expect(lines[0], path).toBe(BANNER);
      expect(lines[1], path).toMatch(/^\/\/ source: schemas\/events\/.+\.json$/);
      expect(source.endsWith('\n'), path).toBe(true);
      expect(source.includes('\r'), path).toBe(false);
    }
  });

  it('emits nothing that would fail the repository lint/typecheck settings', () => {
    for (const [path, source] of emitted) {
      expect(source, path).not.toMatch(/:\s*any\b/);
      for (const specifier of [...source.matchAll(/from\s*'([^']+)'/g)].map((match) => match[1])) {
        expect(specifier, path).toMatch(/^\.\/.+\.js$/);
      }
    }
  });
});

describe('the committed tree matches the emitter (acceptance item 11)', () => {
  it('has every generated file on disk', () => {
    for (const path of emitted.keys()) {
      expect(existsSync(join(PACKAGE_ROOT, path)), `${path} is not on disk`).toBe(true);
    }
  });

  it('reports no difference in either direction', () => {
    expect(differences(emitted, diskImage())).toEqual([]);
  });

  it('detects a hand-edit, naming the path (positive control)', () => {
    const image = diskImage();
    const victim = `${GENERATED_DIR}/webhook/v1/alert-created.ts`;
    image.set(victim, `${image.get(victim) as string}\nexport type Sneaked = string;\n`);
    expect(differences(emitted, image)).toEqual([`differs: ${victim}`]);
  });

  it('detects a deleted and a stale file (positive control)', () => {
    const missing = diskImage();
    missing.delete(`${GENERATED_DIR}/registry.ts`);
    expect(differences(emitted, missing)).toEqual([`missing: ${GENERATED_DIR}/registry.ts`]);

    const stale = diskImage();
    stale.set(`${GENERATED_DIR}/sse/v1/rogue.ts`, '');
    expect(differences(emitted, stale)).toEqual([`stale: ${GENERATED_DIR}/sse/v1/rogue.ts`]);
  });

  it('stores every generated file as LF in the committed blob', () => {
    let checked = 0;
    for (const path of emitted.keys()) {
      const blob = committedBlob(`packages/contracts/${path}`);
      if (blob === null) continue; // first run on a fresh branch, before the commit
      expect(blob.includes(0x0d), `${path} has CRLF in the committed blob`).toBe(false);
      checked += 1;
    }
    expect(checked === 0 || checked === emitted.size).toBe(true);
  });
});

describe('the generated registry agrees with the schema registry', () => {
  it('exports the same event-type lists', async () => {
    const module = await import('../../src/events/generated/registry.js');
    expect(module.SCHEMA_VERSION).toBe('1.0');
    expect([...module.WEBHOOK_EVENT_TYPES]).toEqual(['alert.created']);
    expect([...module.SSE_EVENT_TYPES]).toHaveLength(9);
  });
});
