// CassetteEngine replays synthetic stream-json through the real parser with real delays. Pre-check only.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { CassetteEngine } from '../../../apps/desktop/src/main/engine/cassette';
import { ClaudeCodeEngine } from '../../../apps/desktop/src/main/engine/claudeCode';
import { createEngine } from '../../../apps/desktop/src/main/engine';
import type { EngineEvent, RunRequest } from '../../../apps/desktop/src/shared/engine';

const J0 = resolve(__dirname, '../../cassettes/j0-ask-sample-repo.jsonl');
const LIMIT = resolve(__dirname, '../../cassettes/bad-usage-limit.jsonl');

const req: RunRequest = {
  role: 'TeamLead', cwd: '.', prompt: 'What does this repo do?', systemAppend: 'x',
  allowedTools: ['Read', 'Grep', 'Glob', 'LS'], disallowedTools: ['Edit', 'Write', 'Bash', 'WebFetch'],
  permissionMode: 'plan', maxTurns: 30, timeoutMs: 60_000,
};

describe('cassettes', () => {
  it('first line of every cassette marks it synthetic', () => {
    for (const f of [J0, LIMIT]) {
      expect(JSON.parse(readFileSync(f, 'utf8').split('\n')[0]!)).toEqual({
        type: 'orchestra_cassette', synthetic: true, note: "pre-check only; replace with a recording from the owner's PC",
      });
    }
  });
});

describe('CassetteEngine (pre-check only)', () => {
  it('J0 replays: started -> Read src/math.js -> Read package.json -> text -> result naming src/math.js', async () => {
    const logs: string[] = [];
    const eng = new CassetteEngine(J0, { env: { ORCHESTRA_CASSETTE_DELAY_MS: '200' }, log: (m) => logs.push(m) });
    const events: EngineEvent[] = [];
    const r = await eng.run(req, (e) => events.push(e), new AbortController().signal);
    expect(r.ok).toBe(true);
    expect(r.finalText).toContain('src/math.js');
    expect(r.durationMs).toBeGreaterThanOrEqual(9 * 200 - 50);
    expect(events[0]).toMatchObject({ kind: 'started', engineSessionId: expect.any(String) });
    const reads = events.filter((e) => e.kind === 'tool_call').map((e) => (e.kind === 'tool_call' ? e.path : ''));
    expect(reads[0]).toMatch(/src\/math\.js$/);
    expect(reads[1]).toMatch(/package\.json$/);
    expect(events.filter((e) => e.kind === 'text').length).toBeGreaterThanOrEqual(2);
    expect(logs.some((l) => l.includes('orchestra_cassette'))).toBe(true);
  });

  it('B4 bad-usage-limit cassette -> rate_limited with the time', async () => {
    const eng = new CassetteEngine(LIMIT, { env: { ORCHESTRA_CASSETTE_DELAY_MS: '200' }, log: () => {} });
    const r = await eng.run(req, () => {}, new AbortController().signal);
    expect(r).toMatchObject({ ok: false, error: 'rate_limited', errorDetail: '3pm' });
  });

  it('honours abort mid-replay -> stopped', async () => {
    const eng = new CassetteEngine(J0, { env: { ORCHESTRA_CASSETTE_DELAY_MS: '400' }, log: () => {} });
    const ac = new AbortController();
    setTimeout(() => ac.abort(), 1000);
    const r = await eng.run(req, () => {}, ac.signal);
    expect(r).toMatchObject({ ok: false, error: 'stopped' });
    expect(r.durationMs).toBeLessThan(1500);
  });

  it('missing schema JSON -> bad_output (no re-ask on a cassette)', async () => {
    const eng = new CassetteEngine(J0, { env: { ORCHESTRA_CASSETTE_DELAY_MS: '200' }, log: () => {} });
    const r = await eng.run({ ...req, outputSchema: () => true }, () => {}, new AbortController().signal);
    expect(r).toMatchObject({ ok: false, error: 'bad_output' });
  });
});

describe('createEngine', () => {
  it('defaults to Claude Code, selects a cassette by env, rejects unknown engines', () => {
    expect(createEngine({})).toBeInstanceOf(ClaudeCodeEngine);
    expect(createEngine({ ORCHESTRA_ENGINE: 'claude-code' }).id).toBe('claude-code');
    const c = createEngine({ ORCHESTRA_ENGINE: `cassette:${J0}` });
    expect(c).toBeInstanceOf(CassetteEngine);
    expect(c.id).toBe('cassette');
    expect(() => createEngine({ ORCHESTRA_ENGINE: 'gpt' })).toThrow(/unknown engine/);
  });
});
