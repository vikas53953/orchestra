import { describe, it, expect } from 'vitest';
import { StreamParser, summarizeToolCall, usageTokens, type ParsedItem } from '../../../apps/desktop/src/main/engine/streamParser';

const init = { type: 'system', subtype: 'init', session_id: 'sess-1', model: 'claude-test', tools: [] };
const toolUse = {
  type: 'assistant',
  message: { id: 'm1', content: [{ type: 'tool_use', id: 'tu1', name: 'Read', input: { file_path: 'src/math.js' } }], usage: { input_tokens: 10, output_tokens: 5 } },
};
const toolRes = { type: 'user', message: { content: [{ type: 'tool_result', tool_use_id: 'tu1', is_error: false, content: 'export function add(a, b) {}' }] } };
const text = { type: 'assistant', message: { id: 'm2', content: [{ type: 'text', text: 'It adds numbers.' }], usage: { input_tokens: 20, output_tokens: 7 } } };
const result = { type: 'result', subtype: 'success', is_error: false, result: 'It adds numbers.', session_id: 'sess-1', duration_ms: 1234, usage: { input_tokens: 30, output_tokens: 12 } };

const lines = [init, toolUse, toolRes, text, result].map((o) => JSON.stringify(o));

function kinds(items: ParsedItem[]): string[] {
  return items.map((i) => (i.type === 'event' ? i.event.kind : 'final'));
}

describe('StreamParser', () => {
  it('parses a happy stream: started, tool_call Read, tool_result, text, usage, final', () => {
    const p = new StreamParser();
    const items = p.push(lines.join('\n') + '\n');
    expect(kinds(items)).toEqual(['started', 'tool_call', 'usage', 'tool_result', 'text', 'usage', 'final']);
    expect(items[0]).toEqual({ type: 'event', event: { kind: 'started', engineSessionId: 'sess-1', model: 'claude-test' } });
    expect(items[1]).toEqual({ type: 'event', event: { kind: 'tool_call', tool: 'Read', summary: 'src/math.js', path: 'src/math.js' } });
    expect(items[3]).toMatchObject({ event: { kind: 'tool_result', tool: 'Read', ok: true } });
    const fin = items[6];
    expect(fin?.type === 'final' && fin.final).toMatchObject({ result: 'It adds numbers.', sessionId: 'sess-1', isError: false, durationMs: 1234 });
    expect(p.sawFinal).toBe(true);
  });

  it('handles lines split across chunks, including inside a multi-byte character', () => {
    const p = new StreamParser();
    const all = Buffer.from(lines.join('\n') + '\n' + JSON.stringify({ type: 'assistant', message: { content: [{ type: 'text', text: 'naïve ✓' }] } }) + '\n');
    const got: ParsedItem[] = [];
    for (let i = 0; i < all.length; i += 7) got.push(...p.push(all.subarray(i, i + 7)));
    expect(kinds(got)).toEqual(['started', 'tool_call', 'usage', 'tool_result', 'text', 'usage', 'final', 'text']);
    const last = got[got.length - 1];
    expect(last?.type === 'event' && last.event.kind === 'text' && last.event.text).toBe('naïve ✓');
  });

  it('handles CRLF line endings and a trailing line without newline', () => {
    const p = new StreamParser();
    const got = [...p.push(lines.slice(0, 4).join('\r\n') + '\r\n' + lines[4]), ...p.end()];
    expect(kinds(got)).toEqual(['started', 'tool_call', 'usage', 'tool_result', 'text', 'usage', 'final']);
  });

  it('logs and skips garbage, unknown types and the synthetic cassette header, never throws', () => {
    const logged: string[] = [];
    const p = new StreamParser((m) => logged.push(m));
    const got = p.push(
      [
        '{"type":"orchestra_cassette","synthetic":true,"note":"x"}',
        'not json at all',
        '{"broken": ',
        '[1,2,3]',
        '',
        '{"type":"system","subtype":"hook_response"}',
        '{"type":"assistant"}',
        lines[0],
      ].join('\n') + '\n',
    );
    expect(kinds(got)).toEqual(['started']);
    expect(logged.length).toBe(6);
  });

  it('counts usage once per assistant message id', () => {
    const p = new StreamParser();
    const a = { type: 'assistant', message: { id: 'same', content: [{ type: 'text', text: 'a' }], usage: { input_tokens: 3, cache_read_input_tokens: 2, output_tokens: 1 } } };
    const got = p.push(JSON.stringify(a) + '\n' + JSON.stringify(a) + '\n');
    expect(got.filter((i) => i.type === 'event' && i.event.kind === 'usage')).toEqual([
      { type: 'event', event: { kind: 'usage', inputTokens: 5, outputTokens: 1 } },
    ]);
  });

  it('B6 maps a denied tool_result (is_error) back to its tool and keeps going', () => {
    const p = new StreamParser();
    const call = { type: 'assistant', message: { content: [{ type: 'tool_use', id: 'b1', name: 'Bash', input: { command: 'git push origin main' } }] } };
    const denied = { type: 'user', message: { content: [{ type: 'tool_result', tool_use_id: 'b1', is_error: true, content: [{ type: 'text', text: 'Permission to use Bash with command git push origin main has been denied.' }] }] } };
    const got = p.push([call, denied, text].map((o) => JSON.stringify(o)).join('\n') + '\n');
    expect(got[0]).toEqual({ type: 'event', event: { kind: 'tool_call', tool: 'Bash', summary: 'git push origin main' } });
    expect(got[1]).toMatchObject({ event: { kind: 'tool_result', tool: 'Bash', ok: false } });
    expect(kinds(got)).toContain('text');
  });

  it('summarises tool calls per tool', () => {
    expect(summarizeToolCall('Grep', { pattern: 'add\\(', path: 'src' })).toEqual({ summary: 'add\\(', path: 'src' });
    expect(summarizeToolCall('Glob', { pattern: '**/*.js' })).toEqual({ summary: '**/*.js' });
    expect(summarizeToolCall('Edit', { file_path: 'a.ts', old_string: 'x' })).toEqual({ summary: 'a.ts', path: 'a.ts' });
    expect(summarizeToolCall('Write', { file_path: 'b.ts' })).toEqual({ summary: 'b.ts', path: 'b.ts' });
    const long = 'npm test -- --reporter verbose '.repeat(5);
    expect(summarizeToolCall('Bash', { command: long }).summary.length).toBeLessThanOrEqual(60);
  });

  it('clips tool_result summaries to 120 chars', () => {
    const p = new StreamParser();
    const big = { type: 'user', message: { content: [{ type: 'tool_result', tool_use_id: 'zz', content: 'x'.repeat(500) }] } };
    const got = p.push(JSON.stringify(big) + '\n');
    const ev = got[0];
    expect(ev?.type === 'event' && ev.event.kind === 'tool_result' && ev.event.summary.length).toBe(120);
  });
});

