// ClaudeCodeEngine: drives the locally installed Claude Code CLI (architecture.md §4, §9, §10).
// Spawned with an argument array (never a shell), hidden window, stdin closed, tracked and tree-killed.
import { tmpdir } from 'node:os';
import type { ChildProcess } from 'node:child_process';
import type { Engine, EngineEvent, ProbeResult, RunRequest, RunResult } from '../../shared/engine';
import { spawnTracked, treeKill } from '../process/treeKill';
import { classifyRun, type RunOutcome } from './errors';
import { extractLastJson } from './jsonExtract';
import { resolveClaudeCli, defaultResolveDeps, type ResolveDeps, type ResolvedCli } from './resolveCli';
import { StreamParser, type FinalLine, type ParserLogger } from './streamParser';

export const REASK_PROMPT = 'Reply again with only the JSON object.';
const STDERR_CAP = 64 * 1024;
const VERSION_TIMEOUT_MS = 15_000;
const SIGNED_IN_TIMEOUT_MS = 60_000;

export interface ClaudeCodeOptions {
  env?: NodeJS.ProcessEnv;
  log?: ParserLogger;
  resolveDeps?: ResolveDeps;
}

/**
 * argv for one run, per architecture.md §4. `-p` is a boolean flag and the prompt is positional, so every
 * flag comes first, then '--', then the prompt last: a prompt starting with '-' is never parsed as an option.
 */
export function buildRunArgs(req: RunRequest, prompt = req.prompt, resumeSessionId = req.resumeSessionId): string[] {
  const args = [
    '-p',
    '--output-format', 'stream-json',
    '--verbose',
    '--permission-mode', req.permissionMode,
    '--allowedTools', req.allowedTools.join(','),
    '--disallowedTools', req.disallowedTools.join(','),
    '--append-system-prompt', req.systemAppend,
    '--max-turns', String(req.maxTurns),
  ];
  if (resumeSessionId) args.push('--resume', resumeSessionId);
  args.push('--', prompt);
  return args;
}

/** Final text of a run: the result line's text, else the last assistant text. */
export function finalTextOf(final: FinalLine | undefined, texts: readonly string[]): string {
  if (final?.result) return final.result;
  return texts[texts.length - 1] ?? '';
}

/** Schema check of the final text. Returns the JSON when valid. */
export function checkOutput(text: string, schema: RunRequest['outputSchema']): { ok: true; json: unknown } | { ok: false } {
  if (!schema) return { ok: true, json: undefined };
  const json = extractLastJson(text);
  if (json === undefined) return { ok: false };
  try {
    return schema(json) ? { ok: true, json } : { ok: false };
  } catch {
    return { ok: false };
  }
}

interface Attempt {
  outcome: RunOutcome;
  final?: FinalLine;
  texts: string[];
  sessionId: string | null;
}

export function parseSemver(s: string): [number, number, number] | null {
  const m = s.match(/(\d+)\.(\d+)\.(\d+)/);
  return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : null;
}

export class ClaudeCodeEngine implements Engine {
  readonly id = 'claude-code' as const;
  private readonly env: NodeJS.ProcessEnv;
  private readonly log: ParserLogger;
  private readonly resolveDeps: ResolveDeps;

  constructor(opts: ClaudeCodeOptions = {}) {
    this.env = opts.env ?? process.env;
    this.log = opts.log ?? ((m) => console.warn(`[engine] ${m}`));
    this.resolveDeps = opts.resolveDeps ?? defaultResolveDeps;
  }

  private cli(): Promise<ResolvedCli> {
    return resolveClaudeCli(this.env, this.resolveDeps);
  }

