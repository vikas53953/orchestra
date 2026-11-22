// Tests for the evidence pipeline's pure parts (tools/evidence/lib.mjs): what the PR comment says,
// how failures are digested, how numbers are compared, and which comment gets updated in place.
import { describe, it, expect } from 'vitest';
// @ts-expect-error plain .mjs tool without types
import * as lib from '../../../tools/evidence/lib.mjs';

const {
  MARKER, touchesScreens, parseHashStates, fmtDelta, median, parseJunitFailures, logDigest,
  checkRows, buildFailureDigest, buildComment, planUpsert, mdInline, mdCode, safeEvidenceName,
} = lib;

describe('which PRs get before/after pictures', () => {
  it('renderer, copy.ts and tokens.css changes need pictures; engine-only changes do not', () => {
    expect(touchesScreens(['apps/desktop/src/renderer/screens/Home.tsx'])).toBe(true);
    expect(touchesScreens(['apps/desktop/src/shared/copy.ts'])).toBe(true);
    expect(touchesScreens(['apps/desktop/src/renderer/tokens.css'])).toBe(true);
    expect(touchesScreens(['apps/desktop/src/main/engine/index.ts', 'README.md'])).toBe(false);
    expect(touchesScreens([])).toBe(false);
  });
  it('a change to the photographer or the vite config gets pictures, so it proves itself', () => {
    expect(touchesScreens(['tools/evidence/worktree.mjs'])).toBe(true);
    expect(touchesScreens(['tools/evidence/vite-serve.mjs'])).toBe(true);
    expect(touchesScreens(['vite.config.ts'])).toBe(true);
    expect(touchesScreens(['tools/evidence/publish.mjs'])).toBe(false);
  });
});

describe('screen states to photograph', () => {
  it('reads the hash states the dev mock announces, in order, without duplicates', () => {
    const src = '// delays, plus URL hash states for screenshots: #home #setup #running #home.\nconst x = 1;';
    expect(parseHashStates(src)).toEqual(['home', 'setup', 'running']);
  });
  it('falls back to the plain page when the sha has no dev mock', () => {
    expect(parseHashStates(null)).toEqual(['default']);
    expect(parseHashStates('const a = 1;')).toEqual(['default']);
  });
});

describe('numbers where nothing is visible', () => {
  it('shows base, head and the delta with sign and percent', () => {
    expect(fmtDelta(850, 61, 'ms')).toBe('850 ms → 61 ms (−789 ms, −92.8%)');
    expect(fmtDelta(100, 110.04, 'KB')).toBe('100 KB → 110 KB (+10 KB, +10.0%)');
    expect(fmtDelta(5, 5, 'ms')).toBe('5 ms → 5 ms (no change)');
  });
  it('says n/a at base when the base could not be measured', () => {
    expect(fmtDelta(null, 61, 'ms')).toBe('n/a at base → 61 ms');
    expect(fmtDelta(40, null, 'ms')).toBe('40 ms → n/a at head');
  });
  it('keeps one decimal for small values', () => {
    expect(fmtDelta(1.24, 1.26, 'KB')).toBe('1.2 KB → 1.3 KB (+0.0 KB, +1.6%)');
  });
  it('median of 3 cold starts ignores one outlier', () => {
    expect(median([900, 300, 310])).toBe(310);
    expect(median([1, 2, 3, 4])).toBe(2.5);
    expect(median([])).toBeNull();
  });
});

const JUNIT = `<?xml version="1.0" encoding="UTF-8" ?>
<testsuites name="vitest tests" tests="3" failures="1" errors="0" time="1.5">
  <testsuite name="tests/unit/a.test.ts" tests="3" failures="1">
    <testcase classname="tests/unit/a.test.ts" name="AC-L1 lane shows text &amp; tools" time="0.01">
      <failure message="expected 2 to be 3 // Object.is equality" type="AssertionError">
AssertionError: expected 2 to be 3 // Object.is equality
 ❯ tests/unit/a.test.ts:10:15
      </failure>
    </testcase>
    <testcase classname="tests/unit/a.test.ts" name="passes" time="0.01"></testcase>
    <testcase classname="tests/unit/b.test.ts" name="B4 &lt;crash&gt;" time="0.01">
      <error message="Cannot read properties of undefined" type="TypeError">TypeError: Cannot read properties of undefined
    at x (b.ts:1:1)</error>
    </testcase>
  </testsuite>
</testsuites>`;