// Stream mapping per architecture.md §4: each stream-json line -> lane event, with the exact wording/shape the lane shows.
const J = (o: unknown): string => JSON.stringify(o) + '\n';
const events = (items: ParsedItem[]) => items.flatMap((i) => (i.type === 'event' ? [i.event] : []));
const finalOf = (items: ParsedItem[]) => items.flatMap((i) => (i.type === 'final' ? [i.final] : []))[0];

describe('usageTokens', () => {
  it('input includes cache creation and cache reads; non-numbers count as 0', () => {
    expect(usageTokens({ input_tokens: 3, cache_creation_input_tokens: 5, cache_read_input_tokens: 7, output_tokens: 2 })).toEqual({ inputTokens: 15, outputTokens: 2 });
    expect(usageTokens({ input_tokens: '3', cache_creation_input_tokens: NaN, cache_read_input_tokens: Infinity, output_tokens: null })).toEqual({ inputTokens: 0, outputTokens: 0 });
    expect(usageTokens({ output_tokens: 4 })).toEqual({ inputTokens: 0, outputTokens: 4 });
    expect(usageTokens(null)).toEqual({ inputTokens: 0, outputTokens: 0 });
    expect(usageTokens([1, 2])).toEqual({ inputTokens: 0, outputTokens: 0 });
  });
});

