// Setup check. Spec: PRD.md R0.3, test-contract AC-S0.2a/b, B8. Owner: T3.
import { execFile } from 'node:child_process';
import { existsSync, promises as fsp } from 'node:fs';
import { dirname, parse } from 'node:path';
import type { Engine, ProbeResult } from '../../shared/engine';
import type { SetupItem, SetupReport } from '../../shared/types';

export const MIN_GIT = [2, 40] as const;
export const MIN_FREE_BYTES = 2 * 1024 ** 3;
const CMD_TIMEOUT_MS = 10_000;
const PROBE_TIMEOUT_MS = 60_000;

export interface CmdResult { ok: boolean; stdout: string; stderr: string }
export type RunCmd = (file: string, args: string[], timeoutMs: number) => Promise<CmdResult>;

/** Runs a binary with an argument array (never a shell string), hidden window, with a timeout. */
export function makeRunCmd(env: NodeJS.ProcessEnv = process.env): RunCmd {
  return (file, args, timeoutMs) => new Promise((resolve) => {
    execFile(file, args, { env, timeout: timeoutMs, windowsHide: true, encoding: 'utf8', maxBuffer: 1024 * 1024 },
      (err, stdout, stderr) => resolve({ ok: !err, stdout: String(stdout ?? ''), stderr: String(stderr ?? '') }));
  });
}

/** "git version 2.43.0.windows.1" -> [2, 43]; null when unreadable. */
export function parseGitVersion(out: string): [number, number] | null {
  const m = /git version (\d+)\.(\d+)/.exec(out);
  return m ? [Number(m[1]), Number(m[2])] : null;
}

export function gitVersionOk(v: [number, number]): boolean {
  return v[0] > MIN_GIT[0] || (v[0] === MIN_GIT[0] && v[1] >= MIN_GIT[1]);
}

function withTimeout<T>(p: Promise<T>, ms: number, fallback: T): Promise<T> {
  return new Promise((resolve) => {
    const t = setTimeout(() => resolve(fallback), ms);
    p.then((v) => { clearTimeout(t); resolve(v); }, () => { clearTimeout(t); resolve(fallback); });
  });
}

/** Free bytes on the drive holding `dir` (walks up to the nearest folder that exists). */
export async function freeBytes(dir: string): Promise<number | null> {
  let d = dir;
  while (!existsSync(d) && dirname(d) !== d) d = dirname(d);
  try {
    const s = await fsp.statfs(d);
    return Number(s.bavail) * Number(s.bsize);
  } catch {
    return null;
  }
}

/** "C:" on Windows, "/" elsewhere: the drive named in setup.fix.disk. */
export function driveOf(dir: string, platform: NodeJS.Platform = process.platform): string {
  if (platform === 'win32') {
    const m = /^([a-zA-Z]:)/.exec(dir);
    return m ? m[1]!.toUpperCase() : dir;
  }
  return parse(dir).root || '/';
}

export interface SetupCheckerOpts {
  engine: Pick<Engine, 'probe'> | (() => Pick<Engine, 'probe'>);
  dataDir: string;
  runCmd?: RunCmd;
  freeBytes?: (dir: string) => Promise<number | null>;
  now?: () => number;
}

export interface SetupChecker {
  /** Cached report unless `force` or never run. The signed-in probe runs once per start and on force. */
  check(force?: boolean): Promise<SetupReport>;
  last(): SetupReport | null;
}

const NOT_INSTALLED: ProbeResult = { installed: false, version: null, signedIn: null, supportsStreamJson: null };

export function createSetupChecker(opts: SetupCheckerOpts): SetupChecker {
  const runCmd = opts.runCmd ?? makeRunCmd();
  const getFree = opts.freeBytes ?? freeBytes;
  const now = opts.now ?? Date.now;
  let cached: SetupReport | null = null;
  let inflight: Promise<SetupReport> | null = null;

  const engine = (): Pick<Engine, 'probe'> | null => {
    try { return typeof opts.engine === 'function' ? opts.engine() : opts.engine; } catch { return null; }
  };

  async function claudeItems(): Promise<SetupItem[]> {
    const eng = engine();
    const base = eng ? await withTimeout(eng.probe(), PROBE_TIMEOUT_MS, NOT_INSTALLED) : NOT_INSTALLED;
    if (!base.installed) {
      return [
        { id: 'claude', status: 'missing', fixKey: 'setup.fix.claude', detail: null },
        { id: 'claude_signed_in', status: 'missing', fixKey: 'setup.fix.claude_signed_in', detail: null },
      ];
    }
    const claude: SetupItem = base.supportsStreamJson === false
      ? { id: 'claude', status: 'missing', fixKey: 'setup.fix.claude_update', detail: base.version } // B8
      : { id: 'claude', status: 'ok', fixKey: null, detail: base.version };
    const signed = await withTimeout(eng!.probe({ signedIn: true }), PROBE_TIMEOUT_MS, { ...base, signedIn: false });
    const signedIn: SetupItem = signed.signedIn === true
      ? { id: 'claude_signed_in', status: 'ok', fixKey: null, detail: null }
      : { id: 'claude_signed_in', status: 'missing', fixKey: 'setup.fix.claude_signed_in', detail: null };
    return [claude, signedIn];
  }

  async function gitItem(): Promise<SetupItem> {
    const r = await runCmd('git', ['--version'], CMD_TIMEOUT_MS);
    const v = r.ok ? parseGitVersion(r.stdout) : null;
    if (!v) return { id: 'git', status: 'missing', fixKey: 'setup.fix.git', detail: null };
    const detail = `${v[0]}.${v[1]}`;
    return gitVersionOk(v)
      ? { id: 'git', status: 'ok', fixKey: null, detail }
      : { id: 'git', status: 'missing', fixKey: 'setup.fix.git', detail };
  }

  async function ghItem(): Promise<SetupItem> {
    const r = await runCmd('gh', ['auth', 'status'], CMD_TIMEOUT_MS);
    return r.ok
      ? { id: 'gh', status: 'ok', fixKey: null, detail: null }
      : { id: 'gh', status: 'warn', fixKey: 'setup.fix.gh', detail: null };
  }

  async function diskItem(): Promise<SetupItem> {
    const free = await getFree(opts.dataDir);
    const drive = driveOf(opts.dataDir);
    if (free == null) return { id: 'disk', status: 'warn', fixKey: 'setup.fix.disk', detail: null, drive };
    const detail = `${(free / 1024 ** 3).toFixed(1)} GB`;
    return free >= MIN_FREE_BYTES
      ? { id: 'disk', status: 'ok', fixKey: null, detail, drive }
      : { id: 'disk', status: 'warn', fixKey: 'setup.fix.disk', detail, drive };
  }

  async function run(): Promise<SetupReport> {
    const [claude, git, gh, disk] = await Promise.all([claudeItems(), gitItem(), ghItem(), diskItem()]);
    const items = [...claude, git, gh, disk];
    const ok = (id: SetupItem['id']): boolean => items.find((i) => i.id === id)?.status === 'ok';
    return { items, canStart: ok('claude') && ok('claude_signed_in') && ok('git'), checkedAt: now() };
  }

  return {
    check(force = false) {
      if (cached && !force) return Promise.resolve(cached);
      if (inflight) return inflight;
      inflight = run().then((r) => { cached = r; return r; }).finally(() => { inflight = null; });
      return inflight;
    },
    last: () => cached,
  };
}
