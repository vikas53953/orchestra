import { describe, it, expect } from 'vitest';
import { StreamParser, summarizeToolCall, type ParsedItem } from '../../../apps/desktop/src/main/engine/streamParser';

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
