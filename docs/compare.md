# `warpdom compare` (design draft)

Status: design, 2026-10-12 (open questions decided the same day).
Milestones 1-4 implemented in `src/compare/` (milestone 4, monorepos, on
branch feat/compare-monorepo). See PLAN.md, "Reproducibility and a compare
command before going public".

## Why

A developer deciding whether to switch a test suite to warpdom has three
questions, and the command answers exactly these, on their own suite:

1. **Do my tests still give the same results?** Every test whose status
   changes, and why.
2. **How much faster is my suite?** Measured, alternating, with the spread.
3. **Could it be faster still?** Which runner settings keep the results
   and cut the time further (e.g. the vm pool on MUI: 4.08x faster than
   jsdom's default pool, against 1.88x for warpdom in the default pool;
   laptop, 2026-10-11).
   <!-- source: docs/research/README.md 3.2 (material-ui, timing-2026-10-11-after.csv: jsdom 87.0 s, warpdom 46.2 s, 1.88x; warpdom vmThreads 21.3 s, 4.08x) -->

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
or a monorepo root with Vitest projects, a Vitest workspace or Jest
projects).

| Option | Default | Meaning |
|---|---|---|
| `--rounds <n>` | 1 | Timed rounds; each runs the baseline and warpdom, alternating. 1 round is labeled indicative; use 3 or more for numbers worth quoting |
| `--correctness` | off | One round, results only, no speed claims (fast; for CI) |
| `--fast-frames` | off | Run warpdom with its `fastFrames` option ([fast-frames.md](fast-frames.md)) to see its speedup and which tests change |
| `--explore` | off | Also try runner settings (pool, isolation) on warpdom; see below |
| `--workers <n>` | runner default | Passed as the runner's worker limit to every run |
| `--baseline <env>` | detected | `jsdom` or `happy-dom`; what warpdom is compared with |
| `--out <dir>` | `.warpdom-compare/` | Report, JSON results, logs |
| `--timeout <min>` | 30 | Per run |
| `-- <args>` | | Passed to every run (a file filter, `--project x`, `--config <file>`; these two replace the test script's) |

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
  `vite.config.*`, and with Vitest 2 and 3 `vitest.workspace.*`, also
  without a config; `jest.config.*`, `package.json` "jest"). A config the
  package.json `test` script passes its runner (`jest --config
  projects/hot-table/jest.config.js`, `vitest run -c vitest.unit.ts`; `-c`
  too) is used instead, unless `-- --config <file>` is given; the runner
  then comes from the script, so the file can have any name. Vitest
  `--project` filters in the script are passed on unless `--` gives one.
- **Environment per project:** only projects on jsdom or happy-dom switch.
  Node projects run unchanged in both runs; their tests are not compared,
  and the report says so per project (see "Monorepos"). Vitest
  browser-mode projects are left out of both runs (no browser starts) and
  reported as not run.
- **Node flags:** flags the package.json `test` script gives the runner
  (`node --experimental-vm-modules .../jest.js`, `NODE_OPTIONS=... jest`)
  are passed on in `NODE_OPTIONS`, without debugger flags. When a run does
  not start and none were found, the error says the project may need them.
- **Paths in messages:** relative to the current directory when inside it,
  else absolute (an `--out` elsewhere).
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
override the config, so the wrapper alone would leave those files on
jsdom. They are common: 56% of solid's tests and 84.5% of svelte's are in
files pinned to jsdom, so leaving them out makes both the results and the
speed misleading (solid came out 1.21x slower while the warpdom run loaded
both DOMs).
<!-- source: docs/research/README.md section 3 "Correction, 2026-10-12" (svelte 84.5%, solid 55.6% of tests); PLAN.md compare smoke tests (solid 1.21x slower with both DOMs loaded; 1.03x faster once switched) -->

**Vitest: switched, without editing the files.** Vitest 2, 4 and 5 read a
test file's `@vitest-environment <name>` / `@jest-environment <name>`
comment in the main process with `fs.promises.readFile(file, 'utf-8')` and
match `/@(?:vitest|jest)-environment\s+([\w-]+)\b/` (names only, no paths).
The wrapper config runs in that same process and patches
`fs.promises.readFile` once (marked, so loading the config again does not
patch twice): in what Vitest reads, a jsdom or happy-dom name in that
comment becomes the run's target. It is only a comment, so the transform
is unaffected.

