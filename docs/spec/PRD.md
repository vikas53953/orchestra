# Orchestra PRD — feature map and Sprint 0-1 requirements      DRAFT 2026-11-22

## 1. Whole-product feature map (thin)

Every feature has one "done means" line: what Vikas types or clicks, and what he must see, with the real AI on his PC.

| id | Feature | Sprint | Done means |
|----|---------|--------|------------|
| S0.1 | Installer + app shell | 0 | He runs OrchestraSetup.exe, Orchestra opens on Home (C1) in the approved dark look, sidebar shows "Your sessions" (empty). |
| S0.2 | Setup check (first run, C5) | 0 | On first open he sees a checklist: Claude Code found and signed in, Git found, GitHub CLI signed in; each missing item says exactly what to run, and "Check again" re-tests. |
| S0.3 | One live agent | 0 | He picks a repo folder, types "What does this repo do?", and a Team Lead lane streams a real Claude Code answer within 30 s. |
| S0.4 | CI + one real-AI test | 0 | Every PR shows green Windows CI (lint, types, unit, e2e on recorded replies); the real-AI journey J0 passes 3 in a row on Vikas's PC, with its record linked on the PR. [D9] |
| F1 | Start a task | 1 | On Home he picks a repo, types a task in "Tell the crew what to build", presses Enter; a session opens with its title and appears in "Your sessions". |
| F2 | Team Lead plans + your OK | 1 | Team Lead reads the repo and posts a plan card ("Plan waiting for your OK"); he presses Approve, or types a change and gets a revised plan. |
| F3 | Crew works live in lanes | 1 | After the OK, Builder then Tester appear as lanes; each lane shows its latest step and a working dot; the baton passes Builder → Tester; Ctrl Alt B opens the selected agent's history. |
| F4 | Review and open PR | 1 | When the Tester is done, an approval card shows files changed, +/- lines and the test result; Approve pushes the branch and opens a PR whose link shows on the card; Decline keeps nothing on GitHub. |
| F5 | Failure card + fix loop | 2 | When Tester fails, "Failure: your move" card offers Fix it / Stop; Fix it sends the failure to Builder and re-tests. |
| F6 | Guide the crew | 2 | Typing "@Builder use 600ms" mid-run reaches only Builder and the lane shows it. |
| F7 | Stop, pause, resume | 2 | Stop ends all agents in 2 s; reopening the app shows the session as Stopped with Resume. |
| F8 | Merge from the app | 2 | After CI on the PR is green, "Approve merge" merges it and the session ends "Merged to main". |
| F9 | Watcher agent | 2 | A Watcher lane can watch logs or CI and report into the session. |
| F10 | Bots | 3 | He creates a standing bot from a template; it keeps memory between sessions and has an inbox. |
| F11 | Scheduled runs | 3 | A bot runs on a schedule (e.g. daily 9 AM) and posts results to its inbox. |
| F12 | Parallel builders | 4 | Team Lead splits work across 2-4 Builders in separate worktrees and merges their branches. |
| F13 | More engines | 4 | In Settings he can switch an agent to an API key or Codex. |
| F14 | Limits view | 4 | He sees time and usage per agent and per session, with a cap. |
| F15 | Multi-repo | 4 | One session can touch two repos. |
| F16 | Release polish | 5 | Auto-update, signed installer, design polish pass, a week of daily use with no major bug. |

## 2. Sprint 0 — walking skeleton (full)

