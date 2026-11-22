// Numbers where nothing is visible, measured on this machine at the base sha and the head sha:
// renderer bundle size (gzip KB), unit test wall time (ms), and cold start to Home visible (ms, median of 3,
// Playwright _electron on the built app with ORCHESTRA_DATA_DIR in a fresh temp folder).
// Usage: node tools/evidence/numbers.mjs --base <sha> --head <sha> --out <dir>
import { mkdirSync, writeFileSync, readFileSync, readdirSync, statSync, mkdtempSync, rmSync, existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { gzipSync } from 'node:zlib';
import { tmpdir } from 'node:os';
import { join, delimiter } from 'node:path';
import { createRequire } from 'node:module';
import { parseArgs } from 'node:util';
import { _electron } from '@playwright/test';
import { median } from './lib.mjs';
import { addWorktree, removeWorktree } from './worktree.mjs';

const { values: a } = parseArgs({ options: { base: { type: 'string' }, head: { type: 'string' }, out: { type: 'string' } } });
const out = a.out ?? 'evidence-out';
mkdirSync(out, { recursive: true });
const electronPath = createRequire(import.meta.url)('electron');
const HOME = '[data-testid="home-composer"]';
// Without a Claude CLI (the CI runner, or here) the setup check can swap Home for Setup before Home paints,
// so the clock stops at the first app screen and the screen that appeared is recorded.
const SETUP = '[data-testid="setup-check"]';

const node = (dir, args) => {
  const t0 = performance.now();
  const r = spawnSync(process.execPath, args, { cwd: dir, encoding: 'utf8', env: { ...process.env, CI: '1' } });
  return { ok: r.status === 0, ms: performance.now() - t0, log: `${r.stdout ?? ''}${r.stderr ?? ''}` };
};

function gzipKB(dir) {
  let bytes = 0;
  const walk = (d) => { for (const f of readdirSync(d)) { const p = join(d, f); if (statSync(p).isDirectory()) walk(p); else if (/\.(js|css|html)$/.test(f)) bytes += gzipSync(readFileSync(p), { level: 9 }).length; } };
  walk(dir);
  return Math.round((bytes / 1024) * 10) / 10;
}

/** PATH without the Claude CLI, so launching the app can never reach a real model (cloud rule; D9). */
function pathWithoutClaude() {
  const parts = (process.env.PATH ?? '').split(delimiter);
  return parts.filter((p) => !['claude', 'claude.cmd', 'claude.exe'].some((n) => existsSync(join(p, n)))).join(delimiter);
}

async function coldStart(dir) {
  const runs = [];
  const screens = new Set();
  let note = '';
  for (let i = 0; i < 3; i++) {
    const data = mkdtempSync(join(tmpdir(), 'evidence-data-'));
    const args = [dir, ...(process.platform === 'linux' ? ['--no-sandbox'] : [])];
    const t0 = performance.now();
    let app;
    try {
      app = await _electron.launch({ executablePath: electronPath, args, cwd: dir, env: { ...process.env, PATH: pathWithoutClaude(), ORCHESTRA_DATA_DIR: data }, timeout: 60000 });
      const win = await app.firstWindow();
      await win.waitForSelector(`${HOME}, ${SETUP}`, { state: 'visible', timeout: 30000 });
      runs.push(Math.round(performance.now() - t0));
      screens.add((await win.$(HOME)) ? 'Home' : 'Setup');
    } catch (e) {
      note = `run ${i + 1}: ${String(e.message ?? e).split('\n')[0]}`;
    } finally {
      await app?.close().catch(() => undefined);
      rmSync(data, { recursive: true, force: true });
    }
    if (!runs.length) break; // Home never showed on the first try: this sha has no Home to time
  }
  return { ms: runs.length ? median(runs) : null, runs, note, screens: [...screens] };
}

const result = { base: a.base, head: a.head, bundleGzipKB: {}, unitMs: {}, coldStartMs: { runs: {} }, unitOk: {}, notes: [] };
for (const [side, sha] of [['base', a.base], ['head', a.head]]) {
  const dir = addWorktree(sha, `n-${sha.slice(0, 7)}`);
  try {
    const main = node(dir, ['node_modules/typescript/bin/tsc', '-p', 'tsconfig.main.json']);
    const rend = node(dir, ['node_modules/vite/bin/vite.js', 'build']);
    if (rend.ok) result.bundleGzipKB[side] = gzipKB(join(dir, 'out/renderer'));
    else { result.bundleGzipKB[side] = null; result.notes.push(`renderer build failed at ${side}`); }
    const unit = node(dir, ['node_modules/vitest/vitest.mjs', 'run']);
    result.unitMs[side] = Math.round(unit.ms);
    result.unitOk[side] = unit.ok;
    if (!unit.ok) result.notes.push(`unit tests were red at ${side}; time still measured`);
    if (main.ok && rend.ok) {
      const c = await coldStart(dir);
      result.coldStartMs[side] = c.ms;
      result.coldStartMs.runs[side] = c.runs;
      result.coldStartMs.screens = { ...result.coldStartMs.screens, [side]: c.screens };
      if (c.screens.includes('Setup')) result.notes.push(`cold start at ${side}: first screen was ${c.screens.join(' / ')} (no Claude CLI on the runner)`);
      if (c.ms === null) result.notes.push(`cold start n/a at ${side}: no Home or Setup screen became visible — ${c.note}`);
      else if (c.note) result.notes.push(`cold start at ${side}: ${c.runs.length} of 3 runs timed (${c.note})`);
    } else {
      result.coldStartMs[side] = null;
      result.notes.push(`cold start n/a at ${side}: app did not build`);
    }
  } finally {
    removeWorktree(dir);
  }
  console.log(`numbers ${side} ${sha.slice(0, 7)}: bundle ${result.bundleGzipKB[side]} KB gz, unit ${result.unitMs[side]} ms, cold start ${result.coldStartMs[side]} ms`);
}
writeFileSync(join(out, 'numbers.json'), JSON.stringify(result, null, 2));
