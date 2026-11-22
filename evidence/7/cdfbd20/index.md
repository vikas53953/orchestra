<!-- orchestra-evidence -->
## Evidence for `cdfbd20`

Head `cdfbd20` vs base `64da10e` · [CI run](https://github.com/vikas53953/orchestra/actions/runs/45035170588) · PR #7 · [all files](https://github.com/vikas53953/orchestra/tree/evidence/evidence/7/cdfbd20)

CONFIRMED = proven in this CI run · REPORTED = claimed with a link, not re-run here · UNVERIFIED = not proven yet

| check | result | label | note |
|---|---|---|---|
| typecheck | pass | CONFIRMED |  |
| tokens | pass | CONFIRMED |  |
| unit | pass | CONFIRMED |  |
| red-proof | pass | CONFIRMED |  |
| mutation | pass | CONFIRMED |  |
| build | pass | CONFIRMED |  |
| e2e | not run | UNVERIFIED | ran nothing: no tests/e2e journeys on this branch yet |
| installer | pass | CONFIRMED |  |
| evidence | pass | CONFIRMED |  |
| real-ai | not run | UNVERIFIED | UNVERIFIED until run on owner's PC \(D9\) |

### Numbers (measured on the runner, base → head)

| metric | base → head |
|---|---|
| renderer bundle (gzip) | 57 KB → 57 KB (no change) |
| unit tests duration | 27246 ms → 26542 ms (−704 ms, −2.6%) |
| cold start to first screen, Home or Setup (median of 3) | 346 ms → 400 ms (+54 ms, +15.6%) |

### Before / after (1440×900, reduced motion)

No screen files changed in this PR (renderer, copy.ts, tokens.css), so no pictures.