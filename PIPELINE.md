# PIPELINE — Orchestra                         updated: 2026-11-22 13:40 UTC (Gate B approved 13:35)

Frame: Vikas's standard pipeline ("Think big. Build small. Test real.", adopted 17 Nov 2026).
Repo: github.com/vikas53953/orchestra (public: no secrets, no real data). Thread: "Build Orchestra MVP in sprints".

| # | Phase | Status | Where |
|---|-------|--------|-------|
| A1 | Research | done | Devin teardown (rounds 1-4), Devin + Grokbot design studies |
| A2 | Architecture + full feature map | done · APPROVED 2026-11-22 ("all good") | spec/architecture.md, spec/PRD.md, approval page |
| A3 | Spec + Definition of Done | Sprint 0-1 APPROVED 2026-11-22, locked in repo | spec/PRD.md, spec/test-contract.md |
| A4 | Design | done · APPROVED 2026-11-22 ("all good now") | design page WwFcopfG9pwiLJ8N3Py1Kg, prototype 9EQWxorJqtnq3unjhhnvN1, Paper C1-C7 |
| A5 | Backlog + sprint plan | APPROVED 2026-11-22 | this file, sprint table below |
| B  | Sprint 0 skeleton → Sprint 1 MVP | Sprint 0 building | repo PRs |
| C  | Sprint loop | — | — |
| D  | Release | — | — |

## Sprints

| Sprint | Goal (what Vikas can do at the end) | Features | Length |
|--------|--------------------------------------|----------|--------|
| 0 Walking skeleton | Install Orchestra on his PC, pick a repo, ask one Claude Code agent a question and watch the answer stream into a lane | S0.1 installer + shell, S0.2 setup check, S0.3 one live agent, S0.4 CI + one real-AI test | 1-2 days |
| 1 MVP | Give the crew one task in a real repo and get a reviewed PR | F1 start a task, F2 Team Lead plans + your OK, F3 Builder + Tester work live in lanes, F4 review and open PR | 4-5 days + 1 day of his use |
| 2 Steer and recover | Steer a running crew and recover when it fails | failure card + fix loop, @-message one agent, stop/pause/resume, merge from the app, Watcher agent | ~1 week |
| 3 Bots | Keep standing crew members ("bots") with memory, templates and schedules | bot catalogue, bot memory, inbox, scheduled runs | ~1 week |
| 4 Scale | Run bigger jobs | parallel builders, more engines (API key, Codex), budgets and limits view, multi-repo | ~1 week |
| 5 Release | v1.0 | design polish pass, auto-update, signed installer, a week of daily use with no major bug | ~1 week |

Rules per sprint: small PRs with tests and before/after evidence; one model builds, a different model verifies; locked tests; real-AI pass^3 on top journeys; evidence labelled CONFIRMED / REPORTED / UNVERIFIED; Vikas's plain-English test on his PC is the gate; feature freeze mid-sprint; bugs fixed before the next sprint; 5-minute retro.

## Decisions

| id | kind | question | answer | source |
|----|------|----------|--------|--------|
| D1 | direction | Where does Orchestra run? | Windows desktop app on Vikas's PC; agents work locally in his repos | Vikas, card 2026-11-22 13:22 |
| D2 | direction | Which AI powers the crew? | Claude Code on his PC with his existing sign-in, behind one engine adapter | Vikas, card 2026-11-22 13:23 |
| D3 | direction | Where does the code live? | github.com/vikas53953/orchestra, public ("it will be public only") | Vikas, chat 2026-11-22 13:25 |
| D4 | direction | What must Sprint 1 prove? | One task to a reviewed PR: pick repo, type task, Lead plans, Builder + Tester live in lanes, approve diff, PR opens | Vikas, card 2026-11-22 13:25 |
| D5 | direction | Pipeline to follow | His standard pipeline A-D | Vikas, chat 2026-11-22 13:21 |
| D6 | taste | Visual design | Round 3 Conductor design + prototype, right panel hidden by default, baton moment | Vikas, 2026-11-22 ("all good now") |
| D7 | mechanical | Desktop framework | Electron + React + TypeScript (Node main process can drive the Claude Code CLI directly; Windows NSIS installer) | rule: mechanical, logged |

| D10 | mechanical | SQLite driver | node:sqlite (built in) instead of better-sqlite3, to avoid native builds on Windows | rule: mechanical, logged |
| D8 | direction | Gate B: Sprint 0-1 scope + architecture | Approved ("all good") | Vikas, chat 2026-11-22 13:35 |
| D9 | direction | Real-AI tests: where? | On his PC only (no API key in CI). CI runs recorded replies, labelled pre-check; real-AI pass^k runs on his PC via a remote session at each PR gate / sprint gate | Vikas, chat 2026-11-22 13:35 |

## Open questions
(none)

## Retro
| Sprint | What slipped | New check |
|--------|--------------|-----------|
