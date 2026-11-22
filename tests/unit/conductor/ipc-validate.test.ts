import { describe, expect, it } from 'vitest';
import {
  isAbsolutePath, validateNoArg, validateSessionCreate, validateSessionGet, validateSessionStop, validateSetupCheck,
} from '../../../apps/desktop/src/main/ipc/validate';
import { ipcErrorCode } from '../../../apps/desktop/src/shared/ipc';
import { denyAllPermissions } from '../../../apps/desktop/src/main/ipc/security';

describe('IPC argument validation', () => {
  it('session:create accepts {repoPath, task} with an absolute path (posix and win32)', () => {
    expect(validateSessionCreate({ repoPath: '/home/u/repo', task: 'What does this repo do?' }, 'linux'))
      .toEqual({ repoPath: '/home/u/repo', task: 'What does this repo do?' });
    expect(validateSessionCreate({ repoPath: 'D:\\code\\repo', task: 'x' }, 'win32').repoPath).toBe('D:\\code\\repo');
  });

  it('J9 session:create accepts a 5,000-character task', () => {
    expect(validateSessionCreate({ repoPath: '/r', task: 'a '.repeat(2500) }, 'linux').task).toHaveLength(5000);
  });

  it.each([
    ['null', null],
    ['a string', '/r'],
    ['an array', ['/r', 'x']],
    ['missing task', { repoPath: '/r' }],
    ['empty task (J9)', { repoPath: '/r', task: '   ' }],
    ['non-string task', { repoPath: '/r', task: 42 }],
    ['relative path', { repoPath: 'repo', task: 'x' }],
    ['empty path', { repoPath: '', task: 'x' }],
    ['NUL in path', { repoPath: '/r\0x', task: 'x' }],
    ['extra field', { repoPath: '/r', task: 'x', shell: 'rm -rf /' }],
    ['huge task', { repoPath: '/r', task: 'x'.repeat(100_001) }],
  ])('session:create rejects %s', (_n, arg) => {
    expect(() => validateSessionCreate(arg, 'linux')).toThrow(/orchestra:bad_request/);
  });

  it('session:create rejects a drive-relative win32 path', () => {
    expect(() => validateSessionCreate({ repoPath: 'C:repo', task: 'x' }, 'win32')).toThrow();
    expect(isAbsolutePath('\\\\server\\share\\repo', 'win32')).toBe(true);
  });

  it('session:get {id} and session:stop {sessionId} accept ids and reject anything else', () => {
    expect(validateSessionGet({ id: '7c730e5b-ce09-423b-9e54-451491a4bc21' })).toBe('7c730e5b-ce09-423b-9e54-451491a4bc21');
    expect(validateSessionStop({ sessionId: 'abc-1' })).toBe('abc-1');
    for (const bad of [undefined, 'abc', { id: 5 }, { id: '../x' }, { id: '' }, { id: 'a', more: 1 }, { sessionId: 'a' }]) {
      expect(() => validateSessionGet(bad)).toThrow(/orchestra:bad_request/);
    }
    for (const bad of [null, { id: 'a' }, { sessionId: 'a b' }, { sessionId: 'x'.repeat(129) }]) {
      expect(() => validateSessionStop(bad)).toThrow(/orchestra:bad_request/);
    }
  });

  it('setup:check takes nothing or a boolean; repo:pick and session:list take nothing', () => {
    expect(validateSetupCheck(undefined)).toBe(false);
    expect(validateSetupCheck(true)).toBe(true);
    expect(() => validateSetupCheck('yes')).toThrow();
    expect(() => validateNoArg(undefined, 'repo:pick')).not.toThrow();
    expect(() => validateNoArg({ path: '/' }, 'repo:pick')).toThrow();
  });
});

describe('IPC error prefix', () => {
  it('validation errors map through the shared ipcErrorCode to bad_request', () => {
    let err: unknown;
    try { validateSessionGet(5); } catch (e) { err = e; }
    expect(ipcErrorCode(err)).toBe('bad_request');
  });
});

describe('permission handlers', () => {
  it('deny every permission request and check (camera, notifications, ...)', () => {
    let req: ((wc: unknown, perm: string, cb: (ok: boolean) => void) => void) | null = null;
    let check: ((wc: unknown, perm: string) => boolean) | null = null;
    const fakeSession = {
      setPermissionRequestHandler: (h: typeof req) => { req = h; },
      setPermissionCheckHandler: (h: typeof check) => { check = h; },
    };
    denyAllPermissions(fakeSession as never);
    const answers: boolean[] = [];
    for (const p of ['media', 'notifications', 'geolocation', 'clipboard-read']) {
      req!(null, p, (ok) => answers.push(ok));
      expect(check!(null, p)).toBe(false);
    }
    expect(answers).toEqual([false, false, false, false]);
  });
});
