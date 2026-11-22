# Orchestra test contract — Sprint 0-1            DRAFT 2026-11-22

Written before any code. Locked with the spec at Gate B; builders may not edit it (CODEOWNERS + spec guard). Changes only by an approved Change Request.

## 1. Definition of Done (every Sprint 0-1 feature)
A feature is DONE only when all of these hold on the exact head commit:
1. Its acceptance tests pass in CI on Windows.
2. Its real-AI journey passes 3 runs in a row (pass^3) against real Claude Code, in a real packaged build.
3. Golden pictures match the approved Paper screens within the threshold (≤ 0.5% pixels differ, no element shifted > 4 px).
4. The PR carries a proof block: head SHA, step record (event log excerpt), before/after picture or short video, labelled CONFIRMED / REPORTED / UNVERIFIED.
5. A different model than the builder verified it by trying to break it (probes listed in its report).
6. Vikas's plain-English check (section 6) passes on his PC with the installer.

## 2. Acceptance criteria (Given / When / Then)
AC-S0.1 Given a Windows PC without Orchestra, when OrchestraSetup.exe runs, then Orchestra opens on Home within 3 s and the Start menu has "Orchestra".
AC-S0.2a Given `claude` is not on PATH, when Orchestra starts, then C5 shows "Install Claude Code, then run `claude` once to sign in." and no session can start.
AC-S0.2b Given all tools present, when Orchestra starts, then no setup screen appears.
AC-S0.3 Given a git repo, when he asks "What does this repo do?", then a Team Lead lane shows streamed text within 30 s and ends with an answer that names at least one real file from the repo.
AC-F1a Given Home with a repo chosen, when he types a task and presses Enter, then a session opens with status "Team Lead is planning" and appears first in "Your sessions".
AC-F1b Given a folder without .git, when he picks it, then the inline error appears and the composer stays disabled.
AC-F2a Given planning finishes, then a plan card shows 2-6 steps, each naming Builder or Tester, with status "Plan waiting for your OK".
AC-F2b Given a plan card, when he types a change and sends, then a new plan replaces the card and the old one is in the panel history.
AC-F3a Given he approves the plan, then lanes for Builder and Tester appear; only the running agent shows the working dot; the main checkout's `git status` is unchanged throughout.
AC-F3b Given Builder finishes, then the baton line draws Builder→Tester once and the Tester lane shows "From Builder: <handoff>".
AC-F3c Given Ctrl Alt B, then the right panel opens with the selected agent's history; pressed again, it closes.
AC-F4a Given review_ready, when he presses "Approve and open PR", then within 30 s the card shows "PR opened · #N" and the PR exists on GitHub with the session title.
AC-F4b Given review_ready, when he presses Decline, then nothing is pushed (remote has no orchestra/ branch) and status is "Declined".
AC-F4c Given tests failed, then the card says "Tests failing" and the primary button is "Open PR anyway" in grey.
AC-L1 Given any running session, when he presses Stop or closes the app, then no `claude` process remains after 2 s.
AC-L2 Given any session, then no file outside its worktree is modified (checked by snapshot of the main checkout and the data folder).

## 3. Real-user journeys
J0 (Sprint 0) Ask: pick fixtures/sample-repo, ask "What does this repo do?" → Team Lead lane streams text within 30 s and the answer names a real file (e.g. src/convert.js); pass^3 on Vikas's PC. (run with real AI on fixtures/sample-repo, a tiny synthetic Node project)
J1 Happy path: "add a function that converts celsius to fahrenheit with tests" → plan → approve → Builder → Tester 100% pass → Approve → branch pushed to a local bare remote; in CI the PR step uses a recorded `gh` reply (labelled REPORTED), and the real PR is proven on Vikas's PC in the plain-English check.
J2 Messy words: "pls add c to f convertr + test it, quick" → same outcome as J1.
J3 Hinglish: "ek function bana do jo celsius ko fahrenheit mein badle, aur test bhi likho" → plan in English, same outcome.
J4 Change the plan: approve only after "don't touch index.js, put it in a new file" → new plan lists a new file and not index.js.
J5 Decline: J1 until review, then Decline → nothing pushed.
J6 Stop mid-build: Stop during Builder → state Stopped within 2 s, no claude process, worktree kept.
J7 Close the app mid-run → reopen → session shows Stopped.
J8 Failing tests: task that breaks an existing test on purpose ("change add() to subtract") → card shows "Tests failing", "Open PR anyway" grey.
J9 Empty and huge input: empty Enter does nothing; a 5,000-character task is accepted and the title is trimmed to 60 chars at a word.
J10 Long names (C7): repo folder name of 80 chars shows ellipsis and tooltip.

## 4. AI bad days (each has a safe behaviour and a unit test with a recorded or crafted stream)
B1 Plan JSON wrapped in markdown fences → parsed.  B2 Plan JSON invalid twice → "Team Lead's reply couldn't be read" + Try again.  B3 Half reply then process exit → run failed, cause "crashed".  B4 Usage limit message from CLI → "Claude usage limit reached…" with the time.  B5 Slow first token (25 s) → working dot, no timeout.  B6 Agent tries `git push` → denied by allowlist, run continues, event logged.  B7 Agent writes outside worktree → blocked by permission mode/cwd; AC-L2 catches any leak.  B8 Old Claude Code version without stream-json fields → setup check says "Update Claude Code".  B9 Builder changes no files → failed("Builder changed no files").  B10 Tester reports numbers that don't match its suites → trust suite sums, flag "REPORTED".

## 5. Every angle and the pyramid
- Unit (Vitest, fast): stream parser, JSON extraction, state machine, git command builders, event store, IPC validation. Scripted engine replies wait 2-5 s, labelled "pre-check only".
- Medium: Electron e2e on cassettes (recorded real stream-json from the sample repo), replayed with real timing; golden pictures of C1, C2 (3 lanes), plan card, approval card, C5, C6, C7.
- Large (D9: on Vikas's PC only, never in CI): real-AI journey J0 (Sprint 0) and J1, J3, J5 run on his PC through a remote session for every PR that touches the engine or conductor; J1-J4 pass^3 at each sprint gate. Records (event log + screenshots) are saved to the project files and linked on the PR.
- Sweep test (L10): presses every control on every built screen; each must visibly change something; disabled Sprint-2 controls show their tooltip and nothing else.
- Platform: installer install/uninstall/upgrade on windows-latest; first-run on a clean user profile.
- Coverage map lives in `tests/coverage-map.tsv` (feature → screen id → tests); a row without a test fails CI.

## 6. Vikas's plain-English check (Sprint 1 gate, on his PC, ~15 minutes)
1. Run OrchestraSetup.exe. Orchestra opens. If a setup checklist shows, do what it says, then press Check again.
2. Pick one of your own small repos. Type a small real task you actually want done.
3. Read the plan. Ask for one change in your own words. Check the new plan follows it.
4. Approve. Watch Builder, then Tester. Press Ctrl Alt B and look at Builder's history.
5. On the approval card, press View changes and read them. Then Approve and open PR.
6. Open the PR link. Check the title, the changes, and that your main folder has no new changes.
7. Start a second task and press Stop during Builder. Close and reopen Orchestra. It should say Stopped.
Pass = every step did what it said, in words you understood. Anything else → tell me in your own words; it becomes a failing journey first, then a fix.
