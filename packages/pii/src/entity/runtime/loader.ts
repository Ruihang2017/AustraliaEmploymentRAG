/**
 * EVID-02 deliverable 3 — verification before load, as a pure function.
 *
 * WHY THE IMPURITY IS INJECTED. `test/contract/purity.test.ts` (EVID-01, and not editable by this
 * ticket) asserts that every module specifier under `packages/pii/src/**` is relative: this package
 * may import no Node builtin and no dependency, so it cannot read a file, hash bytes or read an
 * environment variable. That is not an obstacle to this deliverable, it is a stronger form of it —
 * the package still cannot open a file or a socket even with a model enabled. The host
 * (`EVID-03`/`RUNT-02`) supplies an `ArtifactSource` and a digest function; that is where filesystem
 * and hashing code legitimately lives.
 *
 * THE ORDER IS FIXED AND TESTED: read -> size -> digest -> only then `READY`. There is no
 * "warn and continue" branch, no partial success and no fallback: a mismatch is `UNAVAILABLE` with a
 * closed-union reason code carrying no path, no bytes and no digest. `readiness()` on the resulting
 * recogniser is `UNAVAILABLE`, and PRD §21.1's "no arbitrary runtime … download" holds because
 * nothing here can fetch anything — it can only be handed bytes and refuse them.
 */
import type { ArtifactPin } from './pin.js';

/** How the host offers the artifact's bytes. `null` means "absent", never "empty file". */
export interface ArtifactSource {
  readonly read: () => Uint8Array | null;
}

/** The host's digest function. Lower-case hex of the SHA-256 of `bytes`. */
export type ArtifactDigest = (bytes: Uint8Array) => string;

export type LoadFailureReason =
  | 'ARTIFACT_ABSENT'
  | 'SIZE_MISMATCH'
  | 'DIGEST_MISMATCH'
  | 'READ_FAILED';

export type LoadOutcome =
  | { readonly state: 'READY'; readonly bytes: Uint8Array }
  | { readonly state: 'UNAVAILABLE'; readonly reason: LoadFailureReason };

/** The only construction of an `UNAVAILABLE` outcome, so every refusal looks identical. */
export function unavailable(reason: LoadFailureReason): LoadOutcome {
  return { state: 'UNAVAILABLE', reason };
}

export function loadPinnedArtifact(
  pin: ArtifactPin,
  source: ArtifactSource,
  digest: ArtifactDigest,
): LoadOutcome {
  let bytes: Uint8Array | null;
  try {
    bytes = source.read();
  } catch {
    // The thrown value is deliberately not inspected: a host error message could carry a path.
    return unavailable('READ_FAILED');
  }
  if (bytes === null) return unavailable('ARTIFACT_ABSENT');
  if (bytes.length !== pin.sizeBytes) return unavailable('SIZE_MISMATCH');

  let computed: string;
  try {
    computed = digest(bytes);
  } catch {
    return unavailable('READ_FAILED');
  }
  if (computed.toLowerCase() !== pin.digest.toLowerCase()) return unavailable('DIGEST_MISMATCH');

  return { state: 'READY', bytes };
}