R0.1 Installer: Windows x64 NSIS installer, per-user install (no admin), Start menu shortcut "Orchestra", app icon = approved logo (orchestra-icon.ico). Unsigned in Sprint 0-4 (SmartScreen "More info → Run anyway" is expected and written in the handover).
R0.2 Shell: frameless window 1440×900 default, min 1100×700; sidebar 260 px (#0E0E0E, 1px #1B1B1B edge), main #121212; tokens from round 3 page. Dark only in Sprint 0-1 (light theme in Sprint 5).
R0.3 Setup check runs on every start (silent if all pass) and as screen C5 when anything is missing:
- Claude Code: `claude --version` succeeds and a 1-token headless probe returns (signed in). Missing → "Install Claude Code, then run `claude` once to sign in."
- Git: `git --version` ≥ 2.40. Missing → "Install Git for Windows."
- GitHub CLI: `gh auth status` succeeds. Missing → "Install GitHub CLI, then run `gh auth login`." (Needed for F4 only; S0 shows it as a warning, not a block.)
- Data folder: free space ≥ 2 GB on the drive holding Orchestra's data folder. Low → "Low space on C:. Choose another drive in Settings."
R0.4 One live agent: folder picker → Team Lead lane → prompt → stream of steps and final answer, read-only (plan mode). Stop button ends the run.
R0.5 CI: GitHub Actions on windows-latest for every PR: lint, typecheck, unit (Vitest), Electron e2e (Playwright) on recorded replies played back with real delays, build of the installer artifact. Real-AI journeys run on Vikas's PC only (D9), through a remote session, and their records are linked on the PR.

## 3. Sprint 1 — MVP (full)

### Screens and states (approved designs; names from Paper round 3)
- C1 Home: H1 "Tell the crew what to build" (24/32), repo chip (folder name, click to change), composer pill 44px, recent sessions list.
- C2 Session: title 20/28 + status chip + meta line (repo · branch · started), lanes area, composer "Guide the crew, @ to message one agent" (disabled in Sprint 1 with tooltip "Coming in the next sprint"), right panel hidden until asked (Ctrl Alt B).
- C3 Approval card, plan card (same card component, two kinds).
- C5 First run / setup check, C6 Loading skeleton, C7 long names (ellipsis at 112 px name column, tooltip).
- Status chip values: "Team Lead is planning", "Plan waiting for your OK", "Crew is working", "Approval: your move", "PR opened", "Declined", "Stopped", "Failed".

### F1 Start a task
- Repo must be a git repo with a clean or dirty working tree; Orchestra never touches the main checkout (A2). Not a git repo → inline error "This folder isn't a Git repo. Pick a folder that has a .git folder."
- Session title = first 60 chars of the task, trimmed at a word; editable later (Sprint 2).
- Empty task → Enter does nothing; send button stays disabled.

### F2 Team Lead plans + your OK
- Team Lead runs read-only in the task worktree and returns a plan as JSON (schema in architecture.md §5) rendered as a plan card: one-line summary, 2-6 steps, which agent does each, files it expects to touch.
- Card actions: "Approve plan" (white pill) and "Tell Team Lead what to change" (text field). A change re-runs Team Lead with the note; the new plan replaces the card (history in the panel).
- Plan folds to one line after approval [decision: round 3].

### F3 Crew works live in lanes
- Order in Sprint 1: Builder, then Tester (one baton). Lanes: Team Lead, Builder, Tester; each lane = face, name (crew colour), latest step text, grey line counts (+42 −6), working dot (1.6 s) while running.
- Baton moment on Builder → Tester: giver's eyes gaze at receiver, 2px bezier line in giver→receiver colour draws 360 ms, receiver lane shows "From Builder: <handoff note>", line fades ~1 s; reduced motion = no draw.
- Builder: edits code and adds tests inside the worktree, then writes a handoff note. Orchestra commits the Builder's changes on the task branch ("orchestra: <title>").
- Tester: builds/tests from the task branch, reports pass/fail per suite as JSON (architecture §5). Tester may add or fix tests only; Orchestra commits those as a second commit.
- If the Tester reports a failure in Sprint 1, the approval card still appears, marked "Tests failing", and Approve is secondary (grey) with "Open PR anyway". The fix loop is F5 (Sprint 2).
- Right panel (Ctrl Alt B or toolbar toggle): selected agent's full history (steps, tool calls, files touched).

### F4 Review and open PR
- Approval card: "Team Lead is waiting for your OK", summary from Team Lead (2-3 lines), files changed list, +/- totals, test result line ("13 of 13 pass" or "2 of 13 fail"), buttons "Approve and open PR" (white pill), "View changes" (opens diff in the panel), "Decline".
- Approve: Orchestra pushes branch `orchestra/<slug>-<id4>` to origin and runs `gh pr create` with title = session title and body = plan + test result + "Made with Orchestra". Card shows "PR opened · #N" with link; status chip "PR opened".
- Decline: branch and worktree stay local for 7 days (cleanup job), status "Declined", nothing pushed.
- Push or PR failure: card shows the exact cause class (no remote, not signed in to gh, branch protected, network) and "Try again".

### Sprint 1 out of scope (on purpose)
Failure fix loop, @-messages, pause/resume after app restart, merge, Watcher, bots, parallel builders, light theme, settings beyond data folder.

## 4. Non-functional (Sprint 0-1)
- First streamed token from any agent ≤ 30 s on his PC; Home opens ≤ 3 s after launch.
- App memory ≤ 600 MB with 3 lanes running.
- Closing the app kills all agent processes within 2 s (A6); sessions left running show "Stopped" on next start.
- Logs stay on the PC in the data folder; nothing is sent anywhere except Claude Code's own traffic and the PR push.
