// Before/after pictures: photograph every renderer hash state at the base sha and the head sha
// (vite dev server + the dev mock, Playwright chromium, 1440x900, scale 1, reduced motion, frozen clock),
// then compose before | after | diff in a browser canvas (no image libraries needed).
// Usage: node tools/evidence/shots.mjs --base <sha> --head <sha> --out <dir> [--force]
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseArgs } from 'node:util';
import { chromium } from '@playwright/test';
import { touchesScreens, parseHashStates } from './lib.mjs';
import { git, addWorktree, removeWorktree, readAt, startVite } from './worktree.mjs';

const { values: a } = parseArgs({ options: { base: { type: 'string' }, head: { type: 'string' }, out: { type: 'string' }, force: { type: 'boolean' } } });
const out = a.out ?? 'evidence-out';
mkdirSync(out, { recursive: true });
const MOCK = 'apps/desktop/src/renderer/dev/mockApi.ts';
const FROZEN = new Date('2026-11-22T10:00:00Z');
const W = 1440, H = 900;

const changed = git(['diff', '--name-only', `${a.base}...${a.head}`]).split('\n').filter(Boolean);
const touched = touchesScreens(changed);
if (!touched && !a.force) {
  writeFileSync(join(out, 'shots.json'), JSON.stringify({ touched: false, states: [] }, null, 2));
  console.log('shots: no screen files changed, nothing to photograph');
  process.exit(0);
}

const sides = { before: { sha: a.base }, after: { sha: a.head } };
for (const s of Object.values(sides)) s.dir = addWorktree(s.sha, s.sha.slice(0, 7));
const announced = [...new Set([...parseHashStates(readAt(sides.after.dir, MOCK)), ...parseHashStates(readAt(sides.before.dir, MOCK))])];
const states = announced.length > 1 ? announced.filter((s) => s !== 'default') : announced;
const result = { touched: true, base: a.base, head: a.head, states: [] };
let browser;
try {
  // EVIDENCE_CHROMIUM: optional local chromium path (CI uses `npx playwright install chromium`).
  browser = await chromium.launch(process.env.EVIDENCE_CHROMIUM ? { executablePath: process.env.EVIDENCE_CHROMIUM } : {});
  const ctx = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 1, reducedMotion: 'reduce' });
  let port = 5310;
  const errors = {};
  for (const [side, s] of Object.entries(sides)) {
    let server;
    try {
      server = await startVite(s.dir, port++);
      for (const state of states) {
        const page = await ctx.newPage();
        try {
          await page.clock.setFixedTime(FROZEN);
          await page.goto(state === 'default' ? server.url : `${server.url}#${state}`, { waitUntil: 'networkidle' });
          await page.evaluate(() => document.fonts.ready);
          await page.waitForTimeout(1200); // let seeded hash states and fonts settle
          await page.screenshot({ path: join(out, `${state}-${side}.png`), animations: 'disabled', caret: 'hide' });
        } catch (e) {
          errors[`${state}-${side}`] = String(e.message ?? e).split('\n')[0];
        } finally {
          await page.close();
        }
      }
    } catch (e) {
      for (const state of states) errors[`${state}-${side}`] = `${side} sha did not render: ${String(e.message ?? e).split('\n')[0]}`;
    } finally {
      server?.stop();
    }
  }

  const canvasPage = await ctx.newPage();
  await canvasPage.setContent('<body style="margin:0"></body>');
  const b64 = (p) => { try { return readFileSync(p).toString('base64'); } catch { return null; } };
  for (const state of states) {
    const before = b64(join(out, `${state}-before.png`));
    const after = b64(join(out, `${state}-after.png`));
    const entry = { state, before: before ? `${state}-before.png` : null, after: after ? `${state}-after.png` : null };
    if (!before || !after) {
      entry.error = errors[`${state}-before`] ?? errors[`${state}-after`] ?? 'missing screenshot';
      result.states.push(entry);
      continue;
    }
    const r = await canvasPage.evaluate(compose, { before, after, W, H, base7: a.base.slice(0, 7), head7: a.head.slice(0, 7), state });
    writeFileSync(join(out, `${state}-compare.png`), Buffer.from(r.png.split(',')[1], 'base64'));
    Object.assign(entry, { compare: `${state}-compare.png`, changedPct: r.pct, changedPixels: r.changed });
    result.states.push(entry);
    console.log(`shots: #${state} ${r.pct.toFixed(2)}% pixels changed`);
  }
} finally {
  await browser?.close();
  for (const s of Object.values(sides)) removeWorktree(s.dir);
}
writeFileSync(join(out, 'shots.json'), JSON.stringify(result, null, 2));

/** Runs inside the browser page: diff at full size, compose a half-size before | after | diff strip. */
async function compose({ before, after, W, H, base7, head7, state }) {
  const load = async (b) => { const i = new Image(); i.src = `data:image/png;base64,${b}`; await i.decode(); return i; };
  const [ib, ia] = await Promise.all([load(before), load(after)]);
  const full = (img) => { const c = document.createElement('canvas'); c.width = W; c.height = H; const x = c.getContext('2d'); x.drawImage(img, 0, 0); return x.getImageData(0, 0, W, H); };
  const db = full(ib), da = full(ia);
  const diff = new ImageData(W, H);
  const hit = new Uint8Array(W * H);
  let changed = 0;
  for (let p = 0; p < W * H; p++) {
    const i = p * 4;
    const d = Math.max(Math.abs(db.data[i] - da.data[i]), Math.abs(db.data[i + 1] - da.data[i + 1]), Math.abs(db.data[i + 2] - da.data[i + 2]));
    if (d > 24) { hit[p] = 1; changed++; }
    const lum = (0.3 * da.data[i] + 0.59 * da.data[i + 1] + 0.11 * da.data[i + 2]) * 0.35;
    diff.data[i] = diff.data[i + 1] = diff.data[i + 2] = lum; diff.data[i + 3] = 255;
  }
  for (let p = 0; p < W * H; p++) {
    if (!hit[p]) continue;
    const x0 = p % W, y0 = (p / W) | 0;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      const x = x0 + dx, y = y0 + dy;
      if (x < 0 || y < 0 || x >= W || y >= H) continue;
      const i = (y * W + x) * 4; diff.data[i] = 255; diff.data[i + 1] = 0; diff.data[i + 2] = 255;
    }
  }
  const dc = document.createElement('canvas'); dc.width = W; dc.height = H; dc.getContext('2d').putImageData(diff, 0, 0);
  const pct = (changed / (W * H)) * 100;
  const s = 0.5, pw = W * s, ph = H * s, gap = 16, top = 36;
  const c = document.createElement('canvas'); c.width = pw * 3 + gap * 4; c.height = ph + top + gap;
  const x = c.getContext('2d');
  x.fillStyle = '#2a2a2a'; x.fillRect(0, 0, c.width, c.height);
  x.fillStyle = '#e8e8e8'; x.font = '15px sans-serif'; x.textBaseline = 'middle';
  const labels = [`#${state}  before (${base7})`, `after (${head7})`, `diff: ${pct.toFixed(2)}% pixels changed`];
  [ib, ia, dc].forEach((img, k) => {
    const left = gap + k * (pw + gap);
    x.fillText(labels[k], left, top / 2);
    x.imageSmoothingQuality = 'high';
    x.drawImage(img, left, top, pw, ph);
  });
  return { png: c.toDataURL('image/png'), pct, changed };
}
