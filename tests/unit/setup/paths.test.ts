import { describe, expect, it } from 'vitest';
import { join } from 'node:path';
import { dataDir, worktreePath } from '../../../apps/desktop/src/main/paths';

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
});
