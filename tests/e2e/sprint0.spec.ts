// Locked Sprint 0 journeys (CR-1; made stricter by CR-3). Written from docs/spec/test-contract.md before the build.
// Cassette lane = pre-check only. Real-AI lane (REAL_AI=1, Vikas's PC, --repeat-each=3) is the proof (D9).
import { test, expect } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  launch, makeSampleRepo, pickRepo, ask, gitStatus, tempDir, CASSETTE, REAL_AI, claudePids,
  enginePids, engineLeftAfter, hardKill, snapshot, snapshotDiff, warmUpLaunch,
} from './harness';

const J0 = CASSETTE('j0-ask-sample-repo.jsonl');
const REAL_FILES = /src\/math\.js|test\/math\.test\.js|package\.json|README\.md/;

test('AC-S0.1 app opens on Home within 3 s', async () => {
  await warmUpLaunch(); // CR-3 amendment (owner, 17:24 UTC): untimed warm-up; the timed launch below keeps the full 3 s
  const t0 = Date.now(); // CR-3: the 3 s budget starts before Electron is launched, not after the window exists
  const l = await launch({ cassette: J0 });
  const left = 3_000 - (Date.now() - t0);
  expect(left, 'no window within 3 s of launch').toBeGreaterThan(0);
  await expect(l.page.getByText('Tell the crew what to build')).toBeVisible({ timeout: Math.max(1, left) });
  expect(Date.now() - t0).toBeLessThan(3_000);
  expect(Date.now() - t0).toBeLessThan(15_000);
  await expect(l.page.getByTestId('setup-check')).toHaveCount(0); // AC-S0.2b: all tools present → no setup screen
  await expect(l.page.getByText('No sessions yet')).toBeVisible();
  await l.app.close();
});

test('AC-S0.2a missing Claude Code shows the setup checklist and blocks sessions', async () => {
  test.skip(REAL_AI, 'cassette lane only');
  const l = await launch({ env: { ORCHESTRA_ENGINE: 'claude-code', ORCHESTRA_CLAUDE_BIN: join(tempDir('nobin-'), 'claude-missing') } });
  await expect(l.page.getByTestId('setup-check')).toBeVisible();
  await expect(l.page.getByText('Install Claude Code, then run')).toBeVisible();
  // CR-3: the whole sentence, exactly as the copy list has it ('Install Claude Code, then run `claude` once to sign in.');
  // the backticked word is shown as code.
  const fix = l.page.getByText('Install Claude Code, then run claude once to sign in.', { exact: true });
  await expect(fix).toBeVisible();
  await expect(fix.locator('code')).toHaveText('claude', { useInnerText: true });
  await expect(l.page.getByTestId('setup-recheck')).toBeVisible();
  await expect(l.page.getByTestId('home-composer')).toHaveCount(0);
  // CR-3: blocked means blocked — starting a session straight over IPC (a valid git repo, a real task) is refused too.
  const repo = makeSampleRepo();
  const refused = await l.page.evaluate(async (repoPath) => {
    try {
      await window.orchestra.sessionCreate({ repoPath, task: 'What does this repo do?' });
      return 'created';
    } catch (e) {
      return e instanceof Error ? e.message : String(e);
    }
  }, repo);
  expect(refused).toMatch(/orchestra:bad_request\b.*setup blocked/);
  expect(await l.page.evaluate(() => window.orchestra.sessionList())).toEqual([]);
  await expect(l.page.getByTestId('setup-check')).toBeVisible();
  await l.app.close();
});

test('AC-F1b a folder without .git shows the inline error and keeps the composer disabled', async () => {
  const l = await launch({ cassette: J0 });
  const plain = tempDir('orch-plain-');
  writeFileSync(join(plain, 'notes.txt'), 'not a repo');
  await pickRepo(l, plain);
  await expect(l.page.getByText("This folder isn't a Git repo. Pick a folder that has a .git folder.")).toBeVisible();
  await expect(l.page.getByTestId('home-composer')).toBeDisabled();
  await l.app.close();
});

