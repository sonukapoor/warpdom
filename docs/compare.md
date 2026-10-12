# `warpdom compare` (design draft)

Status: design, 2026-10-12 (open questions decided the same day). Not
implemented. See PLAN.md, "Reproducibility
and a compare command before going public".

## Why

A developer deciding whether to switch a test suite to warpdom has three
questions, and the command answers exactly these, on their own suite:

1. **Do my tests still give the same results?** Every test whose status
   changes, and why.
2. **How much faster is my suite?** Measured, alternating, with the spread.
3. **Could it be faster still?** Which runner settings keep the results
   and cut the time further (e.g. the vm pool: MUI 3.97x vs 1.82x by
   default).

Published benchmarks persuade nobody who can't reproduce them. One command
that a skeptic runs in a few minutes turns "trust us" into "see for
yourself". The corpus timing becomes a loop over this command (see
"One implementation" below), so published numbers and user numbers come
from the same code.

## Usage

```
npx warpdom compare [options] [-- runner arguments]
```

Run in the directory where `vitest` or `jest` is normally run (a package,
or a monorepo root with a Vitest workspace or Jest projects).

| Option | Default | Meaning |
|---|---|---|
| `--rounds <n>` | 1 | Timed rounds; each runs the baseline and warpdom, alternating. 1 round is labeled indicative; use 3 or more for numbers worth quoting |
| `--correctness` | off | One round, results only, no speed claims (fast; for CI) |
| `--explore` | off | Also try runner settings (pool, isolation) on warpdom; see below |
| `--workers <n>` | runner default | Passed as the runner's worker limit to every run |
| `--baseline <env>` | detected | `jsdom` or `happy-dom`; what warpdom is compared with |
| `--out <dir>` | `.warpdom-compare/` | Report, JSON results, logs |
| `--timeout <min>` | 30 | Per run |
| `-- <args>` | | Passed to every run (a file filter, `--project x`) |

Exit code: 0 when no test changes from pass to fail; 1 when some do; 2 when
the comparison could not run. That makes `--correctness` usable as a CI
check while trying warpdom.

## What it prints

Illustrative output of `--rounds 3 --explore` (the numbers are made up
for the layout):

```
warpdom compare: vitest 5.0.3, 3 packages, baseline jsdom 26.1.0 (warpdom's jsdom-26 profile)

Results   8,317 tests, all with the same status on jsdom and warpdom
          (2 flaky on jsdom itself: listed in the report, not counted)

Speed     round   jsdom    warpdom
          1       128.2 s  105.9 s
          2       126.9 s  104.8 s
          3       129.4 s  106.3 s
          median  128.2 s  105.9 s   1.21x faster (spread 1.19x-1.23x)

Explore   vm pool (vmThreads)         61.0 s   2.10x  same results
          isolate: false              48.3 s   2.65x  4 tests differ (order-dependent)

Report    .warpdom-compare/report.md (shareable: no test names in the summary)
```

When tests differ, the "Results" section lists them grouped by status
change and first error line (as `diffgroups.cjs` does), largest group
first, with warpdom's error message for each group.

## How it works

### Detection

- **Runner:** `vitest` or `jest` from the nearest config file and the
  binary in `node_modules/.bin`. Both present: ask for `--runner`.
- **Config:** the runner's own lookup order (`vitest.config.*`,
  `vite.config.*`, `vitest.workspace.*`; `jest.config.*`, `package.json`
  "jest").
- **Environment per project:** only projects on jsdom or happy-dom switch.
  Node projects and Vitest browser-mode projects run unchanged in both
  runs, and the report says they were not compared.
- **jsdom version:** the installed jsdom (the same detection as the Vitest
  adapter's `jsdomVersion`), so warpdom runs with the matching profile.
  The report names it.

### Switching the environment without touching the project

The harness in dom-api-tracer already does this. Compare moves that code
here (`vitestWrapper`, `jestWrapper`, `findConfig`, `findBin`,
`runnerArgs`, `readResults`):

- A temporary wrapper config next to the project's own (relative imports
  keep working) imports the original and changes only `environment` /
  `testEnvironment` on jsdom and happy-dom projects. The runner gets it with
  `--config`.
- Nothing else is edited: not `package.json`, not the lockfile, not the
  config.
- Every temporary file is recorded in `.warpdom-compare/pending.json` before
  it is written and removed in `finally` and on SIGINT/SIGTERM. A killed
  run is cleaned up by the next one.
