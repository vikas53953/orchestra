// DEV ONLY (imported behind import.meta.env.DEV): a fake window.orchestra for `vite` with scripted events at real
// delays, plus URL hash states for screenshots: #home #setup #running #answered #failed #long-names #loading #panel.
// Synthetic data only.
import type { OrchestraApi, RepoPickResult, EventsAppendPush } from '../../shared/ipc';
import type { OrchestraEvent, NewEvent } from '../../shared/events';
import type { Session, SetupReport } from '../../shared/types';
import { useApp } from '../store/appStore';

const T0 = new Date(2026, 10, 22, 14, 41, 0).getTime();
const LONG_REPO = 'a-very-long-repository-folder-name-that-keeps-going-and-going-for-eighty-chars-x';
const REPOS: RepoPickResult[] = [
  { path: 'C:\\code\\sample-repo', name: 'sample-repo', isGitRepo: true },
  { path: 'C:\\Users\\dev\\Downloads\\notes', name: 'notes', isGitRepo: false },
  { path: `C:\\code\\${LONG_REPO}`, name: LONG_REPO, isGitRepo: true },
];
const ANSWER = 'This is a small calculator library. `src/math.js` exports **add**, **subtract**, **multiply** and **divide**, and `test/math.test.js` checks each one with Node\'s built-in test runner.\n\n`package.json` names it mini-math and has one script, `npm test`. There is no build step and no dependencies.';

const hash = () => (typeof location !== 'undefined' ? location.hash.replace('#', '') : '');
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

let seq = 0;
const sessions = new Map<string, Session>();
const events = new Map<string, OrchestraEvent[]>();
const listeners = new Set<(p: EventsAppendPush) => void>();
const timers = new Map<string, boolean>();
let pickIndex = 0;

function trimTitle(task: string): string {
  const one = task.replace(/\s+/g, ' ').trim();
  if (one.length <= 60) return one;
  const cut = one.slice(0, 61);
  const at = cut.lastIndexOf(' ');
  return (at > 20 ? cut.slice(0, at) : one.slice(0, 60)).trim();
}

function makeSession(id: string, task: string, repoPath: string, createdAt: number, state: Session['state']): Session {
  const s: Session = { id, title: trimTitle(task), task, repoPath, baseBranch: 'main', branch: `orchestra/${id}`, worktreePath: `${repoPath}-wt`, state, prUrl: null, createdAt, updatedAt: createdAt };
  sessions.set(id, s);
  events.set(id, []);
  return s;
}

function record(id: string, e: NewEvent, ts: number, push = true): void {
  const full = { ...e, seq: ++seq, ts } as OrchestraEvent;
  events.get(id)!.push(full);
  const s = sessions.get(id)!;
  if (full.type === 'session.state') sessions.set(id, { ...s, state: full.payload.state, updatedAt: ts });
  if (full.type === 'session.stopped') sessions.set(id, { ...s, state: 'stopped', updatedAt: ts });
  if (push) listeners.forEach((l) => l({ sessionId: id, events: [full] }));
}

type Step = { delay: number; e: (id: string) => NewEvent };
const ev = <E extends NewEvent>(x: Omit<E, 'sessionId'>) => (id: string) => ({ ...x, sessionId: id }) as NewEvent;
const run = 'run-1';

function script(task: string, repoPath: string, end: 'ok' | 'fail' | 'open'): Step[] {
  const steps: Step[] = [
    { delay: 0, e: ev({ type: 'session.created', runId: null, payload: { title: trimTitle(task), task, repoPath } }) },
    { delay: 0, e: ev({ type: 'session.state', runId: null, payload: { state: 'planning' } }) },
    { delay: 400, e: ev({ type: 'run.started', runId: run, payload: { role: 'TeamLead', model: null } }) },
    { delay: 900, e: ev({ type: 'run.tool_call', runId: run, payload: { role: 'TeamLead', tool: 'Read', summary: 'src/math.js', path: `${repoPath}\\src\\math.js` } }) },
    { delay: 1100, e: ev({ type: 'run.tool_call', runId: run, payload: { role: 'TeamLead', tool: 'Read', summary: 'package.json', path: `${repoPath}\\package.json` } }) },
  ];
  if (end === 'open') return steps;
  if (end === 'fail') {
    return [...steps,
      { delay: 1200, e: ev({ type: 'run.ended', runId: run, payload: { role: 'TeamLead', ok: false, error: 'timeout', finalText: '', durationMs: 600000 } }) },
      { delay: 0, e: ev({ type: 'session.state', runId: null, payload: { state: 'failed' } }) }];
  }
  const words = ANSWER.split(/(?<=\. )/);
  return [...steps,
    ...words.map((w, i) => ({ delay: i === 0 ? 900 : 300, e: ev({ type: 'run.text', runId: run, payload: { role: 'TeamLead', text: w } }) })),
    { delay: 500, e: ev({ type: 'run.ended', runId: run, payload: { role: 'TeamLead', ok: true, finalText: ANSWER, durationMs: 6200 } }) },
    { delay: 0, e: ev({ type: 'session.state', runId: null, payload: { state: 'plan_ready' } }) }];
}

