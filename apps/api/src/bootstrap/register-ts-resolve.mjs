/**
 * Registers `./ts-resolve-hooks.mjs` on the module loader thread.
 *
 * Loaded with `node --import ./src/bootstrap/register-ts-resolve.mjs src/server.ts` (see
 * `apps/api/package.json` `start` / `dev:api`). Nothing else imports this file — tests run under
 * Vitest, which does its own `.js` → `.ts` mapping.
 */
import { register } from 'node:module';

register('./ts-resolve-hooks.mjs', import.meta.url);
