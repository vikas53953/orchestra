// Pure lane reducer: events → what each lane shows (latest step) and what the panel lists (history).
// Round 3 rule: each event is said once. The lane shows only the latest step; the panel holds the history.
import type { OrchestraEvent } from '../../shared/events';
import type { EngineError, Role, SessionState } from '../../shared/types';
import { t, type CopyKey } from '../../shared/copy';

export type LaneOutcome = 'none' | 'ok' | 'failed' | 'stopped';

export interface HistoryItem { ts: number; text: string }

export interface LaneError { error: EngineError; detail: string | null; durationMs: number; ts: number }

export interface LaneView {
  role: Role;
  /** latest step, already in plain words */
  latestStep: string;
  working: boolean;
  outcome: LaneOutcome;
  /** grey +/- counts; null while the agent has changed nothing (always null in Sprint 0, read-only) */
  lineCounts: { added: number; removed: number } | null;
  history: HistoryItem[];
  answer: { text: string; ts: number } | null;
  error: LaneError | null;
}

const ROLE_ORDER: Role[] = ['TeamLead', 'Builder', 'Tester'];
const READ_TOOLS = new Set(['Read', 'NotebookRead']);
const SEARCH_TOOLS = new Set(['Grep', 'Glob', 'LS', 'Search', 'WebSearch']);

function emptyLane(role: Role): LaneView {
  return { role, latestStep: t('lane.waiting'), working: false, outcome: 'none', lineCounts: null, history: [], answer: null, error: null };
}

/** Show paths relative to the repo when the engine reports them absolute. */
export function relativePath(path: string, repoPath: string | null): string {
  if (!repoPath) return path;
  const norm = (p: string) => p.replace(/\\/g, '/');
  const p = norm(path);
  const root = norm(repoPath).replace(/\/+$/, '');
  const winLike = /^[a-zA-Z]:\//.test(root);
  const starts = winLike ? p.toLowerCase().startsWith(`${root.toLowerCase()}/`) : p.startsWith(`${root}/`);
  return starts ? p.slice(root.length + 1) : path;
}

function toolStep(tool: string, path: string | undefined, summary: string, repoPath: string | null): string {
  if (READ_TOOLS.has(tool)) {
    const target = path ?? summary;
    return target ? t('lane.reading', { path: relativePath(target, repoPath) }) : t('lane.thinking');
  }
  if (SEARCH_TOOLS.has(tool)) return t('lane.searching');
  return t('lane.thinking');
}

function step(lane: LaneView, text: string, ts: number): void {
  lane.latestStep = text;
  const last = lane.history[lane.history.length - 1];
  if (!last || last.text !== text) lane.history.push({ ts, text });
}

/** Reduce a session's events (any order of arrival, sorted by seq here) to per-role lanes. Team Lead is always present. */
export function lanes(events: readonly OrchestraEvent[]): LaneView[] {
  const sorted = [...events].sort((a, b) => a.seq - b.seq);
  const byRole = new Map<Role, LaneView>([['TeamLead', emptyLane('TeamLead')]]);
  const get = (r: Role) => {
    let l = byRole.get(r);
    if (!l) { l = emptyLane(r); byRole.set(r, l); }
    return l;
  };
  let repoPath: string | null = null;
  const textBuf = new Map<Role, string>();

  for (const e of sorted) {
    switch (e.type) {
      case 'session.created':
        repoPath = e.payload.repoPath;
        break;
      case 'run.started': {
        const l = get(e.payload.role);
        l.working = true; l.outcome = 'none'; l.answer = null; l.error = null;
        textBuf.set(e.payload.role, '');
        step(l, t('lane.thinking'), e.ts);
        break;
      }
      case 'run.tool_call': {
        const l = get(e.payload.role);
        step(l, toolStep(e.payload.tool, e.payload.path, e.payload.summary, repoPath), e.ts);
        break;
      }
      case 'run.text': {
        const l = get(e.payload.role);
        textBuf.set(e.payload.role, (textBuf.get(e.payload.role) ?? '') + e.payload.text);
        step(l, t('lane.thinking'), e.ts);
        break;
      }
      case 'run.ended': {
        const l = get(e.payload.role);
        l.working = false;
        if (e.payload.ok) {
          l.outcome = 'ok';
          const text = (e.payload.finalText || textBuf.get(e.payload.role) || '').trim();
          l.answer = text ? { text, ts: e.ts } : null;
          step(l, t('lane.done'), e.ts);
        } else if (e.payload.error === 'stopped') {
          l.outcome = 'stopped';
          step(l, t('lane.stopped'), e.ts);
        } else {
          l.outcome = 'failed';
          l.error = { error: e.payload.error ?? 'crashed', detail: e.payload.errorDetail ?? null, durationMs: e.payload.durationMs, ts: e.ts };
          step(l, t('status.failed'), e.ts);
        }
        break;
      }
      case 'session.stopped':
        for (const l of byRole.values()) {
          if (l.working) { l.working = false; l.outcome = 'stopped'; step(l, t('lane.stopped'), e.ts); }
        }
        break;
      default:
        break;
    }
  }
  return ROLE_ORDER.filter((r) => byRole.has(r)).map((r) => byRole.get(r)!);
}

/** Status chip copy key. plan_ready without a plan.proposed event is an answered question (Sprint 0). */
export function statusKey(state: SessionState, events: readonly OrchestraEvent[]): CopyKey {
  if (state === 'plan_ready' && !events.some((e) => e.type === 'plan.proposed')) return 'status.answered';
  return `status.${state}` as CopyKey;
}

/** Tone of the status chip and sidebar dot: one colour per meaning, grey otherwise. */
export type StatusTone = 'working' | 'needs' | 'done' | 'fail' | 'quiet';
export function statusTone(key: CopyKey): StatusTone {
  switch (key) {
    case 'status.planning': case 'status.building': case 'status.testing': case 'status.shipping': return 'working';
    case 'status.plan_ready': case 'status.review_ready': return 'needs';
    case 'status.answered': case 'status.pr_opened': return 'done';
    case 'status.failed': return 'fail';
    default: return 'quiet';
  }
}

/** Error copy for a failed run, with its variables filled in. */
export function errorText(role: Role, err: LaneError): string {
  const roleName = t(`role.${role}` as CopyKey);
  switch (err.error) {
    case 'not_installed': return t('error.not_installed');
    case 'not_signed_in': return t('error.not_signed_in');
    case 'rate_limited': return err.detail ? t('error.rate_limited', { time: err.detail }) : t('error.rate_limited.noTime');
    case 'timeout': return t('error.timeout', { role: roleName, minutes: Math.max(1, Math.round(err.durationMs / 60000)) });
    case 'bad_output': return t('error.bad_output', { role: roleName });
    case 'stopped': return t('error.stopped');
    default: return t('error.crashed', { role: roleName });
  }
}
