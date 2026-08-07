/**
 * UUIDv7 generation (RFC 9562 §5.7) with the monotonic-counter guarantee of RFC 9562 §6.2 method 2.
 *
 * PRD §34.1 requires resource ids to be *"Opaque resource-prefixed UUIDv7 strings"*. UUIDv7 is
 * time-ordered, which is what makes an id k-sortable and index-friendly; the counter is what makes
 * ids minted inside the same millisecond ordered too, so ordering does not silently degrade to
 * "random" under load.
 *
 * NOT A SECURITY TOKEN. A v7 uuid embeds its creation time and carries only 42 random bits per id
 * (plus a 30-bit per-millisecond counter seed). It is an identifier, not a capability: never use it
 * for an invitation token, an API credential, a session id or anything else whose secrecy carries
 * authorisation. Authorisation is a permission check plus resource membership (PRD §38.1), and
 * PRD §16.5 requires another tenant's id and an absent id to return the same `RESOURCE_NOT_FOUND`.
 *
 * Layout (16 bytes):
 *
 * ```text
 * byte 0..5   48-bit big-endian unix_ts_ms
 * byte 6      0x70 | (counter >>> 28)          version 7 + counter bits 31..28
 * byte 7      (counter >>> 20) & 0xff          counter bits 27..20
 * byte 8      0x80 | ((counter >>> 14) & 0x3f) RFC variant 0b10 + counter bits 19..14
 * byte 9      (counter >>> 6) & 0xff           counter bits 13..6
 * byte 10     ((counter & 0x3f) << 2) | rand   counter bits 5..0 + 2 random bits
 * byte 11..15 random                           40 random bits
 * ```
 *
 * No dependency, and in fact no import at all (ticket deliverable 6 — a dependency in
 * `packages/contracts` is inherited by every package in the repository). Randomness comes from the
 * Web Crypto `globalThis.crypto`, a CSPRNG that is a stable global in Node 19+ and in every other
 * modern runtime. `node:crypto` is deliberately not imported: the repository ships no `@types/node`
 * (the member manifests declare no dependencies at all, asserted by tools/tests/skeleton.test.mjs),
 * and the Web Crypto global needs neither a dependency nor an ambient declaration file.
 */

/**
 * `globalThis.crypto` typed structurally. `lib: ["ES2024"]` does not declare it and this package has
 * no ambient Node/DOM types, so the shape is asserted here — narrowly, to the one method used.
 */
const webCrypto = (
  globalThis as unknown as {
    crypto: { getRandomValues: <T extends ArrayBufferView>(array: T) => T };
  }
).crypto;

/** Default randomness source: `size` cryptographically random bytes. */
const defaultRandomBytes = (size: number): Uint8Array =>
  webCrypto.getRandomValues(new Uint8Array(size));

/** Injectable environment. Both are injected together in tests so a run is fully deterministic. */
export interface UuidV7Deps {
  /** Milliseconds since the Unix epoch. Defaults to `Date.now`. */
  readonly now?: () => number;
  /** Cryptographically random bytes. Defaults to Web Crypto's `getRandomValues`. */
  readonly randomBytes?: (size: number) => Uint8Array;
  /**
   * TEST SEAM ONLY. The value the per-millisecond counter is seeded with, masked to 30 bits by the
   * default implementation so ~3.2e9 increments of headroom remain inside one millisecond.
   *
   * It exists because the counter-overflow branch is otherwise unreachable in a test: with the real
   * seed the branch needs billions of calls in a single millisecond. Production code must not pass
   * it — a constant seed makes ids inside a millisecond predictable (see the "NOT A SECURITY TOKEN"
   * note above; predictable is still not a vulnerability here, but it is not the intended behaviour).
   */
  readonly counterSeed?: () => number;
}

const HEX = Array.from({ length: 256 }, (_, i) => i.toString(16).padStart(2, '0'));

