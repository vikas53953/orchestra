# Laws Orchestra must never break

A1 Nothing leaves the PC without Vikas's OK. Agents never push, open PRs, merge, or call external services that publish. Only the Orchestra app pushes, and only after he presses Approve on that exact diff.
A2 Agents work only inside their task's git worktree. They never write to his main checkout, other folders, or system locations.
A3 Agents never see or store secrets. Orchestra never writes keys, tokens or personal data to the repo, logs that leave the PC, or test fixtures.
A4 Every event is said once: the lane shows the latest step, the panel shows the agent's history, cards carry decisions. No duplicated feeds. [decision: round 3]
A5 Every state is honest: working, waiting for you, failed, stopped, done. Never show "done" without the tool result that proves it.
A6 Any agent run can be stopped by Vikas at any time, and closing the app stops all agents cleanly.
A7 Plain, careful words on screen. No jargon without a gloss, no hype, no exclamation marks. [decision: Grokbot ingredient 6]
