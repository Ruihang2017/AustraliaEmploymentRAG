/**
 * The public surface of the canonical enum vocabulary (FND-03 deliverable 3).
 *
 * Downstream modules import from this barrel and never deep-import a family file. Every relative
 * specifier carries a `.js` extension because the workspace compiles with
 * `moduleResolution: "nodenext"` (tsconfig.base.json).
 */
export * from './legal-status.js';
export * from './answer-status.js';
export * from './coverage-candidate-status.js';
export * from './record-workflow-state.js';
export * from './licence-assessment-state.js';
export * from './claim-support.js';
export * from './citation-role.js';
export * from './index-tier.js';
export * from './source-coverage-status.js';
export * from './sso-connection-state.js';
export * from './role.js';
export * from './permission.js';
export * from './api-scope.js';
export * from './funding-ledger.js';
export * from './async-state.js';
export * from './error-code.js';
export * from './sse-event-type.js';
export * from './authority-level.js';
export * from './evidence-qualifier.js';
export * from './change-type.js';
export * from './registry.js';