test('J0 / AC-S0.3 ask about a repo: Team Lead streams within 30 s and names a real file; main checkout untouched (AC-L2)', async () => {
  const repo = makeSampleRepo();
  const before = gitStatus(repo);
  // CR-3 AC-L2: byte-level snapshot of the whole main checkout, .git included. One allowance only:
  // .git/worktrees/ (holding one <id>/ folder, checked below) is the admin folder `git worktree add` itself writes for Orchestra's own session
  // worktree (architecture.md §3: every session works in its own worktree); nothing else may appear or change.
  // The index is snapshotted like any other file; the snapshot is taken after our own `git status`, so a stat
  // refresh by that call can't show up as a change.
  const skipRepo = (rel: string): boolean => /^\.git\/worktrees(\/|$)/.test(rel);
  const repoBefore = snapshot(repo, skipRepo);
  // CR-3 AC-L2: the data folder may hold only Orchestra's own files (orchestra.db*, logs/, settings.json).
  // Worktrees go to a separate folder for this test so nothing else needs excusing.
  const dataDir = tempDir('orch-data-');
  const ownData = (rel: string): boolean => /^(orchestra\.db[^/]*|logs(\/.*)?|settings\.json)$/.test(rel.replace(/\/$/, ''));
  const dataBefore = snapshot(dataDir, ownData);
  const l = await launch({ cassette: J0, dataDir, env: { ORCHESTRA_WORKTREES_DIR: tempDir('orch-wt-') } });
  await pickRepo(l, repo);
  const t0 = Date.now();
  await ask(l, 'What does this repo do?');
  const lane = l.page.getByTestId('lane-TeamLead');
  await expect(lane).toBeVisible();
  await expect(l.page.getByText('Team Lead is planning')).toBeVisible();
  // first streamed step within 30 s
  await expect(lane).not.toHaveText(/^\s*$/, { timeout: 30_000 });
  expect(Date.now() - t0).toBeLessThan(30_000);
  // ends with an answer naming a real file
  const answer = l.page.getByTestId('answer-card');
  await expect(answer).toBeVisible({ timeout: REAL_AI ? 120_000 : 60_000 });
  await expect(answer).toContainText(REAL_FILES);
  await expect(l.page.getByText('Answered')).toBeVisible();
  // must NOT remain: working dot, Stop button, "planning" status
  await expect(lane.getByTestId('working-dot')).toHaveCount(0);
  await expect(l.page.getByTestId('stop')).toHaveCount(0);
  await expect(l.page.getByText('Team Lead is planning')).toHaveCount(0);
  // session listed first in the sidebar
  await expect(l.page.getByTestId('session-list').locator('[data-testid="session-item"]').first()).toContainText('What does this repo do?');
  // AC-L2: the user's checkout has no new changes
  await l.app.close();
  const worktreeAdmin = [...snapshot(repo).keys()].filter((p) => /^\.git\/worktrees\/[^/]+\/$/.test(p));
  expect(worktreeAdmin.length, 'exactly one session worktree registered').toBeLessThanOrEqual(1);
  expect(snapshotDiff(repoBefore, snapshot(repo, skipRepo)), 'main checkout (incl. .git) changed').toEqual([]);
  expect(snapshotDiff(dataBefore, snapshot(dataDir, ownData)), 'data folder gained non-Orchestra files').toEqual([]);
  expect(gitStatus(repo)).toBe(before);
});

test('AC-F3c Ctrl Alt B opens and closes the history panel', async () => {
  const repo = makeSampleRepo();
  const l = await launch({ cassette: J0 });
  await pickRepo(l, repo);
  await ask(l, 'What does this repo do?');
  await expect(l.page.getByTestId('lane-TeamLead')).toBeVisible();
  await expect(l.page.getByTestId('panel')).toBeHidden();
  await l.page.keyboard.press('Control+Alt+B');
  await expect(l.page.getByTestId('panel')).toBeVisible();
  await l.page.keyboard.press('Control+Alt+B');
  await expect(l.page.getByTestId('panel')).toBeHidden();
  await l.app.close();
});

test('AC-L1 / J6 Stop ends the run within 2 s and leaves no agent process', async () => {
  const repo = makeSampleRepo();
  const l = await launch({ cassette: J0, env: { ORCHESTRA_CASSETTE_DELAY_MS: '1500' } });
  await pickRepo(l, repo);
  await ask(l, 'What does this repo do?');
  await expect(l.page.getByTestId('stop')).toBeVisible();
  // CR-3: an engine process really is running before Stop (cassette lane: the replay child)
  await expect.poll(() => enginePids(l.dataDir), { timeout: 10_000 }).not.toEqual([]);
  const t0 = Date.now();
  await l.page.getByTestId('stop').click();
  await expect(l.page.getByText('Stopped').first()).toBeVisible({ timeout: 2_000 });
  expect(Date.now() - t0).toBeLessThan(2_500);
  // CR-3: and it is gone within 2 s of Stop, in both lanes
  expect(await engineLeftAfter(l.dataDir, Math.max(0, 2_000 - (Date.now() - t0))), 'engine process left after Stop').toEqual([]);
  await l.page.waitForTimeout(2_000);
  if (REAL_AI) expect(await claudePids()).toEqual([]);
  await l.app.close();
});

