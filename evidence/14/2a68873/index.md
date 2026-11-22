<!-- orchestra-evidence -->
## Evidence for `2a68873`

Head `2a68873` vs base `efa033f` · [CI run](https://github.com/vikas53953/orchestra/actions/runs/45060211523) · PR #14 · [all files](https://github.com/vikas53953/orchestra/tree/evidence/evidence/14/2a68873)

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
| unit tests duration | 28229 ms → 28277 ms (+48 ms, +0.2%) |
| cold start to first screen, Home or Setup (median of 3) | 477 ms → 448 ms (−29 ms, −6.1%) |

### Before / after (1440×900, reduced motion)

No screen files changed in this PR (renderer, copy.ts, tokens.css), so no pictures.