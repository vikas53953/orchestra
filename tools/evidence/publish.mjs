// Publish job (the only job with write permission; runs no PR code, needs no npm install):
// reads the evidence + gate-log artifacts as untrusted data, writes evidence/<pr>/<sha7>/ to the orphan
// `evidence` branch, and creates or updates the one PR comment that carries MARKER.
// Env: GITHUB_TOKEN GITHUB_REPOSITORY PR_NUMBER HEAD_SHA BASE_SHA RUN_URL OUTCOMES(json) EVIDENCE_DIR GATE_LOGS_DIR
// Usage: node tools/evidence/publish.mjs [--dry-run <out-dir>]   (dry run: no git push, no API calls)
import { readFileSync, writeFileSync, existsSync, readdirSync, statSync, mkdirSync, copyFileSync, mkdtempSync, rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { GATES, checkRows, parseJunitFailures, logDigest, buildComment, planUpsert, safeEvidenceName } from './lib.mjs';

const env = process.env;
const dry = process.argv[2] === '--dry-run' ? process.argv[3] ?? 'evidence-dry' : null;
const repo = env.GITHUB_REPOSITORY;
const pr = Number(env.PR_NUMBER);
const headSha = String(env.HEAD_SHA ?? '');
if (!/^[\w.-]+\/[\w.-]+$/.test(repo ?? '') || !Number.isInteger(pr) || pr <= 0 || !/^[0-9a-f]{40}$/.test(headSha)) {
  console.error('publish: GITHUB_REPOSITORY, PR_NUMBER and a 40-char HEAD_SHA are required');
  process.exit(1);
}
const sha7 = headSha.slice(0, 7);
const MAX_FILE = 8 * 1024 * 1024;

const readText = (p) => { try { return statSync(p).size <= MAX_FILE ? readFileSync(p, 'utf8') : ''; } catch { return ''; } };
const readJson = (p) => { try { return JSON.parse(readText(p)); } catch { return null; } };

// Gate outcomes come from the Actions runtime (needs.windows.outputs), not from the artifact.
let raw = {};
try { raw = JSON.parse(env.OUTCOMES || '{}'); } catch { raw = {}; }
const outcomes = {};
for (const [k, v] of Object.entries(raw)) if (GATES.includes(k.replace(/_/g, '-'))) outcomes[k.replace(/_/g, '-')] = String(v);
if (env.EVIDENCE_RESULT) outcomes.evidence = String(env.EVIDENCE_RESULT); // job result of the pictures + numbers job
const rows = checkRows(outcomes);

const logs = env.GATE_LOGS_DIR ?? 'gate-logs';
const digests = {};
for (const g of GATES) {
  if (outcomes[g] !== 'failure') continue;
  digests[g] = g === 'unit' || g === 'e2e'
    ? { tests: parseJunitFailures(readText(join(logs, g === 'unit' ? 'junit.xml' : 'e2e-junit.xml'))), lines: [] }
    : { tests: [], lines: logDigest(readText(join(logs, `${g}.log`))) };
  if (!digests[g].tests.length && !digests[g].lines.length) digests[g].lines = logDigest(readText(join(logs, `${g}.log`)));
}

const evDir = env.EVIDENCE_DIR ?? 'evidence-out';
const shots = readJson(join(evDir, 'shots.json'));
const numbers = readJson(join(evDir, 'numbers.json'));
const files = existsSync(evDir) ? readdirSync(evDir).filter((f) => safeEvidenceName(f) && statSync(join(evDir, f)).size <= MAX_FILE).slice(0, 80) : [];
if (shots?.states) shots.states = shots.states.filter((s) => s && typeof s.state === 'string').map((s) => ({ ...s, compare: safeEvidenceName(String(s.compare ?? '')) && files.includes(s.compare) ? s.compare : null }));

const ctx = { repo, pr, headSha, baseSha: env.BASE_SHA, runUrl: env.RUN_URL, rows, digests, numbers, shots };
const meta = { pr, headSha, baseSha: env.BASE_SHA, runUrl: env.RUN_URL, outcomes, rows, digests };

if (dry) {
  mkdirSync(dry, { recursive: true });
  for (const f of files) copyFileSync(join(evDir, f), join(dry, f));
  writeFileSync(join(dry, 'index.md'), buildComment({ ...ctx, rawBase: '.' }));
  writeFileSync(join(dry, 'checks.json'), JSON.stringify(meta, null, 2));
  writeFileSync(join(dry, 'comment.md'), buildComment({ ...ctx, rawBase: `https://raw.githubusercontent.com/${repo}/DRYRUN/evidence/${pr}/${sha7}` }));
  console.log(`publish (dry run): wrote ${files.length + 3} files to ${dry}`);
  process.exit(0);
}

// 1. Evidence branch (orphan, never merged): evidence/<pr>/<sha7>/
const git = (args, cwd) => execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
let evidenceCommit = null;
for (let attempt = 1; attempt <= 3 && !evidenceCommit; attempt++) {
  const wt = mkdtempSync(join(tmpdir(), 'evidence-branch-'));
  try {
    let exists = true;
    try { git(['fetch', '--depth=1', 'origin', 'refs/heads/evidence']); } catch { exists = false; }
    if (exists) git(['worktree', 'add', '--detach', '--force', wt, 'FETCH_HEAD']);
    else {
      git(['worktree', 'add', '--detach', '--force', wt]);
      git(['checkout', '--orphan', `evidence-new-${Date.now()}`], wt);
      git(['rm', '-rfq', '--ignore-unmatch', '.'], wt);
      writeFileSync(join(wt, 'README.md'), '# Evidence\n\nCI-made pictures, numbers and gate results per PR and head sha. Written only by the publish job in .github/workflows/ci.yml. Never merged.\n');
    }
    const dest = join(wt, 'evidence', String(pr), sha7);
    mkdirSync(dest, { recursive: true });
    for (const f of files) copyFileSync(join(evDir, f), join(dest, f));
    writeFileSync(join(dest, 'index.md'), buildComment({ ...ctx, rawBase: '.' }));
    writeFileSync(join(dest, 'checks.json'), JSON.stringify(meta, null, 2));
    git(['add', '-A', '.'], wt);
    git(['-c', 'user.name=github-actions[bot]', '-c', 'user.email=41898282+github-actions[bot]@users.noreply.github.com', 'commit', '-q', '--allow-empty', '-m', `evidence: PR ${pr} at ${sha7}`], wt);
    git(['push', 'origin', 'HEAD:refs/heads/evidence'], wt);
    evidenceCommit = git(['rev-parse', 'HEAD'], wt);
  } catch (e) {
    console.error(`publish: evidence push attempt ${attempt} failed: ${String(e.message ?? e).split('\n')[0]}`);
  } finally {
    try { git(['worktree', 'remove', '--force', wt]); } catch { /* gone */ }
    rmSync(wt, { recursive: true, force: true });
  }
}

// 2. One comment, updated in place.
const rawBase = evidenceCommit ? `https://raw.githubusercontent.com/${repo}/${evidenceCommit}/evidence/${pr}/${sha7}` : '';
let body = buildComment({ ...ctx, rawBase });
if (!evidenceCommit) body += '\n\n> The evidence branch push failed, so pictures could not be linked (see the publish job log).';
const api = async (method, path, data) => {
  const r = await fetch(`https://api.github.com${path}`, {
    method,
    headers: { authorization: `Bearer ${env.GITHUB_TOKEN}`, accept: 'application/vnd.github+json', 'x-github-api-version': '2022-11-28', 'content-type': 'application/json' },
    body: data ? JSON.stringify(data) : undefined,
  });
  if (!r.ok) throw new Error(`${method} ${path}: ${r.status} ${(await r.text()).slice(0, 300)}`);
  return r.json();
};
try {
  const comments = [];
  for (let page = 1; page <= 20; page++) {
    const batch = await api('GET', `/repos/${repo}/issues/${pr}/comments?per_page=100&page=${page}`);
    comments.push(...batch);
    if (batch.length < 100) break;
  }
  const plan = planUpsert(comments);
  if (plan.action === 'update') await api('PATCH', `/repos/${repo}/issues/comments/${plan.id}`, { body });
  else await api('POST', `/repos/${repo}/issues/${pr}/comments`, { body });
  console.log(`publish: ${plan.action === 'update' ? 'updated' : 'created'} the evidence comment; evidence commit ${evidenceCommit ?? 'none'}`);
} catch (e) {
  console.error(`publish: could not write the PR comment: ${String(e.message ?? e).split('\n')[0]}`);
  process.exitCode = 1;
}
if (!evidenceCommit) process.exitCode = 1;
