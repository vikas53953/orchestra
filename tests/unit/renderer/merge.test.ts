import { describe, expect, it } from 'vitest';
import type { OrchestraEvent } from '../../../apps/desktop/src/shared/events';
import type { Session } from '../../../apps/desktop/src/shared/types';
import { applyToSessions, folderName, mergeEvents, sortSessions } from '../../../apps/desktop/src/renderer/store/merge';

const ev = (seq: number, state?: Session['state']): OrchestraEvent => (state
  ? { seq, sessionId: 's1', runId: null, ts: seq * 10, type: 'session.state', payload: { state } }
  : { seq, sessionId: 's1', runId: 'r', ts: seq * 10, type: 'run.text', payload: { role: 'TeamLead', text: 'x' } });

const session = (id: string, createdAt: number): Session => ({
  id, title: id, task: id, repoPath: '/r', baseBranch: 'main', branch: 'b', worktreePath: '/w', state: 'planning', prUrl: null, createdAt, updatedAt: createdAt,
});

describe('store merge', () => {
  it('drops duplicate pushes and keeps seq order', () => {
    expect(mergeEvents([ev(1), ev(3)], [ev(3), ev(2)]).map((e) => e.seq)).toEqual([1, 2, 3]);
  });
  it('AC-F1a newest session is listed first', () => {
    expect(sortSessions([session('old', 1), session('new', 2)]).map((s) => s.id)).toEqual(['new', 'old']);
  });
  it('session.state events update the listed state', () => {
    const out = applyToSessions([session('s1', 1), session('s2', 1)], 's1', [ev(4, 'plan_ready')]);
    expect(out[0]?.state).toBe('plan_ready');
    expect(out[1]?.state).toBe('planning');
  });
  it('J10 folder name from posix and Windows paths', () => {
    expect(folderName('/a/b/sample-repo')).toBe('sample-repo');
    expect(folderName('C:\\code\\my-repo\\')).toBe('my-repo');
  });
});
