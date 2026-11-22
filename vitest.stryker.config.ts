import { defineConfig } from 'vitest/config';

// Mutation testing runs only the fast, pure unit suites for the mutated files.
// Process-spawning and git suites (claudeCode, treeKill, conductor, setup) stay in `npm test`.
export default defineConfig({
  test: {
    include: [
      'tests/unit/engine/streamParser.test.ts',
      'tests/unit/engine/jsonExtract.test.ts',
      'tests/unit/engine/errors.test.ts',
      'tests/unit/renderer/lanes.test.ts',
    ],
    environment: 'node',
    testTimeout: 20000,
  },
});
