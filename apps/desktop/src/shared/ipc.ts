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
