// Engine tests against tests/unit/engine/fake-claude.mjs, with real delays. Pre-check only:
// the real CLI is exercised by the real-AI journey on Vikas's PC (test-contract.md §5, D9).
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { ClaudeCodeEngine, buildRunArgs, REASK_PROMPT } from '../../../apps/desktop/src/main/engine/claudeCode';
import { isProcessAlive } from '../../../apps/desktop/src/main/process/treeKill';
import type { EngineEvent, RunRequest } from '../../../apps/desktop/src/shared/engine';

const FAKE = resolve(__dirname, 'fake-claude.mjs');
let dir: string;
let bin: string;

beforeAll(() => {
  dir = mkdtempSync(join(tmpdir(), 'orch-engine-'));
  if (process.platform === 'win32') {
    bin = FAKE; // resolveCli runs .mjs through node
  } else {
    bin = join(dir, 'claude');
    writeFileSync(bin, `#!/bin/sh\nexec "${process.execPath}" "${FAKE}" "$@"\n`);
    chmodSync(bin, 0o755);
  }
});
afterAll(() => rmSync(dir, { recursive: true, force: true }));

const PLAN_SYSTEM = 'You are Team Lead in Orchestra.';
function teamLead(p: Partial<RunRequest> = {}): RunRequest {
  return {
    role: 'TeamLead',
    cwd: process.cwd(),
    prompt: 'What does this repo do?',
    systemAppend: PLAN_SYSTEM,
    allowedTools: ['Read', 'Grep', 'Glob', 'LS'],
    disallowedTools: ['Edit', 'Write', 'Bash', 'WebFetch'],
    permissionMode: 'plan',
    maxTurns: 30,
    timeoutMs: 5 * 60_000,
    ...p,
  };
}

function engine(scenario: string, extra: Record<string, string> = {}): { eng: ClaudeCodeEngine; argvFile: string; logs: string[] } {
  const argvFile = join(dir, `argv-${scenario}-${Math.random().toString(36).slice(2)}.jsonl`);
  const logs: string[] = [];
  const eng = new ClaudeCodeEngine({
    env: { ...process.env, ORCHESTRA_CLAUDE_BIN: bin, FAKE_CLAUDE_SCENARIO: scenario, FAKE_CLAUDE_ARGV_FILE: argvFile, ...extra },
    log: (m) => logs.push(m),
  });
  return { eng, argvFile, logs };
}
function argvs(file: string): string[][] {
  return existsSync(file) ? readFileSync(file, 'utf8').trim().split('\n').map((l) => JSON.parse(l) as string[]) : [];
}
const isPlan = (v: unknown): boolean => typeof v === 'object' && v !== null && typeof (v as { title?: unknown }).title === 'string' && Array.isArray((v as { steps?: unknown }).steps);

describe('ClaudeCodeEngine argv', () => {
  it('builds Team Lead argv exactly per architecture §4/§5', () => {
    expect(buildRunArgs(teamLead())).toEqual([
      '-p', 'What does this repo do?',
      '--output-format', 'stream-json',
      '--verbose',
      '--permission-mode', 'plan',
      '--allowedTools', 'Read,Grep,Glob,LS',
      '--disallowedTools', 'Edit,Write,Bash,WebFetch',
      '--append-system-prompt', PLAN_SYSTEM,
      '--max-turns', '30',
    ]);
    expect(buildRunArgs(teamLead({ resumeSessionId: 'abc' })).slice(-2)).toEqual(['--resume', 'abc']);
  });

  it('passes user text as one argv element, untouched (no shell)', async () => {
    const nasty = 'what "does" this do? & del /q * ; rm -rf ~ $(whoami) `id` %PATH%';
    const { eng, argvFile } = engine('happy', { FAKE_CLAUDE_DELAY_MS: '200' });
    const r = await eng.run(teamLead({ prompt: nasty }), () => {}, new AbortController().signal);
    expect(r.ok).toBe(true);
    expect(argvs(argvFile)[0]).toEqual(buildRunArgs(teamLead({ prompt: nasty })));
  });
});

