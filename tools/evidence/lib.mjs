// Pure helpers for the evidence pipeline: no I/O here, so every rule is unit-tested
// (tests/unit/tools/evidence.test.ts). Used by shots.mjs / numbers.mjs (evidence job, read-only)
// and publish.mjs (publish job, the only job with write permission).

/** Hidden marker that identifies the one evidence comment on a PR. */
export const MARKER = '<!-- orchestra-evidence -->';

/** Gates, in the order the comment lists them. */
export const GATES = ['typecheck', 'tokens', 'unit', 'red-proof', 'mutation', 'build', 'e2e', 'installer', 'evidence'];

// The photographer itself (and the vite config it serves) also counts, so a change to it proves itself on the runner.
const SCREEN_PATHS = [/^apps\/desktop\/src\/renderer\//, /^apps\/desktop\/src\/shared\/copy\.ts$/, /tokens\.css$/, /^tools\/evidence\/(shots|worktree|vite-serve)\.mjs$/, /^vite\.config\.ts$/];

/** True when a changed-file list touches anything that can change what is on screen. */
export function touchesScreens(files) {
  return files.some((f) => SCREEN_PATHS.some((re) => re.test(f)));
}

/** Hash states announced by the renderer's dev mock ("hash states ...: #a #b"); ['default'] when none. */
export function parseHashStates(src) {
  const line = (src ?? '').split('\n').find((l) => /hash states/i.test(l));
  if (!line) return ['default'];
  const states = [...new Set([...line.matchAll(/#([a-z][a-z0-9-]*)/gi)].map((m) => m[1]))];
  return states.length ? states : ['default'];
}

function num(v, decimals) {
  return v.toFixed(decimals);
}

/** "850 ms → 61 ms (−789 ms, −92.8%)"; "n/a at base → 61 ms" when one side is missing. */
export function fmtDelta(base, head, unit) {
  const has = (v) => typeof v === 'number' && Number.isFinite(v);
  const vals = [base, head].filter(has);
  const d = Math.max(0, ...vals.map(Math.abs)) < 10 && !vals.every(Number.isInteger) ? 1 : 0;
  if (!has(base) && !has(head)) return 'n/a';
  if (!has(base)) return `n/a at base → ${num(head, d)} ${unit}`;
  if (!has(head)) return `${num(base, d)} ${unit} → n/a at head`;
  const delta = head - base;
  const shown = `${num(base, d)} ${unit} → ${num(head, d)} ${unit}`;
  if (num(delta, d) === num(0, d) && base === head) return `${shown} (no change)`;
  const sign = delta < 0 ? '−' : '+';
  const pct = base === 0 ? '' : `, ${sign}${Math.abs((delta / base) * 100).toFixed(1)}%`;
  return `${shown} (${sign}${num(Math.abs(delta), d)} ${unit}${pct})`;
}

export function median(xs) {
  const v = xs.filter((x) => typeof x === 'number' && Number.isFinite(x)).sort((a, b) => a - b);
  if (!v.length) return null;
  const m = Math.floor(v.length / 2);
  return v.length % 2 ? v[m] : (v[m - 1] + v[m]) / 2;
}

function unxml(s) {
  return s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n))).replace(/&amp;/g, '&');
}

function attr(tag, name) {
  const m = tag.match(new RegExp(`\\s${name}="([^"]*)"`));
  return m ? unxml(m[1]) : '';
}

/** Failing tests from a vitest JUnit report: file, test name, first assertion/error line. */
export function parseJunitFailures(xml) {
  const out = [];
  for (const m of (xml ?? '').matchAll(/<testcase\b([^>]*?)(?:\/>|>([\s\S]*?)<\/testcase>)/g)) {
    const body = m[2] ?? '';
    const f = body.match(/<(failure|error)\b([^>]*?)(?:\/>|>([\s\S]*?)<\/\1>)/);
    if (!f) continue;
    const text = unxml(f[3] ?? '').split('\n').map((l) => l.trim()).filter(Boolean);
    const line = text.find((l) => /Error|expected|assert/i.test(l)) ?? attr(` ${f[2]}`, 'message') ?? text[0] ?? '';
    out.push({ file: attr(` ${m[1]}`, 'classname'), name: attr(` ${m[1]}`, 'name'), line });
  }
  return out;
}

const LOG_HITS = /(error\b|\bFAIL\b|FAILED|✗|×|Survived|below threshold|Timed out|ERR!)/i;

/** First lines of a raw gate log that say what went wrong (at most 8). */
export function logDigest(log, max = 8) {
  return (log ?? '').replace(/\r\n/g, '\n').split('\n').map((l) => l.trimEnd()).filter((l) => l.trim() && LOG_HITS.test(l)).slice(0, max).map((l) => l.trim());
}

/** Escape text for one markdown line: no pings, no code-span breakouts, no HTML, no links/emphasis, no table breaks. */
export function mdInline(s, max = 200) {
  const t = String(s ?? '').replace(/\s+/g, ' ').trim().replace(/`/g, "'")
    .replace(/[\\[\]()*_~|]/g, (c) => `\\${c}`) // no links, emphasis, strike-through or table breaks
    .replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/@/g, '@\u200b');
  return t.length > max ? `${t.slice(0, max - 1)}…` : t;
}

/** Text for inside a `code span`: entities would show literally there, so only backticks and newlines change. */
export function mdCode(s, max = 120) {
  const t = String(s ?? '').replace(/\s+/g, ' ').trim().replace(/`/g, "'");
  return t.length > max ? `${t.slice(0, max - 1)}…` : t;
}

// A step that exits 0 without running its gate reports 'not-run' (ci.yml step output ran=false).
const NOT_RUN = {
  mutation: 'ran nothing: no mutation target files on this branch yet',
  e2e: 'ran nothing: no tests/e2e journeys on this branch yet',
  'red-proof': 'not applicable: this PR does not change both unit tests and app source',
};

const RESULT = { 'not-run': 'not run', success: 'pass', failure: 'FAIL', cancelled: 'cancelled', skipped: 'skipped' };

/**
 * One row per gate from the real step outcomes of this CI run.
 * Ran here (pass or fail) = CONFIRMED. Skipped / not run = UNVERIFIED. Real AI never runs in CI (D9).
 */
export function checkRows(outcomes, opts = {}) {
  const rows = GATES.map((name) => {
    const o = outcomes[name] ?? '';
    const result = RESULT[o] ?? 'not run';
    const label = o === 'success' || o === 'failure' ? 'CONFIRMED' : 'UNVERIFIED';
    const note = o === 'not-run' ? NOT_RUN[name] ?? 'step ran nothing' : name === 'e2e' && o ? 'recorded replies only (pre-check)' : '';
    return { name, outcome: o, result, label, note };
  });
  rows.push(opts.realAiRecord
    ? { name: 'real-ai', outcome: '', result: 'not run', label: 'REPORTED', note: `record linked by the builder, not re-run here: ${opts.realAiRecord}` }
    : { name: 'real-ai', outcome: '', result: 'not run', label: 'UNVERIFIED', note: "UNVERIFIED until run on owner's PC (D9)" });
  return rows;
}

/** "### ❌ N gates failed" + per gate the failing tests / first error lines. Empty when nothing failed. */
export function buildFailureDigest(rows, digests) {
  const failed = rows.filter((r) => r.outcome === 'failure');
  if (!failed.length) return '';
  const out = [`### ❌ ${failed.length} gate${failed.length === 1 ? '' : 's'} failed — fix these first`];
  for (const r of failed) {
    out.push(`- **${r.name}**`);
    const d = digests[r.name] ?? {};
    for (const t of (d.tests ?? []).slice(0, 10)) out.push(`  - \`${mdCode(t.name)}\` (${mdInline(t.file, 80)}): ${mdInline(t.line)}`);
    if ((d.tests ?? []).length > 10) out.push(`  - …and ${d.tests.length - 10} more`);
    for (const l of d.lines ?? []) out.push(`  - ${mdInline(l)}`);
    if (!(d.tests ?? []).length && !(d.lines ?? []).length) out.push('  - no failure lines captured; open the run log');
  }
  return out.join('\n');
}

/** The whole evidence comment. Everything shown comes from this run's outcomes and measured files. */
export function buildComment({ repo, pr, headSha, baseSha, runUrl, rows, digests, numbers, shots, rawBase }) {
  const sha7 = String(headSha).slice(0, 7);
  const lines = [MARKER];
  const digest = buildFailureDigest(rows, digests ?? {});
  if (digest) lines.push(digest, '');
  lines.push(`## Evidence for \`${sha7}\``, '');
  lines.push(`Head \`${sha7}\` vs base \`${String(baseSha ?? '').slice(0, 7)}\` · [CI run](${runUrl}) · PR #${pr} · [all files](https://github.com/${repo}/tree/evidence/evidence/${pr}/${sha7})`, '');
  lines.push('CONFIRMED = proven in this CI run · REPORTED = claimed with a link, not re-run here · UNVERIFIED = not proven yet', '');
  lines.push('| check | result | label | note |', '|---|---|---|---|');
  for (const r of rows) lines.push(`| ${r.name} | ${r.result} | ${r.label} | ${mdInline(r.note, 300)} |`);
  lines.push('', '### Numbers (measured on the runner, base → head)', '');
  if (numbers) {
    const n = numbers;
    lines.push('| metric | base → head |', '|---|---|');
    lines.push(`| renderer bundle (gzip) | ${fmtDelta(n.bundleGzipKB?.base, n.bundleGzipKB?.head, 'KB')} |`);
    lines.push(`| unit tests duration | ${fmtDelta(n.unitMs?.base, n.unitMs?.head, 'ms')} |`);
    lines.push(`| cold start to first screen, Home or Setup (median of 3) | ${fmtDelta(n.coldStartMs?.base, n.coldStartMs?.head, 'ms')} |`);
    if (n.notes?.length) for (const note of n.notes) lines.push(`\n- ${mdInline(note, 300)}`);
  } else {
    lines.push('UNVERIFIED: the evidence job produced no numbers (see the run log).');
  }
  lines.push('', '### Before / after (1440×900, reduced motion)', '');
  if (!shots) lines.push('UNVERIFIED: the evidence job produced no pictures (see the run log).');
  else if (!shots.touched) lines.push('No screen files changed in this PR (renderer, copy.ts, tokens.css), so no pictures.');
  else {
    lines.push('Each picture: before | after | changed pixels in magenta.', '');
    for (const s of shots.states) {
      const pct = typeof s.changedPct === 'number' ? `${s.changedPct.toFixed(2)}% pixels changed` : mdInline(s.error ?? 'not captured');
      lines.push(`**#${mdInline(s.state, 40)}** — ${pct}`, '');
      if (s.compare) lines.push(`![${mdInline(s.state, 40)}](${rawBase}/${s.compare})`, '');
    }
  }
  return lines.join('\n');
}

/** Which comment to write: the newest bot comment carrying the marker, else a new one. */
export function planUpsert(comments) {
  const mine = comments.filter((c) => c.user?.type === 'Bot' && c.user?.login === 'github-actions[bot]' && String(c.body ?? '').startsWith(MARKER));
  if (!mine.length) return { action: 'create' };
  return { action: 'update', id: Math.max(...mine.map((c) => c.id)) };
}

/** Only flat, plain png/json/md file names may be copied from the evidence artifact. */
export function safeEvidenceName(name) {
  return /^[a-z0-9][a-z0-9._-]{0,80}\.(png|json|md)$/i.test(name) && !name.includes('..');
}
