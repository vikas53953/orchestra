# CR-2 Engine adapter additions (architecture §4)

What the spec said: Engine.id 'claude-code' only; RunRequest.outputSchema: JsonSchema; RunResult without a detail field.
Change: (1) Engine.id may be 'cassette', an engine that replays recorded Claude Code replies, used only by tests (test-contract §5 cassettes). (2) outputSchema is a check function per role schema. (3) RunResult.errorDetail carries plain detail such as the usage-limit reset time shown on screen (§9). Nothing the user sees changes otherwise.
Found by: the independent verifier on PR #2.
Approved by Vikas: tapped "Approve CR-2" on the decision card, 2026-11-22 13:51 UTC.