- warpdom run: the target is `warpdom-compare`, a name Vitest does not
  know, which it resolves as the package `vitest-environment-warpdom-compare`
  from the project root. Compare creates that package for the run in
  `node_modules` (package.json with `type: module` and `exports`, an
  index.js re-exporting warpdom's environment), recorded in `pending.json`
  and removed like the other temporary files.
- The projects compare switches get the same name, not warpdom's path
  (2026-10-14). When test files share workers (`isolate: false`), Vitest
  (1.2 to 5) groups them by environment name and gives each group its own
  workers. On jsdom the config and its pinned files say `jsdom`: one group.
  A path for the config and `warpdom-compare` for the pinned files made two
  groups on warpdom, so files shared workers with other files than on
  jsdom (solid's suite depends on that order). A Vite plugin in the wrapper
  (root config and inline projects) resolves
  `vitest-environment-warpdom-compare` in the test workers to warpdom's
  path as a `/@fs/` id, so the Vitest 2/3 environment-loader hang for
  modules outside the Vite root ([fast-mode.md](fast-mode.md)) cannot
  occur; the package is still needed, since Vitest checks in its main
  process that it exists. Jest does not group test files by environment.
- Baseline run: on a jsdom baseline, happy-dom pins become jsdom; on a
  happy-dom baseline, jsdom pins become happy-dom. Pins already on the
  baseline stay.
- Each switched file is logged (`WARPDOM_COMPARE_PINNED_LOG`), and the
  report says "N files pin jsdom with a comment; switched". Their tests are
  compared like all others.
- Node and other pins stay untouched and are reported as not compared.
- Known limitation: `@vitest-environment-options` stays keyed by the
  original name, so those options do not reach warpdom; the report counts
  switched files that have them.

**Jest: files pinned to jsdom are switched (2026-10-12).** Jest reads the
docblock in its workers, where the wrapper config does not run, and
resolves `@jest-environment jsdom` by first looking for a package named
`jest-environment-jest-environment-jsdom` (it prefixes the name it already
expanded to `jest-environment-jsdom`). No real package has that name, so
compare creates it in node_modules for each warpdom run only, re-exporting
warpdom's Jest environment, and removes it afterwards: files pinned to
jsdom (also as `jest-environment-jsdom`) run on jsdom in baseline runs and
on warpdom in warpdom runs, nothing is edited and the project's
jest-environment-jsdom is not shadowed. Only on a jsdom baseline; other
Jest pins (node, happy-dom, paths) are reported and not compared.

### Monorepos (projects, workspaces)

Compare runs where the runner is configured: a monorepo root with Vitest
projects or Jest projects, or one package inside a monorepo (pnpm, yarn or
npm workspaces). The runner binary is found walking up from there, so a
binary hoisted to the root is used; warpdom is copied into the package's
own `node_modules` when it has one, else next to the runner's.

**Vitest.** Supported from Vitest 2 to 5:

- `test.projects` (Vitest 3.2 and later) and `test.workspace` (3.x),
  inline: objects, functions and promises are switched like the root
  config (functions and promises when Vitest calls them).
- Workspace files (`vitest.workspace.*` / `vitest.projects.*`, read by
  Vitest 2 and 3 only, also without a root config, and a `test.workspace`
  path): compare writes a wrapper next to the file and points
  `test.workspace` at it.
- Strings (config files, directories, globs, `<rootDir>`, `!` negations)
  are resolved the way Vitest does it: a directory's `vitest.config.*` or
  `vite.config.*`, else a project with Vitest's defaults; `node_modules`
  skipped. Each config found gets its own wrapper next to it
  (`<name>.warpdom-compare.<role>.*`, which still matches Vitest's
  project file name rule), and the root wrapper replaces the string with
  the list. The root config listed as a project becomes the root wrapper.
- Inheritance: `extends: true` (and, from Vitest 5, no `extends`) inherits
  the switched root environment; `extends: '<file>'` is pointed at that
  file's wrapper.

**Jest.** `projects` with inline objects (switched, they do not inherit
the root `testEnvironment`), and strings: `<rootDir>` replaced, globs
expanded from the working directory, a directory read through its
`jest.config.*` or `package.json` "jest". Each config found gets a wrapper;
a directory without a config stays as it is. A project pointing back at
the root (`<rootDir>`, `.`) runs through the root wrapper; as the only
project it is dropped and the root config runs itself, as before.

**Which project ran each test.** Neither runner's JSON report says (Vitest
2 to 5 and Jest's `--json` list files only). Compare adds a small reporter
(`*.warpdom-compare.reporter.*`, a temporary file like the wrappers; Vitest
gets it with `--reporter`, Jest through the wrapper's `reporters`, after the
project's own) that records the project of each file result and each
project's environment, in the JSON report's order (a file in two projects
is matched by occurrence). With it:

- test keys carry the project name, so the same file in two projects is
  two sets of tests;
- the projects come from the first baseline run, including those in other
  files, with their environments; projects on node are not compared,
  browser-mode projects are not run (except Vitest files whose comment switched them to a DOM),
  and status changes there are listed in the details;
- a DOM project still on jsdom or happy-dom in the warpdom run (one
  compare could not reach) is reported as not switched and not compared;
- `report.md` details have a table per project (compared, same, each
  difference class, flaky, not compared). The summary gives counts only:
  project names may be private, so they appear in the details only.

**Limitations.**

- Projects in other files are only known once they run: the "nothing to
  compare" check for them happens after the first baseline run, and when
  the root config defines no DOM project itself, the baseline name (jsdom
  or happy-dom, which also decides how pinned comments switch on the
  baseline) is taken from the installed packages, jsdom first.
  `--baseline` overrides it.
- Strings inside project config files (Vitest 5 nested projects) are not
  resolved; such projects run unswitched and are reported as such.
- Globs: `*`, `**`, `?`, `[...]`, `{a,b}` and `!` negations; no extglobs.
- Jest projects without `displayName` are named by their `rootDir`; two
  of them with the same `rootDir` cannot be told apart (their tests share
  keys, numbered).
- A `--reporters` runner argument replaces Jest's configured reporters,
  including compare's: then every project's tests are compared, with a
  warning.

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

## GitHub Action

`compare-action/` in this repository is a composite action around the same
CLI, for a CI job that compares on every pull request without switching
anything: the project keeps running its tests on jsdom (or happy-dom); the
action reports what would change on warpdom and how much time it would
save.

```yaml
# .github/workflows/warpdom-compare.yml
name: warpdom compare
on: pull_request

permissions:
  contents: read
  pull-requests: write # only for pr-comment; leave out otherwise

# One comparison per pull request at a time: a new push cancels the
# running one.
concurrency:
  group: warpdom-compare-${{ github.event.pull_request.number }}
  cancel-in-progress: true

jobs:
  compare:
    runs-on: ubuntu-latest
    timeout-minutes: 30
    steps:
      - uses: actions/checkout@v7
        with:
          persist-credentials: false
      - uses: actions/setup-node@v7
        with:
          node-version: 24 # warpdom needs Node 22.12 or newer
          cache: npm
      - run: npm ci # however the project installs; build steps its tests need go here too
      - uses: sonukapoor/warpdom/compare-action@main # better: a release tag or commit SHA
        with:
          pr-comment: true
```

What it does:

1. Runs `npx --yes --package warpdom@<warpdom-version> -- warpdom compare`
   in `working-directory`, with the job's Node (from the caller's
   `actions/setup-node`; the action does not install Node). warpdom comes
   from npm into npm's cache for this job only; compare copies it into
   `node_modules/.warpdom-compare/` for the runs and removes it afterwards,
   as under plain `npx`. The project's `package.json`, lockfile and config
   are not touched, and compare checks that `git status` is unchanged. The
   project's own jsdom (or happy-dom) and runner are used: no other package
   is installed. When the project already has warpdom installed, compare
   runs that copy (as the CLI always does), so `warpdom-version` then only
   chooses the CLI; the summary says so.
2. Writes the job summary: runner and versions, how many tests have the
   same status, the baseline and warpdom test times, the speedup and the
   time saved per run, and a table of the tests whose status differs
   (regressions first, up to `max-tests`), with the first error line.
   Test files that fail to load on one side are listed and counted apart
   from the tests.
3. With `pr-comment: true`, creates one comment on the pull request, and
   updates that same comment on later pushes (found by a hidden marker per
   working directory, in a comment by the token's author: the token's
   user for a personal token, `github-actions[bot]` for the Actions token,
   or `comment-author` for an app token). Past 1,000 comments without
   finding it, it skips with a warning rather than post a second report.
   If two runs overlap and both post, the older report is kept and the
   newer one deleted; the `concurrency` group in the example avoids the
   overlap in the first place.
4. Uploads `report.md`, `results.json` and the runner logs as an artifact
   (from a new directory under `RUNNER_TEMP` per invocation).
5. Sets outputs (`exit-code`, `compared`, `regressions`, `fixed`,
   `differences`, `baseline-ms`, `warpdom-ms`, `speedup`, `report-dir`) for
   later steps.

| Input | Default | Meaning |
|---|---|---|
| `working-directory` | `.` | Where `vitest` or `jest` is normally run (a package or a monorepo root) |
| `warpdom-version` | `latest` | The warpdom version or dist-tag from npm, or a path to a packed `.tgz` (an installed warpdom takes precedence) |
| `rounds` | `1` | Timed rounds (`--rounds`); 1 is labeled indicative |
| `correctness` | `false` | Results only, no timing (`--correctness`) |
| `baseline` | detected | `jsdom` or `happy-dom` |
| `runner` | detected | `vitest` or `jest`, when both are configured |
| `workers` | runner's | The runner's worker limit |
| `timeout` | `30` | Minutes per run |
| `runner-args` | | Arguments for every run, one per line (after `--`) |
| `fail-on` | `nothing` | `nothing`, `regressions` or `differences` |
| `job-summary` | `true` | Write the job summary |
| `pr-comment` | `false` | Create or update one pull request comment |
| `github-token` | `github.token` | Token for the comment |
| `comment-author` | | The login an app token comments as (`my-app[bot]`) |
| `max-tests` | `50` | Differing tests listed in the summary and comment |
| `artifact-name` | `warpdom-compare` | The report artifact; empty to skip the upload |

**Non-blocking.** By default the action never fails the job: not for
differences, not when the comparison cannot run (no runner found, Node too
old, npx could not install warpdom), and not for a failed comment or
upload. It warns instead and says why in the summary. `fail-on:
regressions` fails the step when a test passes on the baseline and fails on
warpdom, `fail-on: differences` on any status change; with either, a
comparison that cannot run fails too, so a gate never passes silently. The
step fails only after the summary, comment and artifact are written.

**Pull request comments and forks.** The comment needs `pull-requests:
write` on the job. Pull requests from forks get a read-only token on the
`pull_request` event: the action then skips the comment with a warning,
and the job summary has the same content. Do not switch to
`pull_request_target` for the comment: it would run the fork's test code
with a write token. On `push` and other events there is no pull request and
no comment.

**Timing in CI.** Hosted runners are shared and noisy, and one round is
labeled indicative. The times are the runner's own test durations (the npx
install is not counted). For numbers to quote, use `rounds: 3` (eight runs
instead of two: a warm-up pair and three timed pairs), or run `npx warpdom compare --rounds 3` locally.

**Monorepos and matrices.** One step per package with its own
`working-directory`; give each its own `artifact-name` (two uploads with
one name in a job or matrix fail, and the action ignores that failure, so
the second report would be missing). Each working directory gets its own
pull request comment.

**Security.** No secrets are needed: the token is GitHub's own
`github.token` and is only used, when `pr-comment` is true, for GitHub's
issue comments API. The action passes the token to its script only when
`pr-comment` is true, and npx and the project's tests never see it (the
script leaves its inputs out of their environment). Inputs reach the action's script only through
environment variables, never through `${{ }}` in its shell text, and
`warpdom compare` is started without a shell; numbers, choices and the
package spec are validated (`warpdom-version` must be a version, dist-tag
or `.tgz` path, so it cannot name another package). The only other network
access is npm installing warpdom. Pin the action to a commit SHA, as for
any third-party action, or to a release tag that contains it (releases after
0.1.7); `@main` follows this repository's default branch.

