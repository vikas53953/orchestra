// Pure parser for Claude Code `--output-format stream-json --verbose` output (architecture.md §4).
// Feed raw stdout chunks; get engine events and, at most once, the final `result` line.
// Unknown or invalid lines are logged and skipped, never fatal.
import { StringDecoder } from 'node:string_decoder';
import type { EngineEvent } from '../../shared/engine';

export interface FinalLine {
  subtype: string;
  isError: boolean;
  result: string;
  sessionId: string | null;
  durationMs: number | null;
  inputTokens: number;
  outputTokens: number;
}

export type ParsedItem = { type: 'event'; event: EngineEvent } | { type: 'final'; final: FinalLine };

export type ParserLogger = (message: string) => void;

const MAX_LOGGED_LINE = 200;

function isObj(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}
function str(v: unknown): string | undefined {
  return typeof v === 'string' ? v : undefined;
}
function num(v: unknown): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : 0;
}
function oneLine(s: string): string {
  return s.replace(/\s+/g, ' ').trim();
}
function clip(s: string, n: number): string {
  return s.length > n ? s.slice(0, n - 1) + '…' : s;
}

/** Input tokens include cache reads/creations so the number matches what the plan is billed for. */
export function usageTokens(u: unknown): { inputTokens: number; outputTokens: number } {
  if (!isObj(u)) return { inputTokens: 0, outputTokens: 0 };
  return {
    inputTokens: num(u.input_tokens) + num(u.cache_creation_input_tokens) + num(u.cache_read_input_tokens),
    outputTokens: num(u.output_tokens),
  };
}

/** One-line summary of a tool call and the file path it touches, if any. */
export function summarizeToolCall(tool: string, input: unknown): { summary: string; path?: string } {
  const i = isObj(input) ? input : {};
  const filePath = str(i.file_path) ?? str(i.notebook_path) ?? str(i.path);
  switch (tool) {
    case 'Read':
    case 'Edit':
    case 'MultiEdit':
    case 'Write':
    case 'NotebookEdit':
      return filePath ? { summary: filePath, path: filePath } : { summary: tool };
    case 'Grep':
    case 'Glob': {
      const pattern = str(i.pattern) ?? '';
      const where = str(i.path);
      return where ? { summary: pattern, path: where } : { summary: pattern };
    }
    case 'LS':
      return filePath ? { summary: filePath, path: filePath } : { summary: '.' };
    case 'Bash':
      return { summary: clip(oneLine(str(i.command) ?? ''), 60) };
    default: {
      if (filePath) return { summary: filePath, path: filePath };
      const first = Object.values(i).find((v) => typeof v === 'string');
      return { summary: typeof first === 'string' ? clip(oneLine(first), 60) : tool };
    }
  }
}

function toolResultText(content: unknown): string {
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    return content
      .map((c) => (isObj(c) && typeof c.text === 'string' ? c.text : ''))
      .filter(Boolean)
      .join(' ');
  }
  return '';
}

export class StreamParser {
  private buf = '';
  private readonly decoder = new StringDecoder('utf8');
  private readonly toolNames = new Map<string, string>();
  private readonly usageSeen = new Set<string>();
  private finalSeen = false;
  /** every assistant text block, in order (used when the result line has no text) */
  readonly texts: string[] = [];

  constructor(private readonly log: ParserLogger = () => {}) {}

  get sawFinal(): boolean {
    return this.finalSeen;
  }

  push(chunk: Buffer | string): ParsedItem[] {
    this.buf += typeof chunk === 'string' ? chunk : this.decoder.write(chunk);
    const out: ParsedItem[] = [];
    let nl: number;
    while ((nl = this.buf.indexOf('\n')) >= 0) {
      const line = this.buf.slice(0, nl);
      this.buf = this.buf.slice(nl + 1);
      this.parseLine(line, out);
    }
    return out;
  }

