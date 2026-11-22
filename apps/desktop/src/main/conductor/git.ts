// Git calls for the conductor. Argument arrays only, hidden window, with a timeout. Owner: T3.
import { execFile } from 'node:child_process';

export const GIT_TIMEOUT_MS = 30_000;

export interface GitResult { ok: boolean; stdout: string; stderr: string; code: number | null }
export type RunGit = (args: string[], timeoutMs?: number) => Promise<GitResult>;

export const runGit: RunGit = (args, timeoutMs = GIT_TIMEOUT_MS) => new Promise((resolve) => {
  execFile('git', args, { timeout: timeoutMs, windowsHide: true, encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 },
    (err, stdout, stderr) => {
      const code = err ? (typeof (err as { code?: unknown }).code === 'number' ? (err as { code: number }).code : null) : 0;
      resolve({ ok: !err, stdout: String(stdout ?? ''), stderr: String(stderr ?? ''), code });
    });
});

/** Top folder of the repo holding `dir`, or null when `dir` is not inside a git repo (AC-F1b). */
export async function repoTopLevel(dir: string, git: RunGit = runGit): Promise<string | null> {
  const r = await git(['-C', dir, 'rev-parse', '--show-toplevel']);
  const top = r.stdout.trim();
  return r.ok && top !== '' ? top : null;
}
