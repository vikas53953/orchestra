<!-- orchestra-evidence -->
## Evidence for `4946d0a`

Head `4946d0a` vs base `c166c99` · [CI run](https://github.com/vikas53953/orchestra/actions/runs/45035808224) · PR #3 · [all files](https://github.com/vikas53953/orchestra/tree/evidence/evidence/3/4946d0a)

CONFIRMED = proven in this CI run · REPORTED = claimed with a link, not re-run here · UNVERIFIED = not proven yet

| check | result | label | note |
|---|---|---|---|
| typecheck | pass | CONFIRMED |  |
| tokens | pass | CONFIRMED |  |
| unit | pass | CONFIRMED |  |
| red-proof | not run | UNVERIFIED | not applicable: this PR does not change both unit tests and app source |
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
| unit tests duration | 26759 ms → 26720 ms (−39 ms, −0.1%) |
| cold start to first screen, Home or Setup (median of 3) | 383 ms → 384 ms (+1 ms, +0.3%) |

### Before / after (1440×900, reduced motion)

No screen files changed in this PR (renderer, copy.ts, tokens.css), so no pictures.