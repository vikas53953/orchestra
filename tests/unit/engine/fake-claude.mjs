#!/usr/bin/env node
// Fake Claude Code CLI for engine unit tests (pre-check only). Replays a scenario named by
// FAKE_CLAUDE_SCENARIO as stream-json, with real delays (FAKE_CLAUDE_DELAY_MS, default 250 ms per line).
// Each invocation's argv is appended as one JSON line to FAKE_CLAUDE_ARGV_FILE when set.
import { appendFileSync, writeFileSync } from 'node:fs';
import { spawn } from 'node:child_process';

const argv = process.argv.slice(2);
const env = process.env;
if (env.FAKE_CLAUDE_ARGV_FILE) appendFileSync(env.FAKE_CLAUDE_ARGV_FILE, JSON.stringify(argv) + '\n');

// FAKE_CLAUDE_STRICT_ARGV=1: like the real CLI (commander), `-p` is a boolean flag and the prompt is
// positional, so any '-'-prefixed element before '--' that is not a known option is rejected.
if (env.FAKE_CLAUDE_STRICT_ARGV === '1') {
  const BOOL = new Set(['-p', '--print', '--verbose', '--version']);
  const VALUED = new Set(['--output-format', '--permission-mode', '--allowedTools', '--disallowedTools', '--append-system-prompt', '--max-turns', '--resume']);
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--') break;
    if (VALUED.has(a)) { i++; continue; }
    if (a.startsWith('-') && !BOOL.has(a)) {
      process.stderr.write(`error: unknown option '${a}'\n`);
      process.exit(1);
    }
  }
}

const scenario = env.FAKE_CLAUDE_SCENARIO ?? 'happy';
const delay = Number(env.FAKE_CLAUDE_DELAY_MS ?? 250);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const out = (o) => process.stdout.write((typeof o === 'string' ? o : JSON.stringify(o)) + '\n');
const resumed = argv.includes('--resume');
const SID = 'fake-session-0001';

if (argv.includes('--version')) {
  out(scenario === 'old_version' ? '0.2.9 (Claude Code)' : '2.1.0 (Claude Code)');
  process.exit(0);
}

const init = { type: 'system', subtype: 'init', session_id: SID, model: 'fake-model', cwd: process.cwd(), tools: ['Read'] };
const asst = (content, id) => ({ type: 'assistant', message: { id: id ?? `msg-${Math.random()}`, role: 'assistant', content, usage: { input_tokens: 12, output_tokens: 4 } } });
const text = (t) => asst([{ type: 'text', text: t }]);
const toolUse = (id, name, input) => asst([{ type: 'tool_use', id, name, input }]);
const toolRes = (id, content, isError = false) => ({ type: 'user', message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: id, content, is_error: isError }] } });
const result = (r, isError = false, subtype = 'success') => ({ type: 'result', subtype, is_error: isError, result: r, session_id: SID, duration_ms: 1500, usage: { input_tokens: 40, output_tokens: 20 } });

const jsonMode = argv[argv.indexOf('--output-format') + 1] === 'json';
if (jsonMode) {
  await sleep(delay);
  if (scenario === 'not_signed_in') {
    out(result('Invalid API key · Please run /login', true));
    process.exit(1);
  }
  out(result('OK'));
  process.exit(0);
}

async function play(lines) {
  for (const l of lines) {
    await sleep(delay);
    out(l);
  }
}

const PLAN = { title: 'Add sum', summary: 'Add a sum helper', steps: [{ agent: 'Builder', do: 'Add sum()', files: ['src/math.js'] }], risks: [], testCommand: 'npm test' };

switch (scenario) {
  case 'happy':
  case 'slow_first': {
    if (scenario === 'slow_first') await sleep(Number(env.FAKE_CLAUDE_FIRST_DELAY_MS ?? 3000));
    await play([init, toolUse('tu1', 'Read', { file_path: 'src/math.js' }), toolRes('tu1', 'export const add = (a, b) => a + b;'), text('This repo adds numbers in src/math.js.'), result('This repo adds numbers in src/math.js.')]);
    break;
  }
  case 'fenced':
    await play([init, text('Here is the plan.'), result('Here is the plan:\n```json\n' + JSON.stringify(PLAN, null, 2) + '\n```')]);
    break;
  case 'invalid_json':
    await play([init, result(resumed ? '{"title": "Add sum", steps: oops' : 'I think we should add a sum function.')]);
    break;
  case 'json_after_reask':
    await play([init, result(resumed ? JSON.stringify(PLAN) : 'Sure! Plan: add sum.')]);
    break;
  case 'half':
    await play([init, text('Looking at the')]);
    await sleep(delay);
    process.stdout.write('{"type":"assistant","message":{"content":[{"type":"te');
    await sleep(50);
    process.exit(1);
    break;
  case 'usage_limit':
    await play([init, result('5-hour limit reached ∙ resets 3pm (Europe/London)', true, 'error_during_execution')]);
    process.exitCode = 1;
    break;
  case 'denied_push':
    await play([
      init,
      toolUse('b1', 'Bash', { command: 'git push origin main' }),
      toolRes('b1', 'Permission to use Bash with command git push origin main has been denied.', true),
      text('Push is not allowed; I left the commit for Orchestra.'),
      result('Push is not allowed; I left the commit for Orchestra.'),
    ]);
    break;
  case 'hang':
    await play([init]);
    setInterval(() => {}, 1000);
    break;
  case 'family': {
    const g = spawn(process.execPath, ['-e', "process.on('SIGTERM',()=>{}); setInterval(()=>{},1000)"], { stdio: 'ignore' });
    if (env.FAKE_CLAUDE_PID_FILE) writeFileSync(env.FAKE_CLAUDE_PID_FILE, JSON.stringify({ child: process.pid, grandchild: g.pid }));
    await play([init, text('working...')]);
    setInterval(() => {}, 1000);
    break;
  }
  default:
    process.stderr.write(`fake-claude: unknown scenario ${scenario}\n`);
    process.exit(2);
}
