// Locked test harness (CR-1). Launches the built app (out/main/index.js) with an isolated data folder.
import { _electron as electron, type ElectronApplication, type Page } from '@playwright/test';
import { cpSync, mkdtempSync, mkdirSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { execFileSync } from 'node:child_process';

export const REAL_AI = process.env.REAL_AI === '1';
export const ROOT = resolve(__dirname, '../..');
export const CASSETTE = (name: string) => join(ROOT, 'tests/cassettes', name);

export interface Launched { app: ElectronApplication; page: Page; dataDir: string }

export function tempDir(prefix: string): string {
  return mkdtempSync(join(tmpdir(), prefix));
}

/** Copy fixtures/sample-repo into a fresh git repo (synthetic data only). */
export function makeSampleRepo(name = 'sample-repo'): string {
  const parent = tempDir('orch-repo-');
  const dir = join(parent, name);
  mkdirSync(dir, { recursive: true });
  cpSync(join(ROOT, 'fixtures/sample-repo'), dir, { recursive: true });
  const git = (...a: string[]) => execFileSync('git', a, { cwd: dir, stdio: 'pipe' });
  git('init', '-q', '-b', 'main');
  git('-c', 'user.name=Test', '-c', 'user.email=test@example.invalid', 'add', '.');
  git('-c', 'user.name=Test', '-c', 'user.email=test@example.invalid', 'commit', '-q', '-m', 'init');
  return dir;
}

export function gitStatus(dir: string): string {
  return execFileSync('git', ['status', '--porcelain'], { cwd: dir, encoding: 'utf8' });
}

export async function launch(opts: { dataDir?: string; env?: Record<string, string>; cassette?: string } = {}): Promise<Launched> {
  const dataDir = opts.dataDir ?? tempDir('orch-data-');
  const env: Record<string, string> = {
    ...(process.env as Record<string, string>),
    ORCHESTRA_DATA_DIR: dataDir,
    ORCHESTRA_WORKTREES_DIR: join(dataDir, 'worktrees'),
    ...opts.env,
  };
  if (!REAL_AI && opts.cassette && !opts.env?.ORCHESTRA_ENGINE) env.ORCHESTRA_ENGINE = `cassette:${opts.cassette}`;
  if (REAL_AI) delete env.ORCHESTRA_ENGINE;
  const main = join(ROOT, 'out/main/index.js');
  if (!existsSync(main)) throw new Error('Build the app first: npm run build');
  const args = [main];
  if (process.platform === 'linux') args.unshift('--no-sandbox');
  const app = await electron.launch({ args, env });
  const page = await app.firstWindow();
  return { app, page, dataDir };
}

/** Make the folder picker return `dir` without showing a native dialog. */
export async function stubFolderPicker(app: ElectronApplication, dir: string): Promise<void> {
  await app.evaluate(({ dialog }, p) => {
    dialog.showOpenDialog = (async () => ({ canceled: false, filePaths: [p] })) as typeof dialog.showOpenDialog;
  }, dir);
}

export async function pickRepo(l: Launched, dir: string): Promise<void> {
  await stubFolderPicker(l.app, dir);
  await l.page.getByTestId('repo-chip').click();
}

export async function ask(l: Launched, text: string): Promise<void> {
  const box = l.page.getByTestId('home-composer');
  await box.click();
  await box.fill(text);
  await box.press('Enter');
}

export async function claudePids(): Promise<number[]> {
  try {
    const cmd = process.platform === 'win32'
      ? execFileSync('tasklist', ['/FI', 'IMAGENAME eq claude.exe', '/FO', 'CSV', '/NH'], { encoding: 'utf8' })
      : execFileSync('pgrep', ['-f', 'claude|fake-claude'], { encoding: 'utf8' });
    return cmd.split('\n').map((l) => parseInt(l.replace(/"/g, '').split(',')[1] ?? l, 10)).filter((n) => !Number.isNaN(n));
  } catch {
    return [];
  }
}
