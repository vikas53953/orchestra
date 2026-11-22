import { describe, expect, it } from 'vitest';
import type { OrchestraEvent } from '../../../apps/desktop/src/shared/events';
import { errorText, lanes, relativePath, statusKey, statusTone } from '../../../apps/desktop/src/renderer/store/lanes';

let seq = 0;
const base = (ts: number) => ({ seq: ++seq, sessionId: 's1', runId: 'r1', ts });
const created = (): OrchestraEvent => ({ ...base(1), runId: null, type: 'session.created', payload: { title: 'What does this repo do?', task: 'What does this repo do?', repoPath: '/work/sample-repo' } });
const started = (ts = 2): OrchestraEvent => ({ ...base(ts), type: 'run.started', payload: { role: 'TeamLead', model: null } });
const read = (path: string, ts = 3): OrchestraEvent => ({ ...base(ts), type: 'run.tool_call', payload: { role: 'TeamLead', tool: 'Read', summary: path, path } });
const text = (s: string, ts = 4): OrchestraEvent => ({ ...base(ts), type: 'run.text', payload: { role: 'TeamLead', text: s } });

describe('lanes reducer', () => {
  it('AC-S0.3 Team Lead lane is present before any run and waits', () => {
    const [lead, ...rest] = lanes([created()]);
    expect(lead?.role).toBe('TeamLead');
    expect(lead?.latestStep).toBe('Waiting');
    expect(lead?.working).toBe(false);
    expect(rest).toHaveLength(0);
  });

  it('AC-S0.3 the lane shows the latest step only, relative paths, working while running', () => {
    const ls = lanes([created(), started(), read('/work/sample-repo/src/math.js'), read('/work/sample-repo/package.json', 5)]);
    expect(ls[0]?.latestStep).toBe('Reading package.json');
    expect(ls[0]?.working).toBe(true);
    expect(ls[0]?.lineCounts).toBeNull();
  });

  it('AC-F3c the panel history lists each step once, in order', () => {
    const ls = lanes([created(), started(), read('src/math.js'), text('This '), text('repo '), read('package.json', 6), text('is', 7),
      { ...base(8), type: 'run.ended', payload: { role: 'TeamLead', ok: true, finalText: 'It adds numbers in src/math.js.', durationMs: 4000 } }]);
    expect(ls[0]?.history.map((h) => h.text)).toEqual(['Thinking', 'Reading src/math.js', 'Thinking', 'Reading package.json', 'Thinking', 'Done']);
  });

  it('AC-S0.3 a finished run gives the answer and stops working', () => {
    const ls = lanes([created(), started(), text('partial'),
      { ...base(9), type: 'run.ended', payload: { role: 'TeamLead', ok: true, finalText: 'It adds numbers in src/math.js.', durationMs: 4000 } }]);
    expect(ls[0]?.working).toBe(false);
    expect(ls[0]?.outcome).toBe('ok');
    expect(ls[0]?.answer?.text).toBe('It adds numbers in src/math.js.');
    expect(ls[0]?.latestStep).toBe('Done');
  });

  it('falls back to the streamed text when finalText is empty', () => {
    const ls = lanes([started(), text('Hello '), text('there'),
      { ...base(9), type: 'run.ended', payload: { role: 'TeamLead', ok: true, finalText: '', durationMs: 10 } }]);
    expect(ls[0]?.answer?.text).toBe('Hello there');
  });

  it('sorts events by seq even if they arrive out of order', () => {
    const a = started(); const b = read('src/a.js'); const c = read('src/b.js');
    expect(lanes([c, a, b])[0]?.latestStep).toBe('Reading src/b.js');
  });

  it('AC-L1 session.stopped stops a working lane', () => {
    const ls = lanes([started(), read('src/math.js'), { ...base(10), type: 'session.stopped', payload: {} }]);
    expect(ls[0]?.working).toBe(false);
    expect(ls[0]?.outcome).toBe('stopped');
    expect(ls[0]?.latestStep).toBe('Stopped');
  });

  it('a failed run carries the error for the card', () => {
    const ls = lanes([started(), { ...base(11), type: 'run.ended', payload: { role: 'TeamLead', ok: false, error: 'timeout', finalText: '', durationMs: 600000 } }]);
    expect(ls[0]?.outcome).toBe('failed');
    expect(ls[0]?.answer).toBeNull();
    expect(errorText('TeamLead', ls[0]!.error!)).toBe('Team Lead took longer than 10 min and was stopped.');
  });

  it('searching tools read as "Searching the repo"', () => {
    const ls = lanes([started(), { ...base(12), type: 'run.tool_call', payload: { role: 'TeamLead', tool: 'Grep', summary: 'add' } }]);
    expect(ls[0]?.latestStep).toBe('Searching the repo');
  });
});

describe('status', () => {
  it('AC-S0.3 plan_ready without a plan reads "Answered"', () => {
    expect(statusKey('plan_ready', [])).toBe('status.answered');
    expect(statusKey('plan_ready', [{ ...base(1), type: 'plan.proposed', payload: { plan: {} } }])).toBe('status.plan_ready');
    expect(statusKey('planning', [])).toBe('status.planning');
  });
  it('tones', () => {
    expect(statusTone('status.planning')).toBe('working');
    expect(statusTone('status.answered')).toBe('done');
    expect(statusTone('status.failed')).toBe('fail');
    expect(statusTone('status.stopped')).toBe('quiet');
  });
});

describe('relativePath', () => {
  it('handles posix and Windows roots', () => {
    expect(relativePath('/work/r/src/a.js', '/work/r')).toBe('src/a.js');
    expect(relativePath('C:\\Users\\x\\r\\src\\a.js', 'c:\\Users\\x\\r')).toBe('src/a.js');
    expect(relativePath('src/a.js', '/work/r')).toBe('src/a.js');
  });
});