describe('summarizeToolCall: every tool the lane shows', () => {
  it.each([
    ['Read', { file_path: 'a.ts' }, { summary: 'a.ts', path: 'a.ts' }],
    ['MultiEdit', { file_path: 'b.ts', edits: [] }, { summary: 'b.ts', path: 'b.ts' }],
    ['NotebookEdit', { notebook_path: 'n.ipynb' }, { summary: 'n.ipynb', path: 'n.ipynb' }],
    ['Read', {}, { summary: 'Read' }],
    ['Edit', { file_path: 42 }, { summary: 'Edit' }],
    ['Grep', { path: 'src' }, { summary: '', path: 'src' }],
    ['Glob', {}, { summary: '' }],
    ['LS', { path: 'src/lib' }, { summary: 'src/lib', path: 'src/lib' }],
    ['LS', {}, { summary: '.' }],
    ['Bash', {}, { summary: '' }],
    ['Bash', { command: 'git  status\n\t--short ' }, { summary: 'git status --short' }],
    ['WebSearch', { query: 'vitest   docs\n' }, { summary: 'vitest docs' }],
    ['Task', { n: 1, description: 'find tests', prompt: 'p' }, { summary: 'find tests' }],
    ['SomeTool', { path: 'x/y' }, { summary: 'x/y', path: 'x/y' }],
    ['SomeTool', { n: 1, ok: true }, { summary: 'SomeTool' }],
    ['SomeTool', 'not an object', { summary: 'SomeTool' }],
    ['Read', null, { summary: 'Read' }],
  ])('%s %j', (tool, input, want) => {
    expect(summarizeToolCall(tool, input)).toEqual(want);
  });

  it('clips long one-line summaries to 60 chars with an ellipsis; exactly 60 is kept', () => {
    const sixty = 'a'.repeat(60);
    expect(summarizeToolCall('Bash', { command: sixty }).summary).toBe(sixty);
    expect(summarizeToolCall('Bash', { command: sixty + 'b' }).summary).toBe('a'.repeat(59) + '…');
    expect(summarizeToolCall('Other', { q: sixty + 'b' }).summary).toBe('a'.repeat(59) + '…');
  });
});

