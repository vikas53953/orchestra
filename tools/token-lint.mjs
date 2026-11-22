// Token lint: renderer styles may use colours only through var(--o-*) tokens (tokens.css is the one source).
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
const ROOT = 'apps/desktop/src/renderer';
const files = [];
(function walk(d) { for (const n of readdirSync(d)) { const p = join(d, n); statSync(p).isDirectory() ? walk(p) : files.push(p); } })(ROOT);
const RAW = /#[0-9a-fA-F]{3,8}\b|\b(rgba?|hsla?|oklch|oklab|lab|lch|color)\(/;
let bad = 0;
for (const f of files) {
  if (f.endsWith('tokens.css') || !/\.(css|tsx?)$/.test(f)) continue;
  readFileSync(f, 'utf8').split('\n').forEach((line, i) => {
    if (RAW.test(line) && !/token-ok/.test(line)) { console.error(`${f}:${i + 1}: raw colour, use a var(--o-*) token: ${line.trim()}`); bad++; }
  });
}
if (bad) process.exit(1);
console.log(`token lint: ${files.length} renderer files clean`);
