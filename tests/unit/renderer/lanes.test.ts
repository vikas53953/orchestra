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

// Lane states per PRD §2 / AC-S0.3 and the error copy per architecture.md §9.
const ended = (p: Partial<Extract<OrchestraEvent, { type: 'run.ended' }>['payload']>, ts = 20, role: 'TeamLead' | 'Builder' | 'Tester' = 'TeamLead'): OrchestraEvent =>
  ({ ...base(ts), type: 'run.ended', payload: { role, ok: true, finalText: '', durationMs: 1000, ...p } });
const call = (tool: string, summary: string, path?: string, role: 'TeamLead' | 'Builder' | 'Tester' = 'TeamLead'): OrchestraEvent =>
  ({ ...base(5), type: 'run.tool_call', payload: { role, tool, summary, ...(path !== undefined ? { path } : {}) } });

describe('lanes reducer: steps per tool', () => {
  it.each([
    ['Read', 'src/a.js', undefined, 'Reading src/a.js'],
    ['NotebookRead', 'nb.ipynb', 'nb.ipynb', 'Reading nb.ipynb'],
    ['Read', '', undefined, 'Thinking'],
    ['Glob', '**/*.ts', undefined, 'Searching the repo'],
    ['LS', '.', undefined, 'Searching the repo'],
    ['Search', 'x', undefined, 'Searching the repo'],
    ['WebSearch', 'x', undefined, 'Searching the repo'],
    ['Edit', 'src/a.js', 'src/a.js', 'Thinking'],
    ['Bash', 'npm test', undefined, 'Thinking'],
  ])('%s %j -> %s', (tool, summary, path, want) => {
    expect(lanes([started(), call(tool, summary, path)])[0]?.latestStep).toBe(want);
  });

  it('Read prefers the path over the summary, made relative to the repo', () => {
    expect(lanes([created(), started(), call('Read', 'ignored', '/work/sample-repo/lib/x.js')])[0]?.latestStep).toBe('Reading lib/x.js');
  });
});

describe('lanes reducer: run lifecycle', () => {
  it('lanes come out in crew order whatever order roles first appear in', () => {
    const tester: OrchestraEvent = { ...base(3), type: 'run.started', payload: { role: 'Tester', model: null } };
    const builder: OrchestraEvent = { ...base(4), type: 'run.started', payload: { role: 'Builder', model: null } };
    expect(lanes([tester, builder]).map((l) => l.role)).toEqual(['TeamLead', 'Builder', 'Tester']);
    expect(lanes([tester]).map((l) => l.role)).toEqual(['TeamLead', 'Tester']);
    const b = lanes([builder, call('Read', 'a.js', undefined, 'Builder')]);
    expect(b[1]).toMatchObject({ role: 'Builder', working: true, latestStep: 'Reading a.js' });
    expect(b[0]).toMatchObject({ role: 'TeamLead', working: false, latestStep: 'Waiting', history: [] });
  });

  it('a new run clears the previous answer and error and starts working again', () => {
    const ls = lanes([started(2), ended({ ok: false, error: 'crashed' }, 3), started(4)]);
    expect(ls[0]).toMatchObject({ working: true, outcome: 'none', answer: null, error: null, latestStep: 'Thinking' });
    const ok = lanes([started(2), text('old', 3), ended({ finalText: 'first' }, 4), started(5), ended({}, 6)]);
    expect(ok[0]?.answer).toBeNull(); // the old run's streamed text does not leak into the new one
  });

  it('answer is the trimmed final text, else the streamed text; nothing when both are blank', () => {
    expect(lanes([started(), ended({ finalText: '  Hi.\n' })])[0]?.answer).toEqual({ text: 'Hi.', ts: 20 });
    expect(lanes([started(), text('  '), ended({ finalText: '' })])[0]?.answer).toBeNull();
    expect(lanes([started(), ended({ finalText: '' })])[0]?.answer).toBeNull();
    expect(lanes([text('no start '), text('event'), ended({ finalText: '' })])[0]?.answer?.text).toBe('no start event');
  });

  it('a failed run: Failed step, error with detail and duration, defaults to crashed', () => {
    const l = lanes([started(), ended({ ok: false, error: 'rate_limited', errorDetail: '3pm', durationMs: 1234 })])[0]!;
    expect(l).toMatchObject({ working: false, outcome: 'failed', latestStep: 'Failed', answer: null });
    expect(l.error).toEqual({ error: 'rate_limited', detail: '3pm', durationMs: 1234, ts: 20 });
    expect(l.history.map((h) => h.text)).toEqual(['Thinking', 'Failed']);
    expect(lanes([started(), ended({ ok: false })])[0]?.error).toEqual({ error: 'crashed', detail: null, durationMs: 1000, ts: 20 });
  });

  it('a stopped run reads Stopped and is not an error', () => {
    const l = lanes([started(), ended({ ok: false, error: 'stopped' })])[0]!;
    expect(l).toMatchObject({ working: false, outcome: 'stopped', latestStep: 'Stopped', error: null });
  });

  it('session.stopped leaves finished lanes as they are', () => {
    const l = lanes([started(), ended({ finalText: 'ok' }), { ...base(30), type: 'session.stopped', payload: {} }])[0]!;
    expect(l).toMatchObject({ outcome: 'ok', latestStep: 'Done' });
    expect(l.history.map((h) => h.text)).toEqual(['Thinking', 'Done']);
  });

  it('events that are not lane events change nothing', () => {
    const before = lanes([started()]);
    const after = lanes([started(), { ...base(9), type: 'session.state', payload: { state: 'planning' } }, { ...base(10), type: 'run.tool_result', payload: { role: 'TeamLead', tool: 'Read', ok: true, summary: 'x' } }]);
    expect(after).toEqual(before);
  });
});

