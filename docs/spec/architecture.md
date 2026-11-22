# Orchestra architecture — Sprint 0-1 (HLD + LLD)            DRAFT 2026-11-22

## 1. HLD in plain words

```
 ┌──────────────── Orchestra.exe (Electron) ───────────────────────────────┐
 │  Renderer (React UI: Home, Session, lanes, cards, panel)                │
 │        ▲ typed IPC (events down, commands up)                           │
 │  Main process (Node, TypeScript)                                        │
 │   ├ Conductor     — runs a session: plan → OK → Builder → Tester → OK   │
 │   ├ Engine adapter — ClaudeCodeEngine: spawns `claude -p` per agent run │
 │   ├ Workspace     — git worktree per session, commits, push, gh pr      │
 │   ├ Event store   — SQLite, append-only events; UI replays from it     │
 │   └ Setup check   — claude / git / gh / disk                            │
 └──────────────────────────────┬──────────────────────────────────────────┘
        child processes ────────┼─────────────────────────────
   claude (his sign-in)    git (his config)     gh (his sign-in)
        │                      │                     │
   Anthropic           his repo + worktree        GitHub (only after Approve)
```

- The UI never talks to Claude, git or GitHub directly. It sends commands; the main process does the work and appends events; the UI draws from events. This is the same shape Devin uses (ACP: JSON-RPC session/update events over one channel) [exact: devin-bots-teardown round 3], kept local.
- One agent run = one `claude` child process with a role, a working folder (the worktree) and a tool allowlist. The Conductor decides who runs next; agents never call each other.
- Riskiest area: driving Claude Code headless with his subscription sign-in, several runs per task, and parsing its stream reliably on Windows. Sprint 0's real-AI test exists to prove this on day 1-2.

