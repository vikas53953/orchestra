// Spec: docs/spec/architecture.md §8. Owner: lead (T1). Channel names are canonical.
import type { Session, SetupReport } from './types';
import type { OrchestraEvent } from './events';

export const IPC = {
  setupCheck: 'setup:check',
  repoPick: 'repo:pick',
  sessionCreate: 'session:create',
  sessionList: 'session:list',
  sessionGet: 'session:get',
  planApprove: 'plan:approve',
  planChange: 'plan:change',
  reviewApprove: 'review:approve',
  reviewDecline: 'review:decline',
  sessionStop: 'session:stop',
  diffGet: 'diff:get',
  eventsAppend: 'events:append',
} as const;

/** Errors cross IPC as Error messages prefixed "orchestra:<code>" (Electron keeps only the message). */
export const IPC_ERROR_PREFIX = 'orchestra:';
export type IpcErrorCode = 'not_git' | 'empty_task' | 'no_commits' | 'worktree_failed' | 'bad_request';
/** Renderer copy key for each IPC error code. */
export const IPC_ERROR_COPY = {
  not_git: 'home.repo.notGit',
  empty_task: 'home.error.emptyTask',
  no_commits: 'home.error.noCommits',
  worktree_failed: 'home.error.worktreeFailed',
  bad_request: 'home.error.badRequest',
} as const;
export function ipcErrorCode(err: unknown): IpcErrorCode | null {
  const msg = err instanceof Error ? err.message : String(err);
  const m = /orchestra:(not_git|empty_task|no_commits|worktree_failed|bad_request)/.exec(msg);
  return m ? (m[1] as IpcErrorCode) : null;
}

export interface RepoPickResult { path: string; name: string; isGitRepo: boolean }
export interface SessionCreateRequest { repoPath: string; task: string }
export interface SessionWithEvents { session: Session; events: OrchestraEvent[] }
export interface EventsAppendPush { sessionId: string; events: OrchestraEvent[] }

/** The API the preload exposes as window.orchestra. Sprint 0 implements the first six. */
export interface OrchestraApi {
  setupCheck(force?: boolean): Promise<SetupReport>;
  repoPick(): Promise<RepoPickResult | null>;
  sessionCreate(req: SessionCreateRequest): Promise<Session>;
  sessionList(): Promise<Session[]>;
  sessionGet(id: string): Promise<SessionWithEvents | null>;
  sessionStop(id: string): Promise<void>;
  onEvents(cb: (push: EventsAppendPush) => void): () => void;
}

declare global {
  interface Window { orchestra: OrchestraApi }
}
