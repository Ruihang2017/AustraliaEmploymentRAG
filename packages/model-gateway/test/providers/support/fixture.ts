/**
 * EVID-07 — path resolution and typed loaders shared by all three test leaves.
 *
 * Not a `*.test.*` file, so Vitest does not collect it. Paths resolve from `import.meta.url`, never
 * from `process.cwd()`, so the suite behaves the same under `pnpm --filter … test` and under a
 * repository-root run.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const SUPPORT_DIR = dirname(fileURLToPath(import.meta.url));
/** packages/model-gateway/test/providers */
export const TEST_PROVIDERS_DIR = join(SUPPORT_DIR, '..');
/** packages/model-gateway/test */
export const TEST_ROOT = join(TEST_PROVIDERS_DIR, '..');
/** packages/model-gateway */
export const PACKAGE_ROOT = join(TEST_ROOT, '..');
/** the repository root */
export const REPO_ROOT = join(PACKAGE_ROOT, '..', '..');
/** packages/model-gateway/src */
export const SRC_ROOT = join(PACKAGE_ROOT, 'src');

export function readJson<T>(...segments: readonly string[]): T {
  return JSON.parse(readFileSync(join(...segments), 'utf8')) as T;
}

/**
 * docs/PRD.md with line endings normalised to LF (it is committed with LF and materialised with CRLF
 * on a Windows checkout). Only newlines are touched — no character of the prose is changed.
 */
export function loadPrd(): string {
  return readFileSync(join(REPO_ROOT, 'docs', 'PRD.md'), 'utf8').replace(/\r\n/g, '\n');
}

/** A wrapped PRD paragraph as one line, so a wrapped source can be compared with an unwrapped constant. */
export function unwrap(lines: readonly string[]): string {
  return lines.join(' ');
}

/** Deep JSON-ish walk yielding every string reachable from a value — the canary scan's engine. */
export function reachableStrings(value: unknown, seen: WeakSet<object> = new WeakSet()): string[] {
  const found: string[] = [];
  const visit = (node: unknown): void => {
    if (typeof node === 'string') {
      found.push(node);
      return;
    }
    if (typeof node === 'bigint' || typeof node === 'number' || typeof node === 'boolean') return;
    if (node === null || node === undefined) return;
    if (typeof node === 'function') {
      found.push(node.name);
      return;
    }
    if (typeof node !== 'object') return;
    const asObject = node as object;
    if (seen.has(asObject)) return;
    seen.add(asObject);
    if (Array.isArray(node)) {
      for (const entry of node) visit(entry);
      return;
    }
    if (node instanceof Error) {
      found.push(node.message, node.name);
      if (typeof node.stack === 'string') found.push(node.stack);
      return;
    }
    for (const key of Object.getOwnPropertyNames(asObject)) {
      found.push(key);
      const descriptor = Object.getOwnPropertyDescriptor(asObject, key);
      if (descriptor && 'value' in descriptor) visit(descriptor.value);
    }
  };
  visit(value);
  return found;
}
