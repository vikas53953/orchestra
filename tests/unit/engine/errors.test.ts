import { describe, it, expect } from 'vitest';
import { classifyRun, resetDetail } from '../../../apps/desktop/src/main/engine/errors';
import { t } from '../../../apps/desktop/src/shared/copy';
import type { FinalLine } from '../../../apps/desktop/src/main/engine/streamParser';

function fin(p: Partial<FinalLine>): FinalLine {
  return { subtype: 'success', isError: false, result: 'fine', sessionId: 's', durationMs: 1, inputTokens: 0, outputTokens: 0, ...p };
}

describe('classifyRun', () => {
  it('ENOENT on spawn -> not_installed', () => {
    const e = Object.assign(new Error('spawn claude ENOENT'), { code: 'ENOENT' });
    expect(classifyRun({ spawnError: e })).toEqual({ error: 'not_installed', errorDetail: 'ENOENT' });
  });

  it('abort -> stopped, timeout -> timeout, and they win over a missing result', () => {
    expect(classifyRun({ aborted: true, exitCode: null, signal: 'SIGTERM' }).error).toBe('stopped');
    expect(classifyRun({ timedOut: true, exitCode: null, signal: 'SIGTERM' }).error).toBe('timeout');
  });

  it('not signed in, from the result or stderr', () => {
    expect(classifyRun({ final: fin({ isError: true, result: 'Invalid API key · Please run /login' }), exitCode: 1 }).error).toBe('not_signed_in');
    expect(classifyRun({ stderr: 'Error: Not logged in. Run claude and use /login', exitCode: 1 }).error).toBe('not_signed_in');
  });

  it('B4 usage limit -> rate_limited with the reset time', () => {
    expect(classifyRun({ final: fin({ isError: true, result: "5-hour limit reached ∙ resets 3pm (Europe/London)" }), exitCode: 1 }))
      .toEqual({ error: 'rate_limited', errorDetail: '3pm (Europe/London)' });
    expect(classifyRun({ final: fin({ isError: false, result: "You've hit your limit · resets 11:30pm" }), exitCode: 0 }))
      .toEqual({ error: 'rate_limited', errorDetail: '11:30pm' });
    const epoch = classifyRun({ final: fin({ isError: true, result: 'Claude AI usage limit reached|1767225600' }), exitCode: 1 });
    expect(epoch).toEqual({ error: 'rate_limited', errorDetail: '2026-01-01T00:00:00.000Z' });
  });

  it('does not mistake an answer that talks about rate limits for a limit', () => {
    const r = classifyRun({ final: fin({ result: 'This repo implements a rate limit middleware that returns 429 when the usage limit is hit.' }), exitCode: 0 });
    expect(r).toEqual({});
  });

  it('B4 a limit notice reported as a normal result (is_error false, exit 0) -> rate_limited', () => {
    expect(classifyRun({ final: fin({ isError: false, result: 'Claude AI usage limit reached|1732291200' }), exitCode: 0 }))
      .toEqual({ error: 'rate_limited', errorDetail: '2024-11-22T16:00:00.000Z' });
    expect(classifyRun({ final: fin({ isError: false, result: '5-hour limit reached ∙ resets 3pm (Europe/London)\n' }), exitCode: 0 }))
      .toEqual({ error: 'rate_limited', errorDetail: '3pm (Europe/London)' });
  });

  it('a successful answer that only looks like a limit notice stays an answer', () => {
    expect(classifyRun({ final: fin({ result: 'Claude AI usage limit reached|1732291200\nThat string is what the CLI prints.' }), exitCode: 0 })).toEqual({});
    expect(classifyRun({ final: fin({ result: '5-hour limit reached ∙ resets 3pm\nis the banner this repo parses.' }), exitCode: 0 })).toEqual({});
  });

  it('a successful short answer that starts like a limit notice is not rate_limited', () => {
    expect(classifyRun({ final: fin({ isError: false, result: 'Rate limit reached: the middleware returns 429 after 10 calls.' }), exitCode: 0 })).toEqual({});
  });

  it('/login in a successful result is not not_signed_in, even with a nonzero exit', () => {
    const r = classifyRun({ final: fin({ isError: false, result: 'Users sign in at /login. Not logged in users are redirected.' }), exitCode: 1 });
    expect(r.error).not.toBe('not_signed_in');
    expect(r.error).not.toBe('rate_limited');
  });

  it('B3 exit without a result line -> crashed', () => {
    expect(classifyRun({ exitCode: 1, signal: null, stderr: '' })).toMatchObject({ error: 'crashed' });
    expect(classifyRun({ exitCode: 0, signal: null })).toMatchObject({ error: 'crashed' });
  });

  it('error result subtype -> crashed with the subtype', () => {
    expect(classifyRun({ final: fin({ isError: true, subtype: 'error_max_turns', result: '' }), exitCode: 1 })).toEqual({ error: 'crashed', errorDetail: 'error_max_turns' });
  });

  it('resetDetail returns undefined when there is no time', () => {
    expect(resetDetail('usage limit reached')).toBeUndefined();
  });
});

