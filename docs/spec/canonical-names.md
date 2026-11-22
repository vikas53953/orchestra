# Canonical names (builders may not invent names)          DRAFT 2026-11-22
Roles: TeamLead ("Team Lead"), Builder, Tester. Crew colours: Team Lead #8E81CF, Builder #CFCA81, Tester #81CDCF, Watcher #CF81B8 [decision: round 3].
Session states: draft, planning, plan_ready, building, testing, review_ready, shipping, pr_opened, declined, stopped, failed.
Status chip copy: planning "Team Lead is planning" · plan_ready "Plan waiting for your OK" · building/testing "Crew is working" · review_ready "Approval: your move" · pr_opened "PR opened" · declined "Declined" · stopped "Stopped" · failed "Failed".
Branch: orchestra/<slug>-<id4>. Commit messages: "orchestra: <title>", "orchestra: tests". PR footer: "Made with Orchestra".
Paths: %APPDATA%\Orchestra\{settings.json,orchestra.db,logs\}; worktrees <drive>:\.orchestra-worktrees\<repoName>\<sessionId>.
Event types, IPC channels, tables: as listed in architecture.md §7-8 (that list is canonical).
Test ids: data-testid="home-composer", "repo-chip", "session-list", "lane-<role>", "plan-card", "plan-approve", "plan-change-input", "approval-card", "approve-pr", "decline", "view-changes", "stop", "panel", "setup-check", "setup-recheck".
Screens: C1 Home, C2 Session, C3 Approval, C5 First run, C6 Loading, C7 Long names (Paper "Orchestra – Round 3 Conductor").
