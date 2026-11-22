<!-- orchestra-evidence -->
### ❌ 1 gate failed — fix these first
- **unit**
  - `CassetteEngine (pre-check only) > honours abort mid-replay -> stopped` (tests/unit/engine/cassette.test.ts): AssertionError: expected 1635 to be less than 1500

## Evidence for `8218277`

Head `8218277` vs base `b6afa07` · [CI run](https://github.com/vikas53953/orchestra/actions/runs/45056134763) · PR #13 · [all files](https://github.com/vikas53953/orchestra/tree/evidence/evidence/13/8218277)

CONFIRMED = proven in this CI run · REPORTED = claimed with a link, not re-run here · UNVERIFIED = not proven yet

| check | result | label | note |
|---|---|---|---|
| typecheck | pass | CONFIRMED |  |
| tokens | pass | CONFIRMED |  |
| unit | FAIL | CONFIRMED |  |
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
| unit tests duration | 28180 ms → 28228 ms (+48 ms, +0.2%) |
| cold start to first screen, Home or Setup (median of 3) | 445 ms → 444 ms (−1 ms, −0.2%) |

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
