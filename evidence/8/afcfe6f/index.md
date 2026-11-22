<!-- orchestra-evidence -->
## Evidence for `afcfe6f`

Head `afcfe6f` vs base `83e04e9` · [CI run](https://github.com/vikas53953/orchestra/actions/runs/45032856034) · PR #8 · [all files](https://github.com/vikas53953/orchestra/tree/evidence/evidence/8/afcfe6f)

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
| unit tests duration | 25410 ms → 25221 ms (−189 ms, −0.7%) |
| cold start to first screen, Home or Setup (median of 3) | 283 ms → 285 ms (+2 ms, +0.7%) |

### Before / after (1440×900, reduced motion)

No screen files changed in this PR (renderer, copy.ts, tokens.css), so no pictures.