  async run(req: RunRequest, onEvent: (e: EngineEvent) => void, signal: AbortSignal): Promise<RunResult> {
    const t0 = Date.now();
    const deadline = t0 + req.timeoutMs;
    const done = (r: Omit<RunResult, 'durationMs'>): RunResult => ({ ...r, durationMs: Date.now() - t0 });
    if (signal.aborted) return done({ ok: false, finalText: '', error: 'stopped' });

    const cli = await this.cli();
    let startedId: string | null = null;
    const forward = (e: EngineEvent): void => {
      if (e.kind === 'started') {
        // the re-ask resumes the same conversation; only announce it again if the CLI forked a new id
        if (startedId === e.engineSessionId) return;
        startedId = e.engineSessionId;
      }
      onEvent(e);
    };

    const first = await this.attempt(cli, buildRunArgs(req), req.cwd, forward, signal, deadline);
    let finalText = finalTextOf(first.final, first.texts);
    let c = classifyRun(first.outcome);
    if (c.error) return done({ ok: false, finalText, error: c.error, ...(c.errorDetail ? { errorDetail: c.errorDetail } : {}) });

    let checked = checkOutput(finalText, req.outputSchema);
    if (checked.ok) return done({ ok: true, finalText, ...(req.outputSchema ? { json: checked.json } : {}) });

    // One automatic re-ask (architecture.md §4, B2).
    const sid = first.final?.sessionId ?? first.sessionId;
    if (!sid) return done({ ok: false, finalText, error: 'bad_output', errorDetail: 'no session id to re-ask' });
    const second = await this.attempt(cli, buildRunArgs(req, REASK_PROMPT, sid), req.cwd, forward, signal, deadline);
    finalText = finalTextOf(second.final, second.texts);
    c = classifyRun(second.outcome);
    if (c.error) return done({ ok: false, finalText, error: c.error, ...(c.errorDetail ? { errorDetail: c.errorDetail } : {}) });
    checked = checkOutput(finalText, req.outputSchema);
    if (checked.ok) return done({ ok: true, finalText, json: checked.json });
    return done({ ok: false, finalText, error: 'bad_output' });
  }

