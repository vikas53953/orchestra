import { describe, expect, it } from 'vitest';
import { mkdirSync, mkdtempSync, rmSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { canonicalPath, dataDir, samePath, worktreePath } from '../../../apps/desktop/src/main/paths';

describe('paths', () => {
  it('data dir: ORCHESTRA_DATA_DIR wins, else <appData>/Orchestra', () => {
    expect(dataDir('/appdata', { ORCHESTRA_DATA_DIR: '/x/data' })).toBe('/x/data');
    expect(dataDir('/appdata', {})).toBe(join('/appdata', 'Orchestra'));
  });

  it('worktrees: win32 uses <repo drive>:\\.orchestra-worktrees\\<repo>\\<id>', () => {
    expect(worktreePath('D:\\code\\my-app', 'abc', {}, 'win32')).toBe('D:\\.orchestra-worktrees\\my-app\\abc');
  });

  it('worktrees: posix uses <repo parent>/.orchestra-worktrees/<repo>/<id>', () => {
    expect(worktreePath('/home/u/code/my-app', 'abc', {}, 'linux')).toBe('/home/u/code/.orchestra-worktrees/my-app/abc');
  });

  it('worktrees: ORCHESTRA_WORKTREES_DIR overrides the root', () => {
    expect(worktreePath('/home/u/code/my-app', 'abc', { ORCHESTRA_WORKTREES_DIR: '/wt' }, 'linux')).toBe('/wt/my-app/abc');
  });

  it('samePath: win32 ignores slash direction, case and a trailing separator', () => {
    expect(samePath('C:/Users/runneradmin/Temp/repo', 'c:\\users\\RunnerAdmin\\Temp\\repo\\', 'win32')).toBe(true);
    expect(samePath('C:\\a\\b', 'C:\\a\\c', 'win32')).toBe(false);
  });

  it('samePath: posix is case-sensitive and ignores a trailing slash', () => {
    expect(samePath('/a/B', '/a/b', 'linux')).toBe(false);
    expect(samePath('/a/b/', '/a/b', 'linux')).toBe(true);
  });

  it('canonicalPath resolves links to the real long path (the posix twin of a Windows 8.3 short name)', () => {
    const d = mkdtempSync(join(tmpdir(), 'orch-canon-'));
    try {
      const real = join(d, 'long-real-name');
      mkdirSync(real);
      const link = join(d, 'SHORT~1');
      symlinkSync(real, link, 'junction');
      expect(samePath(canonicalPath(link), canonicalPath(real))).toBe(true);
      expect(samePath(link, real)).toBe(true);
      expect(canonicalPath(join(d, 'missing', 'x'))).toBe(join(canonicalPath(d), 'missing', 'x'));
    } finally {
      rmSync(d, { recursive: true, force: true });
    }
  });
});
