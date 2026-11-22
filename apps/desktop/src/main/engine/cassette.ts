// CassetteEngine: replays a JSONL file of raw stream-json lines through the same parser as the real
// engine, with a real delay per line. For pre-check e2e only — never proof that the real CLI works.
// CR-3: the replay runs in a real child process (this app's own binary as Node, ELECTRON_RUN_AS_NODE=1),
// spawned, tracked and tree-killed exactly like ClaudeCodeEngine, so Stop / quit / crash tests see a
// real agent process. Test-only: ORCHESTRA_CASSETTE_PID_FILE, when set, gets each spawned pid appended.
import { appendFileSync, mkdirSync } from 'node:fs';
import { access } from 'node:fs/promises';
import { dirname } from 'node:path';
import { tmpdir } from 'node:os';
import type { ChildProcess } from 'node:child_process';
import type { Engine, EngineEvent, ProbeResult, RunRequest, RunResult } from '../../shared/engine';
import { spawnTracked, treeKill } from '../process/treeKill';
import { classifyRun } from './errors';
import { checkOutput, finalTextOf } from './claudeCode';
import { StreamParser, type FinalLine, type ParserLogger } from './streamParser';

export const DEFAULT_CASSETTE_DELAY_MS = 400;

/**
 * The replay child (one line, passed with -e). argv: <cassette file> <delay ms>. Waits the delay, prints one
 * line, repeats. A closed stdout is ignored on purpose: like a hung agent, it keeps going until killed or done.
 */
export const REPLAY_SCRIPT =
  "/* orchestra-cassette-replay */ const fs=require('fs');process.stdout.on('error',()=>{});" +
  'const a=process.argv.slice(-2);const d=Number(a[1]);' +
  "const lines=fs.readFileSync(a[0],'utf8').split(/\\r?\\n/).filter((l)=>l.trim());let i=0;" +
  "const next=()=>{if(i>=lines.length)return;setTimeout(()=>{process.stdout.write(lines[i++]+'\\n');next();},d);};next();";

export class CassetteEngine implements Engine {
  readonly id = 'cassette' as const;
  private readonly delayMs: number;
  private readonly log: ParserLogger;
  private readonly env: NodeJS.ProcessEnv;

  constructor(private readonly file: string, opts: { env?: NodeJS.ProcessEnv; log?: ParserLogger } = {}) {
    const env = opts.env ?? process.env;
    this.env = env;
    const d = Number(env.ORCHESTRA_CASSETTE_DELAY_MS);
    this.delayMs = env.ORCHESTRA_CASSETTE_DELAY_MS !== undefined && Number.isFinite(d) && d >= 0 ? d : DEFAULT_CASSETTE_DELAY_MS;
    this.log = opts.log ?? ((m) => console.warn(`[cassette] ${m}`));
  }

  async probe(opts: { signedIn?: boolean } = {}): Promise<ProbeResult> {
    return { installed: true, version: 'cassette', signedIn: opts.signedIn ? true : null, supportsStreamJson: true };
  }

  async run(req: RunRequest, onEvent: (e: EngineEvent) => void, signal: AbortSignal): Promise<RunResult> {
    const t0 = Date.now();
    const done = (r: Omit<RunResult, 'durationMs'>): RunResult => ({ ...r, durationMs: Date.now() - t0 });
    if (signal.aborted) return done({ ok: false, finalText: '', error: 'stopped' });

    try {
      await access(this.file);
    } catch (e) {
      return done({ ok: false, finalText: '', error: 'crashed', errorDetail: `cassette not readable: ${(e as Error).message}` });
    }

    const parser = new StreamParser(this.log);
    let final: FinalLine | undefined;
    const handle = (items: ReturnType<StreamParser['push']>): void => {
      for (const it of items) {
        if (it.type === 'final') final = it.final;
        else onEvent(it.event);
      }
    };

    const end = await new Promise<{ why: 'stopped' | 'timeout' | null; code: number | null; spawnError?: Error }>((resolve) => {
      let why: 'stopped' | 'timeout' | null = null;
      let settled = false;
      let child: ChildProcess;
      const kill = (): void => {
        if (child?.pid !== undefined) void treeKill(child.pid);
      };
      const onAbort = (): void => {
        why ??= 'stopped';
        kill();
      };
      const timer = setTimeout(() => {
        why ??= 'timeout';
        kill();
      }, Math.max(0, t0 + req.timeoutMs - Date.now()));
      const finish = (code: number | null, spawnError?: Error): void => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        signal.removeEventListener('abort', onAbort);
        handle(parser.end());
        resolve({ why, code, ...(spawnError ? { spawnError } : {}) });
      };
      try {
        child = spawnTracked(process.execPath, ['-e', REPLAY_SCRIPT, '--', this.file, String(this.delayMs)], {
          cwd: tmpdir(),
          env: { ...this.env, ELECTRON_RUN_AS_NODE: '1' },
          stdio: ['ignore', 'pipe', 'ignore'],
        });
      } catch (e) {
        finish(null, e as Error);
        return;
      }
      this.recordPid(child.pid);
      signal.addEventListener('abort', onAbort, { once: true });
      if (signal.aborted) onAbort();
      child.stdout?.on('data', (d: Buffer) => handle(parser.push(d)));
      child.once('error', (e) => finish(null, e));
      child.once('close', (code) => finish(code));
    });

    const finalText = finalTextOf(final, parser.texts);
    if (end.why) return done({ ok: false, finalText, error: end.why });
    if (end.spawnError) return done({ ok: false, finalText, error: 'crashed', errorDetail: `cassette replay: ${end.spawnError.message}` });
    const c = classifyRun({ ...(final ? { final } : {}), exitCode: final && !final.isError ? 0 : 1, signal: null });
    if (c.error) return done({ ok: false, finalText, error: c.error, ...(c.errorDetail ? { errorDetail: c.errorDetail } : {}) });
    const checked = checkOutput(finalText, req.outputSchema);
    if (!checked.ok) return done({ ok: false, finalText, error: 'bad_output' });
    return done({ ok: true, finalText, ...(req.outputSchema ? { json: checked.json } : {}) });
  }

  /** Test-only (CR-3): lets e2e check that no replay process outlives Stop, quit or a crash. */
  private recordPid(pid: number | undefined): void {
    const f = this.env.ORCHESTRA_CASSETTE_PID_FILE;
    if (!f || pid === undefined) return;
    try {
      mkdirSync(dirname(f), { recursive: true });
      appendFileSync(f, `${pid}\n`);
    } catch (e) {
      this.log(`pid file: ${(e as Error).message}`);
    }
  }
}