describe('StreamParser: line mapping details', () => {
  it('init without session id or model still starts the run', () => {
    expect(events(new StreamParser().push(J({ type: 'system', subtype: 'init' })))).toEqual([{ kind: 'started', engineSessionId: '', model: '' }]);
  });

  it('text: only non-empty text blocks, in order; thinking and malformed blocks are not shown', () => {
    const p = new StreamParser();
    const got = p.push(J({ type: 'assistant', message: { content: [
      { type: 'thinking', thinking: 'hmm', text: 'secret' },
      { type: 'text', text: '' },
      { type: 'text', text: 7 },
      'stray',
      null,
      { type: 'text', text: 'one' },
      { type: 'text', text: 'two' },
    ] } }));
    expect(events(got)).toEqual([{ kind: 'text', text: 'one' }, { kind: 'text', text: 'two' }]);
    expect(p.texts).toEqual(['one', 'two']);
  });

  it('tool_use without a name or id is shown as "tool" and its result maps to "tool"', () => {
    const p = new StreamParser();
    const got = p.push(J({ type: 'assistant', message: { content: [{ type: 'tool_use', input: {} }] } }) + J({ type: 'user', message: { content: [{ type: 'tool_result', content: 'ok' }] } }));
    expect(events(got)).toEqual([{ kind: 'tool_call', tool: 'tool', summary: 'tool' }, { kind: 'tool_result', tool: 'tool', ok: true, summary: 'ok' }]);
  });

  it('tool_result: text parts joined by a space, whitespace collapsed; other parts and non-results skipped', () => {
    const p = new StreamParser();
    p.push(J({ type: 'assistant', message: { content: [{ type: 'tool_use', id: 'g1', name: 'Grep', input: { pattern: 'x' } }] } }));
    const got = p.push(J({ type: 'user', message: { content: [
      'stray',
      { type: 'text', text: 'not a result' },
      { type: 'tool_result', tool_use_id: 'g1', is_error: 'yes', content: [{ type: 'text', text: 'a\n\nb' }, { type: 'image' }, 5, { type: 'text', text: '' }, { type: 'text', text: 'c' }] },
      { type: 'tool_result', tool_use_id: 'unknown', content: { weird: true } },
    ] } }));
    // ok is false only when is_error is exactly true
    expect(events(got)).toEqual([
      { kind: 'tool_result', tool: 'Grep', ok: true, summary: 'a b c' },
      { kind: 'tool_result', tool: 'tool', ok: true, summary: '' },
    ]);
  });

  it('usage: counted per message id, every time when there is no id, never when all zero', () => {
    const p = new StreamParser();
    const noId = { type: 'assistant', message: { content: [], usage: { input_tokens: 1, output_tokens: 0 } } };
    const zero = { type: 'assistant', message: { id: 'z', content: [], usage: { input_tokens: 0, output_tokens: 0 } } };
    const outOnly = { type: 'assistant', message: { id: 'o', content: [], usage: { output_tokens: 2 } } };
    const notObj = { type: 'assistant', message: { id: 'n', content: [], usage: 5 } };
    const got = p.push(J(noId) + J(noId) + J(zero) + J(outOnly) + J(notObj));
    expect(events(got)).toEqual([
      { kind: 'usage', inputTokens: 1, outputTokens: 0 },
      { kind: 'usage', inputTokens: 1, outputTokens: 0 },
      { kind: 'usage', inputTokens: 0, outputTokens: 2 },
    ]);
  });

  it('result: defaults for missing fields; is_error only when exactly true; tokens include cache', () => {
    const f = finalOf(new StreamParser().push(J({ type: 'result', is_error: 'true', result: 42, duration_ms: '9', usage: { input_tokens: 1, cache_read_input_tokens: 2, output_tokens: 3 } })));
    expect(f).toEqual({ subtype: '', isError: false, result: '', sessionId: null, durationMs: null, inputTokens: 3, outputTokens: 3 });
    const g = finalOf(new StreamParser().push(J({ type: 'result', subtype: 'error_max_turns', is_error: true, session_id: 's', duration_ms: 0 })));
    expect(g).toEqual({ subtype: 'error_max_turns', isError: true, result: '', sessionId: 's', durationMs: 0, inputTokens: 0, outputTokens: 0 });
  });

  it('a second result line is logged and ignored', () => {
    const logs: string[] = [];
    const p = new StreamParser((m) => logs.push(m));
    const r1 = { type: 'result', subtype: 'success', result: 'first' };
    const got = p.push(J(r1) + J({ ...r1, result: 'second' }));
    expect(got.filter((i) => i.type === 'final')).toHaveLength(1);
    expect(finalOf(got)?.result).toBe('first');
    expect(logs).toEqual([`stream-json: skipped second result line: ${JSON.stringify({ ...r1, result: 'second' })}`]);
  });

  it('skip log lines name the reason and clip the line to 200 chars', () => {
    const logs: string[] = [];
    const p = new StreamParser((m) => logs.push(m));
    const long = 'z'.repeat(300);
    p.push(`${long}\n[1]\n{"type":"system","subtype":"hook"}\n{"type":"mystery"}\n{"type":"user"}\n{"type":"assistant","message":{"content":"x"}}\n{"type":"user","message":[]}\n`);
    expect(logs).toEqual([
      `stream-json: skipped invalid JSON line: ${'z'.repeat(199)}…`,
      'stream-json: skipped non-object line: [1]',
      'stream-json: skipped system/hook: {"type":"system","subtype":"hook"}',
      'stream-json: skipped unknown type "mystery": {"type":"mystery"}',
      'stream-json: skipped user line without content: {"type":"user"}',
      'stream-json: skipped assistant line without content: {"type":"assistant","message":{"content":"x"}}',
      'stream-json: skipped user line without content: {"type":"user","message":[]}',
    ]);
  });

  it('end(): flushes a trailing line, ignores trailing whitespace, and is empty afterwards', () => {
    const logs: string[] = [];
    const p = new StreamParser((m) => logs.push(m));
    expect(p.push('{"type":"system","subtype":"init","session_id":"s"}')).toEqual([]);
    expect(events(p.end())).toEqual([{ kind: 'started', engineSessionId: 's', model: '' }]);
    expect(p.end()).toEqual([]);
    p.push('  \r\n \t');
    expect(p.end()).toEqual([]);
    expect(logs).toEqual([]);
    expect(p.sawFinal).toBe(false);
  });

  it('end(): completes a multi-byte character split across Buffer chunks', () => {
    const p = new StreamParser();
    const b = Buffer.from(JSON.stringify({ type: 'assistant', message: { content: [{ type: 'text', text: '✓' }] } }));
    p.push(b.subarray(0, b.length - 3));
    expect(events([...p.push(b.subarray(b.length - 3)), ...p.end()])).toEqual([{ kind: 'text', text: '✓' }]);
  });
});
