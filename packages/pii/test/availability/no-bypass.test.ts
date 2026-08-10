import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { PACKAGE_ROOT } from '../contract/fixture.js';

function sourceFiles(dir: string): readonly string[] {
  const found: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) found.push(...sourceFiles(path));
    else if (entry.name.endsWith('.ts')) found.push(path);
  }
  return found;
}

const files = sourceFiles(join(PACKAGE_ROOT, 'src', 'availability'));
const sources = files.map((path) => ({ path, text: readFileSync(path, 'utf8') }));
const forbidden = [
  /SanitizedPayload/,
  /mintSanitizedPayload/,
  /\badmit\s*\(/,
  /\bforce\b/i,
  /\boverride\b/i,
  /\backnowledge\b/i,
  /\bbypass\b/i,
  /\bskipPii\b/i,
  /['"]\.\.\/contract\/result\.js['"]/,
  /['"]\.\.\/contract\/pipeline\.js['"]/,
] as const;

describe('availability has no partial-acceptance path', () => {
  it('scans every availability source file', () => {
    expect(files.length).toBe(6);
    expect(sources.every((source) => source.text.length > 0)).toBe(true);
  });

  it.each(forbidden.map((pattern) => [pattern.source, pattern] as const))(
    'does not contain %s',
    (_name, pattern) => {
      expect(sources.filter((source) => pattern.test(source.text)).map((source) => source.path)).toEqual([]);
    },
  );

  it('proves the scanner rejects a synthetic control', () => {
    const control = "function admit(force: boolean) { return 'SanitizedPayload'; }";
    expect(forbidden.filter((pattern) => pattern.test(control)).length).toBeGreaterThan(1);
  });
});
