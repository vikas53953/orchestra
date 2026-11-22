<!-- orchestra-evidence -->
## Evidence for `b64db4e`

Head `b64db4e` vs base `efa033f` · [CI run](https://github.com/vikas53953/orchestra/actions/runs/45059979735) · PR #14 · [all files](https://github.com/vikas53953/orchestra/tree/evidence/evidence/14/b64db4e)

CONFIRMED = proven in this CI run · REPORTED = claimed with a link, not re-run here · UNVERIFIED = not proven yet

| check | result | label | note |
|---|---|---|---|
| typecheck | pass | CONFIRMED |  |
| tokens | pass | CONFIRMED |  |
| unit | pass | CONFIRMED |  |
| red-proof | pass | CONFIRMED |  |
| mutation | cancelled | UNVERIFIED |  |
| build | skipped | UNVERIFIED |  |
| e2e | skipped | UNVERIFIED | recorded replies only \(pre-check\) |
| installer | skipped | UNVERIFIED |  |
| evidence | pass | CONFIRMED |  |
| real-ai | not run | UNVERIFIED | UNVERIFIED until run on owner's PC \(D9\) |

### Numbers (measured on the runner, base → head)

| metric | base → head |
|---|---|
| renderer bundle (gzip) | 57 KB → 57 KB (no change) |
| unit tests duration | 28263 ms → 28299 ms (+36 ms, +0.1%) |
| cold start to first screen, Home or Setup (median of 3) | 505 ms → 459 ms (−46 ms, −9.1%) |

### Before / after (1440×900, reduced motion)

No screen files changed in this PR (renderer, copy.ts, tokens.css), so no pictures.