// Event store on node:sqlite. Spec: architecture.md §7, §9 (recovery). Owner: T3.
import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import type { EngineError, Role, Run, RunState, Session, SessionState } from '../../shared/types';
import type { NewEvent, OrchestraEvent } from '../../shared/events';
import { MIGRATIONS, SCHEMA_VERSION_DDL } from './migrations';

/** States that mean "work was in flight"; on start they become stopped (J7). */
export const IN_FLIGHT_STATES: readonly SessionState[] = ['planning', 'building', 'testing', 'shipping'];

type Row = Record<string, unknown>;

function toSession(r: Row): Session {
  return {
    id: String(r.id), title: String(r.title), task: String(r.task), repoPath: String(r.repo_path),
    baseBranch: String(r.base_branch), branch: String(r.branch), worktreePath: String(r.worktree_path),
    state: r.state as SessionState, prUrl: r.pr_url == null ? null : String(r.pr_url),
    createdAt: Number(r.created_at), updatedAt: Number(r.updated_at),
  };
}

function toRun(r: Row): Run {
  return {
    id: String(r.id), sessionId: String(r.session_id), role: r.role as Role,
    engineSessionId: r.engine_session_id == null ? null : String(r.engine_session_id),
    model: r.model == null ? null : String(r.model), state: r.state as RunState,
    startedAt: r.started_at == null ? null : Number(r.started_at),
    endedAt: r.ended_at == null ? null : Number(r.ended_at),
    inputTokens: Number(r.input_tokens ?? 0), outputTokens: Number(r.output_tokens ?? 0),
    resultJson: r.result_json == null ? null : String(r.result_json),
    error: r.error == null ? null : (r.error as EngineError),
  };
}

function toEvent(r: Row): OrchestraEvent {
  return {
    seq: Number(r.seq), sessionId: String(r.session_id), runId: r.run_id == null ? null : String(r.run_id),
    ts: Number(r.ts), type: r.type, payload: JSON.parse(String(r.payload)),
  } as OrchestraEvent;
}

export type RunPatch = Partial<Pick<Run, 'engineSessionId' | 'model' | 'state' | 'startedAt' | 'endedAt'
  | 'inputTokens' | 'outputTokens' | 'resultJson' | 'error'>>;

const RUN_COLS: Record<keyof RunPatch, string> = {
  engineSessionId: 'engine_session_id', model: 'model', state: 'state', startedAt: 'started_at',
  endedAt: 'ended_at', inputTokens: 'input_tokens', outputTokens: 'output_tokens',
  resultJson: 'result_json', error: 'error',
};

export class Store {
  readonly db: DatabaseSync;
  private readonly now: () => number;

  constructor(file: string, now: () => number = Date.now) {
    if (file !== ':memory:') mkdirSync(dirname(file), { recursive: true });
    this.db = new DatabaseSync(file);
    this.now = now;
    this.db.exec('PRAGMA journal_mode = WAL');
    this.db.exec('PRAGMA foreign_keys = ON');
    this.migrate();
  }

  /** Runs every migration not yet recorded in schema_version. Safe to call again. */
  migrate(): number[] {
    this.db.exec(SCHEMA_VERSION_DDL);
    const done = new Set(
      (this.db.prepare('SELECT version FROM schema_version').all() as Row[]).map((r) => Number(r.version)),
    );
    const applied: number[] = [];
    for (const m of MIGRATIONS) {
      if (done.has(m.version)) continue;
      this.tx(() => {
        this.db.exec(m.sql);
        this.db.prepare('INSERT INTO schema_version (version, name, applied_at) VALUES (?, ?, ?)')
          .run(m.version, m.name, this.now());
      });
      applied.push(m.version);
    }
    return applied;
  }

  schemaVersion(): number {
    const r = this.db.prepare('SELECT MAX(version) AS v FROM schema_version').get() as Row | undefined;
    return Number(r?.v ?? 0);
  }

  close(): void { this.db.close(); }

  private tx<T>(fn: () => T): T {
    this.db.exec('BEGIN IMMEDIATE');
    try {
      const out = fn();
      this.db.exec('COMMIT');
      return out;
    } catch (e) {
      this.db.exec('ROLLBACK');
      throw e;
    }
  }