**Runners.** Tested on `ubuntu-latest` (`.github/workflows/compare-action.yml`
runs it on `fixtures/compare-vitest` for this repository's pull requests).
macOS runners work the same way; Windows is not tested.

## Out of scope for v1

- Vitest browser mode (nothing to switch), Bun test, Mocha/Karma, `node:test`.
- Watch mode.
- Editing the project's config to adopt warpdom. Compare only prints the
  lines to change.
- Uploading anything.

## Decisions (2026-10-12)

1. **Per-file environment comments:** Vitest files that pin jsdom or
   happy-dom with a comment are switched (2026-10-12, replacing "report
   only": pinned files held 84.5% of svelte's tests). Jest files pinned
   to jsdom are switched too, through a temporary package (above).
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
4. Monorepos (Vitest workspace/projects, Jest projects). Done
   2026-10-12 (see "Monorepos").
5. `--explore`.
6. The corpus timing on top of `compare()`; the GitHub workflow moves here.
   Done 2026-10-12 on branch feat/corpus-timing: `bench/corpus/`
   ([README](../bench/corpus/README.md)) and `.github/workflows/corpus-timing.yml`.
   For it, `compare()` gained API-only options (not in the CLI): `env`,
   `alsoEnvironments` (e.g. `['happy-dom']`: a third DOM in every round,
   with its comparison and times in `result.also`), `domPackages` (DOM
   packages a project lacks, linked for the run), `warmup` and
   `requireDom: false` (node-only packages still run).
7. README section and CI example; then the public release.
