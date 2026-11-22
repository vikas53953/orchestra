// Detached git worktrees at a given sha, sharing this checkout's node_modules (junction on Windows).
import { execFileSync, spawn } from 'node:child_process';
import { mkdtempSync, rmSync, existsSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';

export const git = (args, opts = {}) => execFileSync('git', args, { encoding: 'utf8', ...opts });

export function addWorktree(sha, label) {
  const dir = mkdtempSync(join(tmpdir(), `evidence-${label}-`));
  git(['worktree', 'add', '--detach', '--force', dir, sha], { stdio: 'pipe' });
  const nm = join(process.cwd(), 'node_modules');
  if (existsSync(nm)) {
    if (process.platform === 'win32') execFileSync('cmd', ['/c', 'mklink', '/J', join(dir, 'node_modules'), nm], { stdio: 'pipe' });
    else execFileSync('ln', ['-s', nm, join(dir, 'node_modules')]);
  }
  return dir;
}

export function removeWorktree(dir) {
  try { git(['worktree', 'remove', '--force', dir], { stdio: 'pipe' }); } catch { /* already gone */ }
  rmSync(dir, { recursive: true, force: true });
}

export function readAt(dir, rel) {
  const p = join(dir, rel);
  return existsSync(p) ? readFileSync(p, 'utf8') : null;
}

/** Start the renderer's vite dev server in `dir` on `port`; resolves once it answers. */
export async function startVite(dir, port) {
  const serve = join(import.meta.dirname, 'vite-serve.mjs');
  const child = spawn(process.execPath, [serve, String(port), join(process.cwd(), 'node_modules')], { cwd: dir, stdio: ['ignore', 'pipe', 'pipe'] });
  let log = '';
  child.stdout.on('data', (d) => { log += d; });
  child.stderr.on('data', (d) => { log += d; });
  const url = `http://127.0.0.1:${port}/`;
  for (let i = 0; i < 120; i++) {
    if (child.exitCode !== null) throw new Error(`vite exited (${child.exitCode}): ${log.slice(-800)}`);
    try { if ((await fetch(url)).ok) return { url, stop: () => child.kill() }; } catch { /* not up yet */ }
    await sleep(500);
  }
  child.kill();
  throw new Error(`vite did not start in 60 s: ${log.slice(-800)}`);
}