- Before and after, `git status --porcelain` (when it's a git repository)
  must match. If it doesn't, compare says which files changed.

**Why not the runner's `--environment` / `--env` flag:** it switches every
project, including Node and browser ones, which breaks mixed workspaces.

**Where warpdom must live:** the environment must be inside the project's
`node_modules`. The harness found that Vitest hangs loading an environment
from outside the project root when files share workers (`isolate: false`),
and Jest runs files outside `node_modules` through the project's
transformer. When warpdom is installed (devDependency), that copy is used.
Under plain `npx` (npm cache), compare copies itself into
`node_modules/.warpdom-compare/` for the run and removes it afterwards, as
`copyWarpdom` does today.

### Per-file environment comments

`// @vitest-environment jsdom` and `@jest-environment jsdom` docblocks
override the config, so the wrapper alone leaves those files on jsdom.
v1 counts them and reports "N files pin jsdom with a comment and were not
switched". Whether to switch them later depends on how common they are; the
tracer corpus can count them. Options:

- a Vitest plugin in the wrapper that rewrites the docblock during transform;
- a resolve alias for the environment name.

### Timing

- Rounds alternate baseline and warpdom (B W, W B, B W...), so drift
  (thermal throttling, background load) hits both.
- The time is the runner's own reported duration when it has one (Vitest's
  "Duration", Jest's from the JSON results), else the wall clock of the
  process. Both are kept in the JSON.
- Warm-up: with the default single round there is none. The numbers are
  cold, as in CI, and labeled "indicative, single round". With
  `--rounds` ≥ 2, an untimed warm-up pair runs first (it builds Vite's and
  Jest's caches for both), then the timed rounds. Its results still count
  for correctness.
- The report gives the median, the per-round ratios and the spread. If the
  spread is more than 10%, it says the machine was noisy and suggests more
  rounds or closing other programs.
- An environment record: OS, CPU, cores, memory, Node, runner, jsdom and
  warpdom versions (`record-env.mjs`).

### Correctness

- Each run uses the runner's JSON reporter (`--reporter=json` /
  `--json --outputFile`), next to the project's own reporters.
- The test key is package, file, the full name (describe path + title) and
  an index for duplicate names.
- Statuses: passed, failed, skipped, todo, missing (not in that run).
- **Flaky detection:** with two or more runs per environment (warm-up
  included), a test whose baseline status
  differs between rounds is flaky. It is listed separately and not counted
  as a warpdom difference. The same holds for warpdom-only flakiness, but
  that is reported, because it may be ours.
- **Classes:**
  - **regression** (baseline passes, warpdom fails) sets exit code 1;
  - **fixed** (baseline fails, warpdom passes), often a test written against
    a jsdom bug;
  - **other** (skipped or missing in one run).
- Baseline `happy-dom`: warpdom follows jsdom. When a test relies on a
  happy-dom-only behavior, the report says so instead of calling it a
  warpdom bug.

### Explore (`--explore`)

These are opt-in, because they change how tests run and take longer. Each
runs once on warpdom and is reported with its time and its result
differences against the baseline:

- **Vitest:** `pool: 'vmThreads'`, `isolate: false` (each only if the
  project isn't already using it).
- **Jest:** the default; later the fast-mode equivalents.
- **warpdom fast mode** (`warpdom vitest run`), with its own safety net.

A setting is recommended only when it has zero regressions. The
recommendation includes the exact config lines to add.

### Report

- `report.md` has two parts:
  - **Summary** (shareable): runner, versions, machine, test counts, speed
    table, explore table. No file or test names, so it can be pasted into a
    public issue without exposing private code.
  - **Details:** the difference groups with test names and errors.
- `results.json` holds everything, machine-readable (the corpus loop and
  CI read this).
- `logs/`: the runner output of every run.
- No network access, no telemetry. Sharing is copying the summary.

## One implementation for users and for our corpus

The code lives in `src/compare/` (Node-only; the DOM core stays free of
Node built-ins) with a small API:

```js
import { compare } from 'warpdom/compare';
const result = await compare({ cwd, rounds: 3, workers: 2, explore: false });
```

`bin/warpdom.js compare` is a thin CLI on top. The corpus timing (to move
from dom-api-tracer before going public, under `bench/corpus/`) becomes:

- the project list with pinned commits;
- clone and build;
- a loop calling `compare()`;
- the combined table (`timing-report.cjs`);
- the GitHub Actions workflow (one job per project).

Our published numbers and a user's numbers then come from the same code
path. dom-api-tracer goes back to tracing which DOM APIs suites use.

## CI example

```yaml
# Run once while trying warpdom; fails if any test changes from pass to fail.
- run: npx warpdom compare --correctness
- uses: actions/upload-artifact@v4
  if: always()
  with: { name: warpdom-compare, path: .warpdom-compare/, include-hidden-files: true }
```

Timing in CI is noisy (shared 2- or 4-core machines). The docs recommend
`--correctness` there, and timing locally or with several rounds.

## Out of scope for v1

- Vitest browser mode (nothing to switch), Bun test, Mocha/Karma, `node:test`.
- Watch mode.
- Editing the project's config to adopt warpdom. Compare only prints the
  lines to change.
- Uploading anything.

## Decisions (2026-10-12)

1. **Per-file environment comments:** report only in v1, and count them
   across the corpus before deciding on a transform plugin.
2. **Warm-up:** none for a single round (cold, like CI); an untimed warm-up
   pair before timed rounds when `--rounds` ≥ 2.
3. **Default rounds:** 1, labeled indicative, so a first try costs two
   runs of the suite. Use `--rounds 3` for numbers to quote.
4. **No happy-dom column.** The message stays "same results as jsdom,
   faster". A three-way benchmark belongs in our own published comparison.
   A user on happy-dom gets happy-dom as the baseline (`--baseline`).
5. **Name:** `compare`. It says what it does.

## Milestones

1. Move the harness pieces into `src/compare/` with unit tests (the wrapper
   generators already have fixtures in dom-api-tracer).
2. `--correctness` on one package (Vitest and Jest), report and exit code.
3. Timing rounds, flaky detection, environment record.
4. Monorepos (Vitest workspace/projects, Jest projects).
5. `--explore`.
6. The corpus timing on top of `compare()`; the GitHub workflow moves here.
7. README section and CI example; then the public release.