// Real-world wording variants the CLI and API use for each cause (architecture.md §9). Each row is a
// message a failed run can end with; the cause shown to the user must follow from it.
describe('classifyRun: wording variants of a failed run', () => {
  const failedWith = (result: string) => classifyRun({ final: fin({ isError: true, subtype: 'error_during_execution', result }), exitCode: 1 });

  it.each([
    'Please /login to continue',
    'Please run /login',
    'Invalid API key',
    'authentication_error: invalid x-api-key',
    'Authentication failed for this account',
    'Authentication is required to use Claude Code',
    'OAuth token has expired. Please sign in again.',
    'OAuth token revoked',
    'API Error: 401 {"type":"error","error":{"message":"Unauthorized"}}',
    'API Error: 401 unauthorised',
  ])('not signed in: %s', (msg) => {
    expect(failedWith(msg)).toEqual({ error: 'not_signed_in', errorDetail: msg });
  });

  it.each([
    'API Error: Usage limit exceeded for this organization',
    'Weekly limit reached for Opus',
    'You have hit your usage limit for today',
    'You hit your limit',
    'API Error: rate_limit_error',
    'Request failed: rate limit exceeded',
    'API Error: 429 Too Many Requests',
  ])('rate limited: %s', (msg) => {
    expect(failedWith(msg)).toMatchObject({ error: 'rate_limited' });
  });

  it('auth wins over a limit word in the same failure', () => {
    expect(failedWith('Not logged in (usage limit unknown)').error).toBe('not_signed_in');
  });

  it('a long failed result that starts like a notice is a generic limit: detail is its first line, capped', () => {
    const long = 'Limit reached: ' + 'x'.repeat(500);
    expect(failedWith(long)).toEqual({ error: 'rate_limited', errorDetail: long.slice(0, 200) });
  });

  it('an unrelated failure is crashed with its subtype, or with its first line when there is no subtype', () => {
    expect(failedWith('Something broke')).toEqual({ error: 'crashed', errorDetail: 'error_during_execution' });
    expect(classifyRun({ final: fin({ isError: true, subtype: '', result: '  Tool failed\nstack...' }), exitCode: 1 }))
      .toEqual({ error: 'crashed', errorDetail: 'Tool failed' });
  });

  it('the detail of a sign-in failure is the first line of the result, else of stderr, at most 200 chars', () => {
    expect(failedWith('Invalid API key\nmore')).toEqual({ error: 'not_signed_in', errorDetail: 'Invalid API key' });
    expect(classifyRun({ stderr: '\n  Error: Not logged in\r\nRun claude', exitCode: 1 })).toEqual({ error: 'not_signed_in', errorDetail: 'Error: Not logged in' });
    const long = 'Invalid API key ' + 'k'.repeat(300);
    expect(failedWith(long).errorDetail).toBe(long.slice(0, 200));
  });

  it('a limit in stderr with no reset time uses the first stderr line as detail', () => {
    expect(classifyRun({ stderr: 'API Error: 429\nretry later', exitCode: 1 })).toEqual({ error: 'rate_limited', errorDetail: 'API Error: 429' });
    expect(classifyRun({ final: fin({ isError: true, result: 'Server said 429' }), stderr: 'x', exitCode: 1 }))
      .toEqual({ error: 'rate_limited', errorDetail: 'Server said 429' });
  });

  it('a limit with "try again after" gives that as detail', () => {
    expect(failedWith('API Error: 429 rate limited. Try again after 4:05pm.')).toEqual({ error: 'rate_limited', errorDetail: '4:05pm' });
  });
});

