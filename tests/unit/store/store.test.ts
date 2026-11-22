import { afterEach, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Store } from '../../../apps/desktop/src/main/store';
import type { NewEvent } from '../../../apps/desktop/src/shared/events';

const dirs: string[] = [];
function tempDb(): string {
  const d = mkdtempSync(join(tmpdir(), 'orch-store-'));
  dirs.push(d);
  return join(d, 'data', 'orchestra.db');
}
afterEach(() => { for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true }); });

const base = {
  title: 't', task: 'task', repoPath: '/r', baseBranch: 'main', branch: '', worktreePath: '/w',
};

describe('store', () => {
  it('migrations create the §7 tables, WAL mode, and are idempotent', () => {
    const file = tempDb();
    const a = new Store(file);
    expect(a.schemaVersion()).toBe(1);
    const tables = (a.db.prepare("SELECT name FROM sqlite_master WHERE type IN ('table','index') ORDER BY name").all() as { name: string }[])
      .map((r) => r.name);
    expect(tables).toEqual(expect.arrayContaining(['sessions', 'runs', 'events', 'events_session', 'schema_version']));
    expect((a.db.prepare('PRAGMA journal_mode').get() as { journal_mode: string }).journal_mode).toBe('wal');
    expect(a.migrate()).toEqual([]);
    a.close();
    const b = new Store(file);
    expect(b.migrate()).toEqual([]);
    expect((b.db.prepare('SELECT COUNT(*) AS n FROM schema_version').get() as { n: number }).n).toBe(1);
    b.close();
  });

  it('creates, gets, updates and lists sessions newest first', () => {
    let clock = 1000;
    const s = new Store(tempDb(), () => clock++);
    s.createSession({ ...base, id: 'a', state: 'planning' });
    s.createSession({ ...base, id: 'b', state: 'planning' });
    s.updateSessionState('a', 'plan_ready');
    expect(s.getSession('a')?.state).toBe('plan_ready');
    expect(s.getSession('nope')).toBeNull();
    expect(s.listSessions().map((x) => x.id)).toEqual(['b', 'a']);
    s.close();
  });

  it('appendEvents assigns increasing seq and ts in order; eventsFor returns them in seq order', () => {
    const s = new Store(tempDb());
    s.createSession({ ...base, id: 's1', state: 'planning' });
    s.createSession({ ...base, id: 's2', state: 'planning' });
    const batch: NewEvent[] = [
      { type: 'session.created', sessionId: 's1', runId: null, payload: { title: 't', task: 'x', repoPath: '/r' } },
      { type: 'run.text', sessionId: 's2', runId: 'r', payload: { role: 'TeamLead', text: 'other' } },
      { type: 'session.state', sessionId: 's1', runId: null, payload: { state: 'planning' } },
      { type: 'run.text', sessionId: 's1', runId: 'r1', payload: { role: 'TeamLead', text: 'hi' } },
    ];
    const out = s.appendEvents(batch);
    expect(out.map((e) => e.seq)).toEqual([1, 2, 3, 4]);
    expect(out.every((e) => typeof e.ts === 'number')).toBe(true);
    const evs = s.eventsFor('s1');
    expect(evs.map((e) => e.type)).toEqual(['session.created', 'session.state', 'run.text']);
    expect(evs[2]).toMatchObject({ runId: 'r1', payload: { text: 'hi' } });
    expect(s.appendEvents([])).toEqual([]);
    s.close();
  });

  it('runs: createRun and updateRun round-trip', () => {
    const s = new Store(tempDb());
    s.createSession({ ...base, id: 's', state: 'planning' });
    s.createRun({ id: 'r', sessionId: 's', role: 'TeamLead' });
    s.updateRun('r', { state: 'failed', error: 'timeout', model: 'm', engineSessionId: 'e', inputTokens: 5 });
    expect(s.getRun('r')).toMatchObject({ state: 'failed', error: 'timeout', model: 'm', engineSessionId: 'e', inputTokens: 5 });
    expect(s.runsFor('s')).toHaveLength(1);
    s.close();
  });

  it('J7 recoverInterrupted: in-flight sessions become stopped with a session.stopped event', () => {
    const file = tempDb();
    const s = new Store(file);
    s.createSession({ ...base, id: 'p', state: 'planning' });
    s.createSession({ ...base, id: 'b', state: 'building' });
    s.createSession({ ...base, id: 'done', state: 'plan_ready' });
    s.createSession({ ...base, id: 'f', state: 'failed' });
    s.createRun({ id: 'r', sessionId: 'p', role: 'TeamLead' });
    s.close();
    const t = new Store(file);
    const evs = t.recoverInterrupted();
    expect(evs.filter((e) => e.type === 'session.stopped').map((e) => e.sessionId).sort()).toEqual(['b', 'p']);
    expect(t.getSession('p')?.state).toBe('stopped');
    expect(t.getSession('b')?.state).toBe('stopped');
    expect(t.getSession('done')?.state).toBe('plan_ready');
    expect(t.getSession('f')?.state).toBe('failed');
    expect(t.getRun('r')?.state).toBe('stopped');
    expect(t.recoverInterrupted()).toEqual([]);
    t.close();
  });
});
