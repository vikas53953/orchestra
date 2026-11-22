<!-- orchestra-evidence -->
## Evidence for `79b1e0e`

Head `79b1e0e` vs base `83e04e9` · [CI run](https://github.com/vikas53953/orchestra/actions/runs/45033079155) · PR #8 · [all files](https://github.com/vikas53953/orchestra/tree/evidence/evidence/8/79b1e0e)

CONFIRMED = proven in this CI run · REPORTED = claimed with a link, not re-run here · UNVERIFIED = not proven yet

| check | result | label | note |
|---|---|---|---|
| typecheck | pass | CONFIRMED |  |
| tokens | pass | CONFIRMED |  |
| unit | pass | CONFIRMED |  |
| red-proof | not run | UNVERIFIED | not applicable: this PR does not change both unit tests and app source |
| mutation | not run | UNVERIFIED | ran nothing: no mutation target files on this branch yet |
| build | pass | CONFIRMED |  |
| e2e | not run | UNVERIFIED | ran nothing: no tests/e2e journeys on this branch yet |
| installer | pass | CONFIRMED |  |
| evidence | pass | CONFIRMED |  |
| real-ai | not run | UNVERIFIED | UNVERIFIED until run on owner's PC \(D9\) |

### Numbers (measured on the runner, base → head)

| metric | base → head |
|---|---|
| renderer bundle (gzip) | 57 KB → 57 KB (no change) |
| unit tests duration | 28151 ms → 27972 ms (−179 ms, −0.6%) |
| cold start to first screen, Home or Setup (median of 3) | 416 ms → 436 ms (+20 ms, +4.8%) |

### Before / after (1440×900, reduced motion)

No screen files changed in this PR (renderer, copy.ts, tokens.css), so no pictures.