describe('classifyRun: limit notice on a failed run (B4)', () => {
  it.each([
    ['  Claude AI usage limit reached|1767225600', '2026-01-01T00:00:00.000Z'],
    ["You've hit your usage limit · resets 9am", '9am'],
    ['Youve hit your limit · resets 9am', '9am'],
    ['Opus weekly limit reached • resets Mon 9am', 'Mon 9am'],
    ['5-hour limit reached | resets 3pm', '3pm'],
    ['5-hour limit reached - resets 3pm', '3pm'],
    ['5-hour limit reached: resets at 3pm', '3pm'],
  ])('%s -> %s', (result, detail) => {
    expect(classifyRun({ final: fin({ isError: false, result }), exitCode: 1 })).toEqual({ error: 'rate_limited', errorDetail: detail });
  });

  it('a short notice with no time keeps the whole notice text as detail', () => {
    expect(classifyRun({ final: fin({ isError: true, result: ' 5-hour limit reached ∙ \nUpgrade for more ' }), exitCode: 1 }))
      .toEqual({ error: 'rate_limited', errorDetail: '5-hour limit reached ∙ \nUpgrade for more' });
    expect(classifyRun({ final: fin({ isError: true, result: 'Claude AI usage limit reached\nUpgrade' }), exitCode: 1 }))
      .toEqual({ error: 'rate_limited', errorDetail: 'Claude AI usage limit reached\nUpgrade' });
    expect(classifyRun({ final: fin({ isError: true, result: "You've hit your limit\nUpgrade" }), exitCode: 1 }))
      .toEqual({ error: 'rate_limited', errorDetail: "You've hit your limit\nUpgrade" });
    expect(classifyRun({ final: fin({ isError: true, result: 'Session limit reached:\nUpgrade' }), exitCode: 1 }))
      .toEqual({ error: 'rate_limited', errorDetail: 'Session limit reached:\nUpgrade' });
  });

  it('a phrase that only resembles a notice gets the generic first-line detail', () => {
    // "!" before "limit reached" is not part of a notice's prefix; no separator after it either
    expect(classifyRun({ final: fin({ isError: true, result: 'Oops! limit reached\nUpgrade' }), exitCode: 1 })).toEqual({ error: 'rate_limited', errorDetail: 'Oops! limit reached' });
    expect(classifyRun({ final: fin({ isError: true, result: 'limit reached ok\nUpgrade' }), exitCode: 1 })).toEqual({ error: 'rate_limited', errorDetail: 'limit reached ok' });
    expect(classifyRun({ final: fin({ isError: true, result: 'xx you hit your limit\nUpgrade' }), exitCode: 1 })).toEqual({ error: 'rate_limited', errorDetail: 'xx you hit your limit' });
  });

  it('a "limit reached" phrase that is not a notice is not treated as one', () => {
    // no separator after "limit reached": falls through to the generic limit words, detail from the text
    expect(classifyRun({ final: fin({ isError: true, result: 'limit reached because of X' }), exitCode: 1 })).toEqual({ error: 'rate_limited', errorDetail: 'limit reached because of X' });
    // prose before the phrase that is not a word/space/dash run
    expect(classifyRun({ final: fin({ isError: true, subtype: 'error', result: 'Note: limit reached · resets 3pm' }), exitCode: 1 }))
      .toEqual({ error: 'rate_limited', errorDetail: '3pm' });
  });
});

describe('classifyRun: limit notice on a run that did not fail (B4, exact formats only)', () => {
  const ok = (result: string) => classifyRun({ final: fin({ isError: false, result }), exitCode: 0 });
  it.each([
    ['Claude AI usage limit reached|1767225600', '2026-01-01T00:00:00.000Z'],
    ['claude ai usage limit reached|1767225600000', '2026-01-01T00:00:00.000Z'],
    ['5-hour limit reached ∙ resets 3pm (Europe/London)', '3pm (Europe/London)'],
    ['Weekly limit reached · resets Mon 9am', 'Mon 9am'],
    ['Opus limit reached · resets Mon 9am', 'Mon 9am'],
    ['Sonnet usage limit reached · resets Mon 9am', 'Mon 9am'],
    ['Claude usage limit reached. Your limit will reset at 5pm', '5pm'],
    ['Claude AI usage limit reached · resets 5pm', '5pm'],
    ['Usage limit reached resets 5pm', '5pm'],
    ["You've hit your usage limit · resets 11:30pm", '11:30pm'],
  ])('%s -> %s', (result, detail) => {
    expect(ok(result)).toEqual({ error: 'rate_limited', errorDetail: detail });
  });

  it.each([
    'Answer: Claude AI usage limit reached|1767225600',
    'Claude AI usage limit reached|1767225600 is the format',
    'Claude AI usage limit reached|12345',
    '5-hour limit reached ∙ resets',
    'Daily limit reached ∙ resets 3pm',
    'The 5-hour limit reached ∙ resets 3pm',
    "You've hit your limit ∙ resets 3pm and here is more " + 'x'.repeat(80),
    'Usage limit reached',
  ])('stays an answer: %s', (result) => {
    expect(ok(result)).toEqual({});
  });
});

