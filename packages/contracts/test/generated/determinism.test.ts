/**
 * FND-04 acceptance item 6 — "`pnpm generate && pnpm generated:check` exits 0 and leaves
 * `git status --porcelain` empty — DEV-001's acceptance evidence, *Generated-client diff is clean in
 * CI* (PRD §30.2)."
 *
 * And FND-04 Feedback obligation 4: "The generator emits unstable output (ordering, timestamps,
 * absolute paths) so `generated:check` is flaky. -> That falsifies DEV-001's acceptance evidence.
 * Fix determinism in the generator … Never loosen `generated:check` to a fuzzy comparison."
 *
 * Nothing here writes inside the repository. `runGeneratedCheck()` regenerates into `os.tmpdir()`,
 * and the hand-edit control below feeds the comparator an in-memory mutation rather than editing a
 * committed file — a test process killed mid-edit would otherwise leave the tree dirty, which is the
 * very thing acceptance item 6 asserts is not the case.
 */
import { describe, expect, it } from 'vitest';

import { GENERATED_DIR, emit } from '../../src/openapi/emit.mjs';
import { compareGenerated, runGeneratedCheck } from '../../src/openapi/generated-check.mjs';
import { PACKAGE_ROOT, document } from '../openapi/fixture.js';

describe('generator determinism (acceptance item 6)', () => {
  it('produces byte-identical output when called twice on the same document', () => {
    const first = emit(document());
    const second = emit(document());
    expect([...second.keys()]).toEqual([...first.keys()]);
    for (const [path, contents] of first) expect(second.get(path), path).toBe(contents);
  });

  it('produces the same output from a second, independently parsed document', () => {
    const reparsed = JSON.parse(JSON.stringify(document())) as Parameters<typeof emit>[0];
    const first = emit(document());
    const second = emit(reparsed);
    for (const [path, contents] of first) expect(second.get(path), path).toBe(contents);
  });

  it('emits keys in lexicographic order, the one ordering rule', () => {
    const keys = [...emit(document()).keys()];
    expect(keys).toEqual([...keys].sort());
  });

  it('matches the committed tree', () => {
    const { ok, problems } = runGeneratedCheck(PACKAGE_ROOT);
    expect(problems).toEqual([]);
    expect(ok).toBe(true);
  });

  // Positive control: `generated:check` must actually fail on a hand-edit. This is the automated
  // half of the ticket's Reviewer step 4 (the manual half edits a real file and restores it).
  it('detects a hand-edited generated file, naming it', () => {
    const tampered = new Map(emit(document()));
    const path = `${GENERATED_DIR}/errors.ts`;
    tampered.set(path, (tampered.get(path) as string).replace('errorCodes', 'errorCodesRenamedByHand'));
    const { ok, problems } = compareGenerated(tampered, PACKAGE_ROOT);
    expect(ok).toBe(false);
    expect(problems.join('\n')).toContain(path);
    expect(problems.join('\n')).toContain('differs from the generator');
  });

  it('detects a generated file that has been deleted', () => {
    const tampered = new Map(emit(document()));
    tampered.delete(`${GENERATED_DIR}/paths.ts`);
    const { ok, problems } = compareGenerated(tampered, PACKAGE_ROOT);
    expect(ok).toBe(false);
    expect(problems.join('\n')).toContain('the emitter no longer produces it');
  });

  it('detects a generated file that is missing from disk', () => {
    const tampered = new Map(emit(document()));
    tampered.set(`${GENERATED_DIR}/not-written.ts`, 'x\n');
    const { ok, problems } = compareGenerated(tampered, PACKAGE_ROOT);
    expect(ok).toBe(false);
    expect(problems.join('\n')).toContain('missing');
  });

  it('rejects CR bytes in generated output outright', () => {
    const tampered = new Map(emit(document()));
    const path = `${GENERATED_DIR}/index.ts`;
    tampered.set(path, (tampered.get(path) as string).split('\n').join('\r\n'));
    const { problems } = compareGenerated(tampered, PACKAGE_ROOT);
    expect(problems.join('\n')).toContain('must be LF only');
  });

  // FND-04 deliverable 5: "a baseline advance is an explicit, reviewed commit, never an automatic
  // side effect of `pnpm generate`."
  it('writes nothing outside `src/generated/`, and nothing under the baseline', () => {
    for (const path of emit(document()).keys()) {
      expect(path.startsWith(`${GENERATED_DIR}/`), path).toBe(true);
      expect(path).not.toContain('schemas/openapi/baseline');
      expect(path).not.toContain('..');
    }
  });

  it('is pure: emitting does not touch the filesystem or the clock', () => {
    const source = emit.toString();
    expect(source).not.toContain('writeFileSync');
    expect(source).not.toContain('Date.now');
  });
});
