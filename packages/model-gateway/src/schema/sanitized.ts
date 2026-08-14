/**
 * EVID-07 acceptance item "Sanitized facts only" — the ONE file in `src/**` that names `packages/pii`.
 *
 * PRD §37.5: the gateway *"receives only sanitized task facts and selected evidence"*. PRD §18.5 step
 * 1 puts PII admission before anything else. `EVID-01` expressed that as a type: `SanitizedPayload`
 * carries a phantom brand whose symbol is `declare const … : unique symbol` and is NOT exported, so no
 * module outside `packages/pii/src/contract/result.ts` can write an object literal that satisfies it.
 *
 * The consequence for this package is the acceptance item, for free and at compile time: a caller
 * cannot hand `buildProviderRequest` a plain string, a structurally identical literal, or any payload
 * that did not come out of PII admission. `test/schema/types.test-d.ts` asserts it with
 * `@ts-expect-error`, which fails the build if it ever STARTS compiling.
 *
 * Type-only. Importing a value from `packages/pii` would make this package depend on that runtime;
 * `verbatimModuleSyntax` means `import type` / `export type` erases entirely.
 */
export type {
  SanitizationTransformation,
  SanitizedField,
  SanitizedPayload,
} from '../../../pii/src/contract/index.js';

import type { SanitizedPayload } from '../../../pii/src/contract/index.js';

/**
 * The request-side wrapper. It carries the branded payload and nothing else that could smuggle raw
 * text past admission — there is deliberately no `rawText`, no `original`, no `unsanitized` member,
 * and no escape hatch to add one, because every field of this interface is `readonly` and the type is
 * closed.
 */
export interface SanitizedTaskFacts {
  readonly payload: SanitizedPayload;
}
