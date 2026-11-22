// Conductor tests with a fake engine that waits for real (pre-check only).
import { afterEach, describe, expect, it } from 'vitest';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ASK_SYSTEM_APPEND, Conductor, SessionError, makeTitle } from '../../../apps/desktop/src/main/conductor/ask';
import { Store } from '../../../apps/desktop/src/main/store';
import type { Engine } from '../../../apps/desktop/src/shared/engine';
import type { EventsAppendPush } from '../../../apps/desktop/src/shared/ipc';
import { ANSWER_STEPS, fakeEngine, git, makeRepo, sleep } from './helpers';

const cleanup: Array<() => void> = [];
afterEach(() => { for (const f of cleanup.splice(0)) f(); });

function setup(engine: Engine) {
  const { root, repo } = makeRepo();
  const store = new Store(':memory:');
  const pushes: EventsAppendPush[] = [];
  const c = new Conductor({
    store, engine: () => engine, push: (p) => pushes.push(p),
    worktreePathFor: (r, id) => join(root, '.orchestra-worktrees', 'sample-repo', id),
  });
  cleanup.push(() => { store.close(); rmSync(root, { recursive: true, force: true }); });
  return { root, repo, store, pushes, c };
}

describe('makeTitle', () => {
  it('J9 short task stays whole; whitespace is flattened', () => {
    expect(makeTitle('  What does\nthis repo   do?  ')).toBe('What does this repo do?');
  });
  it('J9 a 5,000-character task is trimmed to at most 60 chars at a word boundary', () => {
    const task = 'Explain the build pipeline of this repository in detail '.repeat(90).slice(0, 5000);
    expect(task.length).toBe(5000);
    const title = makeTitle(task);
    expect(title.length).toBeLessThanOrEqual(60);
    expect(task.startsWith(title)).toBe(true);
    expect(task.charAt(title.length)).toBe(' ');
  });
  it('J9 one long word is hard-cut at 60', () => {
    expect(makeTitle('x'.repeat(200))).toBe('x'.repeat(60));
  });
});

