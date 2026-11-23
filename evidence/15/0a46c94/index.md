<!-- orchestra-evidence -->
## Evidence for `0a46c94`

Head `0a46c94` vs base `d710913` · [CI run](https://github.com/vikas53953/orchestra/actions/runs/45106319725) · PR #15 · [all files](https://github.com/vikas53953/orchestra/tree/evidence/evidence/15/0a46c94)

CONFIRMED = proven in this CI run · REPORTED = claimed with a link, not re-run here · UNVERIFIED = not proven yet

| check | result | label | note |
|---|---|---|---|
| typecheck | pass | CONFIRMED |  |
| tokens | pass | CONFIRMED |  |
| unit | pass | CONFIRMED |  |
| red-proof | pass | CONFIRMED |  |
| mutation | pass | CONFIRMED |  |
| build | pass | CONFIRMED |  |
| e2e | pass | CONFIRMED | recorded replies only \(pre-check\) |
| installer | pass | CONFIRMED |  |
| evidence | pass | CONFIRMED |  |
| real-ai | not run | UNVERIFIED | UNVERIFIED until run on owner's PC \(D9\) |

### Numbers (measured on the runner, base → head)

| metric | base → head |
|---|---|
| renderer bundle (gzip) | 57 KB → 57 KB (no change) |
| unit tests duration | 27100 ms → 26796 ms (−304 ms, −1.1%) |
| cold start to first screen, Home or Setup (median of 3) | 369 ms → 388 ms (+19 ms, +5.1%) |

### Before / after (1440×900, reduced motion)

No screen files changed in this PR (renderer, copy.ts, tokens.css), so no pictures.