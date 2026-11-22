// Sprint 0 conductor: one Team Lead answers a question about a repo, read-only, in its own worktree.
// Spec: architecture.md §3, §6, §9; PRD.md R0.4; test-contract AC-S0.3, AC-F1b, AC-L1, AC-L2, J9. Owner: T3.
import { randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import type { Engine, EngineEvent, RunRequest, RunResult } from '../../shared/engine';
import type { NewEvent, OrchestraEvent } from '../../shared/events';
import type { EventsAppendPush, SessionCreateRequest } from '../../shared/ipc';
import type { EngineError, Role, Session, SessionState } from '../../shared/types';
import type { Store } from '../store';
import { worktreePath as defaultWorktreePath } from '../paths';
import { EventBatcher, PUSH_BATCH_MS } from './batcher';
import { repoTopLevel, runGit, type RunGit } from './git';

export const TITLE_MAX = 60;
export const STOP_DEADLINE_MS = 2_000;

/** Sprint 0 Team Lead ask prompt (decision logged for the lead). */
export const ASK_SYSTEM_APPEND =
  'You are Team Lead in Orchestra, leading a small coding crew in the repository in your current folder. ' +
  'Answer the question about this repository. Read only what you need. Do not edit files. ' +
  'Answer in plain words, under 150 words, and name the files you looked at.';

export const ASK_LIMITS = {
  permissionMode: 'plan',
  allowedTools: ['Read', 'Grep', 'Glob', 'LS'],
  disallowedTools: ['Edit', 'Write', 'Bash', 'WebFetch'],
  maxTurns: 30,
  timeoutMs: 5 * 60_000,
} as const;

/**
 * Error codes crossing IPC. Electron keeps only the message of a rejected invoke, so the code is the
 * message prefix "orchestra:<code>". The renderer maps not_git to copy key home.repo.notGit (AC-F1b).
 */
export type SessionErrorCode = 'not_git' | 'empty_task' | 'no_commits' | 'worktree_failed' | 'bad_request';
export class SessionError extends Error {
  constructor(readonly code: SessionErrorCode, detail?: string) {
    super(`orchestra:${code}${detail ? ` ${detail}` : ''}`);
    this.name = 'SessionError';
  }
}

/** Title = the task on one line, cut to 60 chars at a word boundary (J9). */
export function makeTitle(task: string, max = TITLE_MAX): string {
  const flat = task.replace(/\s+/g, ' ').trim();
  if (flat.length <= max) return flat;
  const cut = flat.slice(0, max + 1);
  const space = cut.lastIndexOf(' ');
  return (space > 0 ? cut.slice(0, space) : flat.slice(0, max)).trimEnd();
}

export interface ConductorDeps {
  store: Store;
  /** Called per run, so an engine that cannot be built fails one run, not the app. */
  engine: () => Engine;
  push: (p: EventsAppendPush) => void;
  git?: RunGit;
  worktreePathFor?: (repoPath: string, sessionId: string) => string;
  newId?: () => string;
  batchMs?: number;
}

interface Active {
  sessionId: string;
  runId: string;
  ac: AbortController;
  done: Promise<void>;
  finished: boolean;
  /** ends the run as stopped without waiting for the engine */
  forceStop: () => void;
}

export class Conductor {
  private readonly active = new Map<string, Active>();
  private readonly batcher: EventBatcher;
  private readonly git: RunGit;
  private readonly wtPath: (repoPath: string, sessionId: string) => string;
  private readonly newId: () => string;

  constructor(private readonly deps: ConductorDeps) {
    this.batcher = new EventBatcher(deps.push, deps.batchMs ?? PUSH_BATCH_MS);
    this.git = deps.git ?? runGit;
    this.wtPath = deps.worktreePathFor ?? ((r, id) => defaultWorktreePath(r, id));
    this.newId = deps.newId ?? randomUUID;
  }

  private emit(events: NewEvent[]): OrchestraEvent[] {
    const saved = this.deps.store.appendEvents(events);
    this.batcher.add(saved);
    return saved;
  }

  private setState(sessionId: string, state: SessionState): void {
    this.deps.store.updateSessionState(sessionId, state);
    this.emit([{ type: 'session.state', sessionId, runId: null, payload: { state } }]);
  }

  /** Validates, makes the worktree, stores the session, and starts the Team Lead run in the background. */
  async createSession(req: SessionCreateRequest): Promise<Session> {
    const task = req.task.trim();
    if (task === '') throw new SessionError('empty_task');
    const top = await repoTopLevel(req.repoPath, this.git);
    if (!top) throw new SessionError('not_git');
    const repoPath = resolve(top);

    const head = await this.git(['-C', repoPath, 'rev-parse', '--verify', '--quiet', 'HEAD']);
    if (!head.ok) throw new SessionError('no_commits');
    const br = await this.git(['-C', repoPath, 'rev-parse', '--abbrev-ref', 'HEAD']);
    const baseBranch = br.ok ? br.stdout.trim() : 'HEAD';

    const id = this.newId();
    const worktreePath = this.wtPath(repoPath, id);
    const wt = await this.git(['-C', repoPath, 'worktree', 'add', '--detach', worktreePath, 'HEAD'], 120_000);
    if (!wt.ok) throw new SessionError('worktree_failed', wt.stderr.trim().slice(0, 300));

    const title = makeTitle(task);
    const session = this.deps.store.createSession({
      id, title, task, repoPath, baseBranch, branch: '', worktreePath, state: 'planning',
    });
    this.emit([
      { type: 'session.created', sessionId: id, runId: null, payload: { title, task, repoPath } },
      { type: 'session.state', sessionId: id, runId: null, payload: { state: 'planning' } },
    ]);
    this.startTeamLead(session);
    return session;
  }

  private startTeamLead(session: Session): void {
    const role: Role = 'TeamLead';
    const runId = this.newId();
    const sessionId = session.id;
    this.deps.store.createRun({ id: runId, sessionId, role });
    const ac = new AbortController();
    const a: Active = { sessionId, runId, ac, done: Promise.resolve(), finished: false, forceStop: () => undefined };
    let started = false;
    const t0 = Date.now();

    const ensureStarted = (model: string | null): void => {
      if (started) return;
      started = true;
      this.emit([{ type: 'run.started', sessionId, runId, payload: { role, model } }]);
    };

    const onEvent = (e: EngineEvent): void => {
      if (a.finished) return;
      switch (e.kind) {
        case 'started':
          this.deps.store.updateRun(runId, { engineSessionId: e.engineSessionId, model: e.model });
          ensureStarted(e.model);
          break;
        case 'text':
          ensureStarted(null);
          this.emit([{ type: 'run.text', sessionId, runId, payload: { role, text: e.text } }]);
          break;
        case 'tool_call':
          ensureStarted(null);
          this.emit([{
            type: 'run.tool_call', sessionId, runId,
            payload: e.path !== undefined ? { role, tool: e.tool, summary: e.summary, path: e.path } : { role, tool: e.tool, summary: e.summary },
          }]);
          break;
        case 'tool_result':
          ensureStarted(null);
          this.emit([{ type: 'run.tool_result', sessionId, runId, payload: { role, tool: e.tool, ok: e.ok, summary: e.summary } }]);
          break;
        case 'usage':
          this.deps.store.updateRun(runId, { inputTokens: e.inputTokens, outputTokens: e.outputTokens });
          break;
      }
    };

    const finish = (res: RunResult): void => {
      if (a.finished) return;
      a.finished = true;
      this.active.delete(sessionId);
      ensureStarted(null);
      const ok = res.ok;
      const error: EngineError | undefined = ok ? undefined : (res.error ?? 'crashed');
      this.deps.store.updateRun(runId, {
        state: ok ? 'ok' : error === 'stopped' ? 'stopped' : 'failed',
        endedAt: Date.now(), error: error ?? null, resultJson: ok ? JSON.stringify({ finalText: res.finalText }) : null,
      });
      const payload = {
        role, ok, finalText: res.finalText, durationMs: res.durationMs,
        ...(error ? { error } : {}), ...(res.errorDetail ? { errorDetail: res.errorDetail } : {}),
      };
      this.emit([{ type: 'run.ended', sessionId, runId, payload }]);
      if (ok) {
        this.setState(sessionId, 'plan_ready'); // no plan.proposed -> renderer shows "Answered"
      } else if (error === 'stopped') {
        this.setState(sessionId, 'stopped');
        this.emit([{ type: 'session.stopped', sessionId, runId: null, payload: {} }]);
      } else {
        this.setState(sessionId, 'failed');
      }
      this.batcher.flush();
    };

    const req: RunRequest = {
      role, cwd: session.worktreePath, prompt: session.task, systemAppend: ASK_SYSTEM_APPEND,
      permissionMode: ASK_LIMITS.permissionMode, allowedTools: [...ASK_LIMITS.allowedTools],
      disallowedTools: [...ASK_LIMITS.disallowedTools], maxTurns: ASK_LIMITS.maxTurns, timeoutMs: ASK_LIMITS.timeoutMs,
    };

    this.active.set(sessionId, a);
    a.done = (async () => {
      let res: RunResult;
      try {
        res = await this.deps.engine().run(req, onEvent, ac.signal);
      } catch (err) {
        res = {
          ok: false, finalText: '', error: ac.signal.aborted ? 'stopped' : 'crashed',
          errorDetail: err instanceof Error ? err.message : String(err), durationMs: Date.now() - t0,
        };
      }
      if (ac.signal.aborted && !res.ok) res = { ...res, error: 'stopped' };
      finish(res);
    })();
    a.forceStop = () => finish({ ok: false, finalText: '', error: 'stopped', durationMs: Date.now() - t0 });
  }

  /** Aborts the run; the session is stopped with session.stopped within 2 s even if the engine lingers (AC-L1). */
  async stop(sessionId: string): Promise<void> {
    const a = this.active.get(sessionId);
    if (!a) return;
    a.ac.abort();
    let timer: NodeJS.Timeout | undefined;
    const deadline = new Promise<void>((r) => { timer = setTimeout(r, STOP_DEADLINE_MS - 250); });
    await Promise.race([a.done, deadline]);
    clearTimeout(timer);
    if (!a.finished) a.forceStop();
  }

  async stopAll(): Promise<void> {
    await Promise.all([...this.active.keys()].map((id) => this.stop(id)));
  }

  runningSessionIds(): string[] { return [...this.active.keys()]; }

  /** Resolves when the session's run has ended (tests and shutdown). */
  async whenDone(sessionId: string): Promise<void> {
    await this.active.get(sessionId)?.done;
  }

  flush(): void { this.batcher.flush(); }
}