## 2. Stack [mechanical unless marked]
Electron 45 (pinned) · React 18 + TypeScript strict · Vite (renderer) + tsc (main, preload) · Zustand store · CSS variables from round 3 tokens (no CSS framework) · node:sqlite (built into Electron's Node; no native build) · node:child_process (spawn with argument arrays) · Vitest (unit) · Playwright for Electron (e2e) · electron-builder NSIS (per-user) · GitHub Actions windows-latest.
Fonts: Inter (bundled, weights 330-600) [decision: round 3].

## 3. Processes and folders
- Data folder: `%APPDATA%\Orchestra` (settings.json, orchestra.db, logs\). Worktrees folder: default `<repo drive>:\.orchestra-worktrees\<repoName>\<sessionId>` so the C: drive is not filled when repos live elsewhere; changeable in Settings.
- Session branch: `orchestra/<slug>-<id4>` from the repo's current HEAD branch (base branch recorded).
- All children are spawned with `windowsHide: true`, tracked by PID, and killed (tree kill) on Stop, app quit, or crash recovery.

## 4. Engine adapter (LLD)
```ts
interface Engine {
  id: 'claude-code' | 'cassette';                     // CR-2: 'cassette' replays recorded replies, tests only
  probe(opts?: { signedIn?: boolean }): Promise<ProbeResult>;                       // installed? signed in? version
  run(req: RunRequest, onEvent: (e: EngineEvent) => void, signal: AbortSignal): Promise<RunResult>;
}
type RunRequest = { role: Role; cwd: string; prompt: string; systemAppend: string;
  allowedTools: string[]; disallowedTools: string[]; permissionMode: 'plan'|'acceptEdits';
  maxTurns: number; timeoutMs: number; resumeSessionId?: string;
  outputSchema?: (value: unknown) => boolean };          // CR-2: a check function per role schema
type EngineEvent =
 | { kind: 'started'; engineSessionId: string; model: string }
 | { kind: 'text'; text: string }                       // assistant prose, streamed
 | { kind: 'tool_call'; tool: string; summary: string; path?: string }
 | { kind: 'tool_result'; tool: string; ok: boolean; summary: string }
 | { kind: 'usage'; inputTokens: number; outputTokens: number };
type RunResult = { ok: boolean; finalText: string; json?: unknown; error?: EngineError;
  errorDetail?: string;                                 // CR-2: plain detail, e.g. usage-limit reset time (§9)
  durationMs: number };
type EngineError = 'not_installed'|'not_signed_in'|'rate_limited'|'timeout'|'bad_output'|'crashed'|'stopped';
```
ClaudeCodeEngine spawns:
`claude -p <prompt> --output-format stream-json --verbose --permission-mode <mode> --allowedTools <list> --disallowedTools <list> --append-system-prompt <role prompt> --max-turns <n>` in `cwd`.
It parses line-delimited JSON (system/init → started; assistant content text/tool_use → text/tool_call; user tool_result → tool_result; result → RunResult). Unknown lines are logged and skipped, never fatal. Final JSON is taken from the last fenced or bare JSON object in the result text and validated with the role's schema; one automatic re-ask ("Reply again with only the JSON object") on bad_output, then error.

## 5. Roles (AI layer) — verbatim system prompts and limits

| Role | Mode | Allowed tools | Disallowed | maxTurns | timeout |
|------|------|---------------|------------|----------|---------|
| Team Lead | plan | Read, Grep, Glob, LS | Edit, Write, Bash, WebFetch | 30 | 5 min |
| Builder | acceptEdits | Read, Grep, Glob, LS, Edit, Write, Bash | Bash(git push:*), Bash(git remote:*), Bash(gh:*), WebFetch | 80 | 25 min |
| Tester | acceptEdits | Read, Grep, Glob, LS, Edit, Write, Bash | Bash(git push:*), Bash(git remote:*), Bash(gh:*), WebFetch | 60 | 20 min |

Team Lead (plan):
> You are Team Lead in Orchestra, leading a small coding crew in the repository in your current folder. Read only what you need. Do not edit files. Write a plan a Builder can follow without asking questions. Reply with only this JSON: {"title": string ≤60 chars, "summary": string ≤200 chars, "steps": [{"agent": "Builder"|"Tester", "do": string ≤140 chars, "files": string[]}], "risks": string[] ≤3, "testCommand": string|null}. Use 2 to 6 steps. If the task is unclear, make the smallest safe plan and put your question in risks.

Team Lead (summary for approval, read-only, resumes its session):
> The crew has finished. Here is the diff summary and the Tester's report. Reply with only this JSON: {"summary": string ≤240 chars, "ready": boolean, "concerns": string[] ≤3}.

Builder:
> You are Builder in Orchestra. Follow the approved plan below exactly, working only inside this folder. Write the code and the tests the plan asks for. Do not commit, push, or change git settings; Orchestra does that. When finished, reply with only this JSON: {"done": boolean, "handoff": string ≤140 chars for the Tester, "filesChanged": string[], "notes": string ≤240 chars}.

Tester:
> You are Tester in Orchestra. Check the Builder's work in this folder. Install dependencies if needed and run the project's tests (use the plan's testCommand if given). You may add or fix tests, never product code. Do not commit or push. Reply with only this JSON: {"passed": number, "failed": number, "suites": [{"name": string, "passed": number, "failed": number}], "failures": [{"test": string, "reason": string ≤200 chars}], "summary": string ≤140 chars}.

Model: Claude Code's default for his plan (recorded per run from system/init). No model override in Sprint 1.

## 6. Conductor state machine (one session)
```
draft → planning → plan_ready ──Approve──▶ building → testing → review_ready ──Approve──▶ shipping → pr_opened
            ▲           │ change note                                  │ Decline → declined
            └───────────┘                                any state ── Stop ──▶ stopped ; engine error ──▶ failed
```
- building: Builder run; on ok, Orchestra `git add -A && git commit -m "orchestra: <title>"` in the worktree; if no changes → failed("Builder changed no files").
- testing: Tester run; if Tester changed files, second commit "orchestra: tests"; result stored.
- review_ready: Team Lead summary run, then approval card.
- shipping: `git push -u origin <branch>` then `gh pr create --base <base> --head <branch> --title <title> --body-file <tmp>`; PR url parsed and stored.

## 7. Event store (database)
SQLite `orchestra.db`, WAL mode, migrations numbered `001_init.sql`…
```sql
CREATE TABLE sessions (id TEXT PRIMARY KEY, title TEXT NOT NULL, task TEXT NOT NULL, repo_path TEXT NOT NULL,
  base_branch TEXT NOT NULL, branch TEXT NOT NULL, worktree_path TEXT NOT NULL, state TEXT NOT NULL,
  pr_url TEXT, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL);
CREATE TABLE runs (id TEXT PRIMARY KEY, session_id TEXT NOT NULL REFERENCES sessions(id), role TEXT NOT NULL,
  engine_session_id TEXT, model TEXT, state TEXT NOT NULL, started_at INTEGER, ended_at INTEGER,
  input_tokens INTEGER DEFAULT 0, output_tokens INTEGER DEFAULT 0, result_json TEXT, error TEXT);
CREATE TABLE events (seq INTEGER PRIMARY KEY AUTOINCREMENT, session_id TEXT NOT NULL, run_id TEXT, ts INTEGER NOT NULL,
  type TEXT NOT NULL, payload TEXT NOT NULL);
CREATE INDEX events_session ON events(session_id, seq);
```
Event types: session.created, session.state, plan.proposed, plan.approved, plan.change_requested, run.started, run.text, run.tool_call, run.tool_result, run.ended, baton.passed, commit.made, review.ready, ship.started, ship.pr_opened, ship.failed, session.declined, session.stopped.
Retention: events kept; declined worktrees deleted after 7 days; Settings → "Delete session" removes rows and worktree.

## 8. IPC (typed, contextIsolation on, no nodeIntegration)
Commands (renderer → main, `ipcRenderer.invoke`): `setup:check`, `repo:pick`, `session:create {repoPath, task}`, `session:list`, `session:get {id}`, `plan:approve {sessionId}`, `plan:change {sessionId, note}`, `review:approve {sessionId}`, `review:decline {sessionId}`, `session:stop {sessionId}`, `diff:get {sessionId}`.
Push (main → renderer): `events:append {sessionId, events[]}` batched every 50 ms.

## 9. Errors and recovery
- Engine errors map to on-screen causes: not_installed / not_signed_in → setup screen; rate_limited → "Claude usage limit reached. Try again after <time from CLI>." (with no time from the CLI: "Claude usage limit reached. Try again later."; the CLI's raw text is never shown in this sentence, CR-4); timeout → "Builder took longer than 25 min and was stopped."; bad_output → "Team Lead's reply couldn't be read" + Try again.
- App crash or quit mid-run: on next start, sessions in planning/building/testing/shipping → stopped; worktree kept.
- Git conflicts are impossible in Sprint 1 (one writer per worktree at a time).

## 10. Security
contextIsolation, sandboxed renderer, strict CSP, no remote content; only main spawns processes; arguments passed as arrays (no shell strings); the repo path and task text never go into a shell command line unescaped; prompts go to `claude` via argv/stdin, never via a shell.

## 11. Repo layout
```
orchestra/
  PIPELINE.md  README.md  docs/spec/ (this spec, locked per sprint, MANIFEST.sha256)  docs/batches.tsv
  apps/desktop/src/main/{conductor,engine,workspace,store,setup,ipc}/
  apps/desktop/src/renderer/{screens,components,lanes,cards,store,tokens.css}
  apps/desktop/src/shared/{types.ts,events.ts,ipc.ts}
  tests/unit/  tests/e2e/ (journeys)  tests/cassettes/ (recorded real stream-json, synthetic repos only)  tests/golden/
  fixtures/sample-repo/ (tiny synthetic project used by tests)
  .github/workflows/{ci.yml,real-ai.yml,heartbeat.yml}  .github/CODEOWNERS (locks tests/e2e + docs/spec)
```
