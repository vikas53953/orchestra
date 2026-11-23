import { describe, it, expect } from 'vitest';
import { win32 } from 'node:path';
import { resolveClaudeCli, type ResolveDeps } from '../../../apps/desktop/src/main/engine/resolveCli';

function deps(p: Partial<ResolveDeps>): ResolveDeps {
  return { platform: 'win32', where: async () => [], exists: () => false, readText: () => null, node: 'node', ...p };
}

const PKG = win32.join('C:\\npm', 'node_modules', '@anthropic-ai', 'claude-code');

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

  it('win32: a claude.cmd shim whose package bin is bin/claude.exe runs that exe directly (Claude Code 2.1.x, found by real-AI J0)', async () => {
    const exe = win32.join(PKG, 'bin', 'claude.exe');
    const r = await resolveClaudeCli({}, deps({
      where: async () => ['C:\\npm\\claude.cmd'],
      readText: (p) => (p === win32.join(PKG, 'package.json') ? JSON.stringify({ name: '@anthropic-ai/claude-code', bin: 'bin/claude.exe' }) : null),
      exists: (p) => p === exe,
    }));
    expect(r).toEqual({ cmd: exe, prefixArgs: [] });
  });

  it('win32: package bin as an object, pointing at a .js file, runs through node', async () => {
    const js = win32.join(PKG, 'cli.mjs');
    const r = await resolveClaudeCli({}, deps({
      where: async () => ['C:\\npm\\claude.cmd'],
      readText: (p) => (p === win32.join(PKG, 'package.json') ? JSON.stringify({ bin: { claude: './cli.mjs' } }) : null),
      exists: (p) => p === js,
    }));
    expect(r).toEqual({ cmd: 'node', prefixArgs: [js] });
  });

  it('win32: with no readable package.json, the target written in the shim is used', async () => {
    const exe = win32.join(PKG, 'bin', 'claude.exe');
    const shim = '@ECHO off\r\n"%dp0%\\node_modules\\@anthropic-ai\\claude-code\\bin\\claude.exe"   %*\r\n';
    const r = await resolveClaudeCli({}, deps({
      where: async () => ['C:\\npm\\claude.cmd'],
      readText: (p) => (p === 'C:\\npm\\claude.cmd' ? shim : null),
      exists: (p) => p === exe,
    }));
    expect(r).toEqual({ cmd: exe, prefixArgs: [] });
  });

  it('win32: the node.exe in an old shim header is never taken as the target', async () => {
    const cli = win32.join(PKG, 'cli.js');
    const old = '@IF EXIST "%~dp0\\node.exe" (\r\n  "%~dp0\\node.exe"  "%~dp0\\node_modules\\@anthropic-ai\\claude-code\\cli.js" %*\r\n)';
    const r = await resolveClaudeCli({}, deps({
      where: async () => ['C:\\npm\\claude.cmd'],
      readText: (p) => (p === 'C:\\npm\\claude.cmd' ? old : null),
      exists: (p) => p === cli || p === 'C:\\npm\\node.exe',
    }));
    expect(r).toEqual({ cmd: 'C:\\npm\\node.exe', prefixArgs: [cli] });
  });

  it('win32: a bin that is not an .exe or JS file is skipped, not spawned', async () => {
    const exe = win32.join(PKG, 'bin', 'claude.exe');
    const r = await resolveClaudeCli({}, deps({
      where: async () => ['C:\\npm\\claude.cmd'],
      readText: (p) => (p === win32.join(PKG, 'package.json') ? JSON.stringify({ bin: 'bin/claude.cmd' }) : null),
      exists: () => true,
    }));
    expect(r).toEqual({ cmd: exe, prefixArgs: [] });
  });

  it('win32: a package bin that escapes the package folder is ignored', async () => {
    const r = await resolveClaudeCli({}, deps({
      where: async () => ['C:\\npm\\claude.cmd'],
      readText: (p) => (p === win32.join(PKG, 'package.json') ? JSON.stringify({ bin: '..\\..\\..\\evil.exe' }) : null),
      exists: () => true,
    }));
    expect(r.cmd).not.toMatch(/evil/);
  });

  it('win32: nothing found -> a name that fails with ENOENT', async () => {
    const r = await resolveClaudeCli({}, deps({ where: async () => ['C:\\npm\\claude.cmd'] }));
    expect(r.cmd).toBe('claude.exe');
  });
});
