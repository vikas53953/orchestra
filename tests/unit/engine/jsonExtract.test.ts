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
