import { describe, it, expect } from 'vitest';
import { extractLastJson } from '../../../apps/desktop/src/main/engine/jsonExtract';

describe('extractLastJson', () => {
  it('B1 parses JSON wrapped in markdown fences', () => {
    const t = 'Here is the plan:\n```json\n{"title":"Add sum","steps":[{"agent":"Builder","do":"x","files":[]}]}\n```\nDone.';
    expect(extractLastJson(t)).toEqual({ title: 'Add sum', steps: [{ agent: 'Builder', do: 'x', files: [] }] });
  });

  it('parses a bare object surrounded by prose', () => {
    expect(extractLastJson('ok so {"a":1} that is it')).toEqual({ a: 1 });
  });

  it('takes the LAST object when there are several', () => {
    expect(extractLastJson('{"a":1}\n```json\n{"b":2}\n```\nand finally {"c":3}')).toEqual({ c: 3 });
    expect(extractLastJson('{"c":3}\n```json\n{"b":2}\n```')).toEqual({ b: 2 });
  });

  it('respects braces and escaped quotes inside strings', () => {
    const t = 'x {"note":"a } b { c \\" }","n":{"d":[1,{"e":"}"}]}} y';
    expect(extractLastJson(t)).toEqual({ note: 'a } b { c " }', n: { d: [1, { e: '}' }] } });
  });

  it('a stray unmatched "{" in prose before the real object does not hide it', () => {
    expect(extractLastJson('it said "{ unmatched and {"a":1}')).toEqual({ a: 1 });
    expect(extractLastJson('{ oops { and then {"b":2} done')).toEqual({ b: 2 });
  });

  it('a stray "{" followed by a stray quote does not hide the real object', () => {
    expect(extractLastJson('{ he said "hi {"a":1}')).toEqual({ a: 1 });
    expect(extractLastJson('a { "b {"a":1} c')).toEqual({ a: 1 });
  });

  it('returns the top-level object, not a nested one, and still the last of several', () => {
    expect(extractLastJson('x {"a":{"b":1}} y')).toEqual({ a: { b: 1 } });
    expect(extractLastJson('{"a":1} {"b":{"c":2}} {oops')).toEqual({ b: { c: 2 } });
  });

  // Stryker's instrumented code is ~5-10x slower, so its workers get a larger bound. 10 s still fails the
  // old quadratic scan (~93 s on this input); the normal run keeps the strict 500 ms.
  const PERF_BOUND_MS = process.env.STRYKER_MUTATOR_WORKER ? 10_000 : 500;

  it('200 KB of stray braces and quotes is handled in well under a second (linear scan)', () => {
    const cases = ['{'.repeat(200_000) + '{"a":1}', '{ "x '.repeat(40_000) + '{"a":1}', '{"a":'.repeat(40_000) + ' {"a":1}'];
    for (const t of cases) {
      const t0 = performance.now();
      expect(extractLastJson(t)).toEqual({ a: 1 });
      expect(performance.now() - t0).toBeLessThan(PERF_BOUND_MS);
    }
  });

  it('handles fences with no language and CRLF', () => {
    expect(extractLastJson('```\r\n{"a":true}\r\n```')).toEqual({ a: true });
  });

  it('returns undefined for no JSON, invalid JSON, or arrays only', () => {
    expect(extractLastJson('')).toBeUndefined();
    expect(extractLastJson('no json here')).toBeUndefined();
    expect(extractLastJson('{"title": "half')).toBeUndefined();
    expect(extractLastJson("{title: 'js not json'}")).toBeUndefined();
    expect(extractLastJson('[1,2]')).toBeUndefined();
  });
});
