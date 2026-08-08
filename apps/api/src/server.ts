/**
 * The API process entry (ticket deliverable 9).
 *
 * Deliberately thin and unconditional — every testable decision lives in `bootstrap/`, so no test
 * ever imports this file except `test/server-process.test.ts`, which runs it as a real child
 * process. A boot failure writes ONE line to stderr (no stack) and exits non-zero.
 */
import nodeProcess from 'node:process';

import { buildApp } from './app.js';
import { loadConfig } from './bootstrap/config.js';
import { installShutdown } from './bootstrap/shutdown.js';

async function main(): Promise<void> {
  const config = loadConfig(nodeProcess.env);
  const { app } = await buildApp(config);
  await app.listen({ host: config.host, port: config.port });
  installShutdown(app, {
    timeoutMs: config.shutdownTimeoutMs,
    onSignal: (signal, listener) => {
      nodeProcess.on(signal, listener);
    },
  });
}

try {
  await main();
} catch (error) {
  // One line, no stack: a boot failure reason is operational, not a debugging dump (PRD §22).
  nodeProcess.stderr.write(
    `api: boot failed: ${error instanceof Error ? error.message : String(error)}\n`,
  );
  nodeProcess.exit(1);
}
