/**
 * The last step of `pnpm --filter @taxrag/sdk-typescript build`.
 *
 * The package is `"type": "module"`, so every `.js` file under it is ESM by default — including the
 * CommonJS output `tsconfig.build.cjs.json` emits into `dist/cjs`. Node resolves that per-directory
 * from the NEAREST `package.json`, so dropping a two-key manifest into `dist/cjs` is what makes the
 * `require` condition of the package `exports` map actually loadable.
 *
 * No dependency, no network, no environment variable (PRD §20.2). It writes one file, inside this
 * package, and nowhere else.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const target = join(packageRoot, 'dist', 'cjs');

mkdirSync(target, { recursive: true });
writeFileSync(join(target, 'package.json'), `${JSON.stringify({ type: 'commonjs' }, null, 2)}\n`, 'utf8');
process.stdout.write(`wrote ${join('dist', 'cjs', 'package.json')}\n`);
