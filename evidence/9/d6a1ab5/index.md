<!-- orchestra-evidence -->
## Evidence for `d6a1ab5`

Head `d6a1ab5` vs base `fce2f3f` · [CI run](https://github.com/vikas53953/orchestra/actions/runs/45107286651) · PR #9 · [all files](https://github.com/vikas53953/orchestra/tree/evidence/evidence/9/d6a1ab5)

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
| renderer bundle (gzip) | 46 KB → 57 KB (+11 KB, +23.4%) |
| unit tests duration | 475 ms → 28710 ms (+28235 ms, +5944.2%) |
| cold start to first screen, Home or Setup (median of 3) | n/a at base → 467 ms |

- unit tests were red at base; time still measured

- cold start n/a at base: no Home or Setup screen became visible — run 1: page.waitForSelector: Timeout 30000ms exceeded.

### Before / after (1440×900, reduced motion)

Each picture: before | after | changed pixels in magenta.

**#home** — 0.90% pixels changed

![home](./home-compare.png)

**#setup** — 1.38% pixels changed

![setup](./setup-compare.png)

**#running** — 1.63% pixels changed

![running](./running-compare.png)

**#answered** — 2.54% pixels changed

![answered](./answered-compare.png)

**#failed** — 2.07% pixels changed

![failed](./failed-compare.png)

**#long-names** — 1.15% pixels changed

![long-names](./long-names-compare.png)

**#loading** — 0.78% pixels changed

![loading](./loading-compare.png)

**#panel** — 2.76% pixels changed

![panel](./panel-compare.png)