describe('ClaudeCodeEngine run (fake CLI, real delays, pre-check only)', () => {
  it('happy stream: started -> tool_call Read -> text -> ok result', async () => {
    const { eng } = engine('happy');
    const events: EngineEvent[] = [];
    const r = await eng.run(teamLead(), (e) => events.push(e), new AbortController().signal);
    expect(r).toMatchObject({ ok: true, finalText: 'This repo adds numbers in src/math.js.' });
    expect(r.durationMs).toBeGreaterThanOrEqual(1000);
    const ks = events.map((e) => e.kind);
    expect(ks.indexOf('started')).toBe(0);
    expect(ks.indexOf('tool_call')).toBeLessThan(ks.indexOf('text'));
    expect(events.find((e) => e.kind === 'tool_call')).toEqual({ kind: 'tool_call', tool: 'Read', summary: 'src/math.js', path: 'src/math.js' });
    expect(events[0]).toEqual({ kind: 'started', engineSessionId: 'fake-session-0001', model: 'fake-model' });
  });

  it('B1 plan JSON in markdown fences is parsed', async () => {
    const { eng, argvFile } = engine('fenced');
    const r = await eng.run(teamLead({ outputSchema: isPlan }), () => {}, new AbortController().signal);
    expect(r.ok).toBe(true);
    expect(r.json).toMatchObject({ title: 'Add sum' });
    expect(argvs(argvFile)).toHaveLength(1);
  });

  it('B2 invalid JSON twice -> bad_output after exactly one re-ask with --resume', async () => {
    const { eng, argvFile } = engine('invalid_json');
    const events: EngineEvent[] = [];
    const r = await eng.run(teamLead({ outputSchema: isPlan }), (e) => events.push(e), new AbortController().signal);
    expect(r).toMatchObject({ ok: false, error: 'bad_output' });
    const calls = argvs(argvFile);
    expect(calls).toHaveLength(2);
    expect(calls[1]).toEqual(buildRunArgs(teamLead(), REASK_PROMPT, 'fake-session-0001'));
    expect(events.filter((e) => e.kind === 'started')).toHaveLength(1);
  });

  it('B2 re-ask recovers when the second reply is valid JSON', async () => {
    const { eng, argvFile } = engine('json_after_reask');
    const r = await eng.run(teamLead({ outputSchema: isPlan }), () => {}, new AbortController().signal);
    expect(r.ok).toBe(true);
    expect(r.json).toMatchObject({ title: 'Add sum' });
    expect(argvs(argvFile)).toHaveLength(2);
  });

  it('B3 half reply then process exit -> crashed', async () => {
    const { eng, logs } = engine('half');
    const events: EngineEvent[] = [];
    const r = await eng.run(teamLead(), (e) => events.push(e), new AbortController().signal);
    expect(r).toMatchObject({ ok: false, error: 'crashed', finalText: 'Looking at the' });
    expect(events.some((e) => e.kind === 'text')).toBe(true);
    expect(logs.some((l) => l.includes('invalid JSON'))).toBe(true);
  });

  it('B4 usage limit message -> rate_limited with the reset time', async () => {
    const { eng } = engine('usage_limit');
    const r = await eng.run(teamLead(), () => {}, new AbortController().signal);
    expect(r).toMatchObject({ ok: false, error: 'rate_limited', errorDetail: 'resets 3pm (Europe/London)' });
  });

  it('B5 scaled: slow first line (3 s) -> no timeout, run completes', async () => {
    const { eng } = engine('slow_first', { FAKE_CLAUDE_FIRST_DELAY_MS: '3000' });
    const r = await eng.run(teamLead({ timeoutMs: 10_000 }), () => {}, new AbortController().signal);
    expect(r.ok).toBe(true);
    expect(r.durationMs).toBeGreaterThanOrEqual(3000);
  });

  it('B6 denied git push tool_result -> run continues and ends ok', async () => {
    const { eng } = engine('denied_push');
    const events: EngineEvent[] = [];
    const r = await eng.run(teamLead(), (e) => events.push(e), new AbortController().signal);
    expect(r.ok).toBe(true);
    expect(events).toContainEqual(expect.objectContaining({ kind: 'tool_call', tool: 'Bash', summary: 'git push origin main' }));
    expect(events).toContainEqual(expect.objectContaining({ kind: 'tool_result', tool: 'Bash', ok: false }));
  });

  it('timeout -> error timeout', async () => {
    const { eng } = engine('hang');
    const r = await eng.run(teamLead({ timeoutMs: 1200 }), () => {}, new AbortController().signal);
    expect(r).toMatchObject({ ok: false, error: 'timeout' });
    expect(r.durationMs).toBeLessThan(4000);
  });

  it('missing CLI -> not_installed', async () => {
    const eng = new ClaudeCodeEngine({ env: { ...process.env, ORCHESTRA_CLAUDE_BIN: join(dir, 'no-such-claude') }, log: () => {} });
    const r = await eng.run(teamLead(), () => {}, new AbortController().signal);
    expect(r).toMatchObject({ ok: false, error: 'not_installed' });
  });

  it.skipIf(process.platform === 'win32')('AC-L1 abort -> stopped and no child or grandchild process remains after 2 s', async () => {
    const pidFile = join(dir, 'family.json');
    const { eng } = engine('family', { FAKE_CLAUDE_PID_FILE: pidFile });
    const ac = new AbortController();
    const events: EngineEvent[] = [];
    const running = eng.run(teamLead(), (e) => events.push(e), ac.signal);
    while (!events.some((e) => e.kind === 'started')) await new Promise((r) => setTimeout(r, 25));
    const { child, grandchild } = JSON.parse(readFileSync(pidFile, 'utf8')) as { child: number; grandchild: number };
    const alive = isProcessAlive; // zombies awaiting reaping count as gone
    expect(alive(child) && alive(grandchild)).toBe(true);
    const t0 = Date.now();
    ac.abort();
    const r = await running;
    expect(r).toMatchObject({ ok: false, error: 'stopped' });
    while ((alive(child) || alive(grandchild)) && Date.now() - t0 < 2000) await new Promise((res) => setTimeout(res, 25));
    expect(alive(child)).toBe(false);
    expect(alive(grandchild)).toBe(false);
    expect(Date.now() - t0).toBeLessThan(2000);
  });

  it('already-aborted signal -> stopped without spawning', async () => {
    const { eng, argvFile } = engine('happy');
    const ac = new AbortController();
    ac.abort();
    const r = await eng.run(teamLead(), () => {}, ac.signal);
    expect(r).toMatchObject({ ok: false, error: 'stopped' });
    expect(argvs(argvFile)).toHaveLength(0);
  });
});

describe('ClaudeCodeEngine probe', () => {
  it('reads the version and signed-in state', async () => {
    const { eng } = engine('happy');
    expect(await eng.probe({ signedIn: true })).toEqual({ installed: true, version: '2.1.0', signedIn: true, supportsStreamJson: true });
    expect(await eng.probe()).toEqual({ installed: true, version: '2.1.0', signedIn: null, supportsStreamJson: true });
  });

  it('B8 old Claude Code version -> supportsStreamJson false', async () => {
    const { eng } = engine('old_version');
    expect(await eng.probe()).toMatchObject({ installed: true, version: '0.2.9', supportsStreamJson: false });
  });

  it('not signed in -> signedIn false', async () => {
    const { eng } = engine('not_signed_in');
    expect(await eng.probe({ signedIn: true })).toMatchObject({ installed: true, signedIn: false });
  });

  it('missing CLI -> installed false', async () => {
    const eng = new ClaudeCodeEngine({ env: { ...process.env, ORCHESTRA_CLAUDE_BIN: join(dir, 'no-such-claude') }, log: () => {} });
    expect(await eng.probe({ signedIn: true })).toEqual({ installed: false, version: null, signedIn: null, supportsStreamJson: null });
  });
});