  /** Flush a trailing line with no newline. */
  end(): ParsedItem[] {
    this.buf += this.decoder.end();
    const out: ParsedItem[] = [];
    const rest = this.buf;
    this.buf = '';
    if (rest.trim()) this.parseLine(rest, out);
    return out;
  }

  private skip(reason: string, line: string): void {
    this.log(`stream-json: skipped ${reason}: ${clip(line, MAX_LOGGED_LINE)}`);
  }

  private parseLine(raw: string, out: ParsedItem[]): void {
    const line = raw.replace(/\r$/, '').trim();
    if (!line) return;
    let msg: unknown;
    try {
      msg = JSON.parse(line);
    } catch {
      this.skip('invalid JSON line', line);
      return;
    }
    if (!isObj(msg)) {
      this.skip('non-object line', line);
      return;
    }
    switch (msg.type) {
      case 'system':
        if (msg.subtype === 'init') {
          out.push({
            type: 'event',
            event: { kind: 'started', engineSessionId: str(msg.session_id) ?? '', model: str(msg.model) ?? '' },
          });
        } else {
          this.skip(`system/${String(msg.subtype)}`, line);
        }
        return;
      case 'assistant':
        this.parseAssistant(msg, line, out);
        return;
      case 'user':
        this.parseUser(msg, line, out);
        return;
      case 'result': {
        if (this.finalSeen) {
          this.skip('second result line', line);
          return;
        }
        this.finalSeen = true;
        const u = usageTokens(msg.usage);
        out.push({
          type: 'final',
          final: {
            subtype: str(msg.subtype) ?? '',
            isError: msg.is_error === true,
            result: str(msg.result) ?? '',
            sessionId: str(msg.session_id) ?? null,
            durationMs: typeof msg.duration_ms === 'number' ? msg.duration_ms : null,
            inputTokens: u.inputTokens,
            outputTokens: u.outputTokens,
          },
        });
        return;
      }
      default:
        this.skip(`unknown type "${String(msg.type)}"`, line);
    }
  }

  private parseAssistant(msg: Record<string, unknown>, line: string, out: ParsedItem[]): void {
    const m = msg.message;
    if (!isObj(m) || !Array.isArray(m.content)) {
      this.skip('assistant line without content', line);
      return;
    }
    for (const c of m.content) {
      if (!isObj(c)) continue;
      if (c.type === 'text' && typeof c.text === 'string') {
        if (!c.text) continue;
        this.texts.push(c.text);
        out.push({ type: 'event', event: { kind: 'text', text: c.text } });
      } else if (c.type === 'tool_use') {
        const tool = str(c.name) ?? 'tool';
        const id = str(c.id);
        if (id) this.toolNames.set(id, tool);
        const s = summarizeToolCall(tool, c.input);
        const ev: EngineEvent = s.path !== undefined
          ? { kind: 'tool_call', tool, summary: s.summary, path: s.path }
          : { kind: 'tool_call', tool, summary: s.summary };
        out.push({ type: 'event', event: ev });
      }
      // thinking and other block types are not shown
    }
    // stream-json repeats one message's usage on every content line; count it once per message id
    if (isObj(m.usage)) {
      const id = str(m.id);
      if (id && this.usageSeen.has(id)) return;
      if (id) this.usageSeen.add(id);
      const u = usageTokens(m.usage);
      if (u.inputTokens || u.outputTokens) out.push({ type: 'event', event: { kind: 'usage', ...u } });
    }
  }

  private parseUser(msg: Record<string, unknown>, line: string, out: ParsedItem[]): void {
    const m = msg.message;
    if (!isObj(m) || !Array.isArray(m.content)) {
      this.skip('user line without content', line);
      return;
    }
    for (const c of m.content) {
      if (!isObj(c) || c.type !== 'tool_result') continue;
      const id = str(c.tool_use_id);
      const tool = (id && this.toolNames.get(id)) || 'tool';
      out.push({
        type: 'event',
        event: { kind: 'tool_result', tool, ok: c.is_error !== true, summary: clip(oneLine(toolResultText(c.content)), 120) },
      });
    }
  }
}
