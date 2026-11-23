# CR-5 Run every Claude call clean: skip the owner's personal plugins, hooks and MCP servers

Found by: real-AI J0 re-run on Vikas's PC, 2026-11-23 (1 of 3 passed). The setup sign-in check took 21-22 s with his personal Claude setup and 5-6 s with `--setting-sources project --strict-mcp-config`. The extra ~16 s pushed the first streamed step past the 30 s budget, and his personal hooks and reminders were fed into Orchestra's agents.
What changes:
1. architecture.md §4 argv gains `--setting-sources project --strict-mcp-config` (and shows the prompt after `--`, as built since PR #7).
2. The setup sign-in check uses the same flags.
3. Sign-in is unchanged. The target repo's own project settings still apply.
What Vikas will notice: agents start faster; his personal plugins, hooks and MCP servers are not used inside Orchestra.
Approved by Vikas:
