import { describe, it, expect } from 'vitest';
import { win32 } from 'node:path';
import { resolveClaudeCli, type ResolveDeps } from '../../../apps/desktop/src/main/engine/resolveCli';

function deps(p: Partial<ResolveDeps>): ResolveDeps {
  return { platform: 'win32', where: async () => [], exists: () => false, node: 'node', ...p };
}

describe('resolveClaudeCli', () => {
  it('honours ORCHESTRA_CLAUDE_BIN, running .mjs/.js through node', async () => {
    expect(await resolveClaudeCli({ ORCHESTRA_CLAUDE_BIN: '/x/fake' }, deps({ platform: 'linux' }))).toEqual({ cmd: '/x/fake', prefixArgs: [] });
    expect(await resolveClaudeCli({ ORCHESTRA_CLAUDE_BIN: 'C:\\t\\fake-claude.mjs' }, deps({}))).toEqual({ cmd: 'node', prefixArgs: ['C:\\t\\fake-claude.mjs'] });
  });

  it('posix: claude on PATH', async () => {
    expect(await resolveClaudeCli({}, deps({ platform: 'darwin' }))).toEqual({ cmd: 'claude', prefixArgs: [] });
  });

  it('win32: prefers claude.exe from where', async () => {
    const r = await resolveClaudeCli({}, deps({ where: async () => ['C:\\npm\\claude.cmd', 'C:\\Users\\u\\.local\\bin\\claude.exe'] }));
    expect(r).toEqual({ cmd: 'C:\\Users\\u\\.local\\bin\\claude.exe', prefixArgs: [] });
  });

  it('win32: a claude.cmd shim becomes node <cli.js>, never cmd.exe', async () => {
    const cli = win32.join('C:\\npm', 'node_modules', '@anthropic-ai', 'claude-code', 'cli.js');
    const r = await resolveClaudeCli({}, deps({ where: async () => ['C:\\npm\\claude.cmd'], exists: (p) => p === cli }));
    expect(r).toEqual({ cmd: 'node', prefixArgs: [cli] });
    expect(r.cmd).not.toMatch(/cmd(\.exe)?$/i);
  });

  it('win32: nothing found -> a name that fails with ENOENT', async () => {
    const r = await resolveClaudeCli({}, deps({ where: async () => ['C:\\npm\\claude.cmd'] }));
    expect(r.cmd).toBe('claude.exe');
  });
});
