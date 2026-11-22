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

// B1: what the model may wrap its reply JSON in. "deep" JSON (arrays nested 2000 levels) is only readable
// through a fence (JSON.parse); the bare scan is depth-capped so it never overflows the stack.
const DEEP = '{"deep":' + '['.repeat(2000) + ']'.repeat(2000) + '}';
const isDeep = (v: unknown): boolean => typeof v === 'object' && v !== null && 'deep' in v;

describe('extractLastJson: fences (B1)', () => {
  it.each([
    ['```json\n', 'json, no spaces'],
    ['```JSON\n', 'upper-case JSON'],
    ['``` json\n', 'space before the language'],
    ['```\t\tjson  \n', 'tabs and spaces around the language'],
    ['```\n', 'no language'],
    ['```json\r\n', 'CRLF'],
  ])('%j (%s)', (open) => {
    expect(isDeep(extractLastJson(`Plan:\n${open}${DEEP}\n\`\`\`\nDone.`))).toBe(true);
  });

  it('a fenced object later than a bare one wins; a bare object later than a fence wins', () => {
    expect(isDeep(extractLastJson('{"a":1}\n```json\n' + DEEP + '\n```'))).toBe(true);
    expect(extractLastJson('```json\n' + DEEP + '\n```\nthen {"a":1}')).toEqual({ a: 1 });
  });

  it('a fence that holds an array, a string, a number or null is not an object', () => {
    for (const inner of ['[1,2]', '"text"', '5', 'null', 'not json']) {
      expect(extractLastJson('{"a":1}\n```json\n' + inner + '\n```')).toEqual({ a: 1 });
    }
  });

  it('unclosed or language-only fences are not read', () => {
    expect(extractLastJson('```json\n' + DEEP)).toBeUndefined();
    expect(extractLastJson('```json ' + DEEP + '```')).toBeUndefined();
  });
});

describe('extractLastJson: bare objects', () => {
  it('an object at the very start, alone, or right next to another', () => {
    expect(extractLastJson('{"a":1}')).toEqual({ a: 1 });
    expect(extractLastJson('{"a":1} trailing')).toEqual({ a: 1 });
    expect(extractLastJson('{"a":1}{"b":2}')).toEqual({ b: 2 });
    expect(extractLastJson('"{"a":1}')).toEqual({ a: 1 });
  });

  it('empty objects and arrays, all JSON value kinds and whitespace kinds', () => {
    expect(extractLastJson('x {} y')).toEqual({});
    expect(extractLastJson('x { } y')).toEqual({});
    expect(extractLastJson('{"a":{},"b":[],"c":[ ]}')).toEqual({ a: {}, b: [], c: [] });
    const all = '{"t":true,"f":false,"n":null,"s":"x\\"y\\\\","i":-12,"d":0.25,"e":1e5,"E":2E-3,"p":-1.5e+10,"z":0,"arr":[1,"2",[3],{"k":4}]}';
    expect(extractLastJson(`see ${all} ok`)).toEqual(JSON.parse(all));
    for (const ws of [' ', '\t', '\n', '\r\n', ' \t\r\n ']) {
      const t = `{${ws}"a"${ws}:${ws}[${ws}1${ws},${ws}2${ws}]${ws},${ws}"b"${ws}:${ws}{${ws}}${ws}}`;
      expect(extractLastJson(`x ${t} y`)).toEqual({ a: [1, 2], b: {} });
    }
  });

  // An outer {...} that is not valid JSON is skipped as a whole, so a valid object inside it is the answer.
  it.each([
    ['missing key quote', '{ab": 1, "c": {"d": 2}}'],
    ['missing colon', '{"a" x1, "c": {"d": 2}}'],
    ['missing comma', '{"a":1 "c": {"d": 2}}'],
    ['missing array comma', '{"a":[1 2], "c": {"d": 2}}'],
    ['raw newline in a string', '{"a":"line\nbreak", "c": {"d": 2}}'],
    ['bare word', '{"a":maybe, "c": {"d": 2}}'],
    ['bad number', '{"a":.5, "c": {"d": 2}}'],
  ])('invalid outer object (%s) -> the valid inner one', (_why, t) => {
    expect(extractLastJson(t)).toEqual({ d: 2 });
  });

  it.each(['1.', '1e', '1e+', '-', '01'])('number %j is not JSON', (n) => {
    expect(extractLastJson(`{"ok":1} {"a":${n}}`)).toEqual({ ok: 1 });
  });

  it('a later object JSON.parse rejects (bad escape) does not hide an earlier good one', () => {
    expect(extractLastJson('{"ok":1} {"a":"\\x"}')).toEqual({ ok: 1 });
  });

  it('very deep nesting does not overflow the stack', () => {
    expect(extractLastJson('{"a":' + '['.repeat(100_000) + ']'.repeat(100_000) + '} {"b":1}')).toEqual({ b: 1 });
    expect(extractLastJson('{"a":'.repeat(50_000) + '1' + '}'.repeat(50_000))).toBeTypeOf('object');
  });
});

describe('extractLastJson: very long text', () => {
  const pad = (n: number): string => 'x'.repeat(n);
  it('up to 1 MB the whole text is searched', () => {
    expect(extractLastJson('{"a":1}' + pad(500_000))).toEqual({ a: 1 });
  });
  it('over 1 MB only the last 256 KB is searched (the reply JSON comes last)', () => {
    expect(extractLastJson(pad(1_000_000) + '{"a":1}' + pad(1_000_000))).toBeUndefined();
    expect(extractLastJson('{"a":1}' + pad(2_000_000))).toBeUndefined();
    expect(extractLastJson(pad(2_000_000) + '{"a":1}' + pad(200_000))).toEqual({ a: 1 });
  });
});
