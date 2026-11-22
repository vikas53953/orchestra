<!-- orchestra-evidence -->
## Evidence for `c58a477`

Head `c58a477` vs base `b6afa07` · [CI run](https://github.com/vikas53953/orchestra/actions/runs/45056127345) · PR #12 · [all files](https://github.com/vikas53953/orchestra/tree/evidence/evidence/12/c58a477)

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
| unit tests duration | 26728 ms → 26437 ms (−291 ms, −1.1%) |
| cold start to first screen, Home or Setup (median of 3) | 360 ms → 370 ms (+10 ms, +2.8%) |

### Before / after (1440×900, reduced motion)

No screen files changed in this PR (renderer, copy.ts, tokens.css), so no pictures.