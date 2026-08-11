/**
 * The single import boundary between `src/tenant/**` and `packages/domain` (FND-06).
 *
 * PRD §45.2 puts pure permissions in `packages/domain`; this ticket consumes that decision and
 * re-implements none of it. Every other file under `src/tenant/**` imports `./domain.js`, never
 * `../../../domain/...` — mirroring `src/migrate/contracts.ts`, so when FND-03's workspace-link
 * question is settled exactly one file changes.
 *
 * The specifier is relative because no `@taxrag/*` workspace links exist yet (the FND-06 / RUNT-07
 * precedent), and it points at the package's `access` barrel, never at a leaf module.
 *
 * `test/tenant/purity.test.ts` asserts this is the only file under `src/tenant/**` naming
 * `../../../domain/`, and that no role/permission table is re-declared here.
 */
export type { Permission, Principal, Role, ApiScope } from '../../../domain/src/access/index.js';
export { principalColumn, isPermission } from '../../../domain/src/access/index.js';