/** Play a script live, at real delays (never 0 ms per line except paired state changes). */
async function play(id: string, steps: Step[]): Promise<void> {
  timers.set(id, true);
  for (const s of steps) {
    if (s.delay) await sleep(s.delay);
    if (!timers.get(id)) return;
    record(id, s.e(id), Date.now());
  }
  timers.delete(id);
}

/** Lay a script down instantly with fixed timestamps (for hash states). */
function seed(id: string, steps: Step[], start: number): void {
  let ts = start;
  for (const s of steps) { ts += s.delay; record(id, s.e(id), ts, false); }
}

function setupReport(): SetupReport {
  const blocked = hash() === 'setup';
  return {
    canStart: !blocked,
    checkedAt: Date.now(),
    items: [
      blocked ? { id: 'claude', status: 'missing', fixKey: 'setup.fix.claude', detail: null } : { id: 'claude', status: 'ok', fixKey: null, detail: '2.1.0' },
      blocked ? { id: 'claude_signed_in', status: 'missing', fixKey: 'setup.fix.claude_signed_in', detail: null } : { id: 'claude_signed_in', status: 'ok', fixKey: null, detail: null },
      { id: 'git', status: 'ok', fixKey: null, detail: '2.47.1' },
      blocked ? { id: 'gh', status: 'warn', fixKey: 'setup.fix.gh', detail: null } : { id: 'gh', status: 'ok', fixKey: null, detail: null },
      { id: 'disk', status: 'ok', fixKey: null, detail: '84 GB free' },
    ],
  };
}

function seedHashState(): void {
  const h = hash();
  const repo = REPOS[0]!.path;
  if (['running', 'answered', 'failed', 'panel', 'loading', 'long-names'].includes(h)) {
    makeSession('s-old-2', 'Explain the build script', repo, T0 - 3 * 3600e3, 'planning');
    seed('s-old-2', script('Explain the build script', repo, 'ok'), T0 - 3 * 3600e3);
    makeSession('s-old-1', 'Where are the math helpers tested?', repo, T0 - 3600e3, 'stopped');
    record('s-old-1', { sessionId: 's-old-1', runId: null, type: 'session.stopped', payload: {} }, T0 - 3500e3, false);
  }
  if (h === 'long-names') {
    makeSession('s-long', 'Find out why the divide helper returns Infinity for some inputs and explain what to change', `C:\\code\\${LONG_REPO}`, T0, 'plan_ready');
    seed('s-long', script('Find out why the divide helper returns Infinity for some inputs and explain what to change', `C:\\code\\${LONG_REPO}`, 'ok'), T0);
    return;
  }
  const end = h === 'running' || h === 'loading' ? 'open' : h === 'failed' ? 'fail' : 'ok';
  if (['running', 'answered', 'failed', 'panel', 'loading'].includes(h)) {
    makeSession('s-main', 'What does this repo do?', repo, T0, 'planning');
    seed('s-main', script('What does this repo do?', repo, end), T0);
  }
}
export function installMockApi(): void {
  seedHashState();
  const api: OrchestraApi = {
    async setupCheck() { await sleep(250); return setupReport(); },
    async repoPick() { await sleep(200); const r = REPOS[pickIndex % REPOS.length]!; pickIndex++; return r; },
    async sessionCreate({ repoPath, task }) {
      await sleep(250);
      const id = `s-${Date.now().toString(36)}`;
      const s = makeSession(id, task, repoPath, Date.now(), 'planning');
      void play(id, script(task, repoPath, 'ok'));
      return s;
    },
    async sessionList() { await sleep(120); return [...sessions.values()]; },
    async sessionGet(id) {
      if (hash() === 'loading' && id === 's-main') return new Promise(() => undefined);
      await sleep(300);
      const s = sessions.get(id);
      return s ? { session: s, events: [...(events.get(id) ?? [])] } : null;
    },
    async sessionStop(id) {
      await sleep(200);
      timers.set(id, false);
      record(id, { sessionId: id, runId: run, type: 'run.ended', payload: { role: 'TeamLead', ok: false, error: 'stopped', finalText: '', durationMs: 0 } }, Date.now());
      record(id, { sessionId: id, runId: null, type: 'session.stopped', payload: {} }, Date.now());
    },
    onEvents(cb) { listeners.add(cb); return () => listeners.delete(cb); },
  };
  window.orchestra = api;
}

/** Drive the store into the state the hash names (after the app has mounted). */
export function applyHashState(): void {
  const h = hash();
  const st = useApp.getState();
  if (h === 'home') st.setRepo(REPOS[0]!);
  if (h === 'long-names') { st.setRepo(REPOS[2]!); return; }
  if (['running', 'answered', 'failed', 'panel', 'loading'].includes(h)) {
    void st.openSession('s-main').then(() => { if (h === 'panel') useApp.getState().togglePanel(true); });
  }
}
