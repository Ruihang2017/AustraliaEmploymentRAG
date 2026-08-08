/**
 * The public surface of the event contracts (FND-05).
 *
 * Consumers — `WTCH-05`, `PLTF-02`, `PLTF-03` — deep-import `@taxrag/contracts/src/events/index.js`,
 * the shape FND-03 established for this package: `packages/contracts/src/index.ts` is required by
 * `tools/workspace-assertions.mjs#assertEntryFilesEmpty` to stay byte-exactly `export {};`.
 *
 * `sha256`, `hmacSha256`, `equalsInConstantTime` and the byte codecs are deliberately NOT re-exported.
 * They are internals of the signing helper; exporting a bespoke hash from the repository's most
 * widely inherited package would invite a second caller with a different threat model.
 *
 * Every relative specifier carries a `.js` extension (`moduleResolution: "nodenext"`).
 */
export { signWebhook, verifyWebhook } from './sign.js';
export type {
  SignWebhookInput,
  VerifyReason,
  VerifyResult,
  VerifyWebhookInput,
  WebhookSecret,
} from './sign.js';

/**
 * The generated bindings (PRD §20.1 — machine-written, never hand-edited): every event interface,
 * plus `SCHEMA_VERSION`, `WEBHOOK_EVENT_TYPES` and `SSE_EVENT_TYPES`.
 */
export * from './generated/index.js';
