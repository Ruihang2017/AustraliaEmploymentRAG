/**
 * The ONLY import boundary between `packages/domain/src/workflow` and `packages/contracts`
 * (FND-08 deliverable 7 — purity: nothing outside `packages/contracts` and Node built-ins).
 *
 * The relative path (rather than the `@taxrag/contracts` package specifier) is deliberate:
 * `packages/contracts/src/index.ts` is still the empty FND-01 skeleton entry file and the workspace
 * has no `node_modules/@taxrag/*` link, so the package specifier resolves to nothing at type level
 * and at runtime (FND-03 open question Q1). Everything else under `src/workflow/` imports from this
 * file, so when Q1 is resolved exactly the two specifiers below change.
 *
 * The barrel (`enums/index.js`) is imported, never a family file: FND-03's barrel documents that
 * downstream modules never deep-import a family.
 */
export { RECORD_WORKFLOW_STATE_VALUES, isRecordWorkflowState } from '../../../contracts/src/enums/index.js';
export type { RecordWorkflowState } from '../../../contracts/src/enums/index.js';
