// Spec guard: locked files (docs/spec/**, tests/e2e/**, tests/golden/**, this script) change only with an approved CR.
// Usage: node tools/spec-guard.mjs verify            -> checks MANIFEST.sha256 matches the files
//        node tools/spec-guard.mjs write             -> regenerates MANIFEST.sha256 (only in a CR PR)
//        node tools/spec-guard.mjs pr <base-sha>     -> fails if locked files changed vs base and PR body lacks "CR-<n>"
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, relative } from 'node:path';
import { execFileSync } from 'node:child_process';

const ROOT = process.cwd();
const LOCKED = ['docs/spec', 'tests/e2e', 'tests/golden'];
const MANIFEST = 'docs/spec/MANIFEST.sha256';

function walk(dir) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });
}
function lockedFiles() {
  return LOCKED.flatMap((d) => walk(join(ROOT, d)))
    .map((p) => relative(ROOT, p).split('\\').join('/'))
    .filter((p) => p !== MANIFEST)
    .sort();
}
function hash(p) {
  // normalise line endings so Windows checkouts hash the same
  const buf = readFileSync(join(ROOT, p)).toString('utf8').replace(/\r\n/g, '\n');
  return createHash('sha256').update(buf).digest('hex');
}
function manifestText() {
  return lockedFiles().map((p) => `${hash(p)}  ${p}`).join('\n') + '\n';
}

const [cmd, arg] = process.argv.slice(2);
if (cmd === 'write') {
  writeFileSync(join(ROOT, MANIFEST), manifestText());
  console.log(`wrote ${MANIFEST}`);
} else if (cmd === 'verify') {
  const want = readFileSync(join(ROOT, MANIFEST), 'utf8').replace(/\r\n/g, '\n');
  const got = manifestText();
  if (want !== got) {
    console.error('SPEC GUARD: locked files do not match docs/spec/MANIFEST.sha256.');
    console.error('Locked spec/tests change only through an approved Change Request (CR-<n>).');
    process.exit(1);
  }
  console.log(`spec guard: ${got.trim().split('\n').length} locked files match the manifest`);
} else if (cmd === 'pr') {
  const changed = execFileSync('git', ['diff', '--no-renames', '--name-only', `${arg}...HEAD`], { encoding: 'utf8' })
    .split('\n').filter(Boolean)
    .filter((p) => LOCKED.some((d) => p.startsWith(d + '/')) || p === 'tools/spec-guard.mjs');
  const body = process.env.PR_BODY ?? '';
  if (changed.length) {
    // A CR id in the body must point at an approval record: docs/change-requests/CR-<n>.md with Vikas's own words.
    const ids = [...body.matchAll(/\bCR-(\d+)\b/g)].map((m) => m[1]);
    const ok = ids.some((n) => {
      const f = join(ROOT, `docs/change-requests/CR-${n}.md`);
      return existsSync(f) && /^Approved by Vikas: .+\S/m.test(readFileSync(f, 'utf8'));
    });
    if (!ok) {
      console.error('SPEC GUARD: this PR changes locked files without an approved CR.');
      console.error('Put "CR-<n>" in the PR body and add docs/change-requests/CR-<n>.md with a line "Approved by Vikas: <his words, date>".');
      for (const p of changed) console.error('  ' + p);
      process.exit(1);
    }
  }
  console.log(`spec guard: ${changed.length} locked file(s) changed; CR check ok`);
} else {
  console.error('usage: spec-guard.mjs verify|write|pr <base>');
  process.exit(2);
}
