// CassetteEngine: replays a JSONL file of raw stream-json lines through the same parser as the real
// engine, with a real delay per line. For pre-check e2e only — never proof that the real CLI works.
import { readFile } from 'node:fs/promises';
import type { Engine, EngineEvent, ProbeResult, RunRequest, RunResult } from '../../shared/engine';
import { classifyRun } from './errors';
import { checkOutput, finalTextOf } from './claudeCode';
import { StreamParser, type FinalLine, type ParserLogger } from './streamParser';

export const DEFAULT_CASSETTE_DELAY_MS = 400;

export class CassetteEngine implements Engine {
  readonly id = 'cassette' as const;
  private readonly delayMs: number;
  private readonly log: ParserLogger;

  constructor(private readonly file: string, opts: { env?: NodeJS.ProcessEnv; log?: ParserLogger } = {}) {
    const env = opts.env ?? process.env;
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

    let raw: string;
    try {
      raw = await readFile(this.file, 'utf8');
    } catch (e) {
      return done({ ok: false, finalText: '', error: 'crashed', errorDetail: `cassette not readable: ${(e as Error).message}` });
    }
    const lines = raw.split(/\r?\n/).filter((l) => l.trim());
    const parser = new StreamParser(this.log);
    let final: FinalLine | undefined;

    for (const line of lines) {
      const why = await this.wait(signal, t0 + req.timeoutMs);
      if (why) return done({ ok: false, finalText: finalTextOf(final, parser.texts), error: why });
      for (const it of parser.push(line + '\n')) {
        if (it.type === 'final') final = it.final;
        else onEvent(it.event);
      }
    }
    const finalText = finalTextOf(final, parser.texts);
    const c = classifyRun({ ...(final ? { final } : {}), exitCode: final && !final.isError ? 0 : 1, signal: null });
    if (c.error) return done({ ok: false, finalText, error: c.error, ...(c.errorDetail ? { errorDetail: c.errorDetail } : {}) });
    const checked = checkOutput(finalText, req.outputSchema);
    if (!checked.ok) return done({ ok: false, finalText, error: 'bad_output' });
    return done({ ok: true, finalText, ...(req.outputSchema ? { json: checked.json } : {}) });
  }

  /** Wait one line's delay. Returns 'stopped' / 'timeout' when the run must end instead. */
  private wait(signal: AbortSignal, deadline: number): Promise<'stopped' | 'timeout' | null> {
    return new Promise((resolve) => {
      if (signal.aborted) return resolve('stopped');
      const left = deadline - Date.now();
      const ms = Math.min(this.delayMs, Math.max(0, left));
      const onAbort = (): void => {
        clearTimeout(t);
        resolve('stopped');
      };
      const t = setTimeout(() => {
        signal.removeEventListener('abort', onAbort);
        resolve(Date.now() >= deadline ? 'timeout' : null);
      }, ms);
      signal.addEventListener('abort', onAbort, { once: true });
    });
  }
}
