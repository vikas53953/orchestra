<!-- orchestra-evidence -->
### ❌ 1 gate failed — fix these first
- **e2e**
  - `AC-S0.1 app opens on Home within 3 s` (sprint0.spec.ts): Error: no window within 3 s of launch

## Evidence for `44f8a9a`

Head `44f8a9a` vs base `adc5997` · [CI run](https://github.com/vikas53953/orchestra/actions/runs/45047198563) · PR #10 · [all files](https://github.com/vikas53953/orchestra/tree/evidence/evidence/10/44f8a9a)

CONFIRMED = proven in this CI run · REPORTED = claimed with a link, not re-run here · UNVERIFIED = not proven yet

| check | result | label | note |
|---|---|---|---|
| typecheck | pass | CONFIRMED |  |
| tokens | pass | CONFIRMED |  |
| unit | pass | CONFIRMED |  |
| red-proof | pass | CONFIRMED |  |
| mutation | pass | CONFIRMED |  |
| build | pass | CONFIRMED |  |
| e2e | FAIL | CONFIRMED | recorded replies only \(pre-check\) |
| installer | pass | CONFIRMED |  |
| evidence | pass | CONFIRMED |  |
| real-ai | not run | UNVERIFIED | UNVERIFIED until run on owner's PC \(D9\) |

### Numbers (measured on the runner, base → head)

| metric | base → head |
|---|---|
| renderer bundle (gzip) | 57 KB → 57 KB (no change) |
| unit tests duration | 28870 ms → 30019 ms (+1149 ms, +4.0%) |
| cold start to first screen, Home or Setup (median of 3) | 498 ms → 452 ms (−46 ms, −9.2%) |

### Before / after (1440×900, reduced motion)

No screen files changed in this PR (renderer, copy.ts, tokens.css), so no pictures.