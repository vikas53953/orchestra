// Classify a finished Claude Code run into an EngineError + plain detail (architecture.md §9).
import type { EngineError } from '../../shared/types';
import type { FinalLine } from './streamParser';

export interface RunOutcome {
  /** error from spawn() itself, e.g. ENOENT when the CLI is missing */
  spawnError?: NodeJS.ErrnoException | Error;
  aborted?: boolean;
  timedOut?: boolean;
  final?: FinalLine;
  stderr?: string;
  exitCode?: number | null;
  signal?: NodeJS.Signals | null;
}

export interface Classified {
  error?: EngineError;
  errorDetail?: string;
}

const AUTH = [
  /not logged in/i,
  /please (run )?\/login/i,
  /\/login\b/,
  /invalid api key/i,
  /authentication[_ ](error|failed)/i,
  /\bauthenticat(e|ion)\b.*\b(required|failed|error)\b/i,
  /oauth token (has )?(expired|revoked)/i,
  /\b401\b.*unauthori[sz]ed/i,
];

const LIMIT = [
  /usage limit/i,
  /limit reached/i,
  /hit your (usage )?limit/i,
  /rate[_ ]limit/i,
  /\b429\b/,
];

/**
 * B4: Claude Code can report a usage limit as a normal-looking result (is_error false, exit 0). On a run
 * that did not fail, only a WHOLE single-line result matching a known CLI limit format counts.
 */
const SEP = '\\s*[∙·•|]\\s*';
const RESETS = 'resets?\\s+[^\\n]{1,60}';
const EXACT_LIMIT_NOTICES = [
  /^Claude AI usage limit reached\|\d{9,13}$/i,
  new RegExp(`^(?:\\d+-hour |weekly |opus |sonnet )?(?:usage )?limit reached${SEP}${RESETS}$`, 'i'),
  new RegExp(`^(?:Claude (?:AI )?)?usage limit reached[.!]?(?:${SEP}|\\s+)(?:your limit will )?${RESETS}$`, 'i'),
  new RegExp(`^you'?ve hit your (?:usage )?limit${SEP}${RESETS}$`, 'i'),
];

function isExactLimitNotice(text: string): boolean {
  const t = text.trim();
  return !/[\r\n]/.test(t) && EXACT_LIMIT_NOTICES.some((r) => r.test(t));
}

/** A short result of a FAILED run (is_error or nonzero exit) that starts like a usage-limit notice. */
const LIMIT_NOTICE = /^\s*(claude ai usage limit reached|you'?ve hit your (usage )?limit|[\w -]*limit reached\s*[∙·•|:-])/i;

/** The reset time as the CLI wrote it: "resets 3pm (Europe/London)" or the epoch after "usage limit reached|". */
export function resetDetail(text: string): string | undefined {
  const resets = text.match(/\bresets?\s+(?:at\s+)?([^\n.;"]{1,60})/i);
  if (resets?.[1]) return `resets ${resets[1].trim()}`;
  const epoch = text.match(/limit reached\|(\d{9,13})/i);
  if (epoch?.[1]) {
    const n = Number(epoch[1]);
    const d = new Date(epoch[1].length > 10 ? n : n * 1000);
    if (!Number.isNaN(d.getTime())) return `resets ${d.toISOString()}`;
  }
  const tryAfter = text.match(/try again (?:after|at|in)\s+([^\n.;"]{1,60})/i);
  if (tryAfter?.[1]) return `try again after ${tryAfter[1].trim()}`;
  return undefined;
}

function matchesAny(text: string, res: RegExp[]): boolean {
  return res.some((r) => r.test(text));
}

export function classifyRun(o: RunOutcome): Classified {
  if (o.spawnError) {
    const code = (o.spawnError as NodeJS.ErrnoException).code;
    return { error: 'not_installed', errorDetail: code ?? o.spawnError.message };
  }
  if (o.aborted) return { error: 'stopped' };
  if (o.timedOut) return { error: 'timeout' };

  const resultText = o.final?.result ?? '';
  const stderr = o.stderr ?? '';
  const failed = !o.final || o.final.isError || (o.exitCode != null && o.exitCode !== 0);

  if ((failed && resultText.length < 400 && LIMIT_NOTICE.test(resultText)) || (!failed && isExactLimitNotice(resultText))) {
    return { error: 'rate_limited', errorDetail: resetDetail(resultText) ?? resultText.trim() };
  }

  if (failed) {
    const hay = `${resultText}\n${stderr}`;
    // A successful result (is_error false) that mentions /login is an answer, not an auth failure.
    const authFailed = !o.final || o.final.isError;
    if (authFailed && matchesAny(hay, AUTH)) return { error: 'not_signed_in', errorDetail: firstLine(resultText || stderr) };
    if (matchesAny(hay, LIMIT)) {
      return { error: 'rate_limited', errorDetail: resetDetail(hay) ?? firstLine(resultText || stderr) };
    }
  }

  if (!o.final) {
    const why = o.signal ? `signal ${o.signal}` : `exit code ${o.exitCode ?? 'unknown'}`;
    return { error: 'crashed', errorDetail: firstLine(stderr) || `process ended without a result (${why})` };
  }
  if (o.final.isError) return { error: 'crashed', errorDetail: o.final.subtype || firstLine(resultText) };
  return {};
}

function firstLine(s: string): string {
  return (s.trim().split(/\r?\n/)[0] ?? '').slice(0, 200);
}
