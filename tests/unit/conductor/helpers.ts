// Test helpers: a temp git repo made from fixtures/sample-repo, and a fake Engine with real delays.
// Anything proven with this fake engine is "pre-check only".
import { execFileSync } from 'node:child_process';
import { cpSync, mkdirSync, mkdtempSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import type { Engine, EngineEvent, RunRequest, RunResult } from '../../../apps/desktop/src/shared/engine';

export const FIXTURE = resolve(__dirname, '../../../fixtures/sample-repo');
export const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export function git(cwd: string, ...args: string[]): string {
  return execFileSync('git', args, { cwd, encoding: 'utf8' });
}

/**
 * A fresh git repo (one commit on main) made from fixtures/sample-repo, reached through a link:
 * `root` is <tmp>/LINK~1 -> <tmp>/long-real-root, the posix twin of a Windows 8.3 short TEMP path
 * (C:\\Users\\RUNNER~1). On Windows os.tmpdir() may itself be a short name. `base` is what to delete.
 */
export function makeRepo(): { base: string; root: string; repo: string } {
  const base = mkdtempSync(join(tmpdir(), 'orch-conductor-'));
  const real = join(base, 'long-real-root');
  mkdirSync(real);
  const root = join(base, 'LINK~1');
  symlinkSync(real, root, 'junction');
  const repo = join(root, 'sample-repo');
  cpSync(FIXTURE, repo, { recursive: true });
  git(repo, 'init', '-q', '-b', 'main');
  git(repo, 'config', 'user.name', 'Test');
  git(repo, 'config', 'user.email', 'test@example.invalid');
  git(repo, 'config', 'commit.gpgsign', 'false');
  git(repo, 'add', '-A');
  git(repo, 'commit', '-q', '-m', 'init');
  return { base, root, repo };
}

/** The folders `git worktree list --porcelain` reports (git prints forward slashes on Windows). */
export function worktreeList(repo: string): string[] {
  return git(repo, 'worktree', 'list', '--porcelain').split(/\r?\n/)
    .filter((l) => l.startsWith('worktree ')).map((l) => l.slice('worktree '.length));
}

export interface FakeStep { delayMs: number; event: EngineEvent }

export interface FakeEngineOpts {
  steps: FakeStep[];
  result?: Partial<RunResult>;
  /** ignore the abort signal (a stuck process) */
  ignoreAbort?: boolean;
  /** write this file into req.cwd during the run, to prove writes land in the worktree */
  writeFile?: string;
}

export function fakeEngine(o: FakeEngineOpts): Engine & { requests: RunRequest[] } {
  const requests: RunRequest[] = [];
  return {
    id: 'cassette',
    requests,
    async probe() { await sleep(200); return { installed: true, version: 'fake', signedIn: true, supportsStreamJson: true }; },
    async run(req, onEvent, signal): Promise<RunResult> {
      requests.push(req);
      const t0 = Date.now();
      for (const s of o.steps) {
        await new Promise<void>((res, rej) => {
          const t = setTimeout(res, s.delayMs);
          if (!o.ignoreAbort) signal.addEventListener('abort', () => { clearTimeout(t); rej(new Error('aborted')); }, { once: true });
        }).catch(() => undefined);
        if (signal.aborted && !o.ignoreAbort) {
          return { ok: false, finalText: '', error: 'stopped', durationMs: Date.now() - t0 };
        }
        onEvent(s.event);
        if (o.writeFile && s.event.kind === 'started') writeFileSync(join(req.cwd, o.writeFile), 'scratch\n');
      }
      const text = o.steps.filter((s) => s.event.kind === 'text').map((s) => (s.event as { text: string }).text).join('');
      return { ok: true, finalText: text, durationMs: Date.now() - t0, ...o.result };
    },
  };
}

export const ANSWER_STEPS: FakeStep[] = [
  { delayMs: 200, event: { kind: 'started', engineSessionId: 'eng-1', model: 'fake-model' } },
  { delayMs: 200, event: { kind: 'tool_call', tool: 'Read', summary: 'Reading package.json', path: 'package.json' } },
  { delayMs: 200, event: { kind: 'tool_result', tool: 'Read', ok: true, summary: 'read 9 lines' } },
  { delayMs: 200, event: { kind: 'text', text: 'This repo is a tiny calculator library. ' } },
  { delayMs: 200, event: { kind: 'text', text: 'Files: package.json, src/math.js.' } },
  { delayMs: 200, event: { kind: 'usage', inputTokens: 120, outputTokens: 30 } },
];
