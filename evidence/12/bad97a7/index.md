<!-- orchestra-evidence -->
## Evidence for `bad97a7`

Head `bad97a7` vs base `376b674` · [CI run](https://github.com/vikas53953/orchestra/actions/runs/45055653393) · PR #12 · [all files](https://github.com/vikas53953/orchestra/tree/evidence/evidence/12/bad97a7)

CONFIRMED = proven in this CI run · REPORTED = claimed with a link, not re-run here · UNVERIFIED = not proven yet

| check | result | label | note |
|---|---|---|---|
| typecheck | pass | CONFIRMED |  |
| tokens | pass | CONFIRMED |  |
| unit | pass | CONFIRMED |  |
| red-proof | not run | UNVERIFIED | not applicable: this PR does not change both unit tests and app source |
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
| unit tests duration | 28333 ms → 27803 ms (−530 ms, −1.9%) |
| cold start to first screen, Home or Setup (median of 3) | 447 ms → 458 ms (+11 ms, +2.5%) |

### Before / after (1440×900, reduced motion)

No screen files changed in this PR (renderer, copy.ts, tokens.css), so no pictures.