// Git calls for the conductor. Argument arrays only, hidden window, with a timeout. Owner: T3.
import { execFile } from 'node:child_process';
import { dirname, resolve } from 'node:path';

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

/** The null device for `-c core.hooksPath=...`: NUL on Windows, /dev/null elsewhere. */
export function nullDevice(platform: NodeJS.Platform = process.platform): string {
  return platform === 'win32' ? 'NUL' : '/dev/null';
}

/**
 * The main checkout for `top`, even when `top` is a linked worktree (e.g. an Orchestra session worktree):
 * the parent of `--git-common-dir`. When git-dir equals the common dir (not a linked worktree, including a
 * separate git dir), `top` itself.
 */
export async function mainRepoOf(top: string, git: RunGit = runGit): Promise<string> {
  const r = await git(['-C', top, 'rev-parse', '--path-format=absolute', '--git-dir', '--git-common-dir']);
  const [gitDir, common] = r.stdout.trim().split(/\r?\n/).map((l) => l.trim());
  if (!r.ok || !gitDir || !common || resolve(gitDir) === resolve(common)) return resolve(top);
  return resolve(dirname(resolve(common)));
}