describe('classifyRun: process ended without a result (B3)', () => {
  it('detail is the first stderr line, else why the process ended', () => {
    expect(classifyRun({ exitCode: 1, stderr: 'TypeError: x is undefined\n  at y' })).toEqual({ error: 'crashed', errorDetail: 'TypeError: x is undefined' });
    expect(classifyRun({ exitCode: 3, signal: null })).toEqual({ error: 'crashed', errorDetail: 'process ended without a result (exit code 3)' });
    expect(classifyRun({ exitCode: 0 })).toEqual({ error: 'crashed', errorDetail: 'process ended without a result (exit code 0)' });
    expect(classifyRun({ exitCode: null, signal: 'SIGKILL' })).toEqual({ error: 'crashed', errorDetail: 'process ended without a result (signal SIGKILL)' });
    expect(classifyRun({})).toEqual({ error: 'crashed', errorDetail: 'process ended without a result (exit code unknown)' });
  });

  it('a spawn error without a code uses its message', () => {
    expect(classifyRun({ spawnError: new Error('boom') })).toEqual({ error: 'not_installed', errorDetail: 'boom' });
  });

  it('a successful result with a nonzero exit and no cause words is still the answer', () => {
    expect(classifyRun({ final: fin({ result: 'All good.' }), exitCode: 2 })).toEqual({});
  });
});

describe('resetDetail', () => {
  it.each([
    ['resets 3pm', '3pm'],
    ['reset at 10:00 UTC', '10:00 UTC'],
    ['Resets  at   noon; later', 'noon'],
    ['usage limit reached|1767225600', '2026-01-01T00:00:00.000Z'],
    ['usage limit reached|1767225600123', '2026-01-01T00:00:00.123Z'],
    ['try again in 5 minutes. thanks', '5 minutes'],
    ['Try again at  4pm', '4pm'],
  ])('%s -> %s', (text, detail) => {
    expect(resetDetail(text)).toBe(detail);
  });

  it('caps the time text at 60 chars and stops at a quote or newline', () => {
    expect(resetDetail('resets ' + 'a'.repeat(100))).toBe('a'.repeat(60));
    expect(resetDetail('resets 3pm"}\nmore')).toBe('3pm');
    expect(resetDetail('try again after ' + 'b'.repeat(100))).toBe('b'.repeat(60));
  });

  it('presetting or "resetting" is not a reset time; an epoch that is not a date is ignored', () => {
    expect(resetDetail('presets 3pm')).toBeUndefined();
    expect(resetDetail('try again after')).toBeUndefined();
    expect(resetDetail('limit reached|9999999999999')).toBe('2286-11-20T17:46:39.999Z');
  });
});

describe('B4 rate_limited detail is only the time, so the copy reads right (architecture.md §9)', () => {
  const sentence = (result: string, isError = true): string => {
    const c = classifyRun({ final: fin({ isError, result }), exitCode: isError ? 1 : 0 });
    expect(c.error).toBe('rate_limited');
    return t('error.rate_limited', { time: c.errorDetail ?? '' });
  };
  it.each([
    ['5-hour limit reached ∙ resets 3pm', 'Claude usage limit reached. Try again after 3pm.'],
    ['5-hour limit reached ∙ resets 3pm (Asia/Calcutta)', 'Claude usage limit reached. Try again after 3pm (Asia/Calcutta).'],
    ['Claude usage limit reached. Your limit will reset at 5pm', 'Claude usage limit reached. Try again after 5pm.'],
    ['Claude AI usage limit reached|1732291200', 'Claude usage limit reached. Try again after 2024-11-22T16:00:00.000Z.'],
    ['API Error: 429. Try again in 5 minutes', 'Claude usage limit reached. Try again after 5 minutes.'],
  ])('%s', (result, want) => {
    for (const isError of [true, false]) {
      if (!isError && result.startsWith('API Error')) continue;
      const s = sentence(result, isError);
      expect(s).toBe(want);
      expect(s).not.toMatch(/after (resets?|try again)/i);
    }
  });
});