describe('failure digest (failed proof goes straight back)', () => {
  it('lists each failing test with its file and the first assertion line', () => {
    expect(parseJunitFailures(JUNIT)).toEqual([
      { file: 'tests/unit/a.test.ts', name: 'AC-L1 lane shows text & tools', line: 'AssertionError: expected 2 to be 3 // Object.is equality' },
      { file: 'tests/unit/b.test.ts', name: 'B4 <crash>', line: 'TypeError: Cannot read properties of undefined' },
    ]);
  });
  it('returns nothing for a green or missing report', () => {
    expect(parseJunitFailures(JUNIT.replace(/<failure[\s\S]*?<\/failure>/, '').replace(/<error[\s\S]*?<\/error>/, ''))).toEqual([]);
    expect(parseJunitFailures('')).toEqual([]);
  });
  it('pulls the first error lines out of a raw log for gates without a JUnit report', () => {
    const log = 'building...\nsrc/a.ts(3,5): error TS2322: Type string is not assignable\nok\nsrc/b.ts(9,1): error TS2304: Cannot find name x\n';
    expect(logDigest(log)).toEqual(['src/a.ts(3,5): error TS2322: Type string is not assignable', 'src/b.ts(9,1): error TS2304: Cannot find name x']);
    expect(logDigest('RED PROOF FAILED: the changed tests already pass on the base code\n')).toEqual(['RED PROOF FAILED: the changed tests already pass on the base code']);
    expect(logDigest('all good\n')).toEqual([]);
  });
  it('caps the digest so a hundred failures stay readable', () => {
    const many = Array.from({ length: 30 }, (_, i) => `error TS1: e${i}`).join('\n');
    expect(logDigest(many).length).toBe(8);
  });
  it('opens with the failing gates and their reasons; empty when every gate passed', () => {
    const rows = checkRows({ typecheck: 'success', unit: 'failure', 'red-proof': 'failure', build: 'success' });
    const d = buildFailureDigest(rows, { unit: { tests: parseJunitFailures(JUNIT) }, 'red-proof': { lines: ['RED PROOF FAILED: already pass'] } });
    expect(d).toMatch(/^### ❌ 2 gates failed/);
    expect(d).toContain('**unit**');
    expect(d).toContain('`AC-L1 lane shows text & tools`');
    expect(d).toContain('AssertionError: expected 2 to be 3');
    expect(d).toContain('**red-proof**');
    expect(buildFailureDigest(checkRows({ typecheck: 'success' }), {})).toBe('');
  });
});

describe('labels: CONFIRMED / REPORTED / UNVERIFIED', () => {
  it('a gate that ran in this CI run is CONFIRMED whether it passed or failed; skipped is UNVERIFIED', () => {
    const rows = checkRows({ typecheck: 'success', unit: 'failure', e2e: 'skipped', installer: '' });
    const by = Object.fromEntries(rows.map((r: { name: string }) => [r.name, r]));
    expect(by.typecheck).toMatchObject({ result: 'pass', label: 'CONFIRMED' });
    expect(by.unit).toMatchObject({ result: 'FAIL', label: 'CONFIRMED' });
    expect(by.e2e).toMatchObject({ result: 'skipped', label: 'UNVERIFIED' });
    expect(by.installer).toMatchObject({ result: 'not run', label: 'UNVERIFIED' });
  });
  it('a step that ran nothing (no target files yet) is "not run · UNVERIFIED" with the reason, never pass', () => {
    const rows = checkRows({ mutation: 'not-run', e2e: 'not-run', 'red-proof': 'not-run', build: 'not-run' });
    const by = Object.fromEntries(rows.map((r: { name: string }) => [r.name, r]));
    for (const g of ['mutation', 'e2e', 'red-proof', 'build']) expect(by[g]).toMatchObject({ result: 'not run', label: 'UNVERIFIED' });
    expect(by.mutation.note).toMatch(/no mutation target files/);
    expect(by.e2e.note).toMatch(/no tests\/e2e journeys/);
    expect(by['red-proof'].note).toMatch(/not applicable/);
    expect(by.build.note).toMatch(/ran nothing/);
    expect(buildComment({ repo: 'o/r', pr: 1, headSha: 'a'.repeat(40), baseSha: 'b', runUrl: 'u', rows, digests: {}, numbers: null, shots: null, rawBase: 'r' }))
      .toMatch(/\| mutation \| not run \| UNVERIFIED \| ran nothing: no mutation target files/);
  });
  it('real AI is always UNVERIFIED in CI until run on the owner\'s PC; a linked record makes it REPORTED', () => {
    const real = checkRows({}).find((r: { name: string }) => r.name === 'real-ai');
    expect(real).toMatchObject({ label: 'UNVERIFIED' });
    expect(real.note).toMatch(/owner's PC/);
    const linked = checkRows({}, { realAiRecord: 'https://github.com/o/r/blob/x/real-ai.json' }).find((r: { name: string }) => r.name === 'real-ai');
    expect(linked).toMatchObject({ label: 'REPORTED' });
  });
});

describe('the PR comment', () => {
  const base = {
    repo: 'o/r', pr: 7, headSha: 'abcdef1234567890', baseSha: '1234567aaaa', runUrl: 'https://github.com/o/r/actions/runs/1',
    rows: checkRows({ typecheck: 'success', unit: 'success' }), digests: {},
    numbers: { bundleGzipKB: { base: 100, head: 90 }, unitMs: { base: 1200, head: 1300 }, coldStartMs: { base: null, head: 800, runs: { head: [790, 800, 900] } } },
    shots: { touched: true, states: [{ state: 'home', changedPct: 3.25, compare: 'home-compare.png' }] },
    rawBase: 'https://raw.githubusercontent.com/o/r/c0ffee/evidence/7/abcdef1',
  };
  it('starts with the hidden marker, names the head sha and links the run', () => {
    const c = buildComment(base);
    expect(c.startsWith(MARKER)).toBe(true);
    expect(c).toContain('`abcdef1`');
    expect(c).toContain('https://github.com/o/r/actions/runs/1');
  });
  it('has a row per gate with its label, the numbers with deltas, and the pictures', () => {
    const c = buildComment(base);
    expect(c).toMatch(/\| typecheck \| pass \| CONFIRMED \|/);
    expect(c).toMatch(/\| real-ai \| not run \| UNVERIFIED \|/);
    expect(c).toContain('100 KB → 90 KB (−10 KB, −10.0%)');
    expect(c).toContain('n/a at base → 800 ms');
    expect(c).toContain('![home](https://raw.githubusercontent.com/o/r/c0ffee/evidence/7/abcdef1/home-compare.png)');
    expect(c).toContain('3.25%');
  });
  it('puts the failure digest first when a gate failed', () => {
    const c = buildComment({ ...base, rows: checkRows({ typecheck: 'failure' }), digests: { typecheck: { lines: ['error TS1: x'] } } });
    const lines = c.split('\n');
    expect(lines[0]).toBe(MARKER);
    expect(lines[1]).toMatch(/^### ❌ 1 gate failed/);
  });
  it('says why there are no pictures when no screen file changed, or when the shots job failed', () => {
    expect(buildComment({ ...base, shots: { touched: false, states: [] } })).toMatch(/No screen files changed/);
    expect(buildComment({ ...base, shots: null })).toMatch(/UNVERIFIED.*evidence job produced no pictures/);
  });
  it('a test name cannot ping people, break out of code spans, or inject HTML', () => {
    expect(mdInline('ping @vikas `x` <img src=x> | y\nz')).toBe("ping @​vikas 'x' &lt;img src=x&gt; \\| y z");
    expect(mdInline('a'.repeat(500)).length).toBeLessThanOrEqual(200);
  });
  it('a name cannot become a link, emphasis or strike-through', () => {
    expect(mdInline('a](http://evil) [x')).toBe('a\\]\\(http://evil\\) \\[x');
    expect(mdInline('**b')).toBe('\\*\\*b');
    expect(mdInline('_c_ ~~d~~ e\\')).toBe('\\_c\\_ \\~\\~d\\~\\~ e\\\\');
    const c = buildComment({ repo: 'o/r', pr: 1, headSha: 'a'.repeat(40), baseSha: 'b', runUrl: 'u', rows: checkRows({}), digests: {}, numbers: null,
      shots: { touched: true, states: [{ state: 'x](http://evil) [y', changedPct: 1, compare: 'x.png' }] }, rawBase: 'r' });
    expect(c).not.toContain('](http://evil)');
  });
  it('a test name inside a code span keeps its < > as typed but cannot close the span', () => {
    expect(mdCode('suite > B4 <crash> `x`\n@y')).toBe("suite > B4 <crash> 'x' @y");
    const d = buildFailureDigest(checkRows({ unit: 'failure' }), { unit: { tests: [{ file: 'f.ts', name: 'a > b', line: 'x' }] } });
    expect(d).toContain('`a > b`');
  });
});

describe('one comment, updated in place', () => {
  const bot = { login: 'github-actions[bot]', type: 'Bot' };
  it('updates the bot comment that carries the marker', () => {
    const comments = [{ id: 1, body: 'hi', user: bot }, { id: 2, body: `${MARKER}\nold`, user: bot }];
    expect(planUpsert(comments)).toEqual({ action: 'update', id: 2 });
  });
  it('ignores a human comment that pastes the marker, and creates a new one', () => {
    expect(planUpsert([{ id: 3, body: `${MARKER} copied`, user: { login: 'someone', type: 'User' } }])).toEqual({ action: 'create' });
    expect(planUpsert([])).toEqual({ action: 'create' });
  });
  it('when duplicates exist, keeps the newest so there is still only one to read', () => {
    const comments = [{ id: 4, body: MARKER, user: bot }, { id: 9, body: MARKER, user: bot }];
    expect(planUpsert(comments)).toEqual({ action: 'update', id: 9 });
  });
});

describe('evidence files copied from the (untrusted) artifact', () => {
  it('allows only plain png/json/md names', () => {
    expect(safeEvidenceName('home-compare.png')).toBe(true);
    expect(safeEvidenceName('numbers.json')).toBe(true);
    expect(safeEvidenceName('../../.github/workflows/x.yml')).toBe(false);
    expect(safeEvidenceName('a/b.png')).toBe(false);
    expect(safeEvidenceName('.hidden.png')).toBe(false);
    expect(safeEvidenceName('run.sh')).toBe(false);
  });
});
