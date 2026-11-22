// Tests for the pipeline's own enforcers (layers register, token lint, spec guard).
import { describe, it, expect } from 'vitest';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const ROOT = resolve(__dirname, '../../..');
const run = (script: string, cwd: string, args: string[] = []) =>
  spawnSync(process.execPath, [join(ROOT, script), ...args], { cwd, encoding: 'utf8' });

function sandbox(): string {
  const d = mkdtempSync(join(tmpdir(), 'guards-'));
  mkdirSync(join(d, 'docs'), { recursive: true });
  return d;
}

describe('layers register (tools/layers-check.mjs)', () => {
  it('passes when every layer names an enforcer and where it runs', () => {
    const d = sandbox();
    writeFileSync(join(d, 'docs/pipeline-layers.tsv'), 'layer\tadded\twhy\treplaces\tenforcer\twhere\tlast_ran\nx\t2026\tw\t-\tscript.mjs\tci\t-\n');
    expect(run('tools/layers-check.mjs', d).status).toBe(0);
  });
  it('fails a layer whose enforcer is blank or whitespace', () => {
    const d = sandbox();
    writeFileSync(join(d, 'docs/pipeline-layers.tsv'), 'layer\tadded\twhy\treplaces\tenforcer\twhere\tlast_ran\nx\t2026\tw\t-\t  \tci\t-\n');
    const r = run('tools/layers-check.mjs', d);
    expect(r.status).toBe(1);
    expect(r.stderr).toMatch(/no enforcer/);
  });
});

describe('token lint (tools/token-lint.mjs)', () => {
  const make = (body: string) => {
    const d = sandbox();
    mkdirSync(join(d, 'apps/desktop/src/renderer/dev'), { recursive: true });
    writeFileSync(join(d, 'apps/desktop/src/renderer/tokens.css'), ':root{--o-x:#121212}');
    writeFileSync(join(d, 'apps/desktop/src/renderer/A.tsx'), body);
    return d;
  };
  it('passes when colours come from var(--o-*) tokens', () => {
    expect(run('tools/token-lint.mjs', make('const s = { color: "var(--o-t1)" };')).status).toBe(0);
  });
  for (const raw of ['#ff0000', 'rgb(1,2,3)', 'hsl(0 0% 0%)', 'oklch(0.5 0.1 20)']) {
    it(`fails a raw colour ${raw}`, () => {
      expect(run('tools/token-lint.mjs', make(`const s = { color: "${raw}" };`)).status).toBe(1);
    });
  }
  it('does not exempt dev/ files', () => {
    const d = make('const ok = 1;');
    writeFileSync(join(d, 'apps/desktop/src/renderer/dev/mock.ts'), 'const c = "#abcdef";');
    expect(run('tools/token-lint.mjs', d).status).toBe(1);
  });
});

describe('spec guard (tools/spec-guard.mjs)', () => {
  it('verify fails when a locked file changes after the manifest was written, and ignores CRLF', () => {
    const d = sandbox();
    mkdirSync(join(d, 'docs/spec'), { recursive: true });
    writeFileSync(join(d, 'docs/spec/a.md'), 'line one\nline two\n');
    expect(run('tools/spec-guard.mjs', d, ['write']).status).toBe(0);
    expect(run('tools/spec-guard.mjs', d, ['verify']).status).toBe(0);
    writeFileSync(join(d, 'docs/spec/a.md'), 'line one\r\nline two\r\n');
    expect(run('tools/spec-guard.mjs', d, ['verify']).status).toBe(0);
    writeFileSync(join(d, 'docs/spec/a.md'), 'line one\nline 2\n');
    expect(run('tools/spec-guard.mjs', d, ['verify']).status).toBe(1);
  });
  it('the real repo manifest matches', () => {
    expect(run('tools/spec-guard.mjs', ROOT, ['verify']).status).toBe(0);
  });
});
