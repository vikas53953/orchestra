// Data and worktree folders. Spec: architecture.md §3. Owner: T3.
import { realpathSync } from 'node:fs';
import { join, posix, win32 } from 'node:path';

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
  const repoName = posix.basename(repoPath);
  const root = env.ORCHESTRA_WORKTREES_DIR && env.ORCHESTRA_WORKTREES_DIR.trim() !== ''
    ? env.ORCHESTRA_WORKTREES_DIR
    : posix.join(posix.dirname(repoPath), '.orchestra-worktrees');
  return posix.join(root, repoName, sessionId);
}

/**
 * The real, long form of a path: links and Windows 8.3 short names (RUNNER~1) resolved with
 * realpathSync.native on the longest part that exists, then normalized, no trailing separator.
 */
export function canonicalPath(p: string, platform: NodeJS.Platform = process.platform): string {
  const path = platform === 'win32' ? win32 : posix;
  let head = path.resolve(p);
  const tail: string[] = [];
  for (;;) {
    try {
      head = realpathSync.native(head);
      break;
    } catch {
      const up = path.dirname(head);
      if (up === head) break;
      tail.unshift(path.basename(head));
      head = up;
    }
  }
  const full = path.normalize(path.join(head, ...tail));
  const root = path.parse(full).root;
  return full.length > root.length ? full.replace(/[\\/]+$/, '') : full;
}

/** Same folder? Canonical forms compared; case-insensitive and slash-agnostic on Windows. */
export function samePath(a: string, b: string, platform: NodeJS.Platform = process.platform): boolean {
  const ca = canonicalPath(a, platform);
  const cb = canonicalPath(b, platform);
  return platform === 'win32' ? ca.toLowerCase() === cb.toLowerCase() : ca === cb;
}
