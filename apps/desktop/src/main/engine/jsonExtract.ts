// Take the LAST JSON object from model text (architecture.md §4): a fenced ```json block or a bare {...}.
// Bare objects are found with a memoised strict JSON scan from every "{", so stray braces/quotes in prose are skipped.

const FENCE = /```[ \t]*(?:json|JSON)?[ \t]*\r?\n([\s\S]*?)```/g;

function tryParseObject(s: string): unknown | undefined {
  try {
    const v: unknown = JSON.parse(s.trim());
    return typeof v === 'object' && v !== null && !Array.isArray(v) ? v : undefined;
  } catch {
    return undefined;
  }
}

const MAX_INPUT = 1024 * 1024;
const TAIL = 256 * 1024;
const MAX_DEPTH = 512;
const NUMBER = /-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?/y;
const LITERALS = ['true', 'false', 'null'];

/**
 * Strict JSON scanner over one text. valueEnd(i) is the index just past the JSON value starting at i
 * (after whitespace), or -1. Results are memoised by start index, so scanning every candidate "{" costs
 * roughly linear time in total, whatever stray braces and quotes surround the real object.
 */
class Scanner {
  private readonly memo: Int32Array;
  constructor(private readonly t: string) {
    this.memo = new Int32Array(t.length + 1).fill(-2);
  }

  private ws(i: number): number {
    const t = this.t;
    while (i < t.length) {
      const c = t.charCodeAt(i);
      if (c !== 32 && c !== 9 && c !== 10 && c !== 13) break;
      i++;
    }
    return i;
  }

  valueEnd(i: number, depth = 0): number {
    i = this.ws(i);
    if (i >= this.t.length) return -1;
    const known = this.memo[i]!;
    if (known !== -2) return known;
    if (depth > MAX_DEPTH) return -1; // not memoised: depends on the caller's depth
    const r = this.scan(i, depth);
    this.memo[i] = r;
    return r;
  }

  private scan(i: number, depth: number): number {
    const t = this.t;
    const ch = t[i];
    if (ch === '"') return this.stringEnd(i);
    if (ch === '{') {
      let j = this.ws(i + 1);
      if (t[j] === '}') return j + 1;
      for (;;) {
        if (t[j] !== '"') return -1;
        j = this.stringEnd(j);
        if (j < 0) return -1;
        j = this.ws(j);
        if (t[j] !== ':') return -1;
        j = this.valueEnd(j + 1, depth + 1);
        if (j < 0) return -1;
        j = this.ws(j);
        if (t[j] === '}') return j + 1;
        if (t[j] !== ',') return -1;
        j = this.ws(j + 1);
      }
    }
    if (ch === '[') {
      let j = this.ws(i + 1);
      if (t[j] === ']') return j + 1;
      for (;;) {
        j = this.valueEnd(j, depth + 1);
        if (j < 0) return -1;
        j = this.ws(j);
        if (t[j] === ']') return j + 1;
        if (t[j] !== ',') return -1;
        j += 1;
      }
    }
    for (const lit of LITERALS) if (t.startsWith(lit, i)) return i + lit.length;
    NUMBER.lastIndex = i;
    return NUMBER.test(t) ? NUMBER.lastIndex : -1;
  }

  private stringEnd(i: number): number {
    const t = this.t;
    for (let j = i + 1; j < t.length; j++) {
      const c = t.charCodeAt(j);
      if (c === 34) return j + 1; // "
      if (c === 92) j++; // backslash: skip the escaped char
      else if (c < 32) return -1; // raw control char (incl. newline) is not allowed in a JSON string
    }
    return -1;
  }
}

/** Every top-level complete JSON object in text, in order, with its start index. Stray braces and quotes are skipped. */
function objectSpans(text: string): Array<{ start: number; body: string }> {
  const sc = new Scanner(text);
  const found: Array<[number, number]> = [];
  // Backwards, so inner objects are memoised before the outer ones that contain them (keeps recursion shallow).
  for (let i = text.lastIndexOf('{'); i >= 0; i = i > 0 ? text.lastIndexOf('{', i - 1) : -1) {
    const e = sc.valueEnd(i);
    if (e > 0) found.push([i, e]);
  }
  found.reverse();
  const spans: Array<{ start: number; body: string }> = [];
  let lastEnd = -1;
  for (const [s, e] of found) {
    if (s < lastEnd) continue; // nested inside an object already taken
    spans.push({ start: s, body: text.slice(s, e) });
    lastEnd = e;
  }
  return spans;
}

export function extractLastJson(text: string): unknown | undefined {
  if (!text) return undefined;
  if (text.length > MAX_INPUT) text = text.slice(-TAIL); // the answer's JSON is at the end
  const found: Array<{ at: number; value: unknown }> = [];
  for (const m of text.matchAll(FENCE)) {
    const v = tryParseObject(m[1] ?? '');
    if (v !== undefined) found.push({ at: m.index ?? 0, value: v });
  }
  for (const s of objectSpans(text)) {
    const v = tryParseObject(s.body);
    if (v !== undefined) found.push({ at: s.start, value: v });
  }
  if (!found.length) return undefined;
  found.sort((a, b) => a.at - b.at);
  return found[found.length - 1]?.value;
}
