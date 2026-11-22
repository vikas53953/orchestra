// Take the LAST JSON object from model text (architecture.md §4): a fenced ```json block or a bare {...}.
// Bare objects are found with a balanced-brace scan that respects strings and escapes.

const FENCE = /```[ \t]*(?:json|JSON)?[ \t]*\r?\n([\s\S]*?)```/g;

function tryParseObject(s: string): unknown | undefined {
  try {
    const v: unknown = JSON.parse(s.trim());
    return typeof v === 'object' && v !== null && !Array.isArray(v) ? v : undefined;
  } catch {
    return undefined;
  }
}

/** Every top-level balanced {...} span in text, in order, with its start index. */
function braceSpans(text: string): Array<{ start: number; body: string }> {
  const spans: Array<{ start: number; body: string }> = [];
  let depth = 0;
  let start = -1;
  let inStr = false;
  let esc = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inStr) {
      if (esc) esc = false;
      else if (ch === '\\') esc = true;
      else if (ch === '"') inStr = false;
      continue;
    }
    if (ch === '"') {
      if (depth > 0) inStr = true;
    } else if (ch === '{') {
      if (depth === 0) start = i;
      depth++;
    } else if (ch === '}' && depth > 0) {
      depth--;
      if (depth === 0) spans.push({ start, body: text.slice(start, i + 1) });
    }
  }
  return spans;
}

export function extractLastJson(text: string): unknown | undefined {
  if (!text) return undefined;
  const found: Array<{ at: number; value: unknown }> = [];
  for (const m of text.matchAll(FENCE)) {
    const v = tryParseObject(m[1] ?? '');
    if (v !== undefined) found.push({ at: m.index ?? 0, value: v });
  }
  for (const s of braceSpans(text)) {
    const v = tryParseObject(s.body);
    if (v !== undefined) found.push({ at: s.start, value: v });
  }
  if (!found.length) return undefined;
  found.sort((a, b) => a.at - b.at);
  return found[found.length - 1]?.value;
}