  private attempt(
    cli: ResolvedCli,
    args: string[],
    cwd: string,
    onEvent: (e: EngineEvent) => void,
    signal: AbortSignal,
    deadline: number,
  ): Promise<Attempt> {
    return new Promise<Attempt>((resolve) => {
      const parser = new StreamParser(this.log);
      const outcome: RunOutcome = {};
      let final: FinalLine | undefined;
      let sessionId: string | null = null;
      let stderr = '';
      let settled = false;
      let child: ChildProcess;

      const handle = (items: ReturnType<StreamParser['push']>): void => {
        for (const it of items) {
          if (it.type === 'final') final = it.final;
          else {
            if (it.event.kind === 'started') sessionId = it.event.engineSessionId;
            try {
              onEvent(it.event);
            } catch (e) {
              this.log(`onEvent threw: ${String(e)}`);
            }
          }
        }
      };

      const kill = (): void => {
        if (child?.pid !== undefined) void treeKill(child.pid);
      };
      const onAbort = (): void => {
        outcome.aborted = true;
        kill();
      };
      const remaining = Math.max(0, deadline - Date.now());
      const timer = setTimeout(() => {
        outcome.timedOut = true;
        kill();
      }, remaining);

      const finish = (): void => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        signal.removeEventListener('abort', onAbort);
        handle(parser.end());
        resolve({ outcome: { ...outcome, stderr, ...(final ? { final } : {}) }, ...(final ? { final } : {}), texts: parser.texts, sessionId });
      };

      try {
        child = spawnTracked(cli.cmd, [...cli.prefixArgs, ...args], {
          cwd,
          env: this.env,
          stdio: ['ignore', 'pipe', 'pipe'],
        });
      } catch (e) {
        outcome.spawnError = e as Error;
        finish();
        return;
      }
      signal.addEventListener('abort', onAbort, { once: true });
      if (signal.aborted) onAbort();

      child.stdout?.on('data', (d: Buffer) => handle(parser.push(d)));
      child.stderr?.on('data', (d: Buffer) => {
        if (stderr.length < STDERR_CAP) stderr += d.toString('utf8');
      });
      child.once('error', (e) => {
        outcome.spawnError = e;
        finish();
      });
      child.once('exit', (code, sig) => {
        outcome.exitCode = code;
        outcome.signal = sig;
        // Leftover descendants (e.g. tool subprocesses) must not outlive the run (AC-L1). posix only:
        // on Windows the pid may already be reused once the parent has exited. groupOnly: the leader is
        // gone, so only live members of its process group are signalled, never a recycled pid.
        if (process.platform !== 'win32' && child.pid !== undefined) void treeKill(child.pid, { graceMs: 200, groupOnly: true });
        // 'close' normally follows once stdio drains; don't wait on a pipe held open by a stray grandchild.
        setTimeout(finish, 1000);
      });
      child.once('close', finish);
    });
  }

  /** Short helper run for probe(): collects stdout/stderr, never throws. */
  private async capture(args: string[], timeoutMs: number): Promise<{ spawnError?: Error; stdout: string; stderr: string; code: number | null; timedOut: boolean }> {
    const cli = await this.cli();
    return new Promise((resolve) => {
      let stdout = '';
      let stderr = '';
      let timedOut = false;
      let done = false;
      const end = (r: { spawnError?: Error; code: number | null }): void => {
        if (done) return;
        done = true;
        clearTimeout(timer);
        resolve({ ...r, stdout, stderr, timedOut });
      };
      let child: ChildProcess;
      try {
        child = spawnTracked(cli.cmd, [...cli.prefixArgs, ...args], { cwd: tmpdir(), env: this.env, stdio: ['ignore', 'pipe', 'pipe'] });
      } catch (e) {
        resolve({ spawnError: e as Error, stdout, stderr, code: null, timedOut });
        return;
      }
      const timer = setTimeout(() => {
        timedOut = true;
        if (child.pid !== undefined) void treeKill(child.pid);
      }, timeoutMs);
      child.stdout?.on('data', (d: Buffer) => (stdout += d.toString('utf8')));
      child.stderr?.on('data', (d: Buffer) => {
        if (stderr.length < STDERR_CAP) stderr += d.toString('utf8');
      });
      child.once('error', (e) => end({ spawnError: e, code: null }));
      child.once('close', (code) => end({ code }));
    });
  }

  async probe(opts: { signedIn?: boolean } = {}): Promise<ProbeResult> {
    const v = await this.capture(['--version'], VERSION_TIMEOUT_MS);
    if (v.spawnError || v.timedOut) {
      if (v.spawnError) this.log(`probe: ${v.spawnError.message}`);
      return { installed: false, version: null, signedIn: null, supportsStreamJson: null };
    }
    const sem = parseSemver(v.stdout);
    const version = sem ? sem.join('.') : null;
    // B8: stream-json with the fields we rely on arrived in Claude Code 1.0.0.
    const supportsStreamJson = sem ? sem[0] >= 1 : null;
    let signedIn: boolean | null = null;
    if (opts.signedIn) {
      const r = await this.capture(['-p', '--output-format', 'json', '--max-turns', '1', '--', 'Reply with OK'], SIGNED_IN_TIMEOUT_MS);
      const final = parseJsonResult(r.stdout, this.log);
      const c = classifyRun({
        ...(r.spawnError ? { spawnError: r.spawnError } : {}),
        timedOut: r.timedOut,
        ...(final ? { final } : {}),
        stderr: r.stderr,
        exitCode: r.code,
      });
      // ok or rate-limited means the CLI accepted the credentials; anything else cannot confirm sign-in.
      signedIn = !c.error || c.error === 'rate_limited';
      if (c.error && c.error !== 'rate_limited') this.log(`probe: sign-in check ${c.error} ${c.errorDetail ?? ''}`);
    }
    return { installed: true, version, signedIn, supportsStreamJson };
  }
}

/** `--output-format json` prints one result object (some builds print an array of messages). */
export function parseJsonResult(stdout: string, log: ParserLogger): FinalLine | undefined {
  const trimmed = stdout.trim();
  if (!trimmed) return undefined;
  try {
    const v: unknown = JSON.parse(trimmed);
    const items = Array.isArray(v) ? v : [v];
    const p = new StreamParser(log);
    let final: FinalLine | undefined;
    for (const it of items) for (const x of p.push(JSON.stringify(it) + '\n')) if (x.type === 'final') final = x.final;
    return final;
  } catch {
    const p = new StreamParser(log);
    const all = [...p.push(trimmed + '\n')];
    const f = all.find((x) => x.type === 'final');
    return f?.type === 'final' ? f.final : undefined;
  }
}
