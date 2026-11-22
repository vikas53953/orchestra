// Red proof: the tests a PR adds or changes must FAIL against the base branch's source code.
// A test that already passes without the change proves nothing about the change.
// Usage (CI, pull_request): node tools/red-proof.mjs <base-sha>
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, cpSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const base = process.argv[2];
const sh = (cmd, args, opts = {}) => execFileSync(cmd, args, { encoding: 'utf8', ...opts });
const changed = sh('git', ['diff', '--no-renames', '--name-only', '--diff-filter=AM', `${base}...HEAD`]).split('\n').filter(Boolean);
const tests = changed.filter((p) => /^tests\/unit\/.+\.test\.ts$/.test(p));
const src = changed.filter((p) => p.startsWith('apps/desktop/src/') && !p.includes('/dev/'));
if (!tests.length || !src.length) {
  console.log(`red proof: not applicable (${tests.length} changed unit test files, ${src.length} changed source files)`);
  process.exit(0);
}
// Worktree at base, then copy in ONLY this PR's tests (+ test helpers under tests/unit).
const dir = mkdtempSync(join(tmpdir(), 'redproof-'));
sh('git', ['worktree', 'add', '--detach', dir, base]);
try {
  cpSync('tests/unit', join(dir, 'tests/unit'), { recursive: true });
  if (existsSync('node_modules')) sh(process.platform === 'win32' ? 'cmd' : 'ln', process.platform === 'win32' ? ['/c', 'mklink', '/J', join(dir, 'node_modules'), join(process.cwd(), 'node_modules')] : ['-s', join(process.cwd(), 'node_modules'), join(dir, 'node_modules')]);
  const r = spawnSync(process.execPath, [join(dir, 'node_modules/vitest/vitest.mjs'), 'run', ...tests], { cwd: dir, encoding: 'utf8' });
  const out = (r.stdout ?? '') + (r.stderr ?? '');
  console.log(out.split('\n').slice(-25).join('\n'));
  if (r.status === 0) {
    console.error('RED PROOF FAILED: the changed tests already pass on the base code, so they do not prove this change.');
    process.exit(1);
  }
  console.log(`red proof: ${tests.length} changed test file(s) fail on base ${base.slice(0, 7)} as expected (status ${r.status})`);
} finally {
  sh('git', ['worktree', 'remove', '--force', dir]);
  rmSync(dir, { recursive: true, force: true });
}
