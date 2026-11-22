// Setup check. Spec: PRD.md R0.3, test-contract AC-S0.2a/b, B8. Owner: T3.
import { execFile } from 'node:child_process';
import { existsSync, promises as fsp } from 'node:fs';
import { dirname, parse, win32 } from 'node:path';
import type { Engine, ProbeResult } from '../../shared/engine';
import type { SetupItem, SetupReport } from '../../shared/types';

export const MIN_GIT = [2, 40] as const;
export const MIN_FREE_BYTES = 2 * 1024 ** 3;
const CMD_TIMEOUT_MS = 10_000;
const PROBE_TIMEOUT_MS = 60_000;

export interface CmdResult { ok: boolean; stdout: string; stderr: string }
export type RunCmd = (file: string, args: string[], timeoutMs: number) => Promise<CmdResult>;

export interface ResolvedCommand { file: string; args: string[]; verbatim: boolean }

const SAFE_ARG = /^[A-Za-z0-9._=:\/-]+$/;

/**
 * How to run `name args` without a shell. Posix: by name through PATH. Windows: search PATH with
 * PATHEXT like a shell does; an .exe/.com runs directly, a .cmd/.bat shim runs via `cmd.exe /d /s /c`
 * (Node refuses to spawn those directly). Only fixed, plain arguments may go through cmd.exe.
 */
export function resolveCommand(
  name: string, args: string[], env: NodeJS.ProcessEnv = process.env,
  platform: NodeJS.Platform = process.platform, exists: (f: string) => boolean = existsSync,
  baseEnv: NodeJS.ProcessEnv = process.env,
): ResolvedCommand {
  if (platform !== 'win32') return { file: name, args, verbatim: false };
  const pathVar = env.PATH ?? env.Path ?? '';
  const exts = (env.PATHEXT ?? '.COM;.EXE;.BAT;.CMD').split(';').filter(Boolean);
  for (const dir of pathVar.split(';').filter(Boolean)) {
    for (const ext of exts) {
      const f = win32.join(dir, name + ext);
      if (!exists(f)) continue;
      if (/\.(cmd|bat)$/i.test(f)) {
        if (!args.every((a) => SAFE_ARG.test(a))) throw new Error(`unsafe argument for ${name}`);
        return { file: comSpec(env, baseEnv), args: ['/d', '/s', '/c', `""${f}" ${args.join(' ')}"`], verbatim: true };
      }
      return { file: f, args, verbatim: false };
    }
  }
  return { file: name, args, verbatim: false };
}

/** cmd.exe by full path: caller ComSpec, else the app's ComSpec, else <SystemRoot>\\System32\\cmd.exe. */
function comSpec(env: NodeJS.ProcessEnv, baseEnv: NodeJS.ProcessEnv): string {
  return env.ComSpec ?? baseEnv.ComSpec
    ?? win32.join(env.SystemRoot ?? baseEnv.SystemRoot ?? 'C:\\Windows', 'System32', 'cmd.exe');
}

/** The child env: the caller's env, plus SystemRoot and ComSpec from the app env on Windows when missing. */
export function spawnEnv(
  env: NodeJS.ProcessEnv, platform: NodeJS.Platform = process.platform, baseEnv: NodeJS.ProcessEnv = process.env,
): NodeJS.ProcessEnv {
  if (platform !== 'win32') return env;
  const out: NodeJS.ProcessEnv = { ...env };
  for (const k of ['SystemRoot', 'ComSpec'] as const) {
    if (out[k] === undefined && baseEnv[k] !== undefined) out[k] = baseEnv[k];
  }
  return out;
}

/** Runs a binary with an argument array (never a shell string with user text), hidden window, with a timeout. */
export function makeRunCmd(env: NodeJS.ProcessEnv = process.env): RunCmd {
  return (name, argv, timeoutMs) => new Promise((resolve) => {
    let cmd: ResolvedCommand;
    try { cmd = resolveCommand(name, argv, env); } catch (e) {
      resolve({ ok: false, stdout: '', stderr: String(e) });
      return;
    }
    execFile(cmd.file, cmd.args, {
      env: spawnEnv(env), timeout: timeoutMs, windowsHide: true, windowsVerbatimArguments: cmd.verbatim,
      encoding: 'utf8', maxBuffer: 1024 * 1024,
    }, (err, stdout, stderr) => resolve({ ok: !err, stdout: String(stdout ?? ''), stderr: String(stderr ?? '') }));
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
