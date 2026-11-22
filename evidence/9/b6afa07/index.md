<!-- orchestra-evidence -->
## Evidence for `b6afa07`

Head `b6afa07` vs base `fce2f3f` · [CI run](https://github.com/vikas53953/orchestra/actions/runs/45055880206) · PR #9 · [all files](https://github.com/vikas53953/orchestra/tree/evidence/evidence/9/b6afa07)

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
| unit tests duration | 308 ms → 26108 ms (+25800 ms, +8376.6%) |
| cold start to first screen, Home or Setup (median of 3) | n/a at base → 323 ms |

- unit tests were red at base; time still measured

- cold start n/a at base: no Home or Setup screen became visible — run 1: page.waitForSelector: Timeout 30000ms exceeded.

### Before / after (1440×900, reduced motion)

Each picture: before | after | changed pixels in magenta.

**#home** — before sha did not render: vite did not start in 60 s: e of Vite serving allow list.

**#setup** — before sha did not render: vite did not start in 60 s: e of Vite serving allow list.

**#running** — before sha did not render: vite did not start in 60 s: e of Vite serving allow list.

**#answered** — before sha did not render: vite did not start in 60 s: e of Vite serving allow list.

**#failed** — before sha did not render: vite did not start in 60 s: e of Vite serving allow list.

**#long-names** — before sha did not render: vite did not start in 60 s: e of Vite serving allow list.

**#loading** — before sha did not render: vite did not start in 60 s: e of Vite serving allow list.

**#panel** — before sha did not render: vite did not start in 60 s: e of Vite serving allow list.