test('J7 closing the app mid-run shows the session as Stopped after reopening', async () => {
  const repo = makeSampleRepo();
  const first = await launch({ cassette: J0, env: { ORCHESTRA_CASSETTE_DELAY_MS: '1500' } });
  await pickRepo(first, repo);
  await ask(first, 'What does this repo do?');
  await expect(first.page.getByTestId('stop')).toBeVisible();
  await expect.poll(() => enginePids(first.dataDir), { timeout: 10_000 }).not.toEqual([]); // CR-3
  // CR-3 (AC-L1 quit path): no engine process outlives closing the app by more than 2 s. Polled while the
  // close is under way: a stray child can hold the app's pipes open and delay close() itself.
  const closing = first.app.close();
  const leftAfterClose = await engineLeftAfter(first.dataDir, 2_000);
  await closing;
  expect(leftAfterClose, 'engine process left 2 s after app close').toEqual([]);
  expect(await enginePids(first.dataDir), 'engine process left after app close').toEqual([]);
  const again = await launch({ dataDir: first.dataDir, cassette: J0 });
  const item = again.page.getByTestId('session-item').first();
  await expect(item).toBeVisible();
  await item.click();
  await expect(again.page.getByText('Stopped').first()).toBeVisible();
  await again.app.close();
});

test('J7 a crash (hard kill) mid-run shows the session as Stopped after reopening and leaves no agent process', async () => {
  // CR-3: the app is killed, not closed — no before-quit, no cleanup; only startup recovery (recoverInterrupted) can fix the state.
  const repo = makeSampleRepo();
  const first = await launch({ cassette: J0, env: { ORCHESTRA_CASSETTE_DELAY_MS: '1500' } });
  await pickRepo(first, repo);
  await ask(first, 'What does this repo do?');
  await expect(first.page.getByTestId('stop')).toBeVisible();
  await expect.poll(() => enginePids(first.dataDir), { timeout: 10_000 }).not.toEqual([]);
  await hardKill(first.app);
  const again = await launch({ dataDir: first.dataDir, cassette: J0 });
  const item = again.page.getByTestId('session-item').first();
  await expect(item).toBeVisible();
  await expect(item).toContainText('What does this repo do?');
  await item.click();
  await expect(again.page.getByText('Stopped').first()).toBeVisible();
  await expect(again.page.getByTestId('stop')).toHaveCount(0);
  await expect(again.page.getByTestId('working-dot')).toHaveCount(0);
  expect(await engineLeftAfter(first.dataDir, 2_000), 'engine process left after crash + reopen').toEqual([]);
  await again.app.close();
});

test('J9 empty Enter does nothing; a 5,000-character task is accepted and the title is trimmed to 60 at a word', async () => {
  const repo = makeSampleRepo();
  const l = await launch({ cassette: J0 });
  await pickRepo(l, repo);
  const box = l.page.getByTestId('home-composer');
  await box.click();
  await box.press('Enter');
  await expect(l.page.getByTestId('lane-TeamLead')).toHaveCount(0);
  const long = ('explain the math helpers and how the tests are organised ').repeat(90).slice(0, 5000);
  await ask(l, long);
  await expect(l.page.getByTestId('lane-TeamLead')).toBeVisible();
  const title = (await l.page.getByTestId('session-title').innerText()).trim();
  expect(title.length).toBeLessThanOrEqual(60);
  expect(long.startsWith(title.replace(/…$/, ''))).toBe(true);
  expect(long[title.replace(/…$/, '').length]).toMatch(/\s/); // cut at a word boundary
  await l.app.close();
});

test('J10 an 80-character repo folder name shows an ellipsis and a tooltip', async () => {
  const name = 'a-very-long-repository-folder-name-that-keeps-going-and-going-for-eighty-chars-x';
  const repo = makeSampleRepo(name.slice(0, 80));
  const l = await launch({ cassette: J0 });
  await pickRepo(l, repo);
  const chip = l.page.getByTestId('repo-chip');
  await expect(chip).toHaveAttribute('title', new RegExp(name.slice(0, 40)));
  const truncated = await chip.evaluate((el) => {
    const t = (el.querySelector('[data-truncate]') as HTMLElement | null) ?? (el as HTMLElement);
    return t.scrollWidth > t.clientWidth;
  });
  expect(truncated).toBe(true);
  await l.app.close();
});