describe('conductor ask session', () => {
  it('AC-S0.3 (pre-check only) streams Team Lead events, stores them, and ends plan_ready', async () => {
    const eng = fakeEngine({ steps: ANSWER_STEPS });
    const { repo, store, pushes, c } = setup(eng);
    const s = await c.createSession({ repoPath: repo, task: '  What does this repo do?  ' });
    expect(s).toMatchObject({ state: 'planning', task: 'What does this repo do?', title: 'What does this repo do?', baseBranch: 'main', branch: '' });
    expect(existsSync(join(s.worktreePath, 'src', 'math.js'))).toBe(true);
    await c.whenDone(s.id);
    await sleep(100);

    const req = eng.requests[0]!;
    expect(req).toMatchObject({
      role: 'TeamLead', cwd: s.worktreePath, prompt: 'What does this repo do?', permissionMode: 'plan',
      allowedTools: ['Read', 'Grep', 'Glob', 'LS'], disallowedTools: ['Edit', 'Write', 'Bash', 'WebFetch'],
      maxTurns: 30, timeoutMs: 300000, systemAppend: ASK_SYSTEM_APPEND,
    });

    const types = store.eventsFor(s.id).map((e) => e.type);
    expect(types).toEqual([
      'session.created', 'session.state', 'run.started', 'run.tool_call', 'run.tool_result',
      'run.text', 'run.text', 'run.ended', 'session.state',
    ]);
    const ended = store.eventsFor(s.id).find((e) => e.type === 'run.ended')!;
    expect(ended.payload).toMatchObject({ ok: true, finalText: expect.stringContaining('src/math.js') });
    expect(store.getSession(s.id)?.state).toBe('plan_ready');
    const run = store.runsFor(s.id)[0]!;
    expect(run).toMatchObject({ state: 'ok', model: 'fake-model', engineSessionId: 'eng-1', inputTokens: 120, outputTokens: 30 });

    // pushed in 50 ms batches, in seq order, nothing lost
    const pushed = pushes.flatMap((p) => p.events.map((e) => e.seq));
    expect(pushed).toEqual(store.eventsFor(s.id).map((e) => e.seq));
    expect(pushes.length).toBeGreaterThan(1);
    expect(pushes[0]!.events.map((e) => e.type)).toEqual(['session.created', 'session.state']);
  });

  it('AC-S0.3 (pre-check only) works with multi-second gaps between lines', async () => {
    const eng = fakeEngine({
      steps: [
        { delayMs: 2500, event: { kind: 'started', engineSessionId: 'e', model: 'm' } },
        { delayMs: 2000, event: { kind: 'text', text: 'It is a calculator. See src/math.js.' } },
      ],
    });
    const { repo, store, c } = setup(eng);
    const s = await c.createSession({ repoPath: repo, task: 'What does this repo do?' });
    await sleep(1000);
    expect(store.getSession(s.id)?.state).toBe('planning');
    await c.whenDone(s.id);
    expect(store.getSession(s.id)?.state).toBe('plan_ready');
  });

  it('AC-F1b a folder without .git is rejected with orchestra:not_git and no session is stored', async () => {
    const { store, c } = setup(fakeEngine({ steps: ANSWER_STEPS }));
    const plain = mkdtempSync(join(tmpdir(), 'orch-plain-'));
    cleanup.push(() => rmSync(plain, { recursive: true, force: true }));
    const err = await c.createSession({ repoPath: plain, task: 'hi' }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(SessionError);
    expect((err as SessionError).code).toBe('not_git');
    expect((err as Error).message.startsWith('orchestra:not_git')).toBe(true);
    expect(store.listSessions()).toEqual([]);
  });

  it('J9 an empty or whitespace task is rejected', async () => {
    const { repo, store, c } = setup(fakeEngine({ steps: ANSWER_STEPS }));
    await expect(c.createSession({ repoPath: repo, task: '   \n ' })).rejects.toMatchObject({ code: 'empty_task' });
    expect(store.listSessions()).toEqual([]);
  });

  it('engine error -> failed with run.ended error and errorDetail', async () => {
    const eng = fakeEngine({
      steps: [{ delayMs: 300, event: { kind: 'started', engineSessionId: 'e', model: 'm' } }],
      result: { ok: false, error: 'rate_limited', errorDetail: '3pm' },
    });
    const { repo, store, c } = setup(eng);
    const s = await c.createSession({ repoPath: repo, task: 'q' });
    await c.whenDone(s.id);
    const ended = store.eventsFor(s.id).find((e) => e.type === 'run.ended')!;
    expect(ended.payload).toMatchObject({ ok: false, error: 'rate_limited', errorDetail: '3pm' });
    expect(store.getSession(s.id)?.state).toBe('failed');
    expect(store.runsFor(s.id)[0]).toMatchObject({ state: 'failed', error: 'rate_limited' });
  });

  it('an engine that throws (e.g. cannot be built) -> failed with cause crashed', async () => {
    const { repo, store, c } = setup({
      id: 'cassette', probe: async () => { throw new Error('x'); },
      run: async () => { await sleep(200); throw new Error('createEngine: not implemented'); },
    });
    const s = await c.createSession({ repoPath: repo, task: 'q' });
    await c.whenDone(s.id);
    expect(store.getSession(s.id)?.state).toBe('failed');
    const ended = store.eventsFor(s.id).find((e) => e.type === 'run.ended')!;
    expect(ended.payload).toMatchObject({ ok: false, error: 'crashed', errorDetail: 'createEngine: not implemented' });
  });

  it('AC-L1 (conductor level, pre-check only) Stop -> stopped + session.stopped within 2 s', async () => {
    const eng = fakeEngine({ steps: [...ANSWER_STEPS, { delayMs: 10_000, event: { kind: 'text', text: 'late' } }] });
    const { repo, store, c } = setup(eng);
    const s = await c.createSession({ repoPath: repo, task: 'q' });
    await sleep(700);
    const t0 = Date.now();
    await c.stop(s.id);
    expect(Date.now() - t0).toBeLessThan(2000);
    expect(store.getSession(s.id)?.state).toBe('stopped');
    const types = store.eventsFor(s.id).map((e) => e.type);
    expect(types.slice(-3)).toEqual(['run.ended', 'session.state', 'session.stopped']);
    expect(store.eventsFor(s.id).find((e) => e.type === 'run.ended')?.payload).toMatchObject({ ok: false, error: 'stopped' });
    expect(c.runningSessionIds()).toEqual([]);
  });

  it('AC-L1 (conductor level, pre-check only) Stop still ends the session within 2 s when the engine ignores abort', async () => {
    const eng = fakeEngine({ steps: [{ delayMs: 6000, event: { kind: 'text', text: 'late' } }], ignoreAbort: true });
    const { repo, store, c } = setup(eng);
    const s = await c.createSession({ repoPath: repo, task: 'q' });
    await sleep(300);
    const t0 = Date.now();
    await c.stopAll();
    expect(Date.now() - t0).toBeLessThan(2000);
    expect(store.getSession(s.id)?.state).toBe('stopped');
    await c.whenDone(s.id);
    await sleep(6000);
    // the late engine reply is ignored: still stopped, one run.ended, no late text
    expect(store.getSession(s.id)?.state).toBe('stopped');
    expect(store.eventsFor(s.id).filter((e) => e.type === 'run.ended')).toHaveLength(1);
    expect(store.eventsFor(s.id).some((e) => e.type === 'run.text')).toBe(false);
  }, 15000);

  it('AC-L2 (pre-check only) the main checkout is never written; the work happens in the worktree', async () => {
    const eng = fakeEngine({ steps: ANSWER_STEPS, writeFile: 'scratch.txt' });
    const { repo, c } = setup(eng);
    const before = git(repo, 'status', '--porcelain');
    const headBefore = git(repo, 'rev-parse', 'HEAD');
    const s = await c.createSession({ repoPath: repo, task: 'What does this repo do?' });
    await c.whenDone(s.id);
    expect(existsSync(join(s.worktreePath, 'scratch.txt'))).toBe(true);
    expect(existsSync(join(repo, 'scratch.txt'))).toBe(false);
    expect(git(repo, 'status', '--porcelain')).toBe(before);
    expect(git(repo, 'rev-parse', 'HEAD')).toBe(headBefore);
    expect(git(repo, 'rev-parse', '--abbrev-ref', 'HEAD').trim()).toBe('main');
    // the only change in the main repo is the worktree registration
    expect(git(repo, 'worktree', 'list', '--porcelain')).toContain(s.worktreePath);
  });
});

describe('shutdown shim', () => {
  it('no-ops when main/process/treeKill is not present yet', async () => {
    const { killAllTrackedIfPresent } = await import('../../../apps/desktop/src/main/conductor/shutdown');
    await expect(killAllTrackedIfPresent(10)).resolves.toBeUndefined();
  });
});
