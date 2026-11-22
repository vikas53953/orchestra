# Real-AI journeys on Vikas's PC (decision D9)

Run by a remote session on Vikas's Windows PC, never in CI. Uses his signed-in Claude Code.

```
git fetch origin <branch> && git checkout <sha>
npm ci && npm run build
set REAL_AI=1
npx playwright test tests/e2e/sprint0.spec.ts -g "J0" --repeat-each=3 --trace off
```

Pass = 3 of 3 (pass^3). Save `test-results/e2e.json` and the screenshots to the project files under
`orchestra-build/evidence/real-ai/<sha7>/` and link them on the PR, labelled CONFIRMED.
