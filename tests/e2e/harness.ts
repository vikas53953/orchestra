// Locked test harness (CR-1, strengthened by CR-3). Launches the built app (out/main/index.js) with an isolated data folder.
import { _electron as electron, type ElectronApplication, type Page } from '@playwright/test';
import { cpSync, mkdtempSync, mkdirSync, existsSync, readFileSync, readdirSync, lstatSync, readlinkSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join, resolve, relative } from 'node:path';
import { execFileSync } from 'node:child_process';

export const REAL_AI = process.env.REAL_AI === '1';
export const ROOT = resolve(__dirname, '../..');
export const CASSETTE = (name: string) => join(ROOT, 'tests/cassettes', name);

export interface Launched { app: ElectronApplication; page: Page; dataDir: string }

export function tempDir(prefix: string): string {
  return mkdtempSync(join(tmpdir(), prefix));
}

/** Copy fixtures/sample-repo into a fresh git repo (synthetic data only). */
export function makeSampleRepo(name = 'sample-repo'): string {
  const parent = tempDir('orch-repo-');
  const dir = join(parent, name);
  mkdirSync(dir, { recursive: true });
  cpSync(join(ROOT, 'fixtures/sample-repo'), dir, { recursive: true });
  const git = (...a: string[]) => execFileSync('git', a, { cwd: dir, stdio: 'pipe' });
  git('init', '-q', '-b', 'main');
  git('-c', 'user.name=Test', '-c', 'user.email=test@example.invalid', 'add', '.');
  git('-c', 'user.name=Test', '-c', 'user.email=test@example.invalid', 'commit', '-q', '-m', 'init');
  return dir;
}

export function gitStatus(dir: string): string {
  return execFileSync('git', ['status', '--porcelain'], { cwd: dir, encoding: 'utf8' });
}

export async function launch(opts: { dataDir?: string; env?: Record<string, string>; cassette?: string } = {}): Promise<Launched> {
  const dataDir = opts.dataDir ?? tempDir('orch-data-');
  const env: Record<string, string> = {
    ...(process.env as Record<string, string>),
    ORCHESTRA_DATA_DIR: dataDir,
    ORCHESTRA_WORKTREES_DIR: join(dataDir, 'worktrees'),
    ...opts.env,
  };
  if (!REAL_AI && opts.cassette && !opts.env?.ORCHESTRA_ENGINE) env.ORCHESTRA_ENGINE = `cassette:${opts.cassette}`;
  if (REAL_AI) delete env.ORCHESTRA_ENGINE;
  // CR-3: the cassette engine replays in a real child process and appends its pid here (test-only switch).
  if (!REAL_AI) env.ORCHESTRA_CASSETTE_PID_FILE = cassettePidFile(dataDir);
  const main = join(ROOT, 'out/main/index.js');
  if (!existsSync(main)) throw new Error('Build the app first: npm run build');
  const args = [main];
  if (process.platform === 'linux') args.unshift('--no-sandbox');
  const app = await electron.launch({ args, env });
  const page = await app.firstWindow();
  return { app, page, dataDir };
}

/** Make the folder picker return `dir` without showing a native dialog. */
export async function stubFolderPicker(app: ElectronApplication, dir: string): Promise<void> {
  await app.evaluate(({ dialog }, p) => {
    dialog.showOpenDialog = (async () => ({ canceled: false, filePaths: [p] })) as typeof dialog.showOpenDialog;
  }, dir);
}

export async function pickRepo(l: Launched, dir: string): Promise<void> {
  await stubFolderPicker(l.app, dir);
  await l.page.getByTestId('repo-chip').click();
}

export async function ask(l: Launched, text: string): Promise<void> {
  const box = l.page.getByTestId('home-composer');
  await box.click();
  await box.fill(text);
  await box.press('Enter');
}

