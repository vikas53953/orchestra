// Spawn tracked child processes and kill whole process trees (architecture.md §3, AC-L1, A6).
// win32: `taskkill /pid <pid> /T /F`. posix: children lead their own process group (detached),
// so the group gets SIGTERM, then SIGKILL after a grace period.
import { spawn, type ChildProcess, type SpawnOptions } from 'node:child_process';
import { readdirSync, readFileSync } from 'node:fs';

const tracked = new Map<number, ChildProcess>();

/** Spawn with an argument array (never a shell), hidden window, own process group on posix. PID is tracked until exit. */
export function spawnTracked(cmd: string, args: readonly string[], opts: SpawnOptions = {}): ChildProcess {
  const child = spawn(cmd, [...args], {
    ...opts,
    shell: false,
    windowsHide: true,
    detached: process.platform !== 'win32',
  });
  const pid = child.pid;
  if (pid !== undefined) {
    tracked.set(pid, child);
    const drop = (): void => {
      tracked.delete(pid);
    };
    child.once('exit', drop);
    child.once('error', drop);
  }
  return child;
}

export function trackedPids(): number[] {
  return [...tracked.keys()];
}

/** Linux: state and process group from /proc/<pid>/stat (null when gone). A zombie counts as gone. */
function procStat(pid: number | string): { state: string; pgrp: number } | null {
  try {
    const s = readFileSync(`/proc/${pid}/stat`, 'utf8');
    const rest = s.slice(s.lastIndexOf(')') + 2).split(' ');
    return { state: rest[0] ?? '', pgrp: Number(rest[2]) };
  } catch {
    return null;
  }
}

const hasProc = process.platform === 'linux';

function signalAlive(target: number): boolean {
  try {
    process.kill(target, 0);
    return true;
  } catch (e) {
    return (e as NodeJS.ErrnoException).code === 'EPERM';
  }
}

/** True when pid is running (not a zombie waiting to be reaped). */
export function isProcessAlive(pid: number): boolean {
  if (hasProc) {
    const st = procStat(pid);
    return st !== null && st.state !== 'Z' && st.state !== 'X';
  }
  return signalAlive(pid);
}

/** posix: any live (non-zombie) member left in the process group led by pid. */
function groupAlive(pid: number): boolean {
  if (!signalAlive(-pid)) return false;
  if (!hasProc) return true;
  let entries: string[];
  try {
    entries = readdirSync('/proc');
  } catch {
    return true;
  }
  for (const e of entries) {
    if (e.charCodeAt(0) < 48 || e.charCodeAt(0) > 57) continue;
    const st = procStat(e);
    if (st && st.pgrp === pid && st.state !== 'Z' && st.state !== 'X') return true;
  }
  return false;
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function signalGroup(pid: number, sig: NodeJS.Signals): void {
  try {
    process.kill(-pid, sig);
  } catch {
    // group already gone; fall back to the pid itself
    try {
      process.kill(pid, sig);
    } catch {
      /* already gone */
    }
  }
}

function taskkill(pid: number): Promise<void> {
  return new Promise((resolve) => {
    const k = spawn('taskkill', ['/pid', String(pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore', shell: false });
    k.once('exit', () => resolve());
    k.once('error', () => resolve());
  });
}

/**
 * Kill pid and all its descendants. Resolves once the tree is gone or `timeoutMs` has passed.
 * posix: SIGTERM to the group, SIGKILL after `graceMs`.
 */
export async function treeKill(pid: number, opts: { graceMs?: number; timeoutMs?: number } = {}): Promise<void> {
  const graceMs = opts.graceMs ?? 1000;
  const timeoutMs = Math.max(opts.timeoutMs ?? 2000, graceMs);
  if (process.platform === 'win32') {
    await taskkill(pid);
    return;
  }
  const alive = (): boolean => groupAlive(pid) || isProcessAlive(pid);
  if (!alive()) return;
  signalGroup(pid, 'SIGTERM');
  const start = Date.now();
  let killed = false;
  while (alive()) {
    const t = Date.now() - start;
    if (!killed && t >= graceMs) {
      signalGroup(pid, 'SIGKILL');
      killed = true;
    }
    if (t >= timeoutMs) {
      signalGroup(pid, 'SIGKILL');
      return;
    }
    await sleep(25);
  }
}

/** For app quit: kill every tracked tree. Resolves within roughly `timeoutMs`. */
export async function killAllTracked(timeoutMs = 2000): Promise<void> {
  const pids = trackedPids();
  await Promise.all(pids.map((pid) => treeKill(pid, { graceMs: Math.min(1000, timeoutMs / 2), timeoutMs })));
  for (const pid of pids) tracked.delete(pid);
}
