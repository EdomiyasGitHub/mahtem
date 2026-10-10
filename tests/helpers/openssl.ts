/**
 * Runs the real OpenSSL CLI as an independent reference implementation.
 * Set OPENSSL_BIN to its full path if `openssl` is not on PATH (on Windows,
 * Git for Windows ships one at C:\Program Files\Git\usr\bin\openssl.exe).
 * Tests that need it are skipped, not failed, when it is unavailable.
 */
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

export const OPENSSL = process.env.OPENSSL_BIN ?? 'openssl';

const probe = spawnSync(OPENSSL, ['version'], { encoding: 'utf8' });
export const opensslAvailable = probe.status === 0;
export const opensslVersion = opensslAvailable ? probe.stdout.trim() : 'not found';

// In CI the interop tests are mandatory evidence: never let them skip silently.
if (process.env.CI && !opensslAvailable) {
  throw new Error('OpenSSL CLI not found in CI; interop tests cannot be skipped there.');
}

export interface RunResult {
  status: number | null;
  stdout: string;
  /** stdout as raw bytes, for binary output such as DER. */
  stdoutBytes: Uint8Array;
  stderr: string;
}

/** Run OpenSSL with an argument array (no shell, so no injection). */
export function openssl(args: string[], options: { cwd: string; input?: Buffer }): RunResult {
  const r = spawnSync(OPENSSL, args, { cwd: options.cwd, input: options.input, encoding: 'buffer' });
  return {
    status: r.status,
    stdout: r.stdout.toString('utf8'),
    stdoutBytes: new Uint8Array(r.stdout),
    stderr: r.stderr.toString('utf8'),
  };
}

/** Run `fn` in a fresh temporary directory, removed only after `fn` has fully finished. */
export async function withTempDir<T>(fn: (dir: string) => T | Promise<T>): Promise<T> {
  const dir = mkdtempSync(join(tmpdir(), 'mahtem-'));
  try {
    return await fn(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}
