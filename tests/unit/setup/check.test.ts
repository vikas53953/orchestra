import { afterEach, describe, expect, it } from 'vitest';
import { chmodSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  createSetupChecker, driveOf, makeRunCmd, parseGitVersion, gitVersionOk,
} from '../../../apps/desktop/src/main/setup/check';
import type { ProbeResult } from '../../../apps/desktop/src/shared/engine';
import { COPY } from '../../../apps/desktop/src/shared/copy';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const dirs: string[] = [];
afterEach(() => { for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true }); });

/** A PATH folder holding only the fake binaries we ask for. */
function fakeBin(bins: Record<string, string>): string {
  const d = mkdtempSync(join(tmpdir(), 'orch-bin-'));
  dirs.push(d);
  for (const [name, script] of Object.entries(bins)) {
    const p = join(d, name);
    writeFileSync(p, `#!/bin/sh\n${script}\n`);
    chmodSync(p, 0o755);
  }
  return d;
}

function fakeEngine(base: ProbeResult, signedIn: boolean) {
  const calls: Array<{ signedIn?: boolean } | undefined> = [];
  return {
    calls,
    probe: async (o?: { signedIn?: boolean }): Promise<ProbeResult> => {
      calls.push(o);
      await sleep(200);
      return o?.signedIn ? { ...base, signedIn } : base;
    },
  };
}

const INSTALLED: ProbeResult = { installed: true, version: '2.1.0', signedIn: null, supportsStreamJson: true };
const BIG = async () => 50 * 1024 ** 3;

describe('setup check', () => {
  it('AC-S0.2a claude missing -> Install Claude Code fix key and canStart false', async () => {
    const path = fakeBin({ git: 'echo "git version 2.45.1"', gh: 'exit 0' });
    const eng = fakeEngine({ installed: false, version: null, signedIn: null, supportsStreamJson: null }, false);
    const c = createSetupChecker({ engine: eng, dataDir: '/tmp', runCmd: makeRunCmd({ PATH: path }), freeBytes: BIG });
    const r = await c.check();
    const claude = r.items.find((i) => i.id === 'claude')!;
    expect(claude.status).toBe('missing');
    expect(claude.fixKey).toBe('setup.fix.claude');
    expect(COPY[claude.fixKey as keyof typeof COPY]).toBe('Install Claude Code, then run `claude` once to sign in.');
    expect(r.canStart).toBe(false);
  });

  it('AC-S0.2b all tools present -> every item ok and canStart true', async () => {
    const path = fakeBin({ git: 'echo "git version 2.45.1.windows.1"', gh: 'echo "Logged in"; exit 0' });
    const eng = fakeEngine(INSTALLED, true);
    const c = createSetupChecker({ engine: eng, dataDir: '/tmp', runCmd: makeRunCmd({ PATH: path }), freeBytes: BIG });
    const r = await c.check();
    expect(r.items.map((i) => [i.id, i.status])).toEqual([
      ['claude', 'ok'], ['claude_signed_in', 'ok'], ['git', 'ok'], ['gh', 'ok'], ['disk', 'ok'],
    ]);
    expect(r.canStart).toBe(true);
    expect(r.items.find((i) => i.id === 'disk')?.drive).toBe('/');
  });

  it('not signed in blocks; gh missing and low disk only warn', async () => {
    const path = fakeBin({ git: 'echo "git version 2.40.0"' });
    const c = createSetupChecker({
      engine: fakeEngine(INSTALLED, false), dataDir: '/tmp', runCmd: makeRunCmd({ PATH: path }),
      freeBytes: async () => 1024 ** 3,
    });
    const r = await c.check();
    const by = Object.fromEntries(r.items.map((i) => [i.id, i]));
    expect(by.claude_signed_in).toMatchObject({ status: 'missing', fixKey: 'setup.fix.claude_signed_in' });
    expect(by.gh).toMatchObject({ status: 'warn', fixKey: 'setup.fix.gh' });
    expect(by.disk).toMatchObject({ status: 'warn', fixKey: 'setup.fix.disk', detail: '1.0 GB', drive: '/' });
    expect(by.git?.status).toBe('ok');
    expect(r.canStart).toBe(false);
  });

  it('git older than 2.40 or missing blocks with setup.fix.git', async () => {
    const old = createSetupChecker({
      engine: fakeEngine(INSTALLED, true), dataDir: '/tmp',
      runCmd: makeRunCmd({ PATH: fakeBin({ git: 'echo "git version 2.39.9"', gh: 'exit 0' }) }), freeBytes: BIG,
    });
    const r1 = await old.check();
    expect(r1.items.find((i) => i.id === 'git')).toMatchObject({ status: 'missing', fixKey: 'setup.fix.git', detail: '2.39' });
    expect(r1.canStart).toBe(false);
    const none = createSetupChecker({
      engine: fakeEngine(INSTALLED, true), dataDir: '/tmp',
      runCmd: makeRunCmd({ PATH: fakeBin({ gh: 'exit 0' }) }), freeBytes: BIG,
    });
    expect((await none.check()).items.find((i) => i.id === 'git')?.status).toBe('missing');
  });

  it('B8 old Claude Code without stream-json -> setup.fix.claude_update', async () => {
    const c = createSetupChecker({
      engine: fakeEngine({ ...INSTALLED, supportsStreamJson: false }, true), dataDir: '/tmp',
      runCmd: makeRunCmd({ PATH: fakeBin({ git: 'echo "git version 2.45.0"', gh: 'exit 0' }) }), freeBytes: BIG,
    });
    const r = await c.check();
    expect(r.items.find((i) => i.id === 'claude')).toMatchObject({ status: 'missing', fixKey: 'setup.fix.claude_update' });
    expect(r.canStart).toBe(false);
  });

  it('caches the report; the signed-in probe runs once per start and again on force', async () => {
    const eng = fakeEngine(INSTALLED, true);
    const c = createSetupChecker({
      engine: eng, dataDir: '/tmp',
      runCmd: makeRunCmd({ PATH: fakeBin({ git: 'echo "git version 2.45.0"', gh: 'exit 0' }) }), freeBytes: BIG,
    });
    const a = await c.check();
    const b = await c.check();
    expect(b).toBe(a);
    expect(eng.calls.filter((x) => x?.signedIn).length).toBe(1);
    await c.check(true);
    expect(eng.calls.filter((x) => x?.signedIn).length).toBe(2);
  });

  it('an engine factory that throws counts as claude missing', async () => {
    const c = createSetupChecker({
      engine: () => { throw new Error('no engine'); }, dataDir: '/tmp',
      runCmd: makeRunCmd({ PATH: fakeBin({ git: 'echo "git version 2.45.0"', gh: 'exit 0' }) }), freeBytes: BIG,
    });
    expect((await c.check()).items[0]).toMatchObject({ id: 'claude', status: 'missing' });
  });

  it('helpers: git version parse and drive name', () => {
    expect(parseGitVersion('git version 2.43.0.windows.1')).toEqual([2, 43]);
    expect(parseGitVersion('nope')).toBeNull();
    expect(gitVersionOk([3, 0])).toBe(true);
    expect(gitVersionOk([2, 39])).toBe(false);
    expect(driveOf('d:\\Users\\x\\AppData', 'win32')).toBe('D:');
    expect(driveOf('/home/x', 'linux')).toBe('/');
  });
});
