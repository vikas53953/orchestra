import { afterEach, describe, expect, it } from 'vitest';
import { chmodSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  createSetupChecker, driveOf, makeRunCmd, parseGitVersion, gitVersionOk, resolveCommand, spawnEnv,
} from '../../../apps/desktop/src/main/setup/check';
import type { ProbeResult } from '../../../apps/desktop/src/shared/engine';
import { COPY } from '../../../apps/desktop/src/shared/copy';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const dirs: string[] = [];
afterEach(() => { for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true }); });

interface FakeCmd { out?: string; code?: number }
/**
 * A PATH folder holding only the fake binaries we ask for: `#!/bin/sh` scripts on posix, `.cmd` files on
 * Windows (found through PATHEXT, as production resolves them).
 */
function fakeBin(bins: Record<string, FakeCmd>): string {
  const d = mkdtempSync(join(tmpdir(), 'orch-bin-'));
  dirs.push(d);
  for (const [name, { out, code = 0 }] of Object.entries(bins)) {
    if (process.platform === 'win32') {
      writeFileSync(join(d, `${name}.cmd`), `@echo off\r\n${out ? `echo ${out}\r\n` : ''}exit /b ${code}\r\n`);
    } else {
      const p = join(d, name);
      writeFileSync(p, `#!/bin/sh\n${out ? `echo "${out}"\n` : ''}exit ${code}\n`);
      chmodSync(p, 0o755);
    }
  }
  return d;
}
/** PATH plus PATHEXT, so the Windows resolver sees .CMD like a real shell would. */
const env = (path: string): NodeJS.ProcessEnv => ({ PATH: path, PATHEXT: '.COM;.EXE;.BAT;.CMD' });
const DATA = tmpdir();
const EXPECTED_DRIVE = process.platform === 'win32' ? DATA.slice(0, 2).toUpperCase() : '/';

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
    const path = fakeBin({ git: { out: 'git version 2.45.1' }, gh: { code: 0 } });
    const eng = fakeEngine({ installed: false, version: null, signedIn: null, supportsStreamJson: null }, false);
    const c = createSetupChecker({ engine: eng, dataDir: DATA, runCmd: makeRunCmd(env(path)), freeBytes: BIG });
    const r = await c.check();
    const claude = r.items.find((i) => i.id === 'claude')!;
    expect(claude.status).toBe('missing');
    expect(claude.fixKey).toBe('setup.fix.claude');
    expect(COPY[claude.fixKey as keyof typeof COPY]).toBe('Install Claude Code, then run `claude` once to sign in.');
    expect(r.canStart).toBe(false);
  });

  it('AC-S0.2b all tools present -> every item ok and canStart true', async () => {
    const path = fakeBin({ git: { out: 'git version 2.45.1.windows.1' }, gh: { out: 'Logged in' } });
    const eng = fakeEngine(INSTALLED, true);
    const c = createSetupChecker({ engine: eng, dataDir: DATA, runCmd: makeRunCmd(env(path)), freeBytes: BIG });
    const r = await c.check();
    expect(r.items.map((i) => [i.id, i.status])).toEqual([
      ['claude', 'ok'], ['claude_signed_in', 'ok'], ['git', 'ok'], ['gh', 'ok'], ['disk', 'ok'],
    ]);
    expect(r.canStart).toBe(true);
    expect(r.items.find((i) => i.id === 'disk')?.drive).toBe(EXPECTED_DRIVE);
  });

  it('not signed in blocks; gh missing and low disk only warn', async () => {
    const path = fakeBin({ git: { out: 'git version 2.40.0' } });
    const c = createSetupChecker({
      engine: fakeEngine(INSTALLED, false), dataDir: DATA, runCmd: makeRunCmd(env(path)),
      freeBytes: async () => 1024 ** 3,
    });
    const r = await c.check();
    const by = Object.fromEntries(r.items.map((i) => [i.id, i]));
    expect(by.claude_signed_in).toMatchObject({ status: 'missing', fixKey: 'setup.fix.claude_signed_in' });
    expect(by.gh).toMatchObject({ status: 'warn', fixKey: 'setup.fix.gh' });
    expect(by.disk).toMatchObject({ status: 'warn', fixKey: 'setup.fix.disk', detail: '1.0 GB', drive: EXPECTED_DRIVE });
    expect(by.git?.status).toBe('ok');
    expect(r.canStart).toBe(false);
  });

  it('git older than 2.40 or missing blocks with setup.fix.git', async () => {
    const old = createSetupChecker({
      engine: fakeEngine(INSTALLED, true), dataDir: DATA,
      runCmd: makeRunCmd(env(fakeBin({ git: { out: 'git version 2.39.9' }, gh: { code: 0 } }))), freeBytes: BIG,
    });
    const r1 = await old.check();
    expect(r1.items.find((i) => i.id === 'git')).toMatchObject({ status: 'missing', fixKey: 'setup.fix.git', detail: '2.39' });
    expect(r1.canStart).toBe(false);
    const none = createSetupChecker({
      engine: fakeEngine(INSTALLED, true), dataDir: DATA,
      runCmd: makeRunCmd(env(fakeBin({ gh: { code: 0 } }))), freeBytes: BIG,
    });
    expect((await none.check()).items.find((i) => i.id === 'git')?.status).toBe('missing');
  });

  it('B8 old Claude Code without stream-json -> setup.fix.claude_update', async () => {
    const c = createSetupChecker({
      engine: fakeEngine({ ...INSTALLED, supportsStreamJson: false }, true), dataDir: DATA,
      runCmd: makeRunCmd(env(fakeBin({ git: { out: 'git version 2.45.0' }, gh: { code: 0 } }))), freeBytes: BIG,
    });
    const r = await c.check();
    expect(r.items.find((i) => i.id === 'claude')).toMatchObject({ status: 'missing', fixKey: 'setup.fix.claude_update' });
    expect(r.canStart).toBe(false);
  });

  it('caches the report; the signed-in probe runs once per start and again on force', async () => {
    const eng = fakeEngine(INSTALLED, true);
    const c = createSetupChecker({
      engine: eng, dataDir: DATA,
      runCmd: makeRunCmd(env(fakeBin({ git: { out: 'git version 2.45.0' }, gh: { code: 0 } }))), freeBytes: BIG,
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
      engine: () => { throw new Error('no engine'); }, dataDir: DATA,
      runCmd: makeRunCmd(env(fakeBin({ git: { out: 'git version 2.45.0' }, gh: { code: 0 } }))), freeBytes: BIG,
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

  it('win32: commands resolve through PATH + PATHEXT; .exe runs directly, a .cmd shim runs via cmd.exe', () => {
    const env = { PATH: 'C:\\a;C:\\b', PATHEXT: '.COM;.EXE;.BAT;.CMD' };
    const exe = resolveCommand('git', ['--version'], env, 'win32', (f) => f === 'C:\\b\\git.EXE');
    expect(exe).toEqual({ file: 'C:\\b\\git.EXE', args: ['--version'], verbatim: false });
    const cmd = resolveCommand('gh', ['auth', 'status'], env, 'win32', (f) => f === 'C:\\a\\gh.CMD');
    expect(cmd.file.toLowerCase()).toMatch(/^[a-z]:\\.*\\cmd\.exe$/); // a full path, never a PATH lookup
    expect(cmd.args).toEqual(['/d', '/s', '/c', '""C:\\a\\gh.CMD" auth status"']);
    expect(cmd.verbatim).toBe(true);
    expect(resolveCommand('git', ['--version'], env, 'win32', () => false).file).toBe('git');
    expect(() => resolveCommand('gh', ['a b'], env, 'win32', (f) => f === 'C:\\a\\gh.CMD')).toThrow();
  });

  it('posix: commands run by name through PATH', () => {
    expect(resolveCommand('git', ['--version'], { PATH: '/x' }, 'linux', () => true))
      .toEqual({ file: 'git', args: ['--version'], verbatim: false });
  });

  it('win32: a .cmd shim finds cmd.exe via ComSpec/SystemRoot even when the caller env has neither', () => {
    const env = { PATH: 'C:\\fake', PATHEXT: '.EXE;.CMD' };
    const isGh = (f: string) => f === 'C:\\fake\\gh.CMD';
    const viaComSpec = resolveCommand('gh', ['auth', 'status'], env, 'win32', isGh, { ComSpec: 'C:\\Win\\System32\\cmd.exe' });
    expect(viaComSpec.file).toBe('C:\\Win\\System32\\cmd.exe');
    const viaRoot = resolveCommand('gh', ['auth', 'status'], env, 'win32', isGh, { SystemRoot: 'D:\\Windows' });
    expect(viaRoot.file).toBe('D:\\Windows\\System32\\cmd.exe');
    expect(resolveCommand('gh', ['auth', 'status'], env, 'win32', isGh, {}).file).toBe('C:\\Windows\\System32\\cmd.exe');
    expect(resolveCommand('gh', ['x'], { ...env, ComSpec: 'E:\\cmd.exe' }, 'win32', isGh, {}).file).toBe('E:\\cmd.exe');
  });

  it('win32: the spawn env keeps SystemRoot and ComSpec from the app env when the caller env lacks them', () => {
    const base = { SystemRoot: 'C:\\Windows', ComSpec: 'C:\\Windows\\System32\\cmd.exe', SECRET: 'x' };
    expect(spawnEnv({ PATH: 'C:\\fake' }, 'win32', base))
      .toEqual({ PATH: 'C:\\fake', SystemRoot: 'C:\\Windows', ComSpec: 'C:\\Windows\\System32\\cmd.exe' });
    expect(spawnEnv({ PATH: 'C:\\fake', SystemRoot: 'Z:\\W' }, 'win32', base).SystemRoot).toBe('Z:\\W');
    expect(spawnEnv({ PATH: '/x' }, 'linux', base)).toEqual({ PATH: '/x' });
  });
});
