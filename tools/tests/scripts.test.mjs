import { describe, expect, it } from 'vitest';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { REPO_ROOT, loadFixture } from '../workspace-assertions.mjs';
import { membersProviding, ownerLine } from '../workspace-script.mjs';

const owners = loadFixture('script-owners.json');

function runScriptWrapper(name) {
  return spawnSync(process.execPath, ['tools/workspace-script.mjs', name], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
  });
}

describe('root scripts (FND-01 deliverable 2)', () => {
  it('declares all ten names in the root package.json', () => {
    const manifest = JSON.parse(readFileSync(join(REPO_ROOT, 'package.json'), 'utf8'));
    expect(Object.keys(manifest.scripts).sort()).toEqual([...owners.rootScripts].sort());
    for (const name of owners.rootScripts) {
      expect(manifest.scripts[name]).toBe(`node tools/workspace-script.mjs ${name}`);
    }
  });

  it('is private and carries the exact engines/packageManager pins', () => {
    const manifest = JSON.parse(readFileSync(join(REPO_ROOT, 'package.json'), 'utf8'));
    expect(manifest.private).toBe(true);
    expect(manifest.packageManager).toBe('pnpm@11.4.0');
    expect(manifest.engines.node).toBe('24.18.0');
  });

  it('names every owner the ticket requires', () => {
    expect(owners.owners.dev).toEqual({ ticket: 'RUNT-01/RUNT-05', module: '03-app-runtime' });
    expect(owners.owners['stack:up']).toEqual({ ticket: 'RUNT-09', module: '03-app-runtime' });
    expect(owners.owners['stack:down']).toEqual({ ticket: 'RUNT-09', module: '03-app-runtime' });
    expect(owners.owners['eval:smoke']).toEqual({ ticket: 'GOLD-03', module: '21-evaluation-600' });
    expect(owners.owners['test:integration']).toEqual({ ticket: 'ASSR-*', module: '23-assurance' });
    expect(owners.owners.generate).toEqual({ ticket: 'FND-04/FND-05', module: '00-foundation' });
    expect(owners.owners['generated:check']).toEqual({ ticket: 'FND-04/FND-05', module: '00-foundation' });
  });

  it.each(Object.keys(owners.owners))(
    '`%s` prints exactly one owner-naming line and exits 0',
    (name) => {
      expect(membersProviding(name)).toEqual([]);
      const result = runScriptWrapper(name);
      expect(result.status).toBe(0);
      const lines = result.stdout.split(/\r?\n/).filter((line) => line.trim().length > 0);
      expect(lines).toHaveLength(1);
      expect(lines[0]).toBe(ownerLine(name));
      expect(lines[0]).toMatch(/^[a-z:]+: not implemented yet \(owner: [^,]+, module [\w-]+\)$/);
    },
  );

  it('names the four commands PRD 45.3 flags as unimplemented among them', () => {
    for (const name of ['dev', 'eval:smoke', 'stack:up', 'stack:down']) {
      expect(Object.keys(owners.owners)).toContain(name);
    }
  });

  it('detects a workspace provider for typecheck, so delegation is not vacuous', () => {
    expect(membersProviding('typecheck')).toHaveLength(21);
    expect(membersProviding('typecheck')).toContain('packages/contracts');
  });

  it('exits 2 on an unknown script rather than silently succeeding', () => {
    const result = runScriptWrapper('no-such-script');
    expect(result.status).toBe(2);
    expect(result.stderr).toContain('no owner recorded');
  });
});
