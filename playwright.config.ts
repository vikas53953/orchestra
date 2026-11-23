import { defineConfig } from '@playwright/test';

// Two lanes:
//  - "cassette" (default, CI): recorded/synthetic Claude Code replies played back with real delays. Pre-check only.
//  - "real-ai" (Vikas's PC only, decision D9): REAL_AI=1, real Claude Code with his sign-in, run with --repeat-each=3 (pass^3).
export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 120_000,
  expect: { timeout: 30_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [['list'], ['json', { outputFile: 'test-results/e2e.json' }]],
  use: { trace: 'off', screenshot: 'only-on-failure' },
});
