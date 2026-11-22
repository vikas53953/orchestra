// Find the Claude Code CLI to spawn (architecture.md §4, §10). Never routes user text through cmd.exe:
// on Windows a `claude.cmd` npm shim is replaced by `node <cli.js>` from the package it points to.
import { execFile } from 'node:child_process';
import { existsSync } from 'node:fs';
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
  node: 'node',
};

const JS_ENTRY = /\.(c|m)?js$/i;

function nodeFor(shimDir: string, deps: ResolveDeps): string {
  const local = win32.join(shimDir, 'node.exe');
  return deps.exists(local) ? local : deps.node;
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
    const cli = join(dir, 'node_modules', '@anthropic-ai', 'claude-code', 'cli.js');
    if (deps.exists(cli)) return { cmd: nodeFor(dir, deps), prefixArgs: [cli] };
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
