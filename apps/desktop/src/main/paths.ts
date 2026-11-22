// Data and worktree folders. Spec: architecture.md §3. Owner: T3.
import { basename, dirname, join, win32 } from 'node:path';

/** Data folder: ORCHESTRA_DATA_DIR, else <appData>/Orchestra (settings.json, orchestra.db, logs/). */
export function dataDir(appDataDir: string, env: NodeJS.ProcessEnv = process.env): string {
  return env.ORCHESTRA_DATA_DIR && env.ORCHESTRA_DATA_DIR.trim() !== ''
    ? env.ORCHESTRA_DATA_DIR
    : join(appDataDir, 'Orchestra');
}

export function dbPath(dir: string): string { return join(dir, 'orchestra.db'); }
export function settingsPath(dir: string): string { return join(dir, 'settings.json'); }
export function logsDir(dir: string): string { return join(dir, 'logs'); }

/**
 * Worktree folder for one session.
 * ORCHESTRA_WORKTREES_DIR/<repoName>/<sessionId> when set;
 * win32: <repo drive>:\.orchestra-worktrees\<repoName>\<sessionId> (keeps C: free when repos live elsewhere);
 * posix: <repo parent>/.orchestra-worktrees/<repoName>/<sessionId>.
 */
export function worktreePath(
  repoPath: string,
  sessionId: string,
  env: NodeJS.ProcessEnv = process.env,
  platform: NodeJS.Platform = process.platform,
): string {
  if (platform === 'win32') {
    const repoName = win32.basename(repoPath);
    const root = env.ORCHESTRA_WORKTREES_DIR && env.ORCHESTRA_WORKTREES_DIR.trim() !== ''
      ? env.ORCHESTRA_WORKTREES_DIR
      : win32.join(win32.parse(win32.resolve(repoPath)).root, '.orchestra-worktrees');
    return win32.join(root, repoName, sessionId);
  }
  const repoName = basename(repoPath);
  const root = env.ORCHESTRA_WORKTREES_DIR && env.ORCHESTRA_WORKTREES_DIR.trim() !== ''
    ? env.ORCHESTRA_WORKTREES_DIR
    : join(dirname(repoPath), '.orchestra-worktrees');
  return join(root, repoName, sessionId);
}
