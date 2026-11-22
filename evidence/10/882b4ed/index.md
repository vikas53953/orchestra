<!-- orchestra-evidence -->
## Evidence for `882b4ed`

Head `882b4ed` vs base `adc5997` · [CI run](https://github.com/vikas53953/orchestra/actions/runs/45049430046) · PR #10 · [all files](https://github.com/vikas53953/orchestra/tree/evidence/evidence/10/882b4ed)

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
| unit tests duration | 28185 ms → 27972 ms (−213 ms, −0.8%) |
| cold start to first screen, Home or Setup (median of 3) | 429 ms → 459 ms (+30 ms, +7.0%) |

### Before / after (1440×900, reduced motion)

No screen files changed in this PR (renderer, copy.ts, tokens.css), so no pictures.