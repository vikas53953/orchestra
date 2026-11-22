// Spec: docs/spec/architecture.md §4-§8, canonical-names.md. Owner: lead (T1). Tickets request changes, never edit.

export type Role = 'TeamLead' | 'Builder' | 'Tester';

/** Session states (canonical-names.md). Sprint 0 uses: planning (asking), plan_ready (answered), stopped, failed. */
export type SessionState =
  | 'draft' | 'planning' | 'plan_ready' | 'building' | 'testing'
  | 'review_ready' | 'shipping' | 'pr_opened' | 'declined' | 'stopped' | 'failed';

export type RunState = 'running' | 'ok' | 'failed' | 'stopped';

export interface Session {
  id: string;
  title: string;
  task: string;
  repoPath: string;
  baseBranch: string;
  branch: string;
  worktreePath: string;
  state: SessionState;
  prUrl: string | null;
  createdAt: number;
  updatedAt: number;
}

export interface Run {
  id: string;
  sessionId: string;
  role: Role;
  engineSessionId: string | null;
  model: string | null;
  state: RunState;
  startedAt: number | null;
  endedAt: number | null;
  inputTokens: number;
  outputTokens: number;
  resultJson: string | null;
  error: EngineError | null;
}

export type EngineError =
  | 'not_installed' | 'not_signed_in' | 'rate_limited' | 'timeout'
  | 'bad_output' | 'crashed' | 'stopped';

export type SetupItemId = 'claude' | 'claude_signed_in' | 'git' | 'gh' | 'disk';
export type SetupItemStatus = 'ok' | 'missing' | 'warn';
export interface SetupItem {
  id: SetupItemId;
  status: SetupItemStatus;
  /** copy key for the fix instruction, shown when status != ok */
  fixKey: string | null;
  detail: string | null; // e.g. version string or free GB
  /** for the disk item: the drive or mount checked, e.g. "C:" (fills {drive} in setup.fix.disk) */
  drive?: string;
}
export interface SetupReport {
  items: SetupItem[];
  /** true when no item blocks starting a session (gh and disk only warn in Sprint 0) */
  canStart: boolean;
  checkedAt: number;
}
