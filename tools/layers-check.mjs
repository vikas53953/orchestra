// Layers register check: every pipeline layer must name an enforcer and where it runs.
import { readFileSync } from 'node:fs';
const rows = readFileSync('docs/pipeline-layers.tsv', 'utf8').replace(/\r\n/g, '\n').trim().split('\n');
const head = rows.shift().split('\t');
const iE = head.indexOf('enforcer'), iW = head.indexOf('where'), iL = head.indexOf('layer');
let bad = 0;
for (const r of rows) {
  const c = r.split('\t').map((x) => x.trim());
  if (!c[iE] || c[iE] === '-' || !c[iW] || c[iW] === '-') { console.error(`layer "${c[iL]}" has no enforcer or place to run`); bad++; }
}
if (bad) process.exit(1);
console.log(`layers register: ${rows.length} layers, all enforced`);