describe('status tones (one colour per meaning)', () => {
  it.each([
    ['status.planning', 'working'], ['status.building', 'working'], ['status.testing', 'working'], ['status.shipping', 'working'],
    ['status.plan_ready', 'needs'], ['status.review_ready', 'needs'],
    ['status.answered', 'done'], ['status.pr_opened', 'done'],
    ['status.failed', 'fail'],
    ['status.draft', 'quiet'], ['status.declined', 'quiet'], ['status.stopped', 'quiet'],
  ] as const)('%s -> %s', (key, tone) => {
    expect(statusTone(key)).toBe(tone);
  });
  it('other states keep their own key', () => {
    expect(statusKey('review_ready', [])).toBe('status.review_ready');
    expect(statusKey('failed', [{ ...base(1), type: 'plan.proposed', payload: { plan: {} } }])).toBe('status.failed');
  });
});

describe('errorText (architecture.md §9 copy)', () => {
  const err = (error: Parameters<typeof errorText>[1]['error'], detail: string | null = null, durationMs = 1000) => ({ error, detail, durationMs, ts: 1 });
  it.each([
    ['not_installed', null, 'Claude Code was not found on this PC.'],
    ['not_signed_in', null, 'Claude Code is not signed in. Run `claude` once and sign in.'],
    ['rate_limited', '3pm', 'Claude usage limit reached. Try again after 3pm.'],
    ['rate_limited', null, 'Claude usage limit reached. Try again later.'],
    ['rate_limited', '', 'Claude usage limit reached. Try again later.'],
    ['bad_output', null, "Builder's reply couldn't be read."],
    ['stopped', null, 'Stopped.'],
    ['crashed', null, 'Builder stopped unexpectedly.'],
  ] as const)('%s', (e, detail, want) => {
    expect(errorText('Builder', err(e, detail))).toBe(want);
  });
  it('timeout minutes are rounded, at least 1', () => {
    expect(errorText('Tester', err('timeout', null, 10_000))).toBe('Tester took longer than 1 min and was stopped.');
    expect(errorText('Tester', err('timeout', null, 150_000))).toBe('Tester took longer than 3 min and was stopped.');
  });
});

describe('relativePath edge cases', () => {
  it('no repo, trailing slashes, siblings and case', () => {
    expect(relativePath('/work/r/a.js', null)).toBe('/work/r/a.js');
    expect(relativePath('/work/r/a.js', '/work/r//')).toBe('a.js');
    expect(relativePath('/work/r2/a.js', '/work/r')).toBe('/work/r2/a.js');
    expect(relativePath('/Work/r/a.js', '/work/r')).toBe('/Work/r/a.js');
    expect(relativePath('D:\\other\\a.js', 'C:\\r')).toBe('D:\\other\\a.js');
    expect(relativePath('C:/R/sub/a.js', 'c:/r/')).toBe('sub/a.js');
  });
});