export async function claudePids(): Promise<number[]> {
  try {
    const cmd = process.platform === 'win32'
      ? execFileSync('tasklist', ['/FI', 'IMAGENAME eq claude.exe', '/FO', 'CSV', '/NH'], { encoding: 'utf8' })
      : execFileSync('pgrep', ['-f', 'claude|fake-claude'], { encoding: 'utf8' });
    return cmd.split('\n').map((l) => parseInt(l.replace(/"/g, '').split(',')[1] ?? l, 10)).filter((n) => !Number.isNaN(n));
  } catch {
    return [];
  }
}

/** CR-3: where the cassette engine records the pid of each replay child it spawns (inside logs/, Orchestra's own files). */
export function cassettePidFile(dataDir: string): string {
  return join(dataDir, 'logs', 'cassette-pids.txt');
}

/** Running, not a zombie (Linux reads /proc; elsewhere signal 0). */
export function pidAlive(pid: number): boolean {
  if (process.platform === 'linux') {
    try {
      const st = readFileSync(`/proc/${pid}/stat`, 'utf8');
      const state = st.slice(st.lastIndexOf(')') + 2).split(' ')[0];
      return state !== 'Z' && state !== 'X';
    } catch {
      return false;
    }
  }
  try {
    process.kill(pid, 0);
    return true;
  } catch (e) {
    return (e as NodeJS.ErrnoException).code === 'EPERM';
  }
}

/**
 * CR-3: live agent-engine processes for this app's data folder, in both lanes.
 * Real-AI lane: every `claude` process (as before). Cassette lane: replay children the app spawned that are still running.
 */
export async function enginePids(dataDir: string): Promise<number[]> {
  if (REAL_AI) return claudePids();
  const f = cassettePidFile(dataDir);
  if (!existsSync(f)) return [];
  return readFileSync(f, 'utf8').split('\n').map((l) => parseInt(l, 10)).filter((n) => !Number.isNaN(n) && pidAlive(n));
}

/** Every pid the cassette engine has spawned for this data folder (alive or not). Empty in the real-AI lane. */
export function cassetteSpawnedPids(dataDir: string): number[] {
  const f = cassettePidFile(dataDir);
  if (REAL_AI || !existsSync(f)) return [];
  return readFileSync(f, 'utf8').split('\n').map((l) => parseInt(l, 10)).filter((n) => !Number.isNaN(n));
}

/** Polls until no engine process is left, or `ms` passes. Returns what is still running. */
export async function engineLeftAfter(dataDir: string, ms: number): Promise<number[]> {
  const end = Date.now() + ms;
  let left = await enginePids(dataDir);
  while (left.length && Date.now() < end) {
    await new Promise((r) => setTimeout(r, 50));
    left = await enginePids(dataDir);
  }
  return left;
}

/** All descendants of pid (posix, from `ps`). */
function descendants(pid: number): number[] {
  const rows = execFileSync('ps', ['-e', '-o', 'pid=,ppid='], { encoding: 'utf8' })
    .split('\n').map((l) => l.trim().split(/\s+/).map(Number)).filter((r) => r.length === 2 && !r.some(Number.isNaN));
  const out: number[] = [];
  const walk = (p: number): void => {
    for (const [c, pp] of rows) if (pp === p && !out.includes(c!)) { out.push(c!); walk(c!); }
  };
  walk(pid);
  return out;
}

/**
 * CR-3 J7: crash the app — hard-kill the Electron main process and its whole process tree, as Task Manager's
 * "End process tree" would. win32: taskkill /F /T. posix: SIGKILL to the main pid and every descendant
 * (including children that lead their own process group), found by parent pid before any of them dies.
 */
export async function hardKill(app: ElectronApplication): Promise<void> {
  const proc = app.process();
  const pid = proc.pid;
  if (pid === undefined) throw new Error('no Electron pid');
  const exited = new Promise<void>((r) => {
    if (proc.exitCode !== null || proc.signalCode !== null) r();
    else proc.once('exit', () => r());
  });
  if (process.platform === 'win32') {
    execFileSync('taskkill', ['/PID', String(pid), '/T', '/F'], { stdio: 'ignore' });
  } else {
    const tree = [pid, ...descendants(pid)];
    for (const p of tree) {
      try { process.kill(p, 'SIGKILL'); } catch { /* already gone */ }
    }
  }
  await exited;
}

export interface FileStamp { size: number; mtimeMs: number; sha256: string }
export type Snapshot = Map<string, FileStamp>;

/** CR-3 AC-L2: path -> size + mtime + sha256 of every file (and link) under root, .git included. `skip` gets the relative path (posix slashes). */
export function snapshot(root: string, skip: (rel: string) => boolean = () => false): Snapshot {
  const out: Snapshot = new Map();
  const walk = (dir: string): void => {
    for (const name of readdirSync(dir)) {
      const full = join(dir, name);
      const rel = relative(root, full).split('\\').join('/');
      if (skip(rel)) continue;
      const st = lstatSync(full);
      if (st.isDirectory()) {
        out.set(rel + '/', { size: 0, mtimeMs: 0, sha256: 'dir' });
        walk(full);
      } else {
        const body = st.isSymbolicLink() ? Buffer.from(readlinkSync(full)) : readFileSync(full);
        out.set(rel, { size: st.size, mtimeMs: st.mtimeMs, sha256: createHash('sha256').update(body).digest('hex') });
      }
    }
  };
  walk(root);
  return out;
}

/** Human-readable list of added / removed / changed paths between two snapshots (empty when identical). */
export function snapshotDiff(before: Snapshot, after: Snapshot): string[] {
  const d: string[] = [];
  for (const [p, a] of after) {
    const b = before.get(p);
    if (!b) d.push(`added ${p}`);
    else if (b.size !== a.size || b.mtimeMs !== a.mtimeMs || b.sha256 !== a.sha256) d.push(`changed ${p}`);
  }
  for (const p of before.keys()) if (!after.has(p)) d.push(`removed ${p}`);
  return d.sort();
}
