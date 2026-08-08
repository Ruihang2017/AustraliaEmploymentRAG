/**
 * A narrow ambient declaration of the three `node:crypto` members `sign.ts` uses.
 *
 * WHY THIS FILE EXISTS. This package declares no dependency of any kind — `tools/tests/skeleton.test.mjs`
 * asserts exactly that for every workspace member — so there is no `@types/node`, and
 * `tsconfig.base.json` sets `lib: ["ES2024"]`, which declares neither `Buffer` nor `TextEncoder`. The
 * same constraint produced the structural typing of `globalThis.crypto` in `../ids/uuidv7.ts`; this is
 * the same move for a module specifier instead of a global.
 *
 * WHY NOT WEB CRYPTO. `crypto.subtle` needs no declaration, but it is **async** — which would make
 * `signWebhook`/`verifyWebhook` promise-returning, contradicting the signatures FND-05 deliverable 3
 * specifies — and it offers no constant-time comparator. The verifier's runtime surface is flagged as
 * an ADR candidate for `PLTF-02` (a browser SDK cannot provide `node:crypto`); the signing *input*
 * (`<timestamp>.<raw_body>`, HMAC-SHA256, lowercase hex) is unchanged either way, so nothing here
 * blocks on it.
 *
 * KEEP THE SURFACE EXACTLY THIS. Every added member is one more untyped assumption about Node's real
 * API that no compiler in this repository can check.
 *
 * This file must stay an ambient script: no top-level `import` or `export`, or the `declare module`
 * block below stops being global and `sign.ts` fails to resolve `node:crypto`.
 */
declare module 'node:crypto' {
  interface Hmac {
    /** Absorb raw bytes — the webhook body as sent. */
    update(data: Uint8Array): Hmac;
    /** Absorb text. The encoding is spelled explicitly; there is no `TextEncoder` in `lib: ES2024`. */
    update(data: string, encoding: 'utf8'): Hmac;
    /** Finalise. `'hex'` is lower-case hex, which is what PRD §34.8 specifies. */
    digest(encoding: 'hex'): string;
  }

  export function createHmac(algorithm: 'sha256', key: string | Uint8Array): Hmac;

  /** THROWS on a length mismatch — callers must guard the length first. */
  export function timingSafeEqual(a: Uint8Array, b: Uint8Array): boolean;
}
