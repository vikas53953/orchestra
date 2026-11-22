// Find the Claude Code CLI to spawn (architecture.md §4, §10). Never routes user text through cmd.exe:
// on Windows a `claude.cmd` npm shim is replaced by what it points to: the package's "bin" entry (an .exe runs
// directly, a .js runs through node), else the target written in the shim, else the known layouts.
import { execFile } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { win32 } from 'node:path';

export interface ResolvedCli {
  cmd: string;
  /** args placed before Claude Code's own args (e.g. the cli.js path when run through node) */
  prefixArgs: string[];
}

export interface ResolveDeps {
  platform: NodeJS.Platform;
  /** lines printed by `where claude` (win32) — empty when not found */
  where: (name: string) => Promise<string[]>;
  exists: (p: string) => boolean;
  /** file text, or null when it can't be read */
  readText: (p: string) => string | null;
  /** a node binary to run JS entry points with */
  node: string;
}

function whereDefault(name: string): Promise<string[]> {
  return new Promise((resolve) => {
    execFile('where', [name], { windowsHide: true, timeout: 10_000 }, (err, stdout) => {
      if (err) return resolve([]);
      resolve(String(stdout).split(/\r?\n/).map((s) => s.trim()).filter(Boolean));
    });
  });
}

export const defaultResolveDeps: ResolveDeps = {
  platform: process.platform,
  where: whereDefault,
  exists: existsSync,
  readText: (p) => { try { return readFileSync(p, 'utf8'); } catch { return null; } },
  node: 'node',
};

const JS_ENTRY = /\.(c|m)?js$/i;

function nodeFor(shimDir: string, deps: ResolveDeps): string {
  const local = win32.join(shimDir, 'node.exe');
  return deps.exists(local) ? local : deps.node;
}

/** Where an npm `claude.cmd` shim can lead, most specific first. Every path stays inside the shim's folder. */
function shimTargets(shim: string, deps: ResolveDeps): string[] {
  const { dirname, join, resolve, relative, isAbsolute } = win32;
  const dir = dirname(shim);
  const pkg = join(dir, 'node_modules', '@anthropic-ai', 'claude-code');
  const inside = (base: string, p: string) => { const r = relative(base, p); return !!r && !r.startsWith('..') && !isAbsolute(r); };
  const out: string[] = [];
  const json = deps.readText(join(pkg, 'package.json'));
  if (json) {
    try {
      const bin: unknown = (JSON.parse(json) as { bin?: unknown }).bin;
      const rel = typeof bin === 'string' ? bin : bin && typeof bin === 'object' ? (bin as Record<string, unknown>).claude : undefined;
      if (typeof rel === 'string') { const p = resolve(pkg, rel); if (inside(pkg, p)) out.push(p); }
    } catch { /* unreadable package.json: try the shim and known layouts */ }
  }
  const text = deps.readText(shim);
  const m = text?.match(/"%~?dp0%?\\([^"%\r\n]+\.(?:exe|c?m?js))"/i);
  if (m?.[1]) { const p = resolve(dir, m[1]); if (inside(dir, p)) out.push(p); }
  out.push(join(pkg, 'bin', 'claude.exe'), join(pkg, 'cli.js'));
  return [...new Set(out)];
}

export async function resolveClaudeCli(env: NodeJS.ProcessEnv, deps: ResolveDeps = defaultResolveDeps): Promise<ResolvedCli> {
  const win = deps.platform === 'win32';
  const override = env.ORCHESTRA_CLAUDE_BIN?.trim();
  if (override) {
    if (JS_ENTRY.test(override)) return { cmd: deps.node, prefixArgs: [override] };
    return { cmd: override, prefixArgs: [] };
  }
  if (!win) return { cmd: 'claude', prefixArgs: [] };

  const { dirname, join } = win32;
  const found = await deps.where('claude');
  const exe = found.find((p) => /\.exe$/i.test(p));
  if (exe) return { cmd: exe, prefixArgs: [] };
  for (const shim of found.filter((p) => /\.cmd$/i.test(p))) {
    const dir = dirname(shim);
    for (const target of shimTargets(shim, deps)) {
      if (!deps.exists(target)) continue;
      return JS_ENTRY.test(target) ? { cmd: nodeFor(dir, deps), prefixArgs: [target] } : { cmd: target, prefixArgs: [] };
    }
  }
  // Native installer default location, when PATH has not been refreshed yet.
  const home = env.USERPROFILE;
  if (home) {
    const native = join(home, '.local', 'bin', 'claude.exe');
    if (deps.exists(native)) return { cmd: native, prefixArgs: [] };
  }
  // Nothing found: spawning this fails with ENOENT, which classifies as not_installed.
  return { cmd: 'claude.exe', prefixArgs: [] };
}
