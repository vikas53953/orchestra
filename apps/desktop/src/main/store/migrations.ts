// Numbered migrations. Spec: architecture.md §7. Owner: T3.
// 001_init is exactly the three tables + index from §7; schema_version records what ran.

export interface Migration { version: number; name: string; sql: string }

export const MIGRATIONS: Migration[] = [
  {
    version: 1,
    name: '001_init',
    sql: `
CREATE TABLE sessions (id TEXT PRIMARY KEY, title TEXT NOT NULL, task TEXT NOT NULL, repo_path TEXT NOT NULL,
  base_branch TEXT NOT NULL, branch TEXT NOT NULL, worktree_path TEXT NOT NULL, state TEXT NOT NULL,
  pr_url TEXT, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL);
CREATE TABLE runs (id TEXT PRIMARY KEY, session_id TEXT NOT NULL REFERENCES sessions(id), role TEXT NOT NULL,
  engine_session_id TEXT, model TEXT, state TEXT NOT NULL, started_at INTEGER, ended_at INTEGER,
  input_tokens INTEGER DEFAULT 0, output_tokens INTEGER DEFAULT 0, result_json TEXT, error TEXT);
CREATE TABLE events (seq INTEGER PRIMARY KEY AUTOINCREMENT, session_id TEXT NOT NULL, run_id TEXT, ts INTEGER NOT NULL,
  type TEXT NOT NULL, payload TEXT NOT NULL);
CREATE INDEX events_session ON events(session_id, seq);
`,
  },
];

export const SCHEMA_VERSION_DDL =
  'CREATE TABLE IF NOT EXISTS schema_version (version INTEGER PRIMARY KEY, name TEXT NOT NULL, applied_at INTEGER NOT NULL)';