  createSession(s: Omit<Session, 'createdAt' | 'updatedAt' | 'prUrl'> & { prUrl?: string | null }): Session {
    const ts = this.now();
    this.db.prepare(`INSERT INTO sessions (id, title, task, repo_path, base_branch, branch, worktree_path, state,
      pr_url, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .run(s.id, s.title, s.task, s.repoPath, s.baseBranch, s.branch, s.worktreePath, s.state,
        s.prUrl ?? null, ts, ts);
    return this.getSession(s.id)!;
  }

  updateSessionState(id: string, state: SessionState): void {
    this.db.prepare('UPDATE sessions SET state = ?, updated_at = ? WHERE id = ?').run(state, this.now(), id);
  }

  getSession(id: string): Session | null {
    const r = this.db.prepare('SELECT * FROM sessions WHERE id = ?').get(id) as Row | undefined;
    return r ? toSession(r) : null;
  }

  /** Newest first (created_at desc, then rowid desc so same-ms inserts keep order). */
  listSessions(): Session[] {
    return (this.db.prepare('SELECT * FROM sessions ORDER BY created_at DESC, rowid DESC').all() as Row[])
      .map(toSession);
  }

  createRun(r: { id: string; sessionId: string; role: Role; state?: RunState; startedAt?: number | null }): Run {
    this.db.prepare('INSERT INTO runs (id, session_id, role, state, started_at) VALUES (?, ?, ?, ?, ?)')
      .run(r.id, r.sessionId, r.role, r.state ?? 'running', r.startedAt ?? this.now());
    return this.getRun(r.id)!;
  }

  updateRun(id: string, patch: RunPatch): void {
    const keys = (Object.keys(patch) as (keyof RunPatch)[]).filter((k) => k in RUN_COLS);
    if (keys.length === 0) return;
    const sql = `UPDATE runs SET ${keys.map((k) => `${RUN_COLS[k]} = ?`).join(', ')} WHERE id = ?`;
    const vals = keys.map((k) => (patch[k] === undefined ? null : patch[k]) as string | number | null);
    this.db.prepare(sql).run(...vals, id);
  }

  getRun(id: string): Run | null {
    const r = this.db.prepare('SELECT * FROM runs WHERE id = ?').get(id) as Row | undefined;
    return r ? toRun(r) : null;
  }

  runsFor(sessionId: string): Run[] {
    return (this.db.prepare('SELECT * FROM runs WHERE session_id = ? ORDER BY rowid').all(sessionId) as Row[])
      .map(toRun);
  }

  /** Assigns seq and ts to every event in one transaction and returns them in order. */
  appendEvents(events: NewEvent[]): OrchestraEvent[] {
    if (events.length === 0) return [];
    return this.tx(() => this.insertEvents(events));
  }

  private insertEvents(events: NewEvent[]): OrchestraEvent[] {
    const stmt = this.db.prepare('INSERT INTO events (session_id, run_id, ts, type, payload) VALUES (?, ?, ?, ?, ?)');
    const out: OrchestraEvent[] = [];
    for (const e of events) {
      const ts = this.now();
      const res = stmt.run(e.sessionId, e.runId ?? null, ts, e.type, JSON.stringify(e.payload ?? {}));
      out.push({ ...e, seq: Number(res.lastInsertRowid), ts } as OrchestraEvent);
    }
    return out;
  }

  eventsFor(sessionId: string): OrchestraEvent[] {
    return (this.db.prepare('SELECT * FROM events WHERE session_id = ? ORDER BY seq').all(sessionId) as Row[])
      .map(toEvent);
  }

  /**
   * After a crash or quit mid-run: in-flight sessions become stopped with a session.stopped event (J7),
   * and their running runs become stopped. Worktrees are kept. Returns the events written.
   */
  recoverInterrupted(): OrchestraEvent[] {
    const marks = IN_FLIGHT_STATES.map(() => '?').join(', ');
    const rows = this.db.prepare(`SELECT id FROM sessions WHERE state IN (${marks})`).all(...IN_FLIGHT_STATES) as Row[];
    if (rows.length === 0) return [];
    const ids = rows.map((r) => String(r.id));
    const ts = this.now();
    return this.tx(() => {
      for (const id of ids) {
        this.db.prepare('UPDATE sessions SET state = ?, updated_at = ? WHERE id = ?').run('stopped', ts, id);
        this.db.prepare(`UPDATE runs SET state = 'stopped', error = 'stopped', ended_at = ? WHERE session_id = ? AND state = 'running'`)
          .run(ts, id);
      }
      return this.insertEvents(ids.flatMap((id): NewEvent[] => [
        { type: 'session.state', sessionId: id, runId: null, payload: { state: 'stopped' } },
        { type: 'session.stopped', sessionId: id, runId: null, payload: {} },
      ]));
    });
  }
}

export function openStore(file: string, now?: () => number): Store {
  return new Store(file, now);
}
