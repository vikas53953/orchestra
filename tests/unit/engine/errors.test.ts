import { describe, it, expect } from 'vitest';
import { classifyRun, resetDetail } from '../../../apps/desktop/src/main/engine/errors';
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
      .toEqual({ error: 'rate_limited', errorDetail: 'resets 3pm (Europe/London)' });
    expect(classifyRun({ final: fin({ isError: false, result: "You've hit your limit · resets 11:30pm" }), exitCode: 0 }))
      .toEqual({ error: 'rate_limited', errorDetail: 'resets 11:30pm' });
    const epoch = classifyRun({ final: fin({ isError: true, result: 'Claude AI usage limit reached|1767225600' }), exitCode: 1 });
    expect(epoch).toEqual({ error: 'rate_limited', errorDetail: 'resets 2026-01-01T00:00:00.000Z' });
  });

  it('does not mistake an answer that talks about rate limits for a limit', () => {
    const r = classifyRun({ final: fin({ result: 'This repo implements a rate limit middleware that returns 429 when the usage limit is hit.' }), exitCode: 0 });
    expect(r).toEqual({});
  });

  it('B4 a limit notice reported as a normal result (is_error false, exit 0) -> rate_limited', () => {
    expect(classifyRun({ final: fin({ isError: false, result: 'Claude AI usage limit reached|1732291200' }), exitCode: 0 }))
      .toEqual({ error: 'rate_limited', errorDetail: 'resets 2024-11-22T16:00:00.000Z' });
    expect(classifyRun({ final: fin({ isError: false, result: '5-hour limit reached ∙ resets 3pm (Europe/London)\n' }), exitCode: 0 }))
      .toEqual({ error: 'rate_limited', errorDetail: 'resets 3pm (Europe/London)' });
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
