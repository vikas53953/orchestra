# CR-4 Usage-limit message when Claude Code gives no reset time

Found by: T2 engine builder, confirmed by the PR #7 re-check (Sonnet, MAJOR). Logged in PIPELINE.md Follow-ups.
What changes: one new on-screen sentence, two locked spec lines, the engine's reset-time reading, and their unit tests.
1. When Claude Code's limit notice has no reset time, the screen says "Claude usage limit reached. Try again later." The CLI's raw text (e.g. "5-hour limit reached ∙ Upgrade for more", "API Error: 429") is never put inside the sentence.
2. With a reset time nothing changes: "Claude usage limit reached. Try again after 3pm."
3. A month short form keeps the whole time: "resets Nov. 22 3pm" gives "Nov. 22 3pm", not "Nov".
Spec edits: docs/spec/architecture.md §9 (rate_limited line) and docs/spec/test-contract.md B4. Copy key added: error.rate_limited.noTime.
Approved by Vikas: chose "Usage limit reached. Try later." on the decision card, 2026-11-22 18:23 UTC.
