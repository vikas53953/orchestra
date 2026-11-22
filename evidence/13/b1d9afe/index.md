<!-- orchestra-evidence -->
## Evidence for `b1d9afe`

Head `b1d9afe` vs base `ce34623` · [CI run](https://github.com/vikas53953/orchestra/actions/runs/45057840527) · PR #13 · [all files](https://github.com/vikas53953/orchestra/tree/evidence/evidence/13/b1d9afe)

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
| unit tests duration | 26559 ms → 26823 ms (+264 ms, +1.0%) |
| cold start to first screen, Home or Setup (median of 3) | 361 ms → 347 ms (−14 ms, −3.9%) |

### Before / after (1440×900, reduced motion)

Each picture: before | after | changed pixels in magenta.

**#home** — 0.00% pixels changed

![home](./home-compare.png)

**#setup** — 0.00% pixels changed

![setup](./setup-compare.png)

**#running** — 0.00% pixels changed

![running](./running-compare.png)

**#answered** — 0.00% pixels changed

![answered](./answered-compare.png)

**#failed** — 0.00% pixels changed

![failed](./failed-compare.png)

**#long-names** — 0.00% pixels changed

![long-names](./long-names-compare.png)

**#loading** — 0.00% pixels changed

![loading](./loading-compare.png)

**#panel** — 0.00% pixels changed

![panel](./panel-compare.png)
