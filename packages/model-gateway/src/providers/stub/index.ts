/**
 * EVID-07 deliverable 7 — the `./testing` subpath.
 *
 * `packages/model-gateway/package.json` maps `"./testing"` here, so `EVID-05`, `ASK-02`, `GOLD-15`
 * and `ASSR-04` consume ONE stub. Until workspace links exist they deep-import
 * `packages/model-gateway/src/providers/stub/index.js` relatively, exactly as `EVID-02` and `ASK-06`
 * do for `packages/pii` (plan OQ-3).
 *
 * Nothing here can reach a network: the stub is a `Transport` that returns fixed data, and this
 * package holds no client to fall through to.
 */
export { STUB_MODEL_VERSION, createStubProvider, exactTextOf } from './deterministic.js';
export type { StubOptions } from './deterministic.js';

export {
  CONTENT_LEVEL_MODES,
  STUB_MODES,
  TRANSPORT_LEVEL_MODES,
  isStubMode,
} from './failure-modes.js';
export type { StubMode } from './failure-modes.js';

export { STUB_PROVIDER_ID } from '../../profiles/provider-ids.js';
