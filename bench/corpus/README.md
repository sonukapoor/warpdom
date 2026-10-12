# Corpus timing

The published suite timings (jsdom, warpdom and happy-dom on real projects'
own test suites) come from the tools in this directory. They run each
package with `compare()` from `src/compare/`, the same code as
`npx warpdom compare`, so our numbers and a user's numbers come from one
implementation ([docs/compare.md](../../docs/compare.md)). Results and their
interpretation are in [docs/research/README.md](../../docs/research/README.md).

| File | What it is |
| --- | --- |
| `corpus.json` | The tuning corpus: 20 projects, their packages, runners, configs, arguments, environment variables, install and build commands |
| `held-out.json` | 9 projects warpdom was never tuned on (do not fix warpdom against these, or they stop being held out) |
| `pins.json`, `held-out-pins.json` | The commit of each project the published numbers were measured on |
| `checkout.mjs` | Clones projects at their pinned commits, installs, builds |
| `time.mjs` | Times projects: per round, each configuration in turn, writes a CSV row per round and configuration |
| `report.mjs` | Turns a timing CSV into the published tables, with uncertainty |
| `write-pins.mjs` | Rewrites a pins file from local checkouts (when the corpus moves) |
| `lib.mjs` | Shared code (corpus reading, rows, environment record) |
| [`.github/workflows/corpus-timing.yml`](../../.github/workflows/corpus-timing.yml) | The same on GitHub-hosted runners, one job per project |

The corpus files and pins are copied from dom-api-tracer
(`corpus/*.json` at d790997), where the timing ran until 2026-10-12; the
format is unchanged.

## Requirements

- Node 22.23.3 (the corpus needs 22.23.3 or later; the published numbers
  used exactly this version), `corepack enable` (pnpm and yarn at the
  versions projects declare), bun for ark-ui, git.
- `npm ci` in this repository: it also installs jsdom, happy-dom and
  `@happy-dom/jest-environment` (devDependencies), which `time.mjs` links
  into projects that lack them, for the jsdom and happy-dom columns.
- Disk: the 14 projects of the published table take about 21 GB once
  installed and built (measured on full clones; `checkout.mjs` makes
  shallow ones).
- An otherwise idle machine. Corpus runs are heavy: one at a time, 2
  workers.

## Reproducing a table

### The three-way table (docs/research/README.md 3.6)

On GitHub Actions: Actions, "corpus-timing", "Run workflow" (choose the
branch or tag of warpdom to measure), or

```sh
gh workflow run corpus-timing.yml --ref main \
  -f projects=react-hook-form,solid,floating-ui,analog,radix-primitives,vuetify,emoji-picker-element,svelte,ark-ui,material-ui,react-spectrum,CopilotKit,ariakit,handsontable \
  -f rounds=3
```

(GitHub dispatches a workflow only once it is on the default branch.)
The run's summary page shows the tables; the `timing-report` artifact has
the combined CSV, the report and each job's environment record; each
`timing-<project>` artifact has that project's compare output (below).

Locally (checkouts in `~/corpus-repos`, or `--repos-dir`):

```sh
node bench/corpus/checkout.mjs --repos-dir ~/corpus-repos react-hook-form floating-ui
node bench/corpus/time.mjs --repos-dir ~/corpus-repos --rounds 3 --csv timing.csv react-hook-form floating-ui
node bench/corpus/report.mjs timing.csv
```

`time.mjs` appends to the CSV, so projects can be timed in separate
invocations (one at a time) and reported together.

### The held-out set (3.7)

The same with `--corpus bench/corpus/held-out.json` (both tools), or the
workflow's `corpus` input set to `held-out.json` and its project names in
`projects`.

### Two-way tables (jsdom and warpdom only)

`--configs "jsdom-default warpdom-default"` (or the workflow's `configs`
input). On a project whose own DOM is happy-dom (ariakit, ag-grid,
ngx-formly), happy-dom is compare's baseline and still runs.

### Expected runtime

Per round (all three DOMs; GitHub-hosted runner, 2 cores, from the
2026-10-12 three-way run): react-spectrum 32 min, ariakit 31, handsontable
18 or more (its jsdom core run took over 45 minutes on runners), material-ui
18, CopilotKit 15, ark-ui 9, svelte 6.5, vuetify 3, emoji-picker-element
2.3, analog 1.9, radix-primitives 1.6, floating-ui 1.2, react-hook-form 1.1,
solid 0.2. With `--rounds 3` compare adds an untimed warm-up group, so a
project costs about four rounds plus install and build (2-10 min). The
14-project table is about 9 hours of runner time (about 2.5 hours of wall
clock, since jobs run in parallel); on a laptop, run one project at a time.