const MAX_COUNTER = 0xffff_ffff;
/**
 * The seed occupies the low 30 bits, so at least `0xffff_ffff - 0x3fff_ffff` = ~3.2e9 increments
 * remain before the counter rolls over inside one millisecond (RFC 9562 §6.2: seed the counter so
 * that rollover is improbable). This is what makes the acceptance item's 10,000 ids from a fixed
 * clock strictly increasing rather than "usually" increasing.
 */
const COUNTER_SEED_MASK = 0x3fff_ffff;

/** Lower-case 8-4-4-4-12. Hyphens sit at fixed positions, so byte order == string order. */
function format(bytes: Uint8Array): string {
  let out = '';
  for (let i = 0; i < 16; i += 1) {
    if (i === 4 || i === 6 || i === 8 || i === 10) out += '-';
    out += HEX[bytes[i] as number];
  }
  return out;
}

/**
 * A UUIDv7 generator with its own clock, counter and randomness.
 *
 * The counter is per-factory mutable state. Within one process the increment is atomic (Node runs
 * one JavaScript thread per worker). Across processes, worker threads or `node:cluster`, two
 * generators in the same millisecond seed independently: ids stay unique (42 random bits plus
 * independent seeds) but are not globally ordered *inside* a millisecond. That is exactly RFC 9562's
 * guarantee — do not assert or rely on cross-process ordering.
 */
export function createUuidV7(deps: UuidV7Deps = {}): () => string {
  const now = deps.now ?? Date.now;
  const randomBytes = deps.randomBytes ?? defaultRandomBytes;

  let lastMs = -1;
  let counter = 0;

  const seedCounter = (): number => {
    if (deps.counterSeed) return deps.counterSeed() >>> 0;
    const r = randomBytes(4);
    const value =
      ((r[0] as number) << 24) |
      ((r[1] as number) << 16) |
      ((r[2] as number) << 8) |
      (r[3] as number);
    return (value >>> 0) & COUNTER_SEED_MASK;
  };

  return function uuidv7(): string {
    const ms = now();
    if (ms > lastMs) {
      lastMs = ms;
      counter = seedCounter();
    } else {
      // Covers ms === lastMs and a clock that went backwards (NTP step): lastMs never decreases, so
      // ids never regress and the k-sortable property holds across the correction.
      counter += 1;
      if (counter > MAX_COUNTER) {
        lastMs += 1;
        counter = seedCounter();
      }
    }

    const rand = randomBytes(6);
    const bytes = new Uint8Array(16);

    // 48-bit big-endian timestamp. Split so the high 16 bits survive without 32-bit truncation.
    const high = Math.floor(lastMs / 0x1_0000_0000);
    const low = lastMs >>> 0;
    bytes[0] = (high >>> 8) & 0xff;
    bytes[1] = high & 0xff;
    bytes[2] = (low >>> 24) & 0xff;
    bytes[3] = (low >>> 16) & 0xff;
    bytes[4] = (low >>> 8) & 0xff;
    bytes[5] = low & 0xff;

    bytes[6] = 0x70 | ((counter >>> 28) & 0x0f);
    bytes[7] = (counter >>> 20) & 0xff;
    bytes[8] = 0x80 | ((counter >>> 14) & 0x3f);
    bytes[9] = (counter >>> 6) & 0xff;
    bytes[10] = ((counter & 0x3f) << 2) | ((rand[0] as number) & 0x03);
    bytes[11] = rand[1] as number;
    bytes[12] = rand[2] as number;
    bytes[13] = rand[3] as number;
    bytes[14] = rand[4] as number;
    bytes[15] = rand[5] as number;

    return format(bytes);
  };
}

/**
 * The canonical textual form of a version-7, RFC-variant uuid. Anchored, lower-case only: an
 * upper-case or v4 uuid is not a valid id (PRD §34.1 ids are minted by the server, never parsed or
 * constructed by a client).
 */
export const UUID_V7_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

/** Whether `value` is a canonical UUIDv7 string. */
export const isUuidV7 = (value: unknown): value is string =>
  typeof value === 'string' && UUID_V7_PATTERN.test(value);

/** The process-wide default generator. */
export const uuidv7 = createUuidV7();
