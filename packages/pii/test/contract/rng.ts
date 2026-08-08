/**
 * EVID-01 — the deterministic generator the property test draws from.
 *
 * WHY HAND-ROLLED: `tools/tests/skeleton.test.mjs` asserts that NO pnpm member declares a dependency
 * of any kind, and the root lockfile belongs to `FND-01` (PRD §44.3 serial-owned). Adding
 * `fast-check` would write `pnpm-lock.yaml` from inside this ticket's branch. The acceptance item
 * asks for a property test over generated finding sets, not for a particular library, so the
 * file-scope wins. This is the same shape `packages/domain/test/answers/arbitrary.ts` uses — copied
 * rather than imported, because importing another module's test tree is a worse dependency than
 * forty duplicated lines.
 *
 * `Math.random` appears nowhere: every run draws from the same fixed seed list, so a failure is
 * reproducible from the printed seed and the suite can never flake.
 */

/** mulberry32 — a small, fast, well-distributed 32-bit PRNG. */
export function mulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export class Rng {
  private readonly next: () => number;

  constructor(readonly seed: number) {
    this.next = mulberry32(seed);
  }

  float(): number {
    return this.next();
  }

  bool(): boolean {
    return this.next() < 0.5;
  }

  /** Uniform integer in [0, bound). */
  int(bound: number): number {
    return Math.floor(this.next() * bound);
  }

  /** Uniform element of a non-empty array. */
  pick<T>(values: readonly T[]): T {
    const value = values[this.int(values.length)];
    if (value === undefined) throw new Error('Rng.pick: empty array');
    return value;
  }
}

/** Fixed seeds. Changing this list changes which cases run — do it deliberately, never automatically. */
export const SEEDS: readonly number[] = Object.freeze([
  0x1a2b3c4d, 0x5e6f7081, 0x0badc0de, 0x13572468, 0x2468ace0, 0x7fffffff, 0x00000001, 0xfeedface,
  0x0f0f0f0f, 0xdeadbeef,
]);

/** Draws `count` cases in total, spread evenly over `SEEDS`, and reports the seed with each case. */
export function forEachDraw(
  count: number,
  run: (rng: Rng, index: number, seed: number) => void,
): void {
  const perSeed = Math.ceil(count / SEEDS.length);
  let index = 0;
  for (const seed of SEEDS) {
    const rng = new Rng(seed);
    for (let i = 0; i < perSeed && index < count; i += 1, index += 1) run(rng, index, seed);
  }
}
