# CR-3 Make 5 locked Sprint 0 journeys as strict as their approved ACs

Found by: second-model sabotage check on PR #3 (16 deliberate breakages; 12 caught, 4 slipped through).
What changes: test strictness in tests/e2e (locked by CR-1), plus a test-only change so the recorded-replies engine runs as a real child process. The AC text in test-contract.md does not change.
1. AC-L1 / J6: CI checks that no engine child process is left after Stop and after app quit.
2. AC-S0.1: the 3 s budget is timed from launch, not after it.
3. J7: adds a hard kill (crash) mid-run; after reopening the session shows Stopped and no engine process is left.
4. AC-L2: snapshot of the whole main checkout including .git, and of the data folder outside Orchestra's own files.
5. AC-S0.2a: also tries to start a session directly over IPC and expects a refusal; asserts the exact on-screen sentence.
Approved by Vikas: tapped "Approve CR-3" on the decision card, 2026-11-22 16:52 UTC.