## What each output means

`time.mjs` writes, for a CSV `<name>.csv`:

- **`<name>.csv`**: `round,project,config,seconds,differs`, one row per
  timed round and configuration (`jsdom-default`, `warpdom-default`,
  `happy-dom-default`). `seconds` is the wall clock of the runner process,
  summed over the project's packages (as dom-api-tracer's harness measured;
  `--time runner` uses the runner's own duration instead); `NA` when a
  package has no valid run for that round (timeout, no results). `differs`
  is the number of tests whose status differs from the project's first
  jsdom run (the warm-up one when there is one): on warpdom and happy-dom
  it is the correctness column; on jsdom it should be 0 or a few flaky
  tests, and the report marks a suite "(check)" and leaves it out of the
  medians when a jsdom round differs in more than 5.
- **`<name>.env-<time>.json`**: the environment: Node, OS, CPU, memory,
  load, warpdom's commit, and each project checkout's commit with whether it
  matches its pin.
- **`<name>.compare-<project>.json`**: the rows and, per package, the full
  `compare()` result: test counts, every test whose status differs from the
  baseline on warpdom (`correctness`) and on the other DOMs
  (`also.<name>.correctness`), flaky tests, per-file environment comments,
  times per run.
- **`<out>/<project>/<package>/`** (default out `.corpus-timing`):
  compare's own output: `report.md`, `results.json`, `runs/` (the runner's
  JSON report of every run: per-test results) and `logs/`.

`report.mjs` prints, from the CSV:

1. Per suite: rounds, median seconds per configuration, the median of the
   per-round jsdom/warpdom ratios, and the differences.
2. With happy-dom rows, the three-way table: each DOM's time, the three
   speedups, the tests differing from jsdom on warpdom and on happy-dom, and
   the medians over the suites with valid jsdom rounds.
3. Uncertainty: per suite, the range of the per-round ratios (fewer than 5
   rounds) or a 95% bootstrap interval of their median; across suites, a
   95% bootstrap interval of the median speedup, resampling suites and their
   rounds (two levels), with a fixed seed, so the same CSV always gives the
   same intervals.

It also renders the fast-mode and experiment tables of dom-api-tracer's
CSVs (`warpdom-learned-*`, `warpdomframes-*` rows); `report.mjs` gives the
same output as dom-api-tracer's `timing-report.cjs` on every CSV in
`docs/research/data/timing/`.

## How a package is run

For each package of a project (`packages` in the corpus file),
`compare()` runs in the package directory with:

- the runner (`runner`), the config (`config`, else the runner's own
  lookup), the extra arguments (`args`) and environment variables (`env`);
- 2 workers, a 45-minute limit per run;
- rounds rotating the configurations (jsdom, warpdom, happy-dom; then
  warpdom, happy-dom, jsdom; ...), after an untimed warm-up group when there
  are 2 or more rounds (`--no-warmup` to leave it out, as dom-api-tracer's
  harness did);
- the project's own DOM environment as the baseline (e.g. Jest's
  `jest-fixed-jsdom`), the others switched by temporary wrapper configs;
  test files that pin jsdom or happy-dom with a comment are switched too;
- packages whose projects all run in Vitest browser mode are skipped;
  packages without a DOM project still run (their time counts on every
  side, their tests are not compared).

Nothing in the checkouts is edited; temporary files are removed afterwards.

## Differences from dom-api-tracer's harness

Checked on react-hook-form and floating-ui (2026-10-12, 1 round, three
DOMs): the same packages and the same test counts (1,515; 292 + 15 + 1 +
32), the same differences (warpdom 0 and 0; happy-dom the same tests, 7 or 8
in react-hook-form from a flaky happy-dom test, 14 in floating-ui), times
within 0.4 s. By design:

- The jsdom side keeps the project's own environment (react-hook-form's
  `jest-fixed-jsdom`); the old harness replaced it with plain `jsdom`.
- Configurations rotate within a round instead of running in the same order
  every round, and an untimed warm-up group runs first with 2 or more
  rounds.
- compare adds `--coverage.enabled=false` (Vitest) or `--coverage=false`
  (Jest), the default reporter next to the JSON one, and node flags from the
  package's `test` script.
- A run that fails (timeout, no results) ends that package's comparison;
  the old harness went on with the next rounds.
- `differs` counts duplicate test names separately (the old count merged
  them).
- A project's `path` is used when it exists, else `<repos-dir>/<name>`.

Not ported yet: the vm-pool configurations (`*-vm`), fast mode
(`learned.sh`), per-file phase timings and CPU profiles; those remain in
dom-api-tracer's `scripts/research/`.
