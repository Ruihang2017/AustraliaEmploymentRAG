/**
 * `src/server.ts` as a real child process (ticket acceptance: SIGTERM drains and exits 0; a boot
 * failure exits non-zero with one stderr line and no stack).
 *
 * The signal half is skipped on Windows — `process.kill(pid, 'SIGTERM')` there terminates the child
 * abruptly rather than delivering a signal, so the assertion would be about the OS, not the code.
 * CI runs `ubuntu-latest` (`.github/workflows`, `node-version-file: .node-version`), so it runs for
 * real there. The OS-independent shutdown properties are covered by `test/shutdown.test.ts`.
 */
import { spawn } from 'node:child_process';
import nodeProcess from 'node:process';
import { join } from 'node:path';
import { URL, fileURLToPath, pathToFileURL } from 'node:url';
import { setTimeout } from 'node:timers';
import { describe, expect, it } from 'vitest';

const APP_ROOT = fileURLToPath(new URL('..', import.meta.url));
const SERVER = join(APP_ROOT, 'src', 'server.ts');
/**
 * The same argv `apps/api`'s `start` script uses. The `--import` hook maps the repository's `.js`
 * import specifiers onto the `.ts` files on disk; see `src/bootstrap/ts-resolve-hooks.mjs`.
 */
const SERVER_ARGV = [
  '--import',
  // A file: URL, not a bare Windows path — `--import` treats its argument as a module specifier.
  pathToFileURL(join(APP_ROOT, 'src', 'bootstrap', 'register-ts-resolve.mjs')).href,
  SERVER,
];

interface RunResult {
  readonly code: number | null;
  readonly signal: string | null;
  readonly stdout: string;
  readonly stderr: string;
}

/**
 * Boots `src/server.ts` with `env`, waits until `settle` resolves (or the process exits), and
 * returns the outcome. Always kills the child in a `finally` so no test leaks a listener.
 */
function runServer(
  env: Record<string, string | undefined>,
  afterSpawn?: (kill: (signal: string) => void) => void,
): Promise<RunResult> {
  return new Promise<RunResult>((resolve, reject) => {
    const child = spawn(nodeProcess.execPath, SERVER_ARGV, { cwd: APP_ROOT, env });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => {
      stdout += String(chunk);
    });
    child.stderr.on('data', (chunk) => {
      stderr += String(chunk);
    });
    child.on('error', reject);
    child.on('exit', (code, signal) => {
      resolve({ code, signal, stdout, stderr });
    });
    afterSpawn?.((signal) => {
      child.kill(signal);
    });
  });
}

describe('boot failure', () => {
  it('exits non-zero with a single stderr line and no stack', async () => {
    const result = await runServer({
      ...nodeProcess.env,
      NODE_ENV: 'production',
      TAXRAG_MYSTERY_SETTING: '1',
    });
    expect(result.code).not.toBe(0);
    const lines = result.stderr.trim().split('\n').filter((line) => line.trim().length > 0);
    expect(lines).toHaveLength(1);
    expect(lines[0]).toContain('api: boot failed');
    expect(lines[0]).toContain('TAXRAG_MYSTERY_SETTING');
    expect(result.stderr).not.toContain('    at ');
    expect(result.stderr).not.toContain('node:internal');
  }, 30_000);
});

describe.skipIf(nodeProcess.platform === 'win32')('SIGTERM', () => {
  it('drains and exits 0', async () => {
    const result = await runServer(
      { ...nodeProcess.env, NODE_ENV: 'test', TAXRAG_API_PORT: '41879', TAXRAG_API_SHUTDOWN_TIMEOUT_MS: '5000' },
      (kill) => {
        // The process listens on an ephemeral port; give it a moment to reach `installShutdown`.
        setTimeout(() => kill('SIGTERM'), 2000);
      },
    );
    expect(result.signal).toBeNull();
    expect(result.code).toBe(0);
  }, 30_000);
});
