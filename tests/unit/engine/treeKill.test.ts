import { describe, it, expect } from 'vitest';
import { spawnTracked, treeKill, killAllTracked, trackedPids, isProcessAlive } from '../../../apps/desktop/src/main/process/treeKill';

// zombies waiting for init to reap them count as gone
const alive = isProcessAlive;

/** Spawns node that spawns a grandchild ignoring SIGTERM; resolves with [childPid, grandchildPid]. */
function spawnFamily(): Promise<[number, number]> {
  const script = `
    const { spawn } = require('node:child_process');
    const g = spawn(process.execPath, ['-e', "process.on('SIGTERM',()=>{}); setInterval(()=>{},1000)"], { stdio: 'ignore' });
    process.stdout.write(String(g.pid) + '\\n');
    setInterval(() => {}, 1000);
  `;
  const child = spawnTracked(process.execPath, ['-e', script], { stdio: ['ignore', 'pipe', 'ignore'] });
  return new Promise((resolve) => {
    child.stdout!.once('data', (d: Buffer) => resolve([child.pid!, Number(String(d).trim())]));
  });
}

async function waitGone(pids: number[], ms: number): Promise<boolean> {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if (pids.every((p) => !alive(p))) return true;
    await new Promise((r) => setTimeout(r, 25));
  }
  return pids.every((p) => !alive(p));
}

describe.skipIf(process.platform === 'win32')('treeKill (posix)', () => {
  it('AC-L1 kills a child and its SIGTERM-ignoring grandchild within 2 s', async () => {
    const [c, g] = await spawnFamily();
    expect(alive(c) && alive(g)).toBe(true);
    const t0 = Date.now();
    await treeKill(c);
    expect(await waitGone([c, g], 2000 - (Date.now() - t0))).toBe(true);
  });

  it('A6 killAllTracked leaves nothing after 2 s', async () => {
    const fams = await Promise.all([spawnFamily(), spawnFamily()]);
    expect(trackedPids().length).toBeGreaterThanOrEqual(2);
    const t0 = Date.now();
    await killAllTracked(2000);
    expect(Date.now() - t0).toBeLessThan(2200);
    expect(await waitGone(fams.flat(), 100)).toBe(true);
    expect(trackedPids()).toEqual([]);
  });

  it('is a no-op for a pid that is already gone', async () => {
    const child = spawnTracked(process.execPath, ['-e', '0'], { stdio: 'ignore' });
    await new Promise((r) => child.once('exit', r));
    await expect(treeKill(child.pid!)).resolves.toBeUndefined();
  });
});
