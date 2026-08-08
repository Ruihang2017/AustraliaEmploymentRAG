/**
 * The SDK's own identity, as literals.
 *
 * Deliberately NOT read from `package.json` at runtime: this package must work in a bundler and in a
 * runtime with no filesystem, and `test/version.test.ts` asserts both literals still equal the
 * manifest, so they cannot drift.
 */
export const SDK_NAME = '@taxrag/sdk-typescript';
export const SDK_VERSION = '0.0.0';

/** The `User-Agent` this SDK sends. A caller's suffix is appended, never substituted. */
export function userAgent(suffix?: string | undefined): string {
  const base = `${SDK_NAME}/${SDK_VERSION}`;
  const trimmed = suffix?.trim();
  return trimmed ? `${base} ${trimmed}` : base;
}
