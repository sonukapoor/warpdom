# Fast mode for Vitest

Vitest isolates every test file by default: each file gets fresh modules
and a fresh environment, and reloading modules per file is most of a
component suite's run time. Without isolation (`isolate: false`) files share
modules and are much faster, but state leaks between them; with jsdom the
DOM itself leaks (listeners, attributes, focus), so suites break.

warpdom's fast mode runs files without isolation and resets the window
between files (same objects, fresh state), and runs the files that still
leak (module state the reset cannot reach) isolated. It decides by
measuring, with a margin for noise, and checks every split run against
the isolated time, so it does not stay slower than isolated runs beyond
noise.

## Setup (Vitest 3.2 or later)

```ts
// vitest.config.ts
import { defineConfig } from 'vitest/config'
import { withFastMode } from 'warpdom/vitest/fast'

export default defineConfig(withFastMode({ test: { environment: 'warpdom' } }))
```

With `test.projects`, name the project to run fast:
`withFastMode(config, { project: 'unit' })`. Config functions and promises
work too.

Run tests with the warpdom CLI instead of `vitest run`:

```sh
warpdom vitest run [--learn] [--slow-runs=3] [--relearn-after=10] [vitest arguments]
```

`--learn` learns now; `--slow-runs` and `--relearn-after` set the
feedback rule below (defaults shown; `--relearn-after=0` keeps a switched
mode isolated until `--learn`).

## What it does

- **First run (or `--learn`)**: a plain isolated run (its result is the
  run's result), then two quiet runs: one without isolation and the split.
  Files whose results without isolation differ from the isolated run's
  (any test's status, a missing test or file), that fail without
  isolation, or that have an unhandled error there are the files to
  isolate. The split must reproduce the isolated results (files that
  still differ join the isolated ones, for up to 4 split runs) and beat
  the isolated time by more than the noise margin, else the mode is
  isolated.
  Kept in `.warpdom/fast-mode.json` (commit it, or learn on the machine
  that runs the suite: the times are that machine's).
- **Isolated mode** is a plain `vitest run` with your arguments, in the
  CLI's own process: nothing added, so it costs what `vitest run` costs.
- **Split mode**: the project becomes `<name>` (no isolation, warpdom's
  reset) and `<name> (isolated)` (the files to isolate), in one Vitest
  run. A file that fails without isolation is run again isolated and its
  isolated result counts, so a newly leaking file never shows a false
  failure; it runs isolated from then on (also when it fails isolated too:
  a real failure is then reported directly, not after a shared run and a
  rerun).
- **Feedback**: a split run (without its reruns) that takes longer than
  the learned isolated time plus the margin is *slow*. Three slow split
  runs in a row switch the mode to isolated; a faster run resets the
  count, so one slow runner or one noisy run never ends split mode. That
  isolated mode learns again after 10 plain runs (the slowness may have
  been the machine's). A split run whose suite has more than 10% more or
  fewer test files than the learned one learns again on the next run.
  Every mode decision is recorded in the state with its reason and times
  (`decisions`).
- **Hangs and timeouts**: a run without isolation that takes much longer
  than the isolated one is stopped. When learning, that means isolated
  mode; in a split run, the run falls back to an isolated run (its result
  counts) and the mode becomes isolated. A run that writes no report, or
  has an unhandled error outside any test file, is treated the same way.
- Plain `vitest run` with the helper uses what the file says, without the
  rerun.

## Design decisions

The rules, and why (CI evaluation of 2026-10-12, warpdom 1ccb7048: learned
was 3-8% slower than the drop-in on 5 of 11 tuning suites).

- **Quiet runs are not buffered.** The CLI ran its learning runs with
  `spawnSync` and piped output, whose 1 MB `maxBuffer` killed a run whose
  output (failing shared tests print a lot) passed it: no report, so no
  leaky files, and a split time measured on a killed run. On CI that made
  ark-ui's react, solid and vue packages and CopilotKit's vue package
  split with no leaky files, and every later run re-ran their failing
  files (ark-ui 173 reruns in five rounds); naive-ui's leaky set varied
  from 0 to 43 files between learnings for the same reason. Quiet runs
  now discard their output, and every run reports through warpdom's
  reporter (`vitest-fast-reporter.js`, added after the project's own
  reporters, which the CLI no longer replaces).
- **Results, not just failures.** A file is isolated when any test's
  status differs without isolation, when a test or the file has no result
  (a hang, a crash, a timeout), when it fails without isolation, or when
  an unhandled error comes from it. A file that fails both ways is
  isolated too: its shared result says nothing, and isolating it saves a
  rerun on every later failing build.
- **An unhandled error belongs to the file whose code threw it.** Vitest
  reports an unhandled error with the file that was running when it was
  thrown. Without isolation that is often another file: a timer or
  promise a test leaves behind (an un-awaited `vi.waitFor`, assertions in
  a callback that runs after the test ended) throws while a later file of
  the same worker runs; isolated, the worker ends with its file and the
  error never surfaces. Isolating the running file only moved the error
  to the next file, so the split never reproduced the isolated results.
  On CI (8630317, 4-core runners) that kept VueUse (an un-awaited
  `vi.waitFor` in `packages/shared/utils/index.test.ts`) and naive-ui
  (`forEach(async ...)` with `await vi.waitFor` in the AutoComplete and
  ColorPicker placement tests) isolated in all 6 learnings each ("the
  split's results differ ... in 1-3 more file(s)"), although on VueUse
  sharing with warpdom's reset kept every test's status; on a lightly
  loaded fast machine the errors could come after the worker's last file
  and not show, so learning there chose split. warpdom's
  reporter now also records the run's test files that the error's stack
  names (Vitest keeps the call site's stack for `vi.waitFor`; a callback's
  frames name the file that defined it), and those are the files the
  error counts against; only an error whose stack names no test file
  counts against the running file, as before. On CI at 2606b3d VueUse
  and naive-ui then split in all 6 learnings each (VueUse isolating
  `packages/shared/utils/index.test.ts`).
  Whether such an error shows at all depends on timing (naive-ui's two
  files showed one at a time), so a split that still differs adds the
  differing files and runs again up to 4 times (was 2); a learning that
  ends isolated this way names the files in `differing`.
- **Margin.** Split is chosen only if t_split < t_iso - max(5% of t_iso,
  0.5 s). Paired A/A runs on CI vary by 0.8% (median) and 3.1% (95th
  percentile); the learning measures each mode once, and its isolated run
  is the first and coldest. Learnings within a few percent flipped between
  modes (emoji-picker-element, svelte, solid), and a suite gaining under
  5% from the split gains little anyway.
- **The mode is decided on one machine; feedback needs persistent
  evidence.** The learning compares t_split with t_iso measured in the
  same learning, on the same machine, minutes apart, so its decision is
  relative. Later split runs can only be compared with the stored t_iso,
  an absolute time from the learning's machine, and absolute times of
  the same suite vary up to 1.6x between hosted CI runners of the same
  type. Until 2026-10-14 one split run not faster than t_iso switched to
  isolated for good: one slow runner or one noisy run disabled a split
  that pays. Now a split run is slow only beyond the margin
  (t > t_iso + max(5% of t_iso, 0.5 s), the learning's margin), the mode
  switches only after 3 slow split runs in a row (`--slow-runs`), and an
  isolated mode reached that way learns again after 10 plain runs
  (`--relearn-after`), on the machine that runs the suite then, which
  recovers from a learning made on a faster machine. A split that really
  stops paying (more files isolated, a grown suite) costs at most 3 runs
  slower than isolated by more than the margin, then a learning every 10
  runs while it does not pay. A suite that gained or lost more than 10% of
  its test files learns again (the stored t_iso no longer stands for it).
  Isolated mode chosen by a learning stays a plain run: no counter, no
  write, no re-learning (`--learn` after large changes).
  Not chosen: scaling t_iso by a calibration on the current machine (per
  file times of the isolated files, or a probe run). Per-file times in a
  run depend on what the other workers run, and a probe costs time on
  every run; persistence and re-learning need neither.
- **Isolated mode costs exactly a plain run.** Vitest runs in the CLI's
  process with the arguments as given: no second Node process, no added
  reporters (the CLI used to replace the project's reporters with
  `default` and `json`, and wrote the JSON report every run). On CI the
  isolated mode cost 4-8% over the drop-in on analog (eight packages, all
  isolated) and svelte.
- **Deadlines.** A learning run without isolation is stopped at 1.25 x
  t_iso + 10 s, a split run at 1.5 x t_iso + 30 s (its state may come from
  another machine). The process group is killed, workers included.
- **The global between files.** Outside Vitest's VM pools the window is
  the worker's global, so `window.x = 1` in a test stayed for the next
  file of the worker (#175: the CLI saw the next file fail, reran it
  isolated and isolated it from then on). The reset now deletes the
  global's properties added after the previous file's tests started (a
  `beforeAll` of `warpdom/vitest/reset`) and puts back the window members
  a test redefined or deleted (`Object.defineProperty(window,
  'innerWidth', ...)`). What the file's setup files and imports set stays:
  without isolation a module loads once per worker, so a global it sets
  (a polyfill, a test helper's `global.ResizeObserver = ...`) would be
  gone for every later file. A test file's top-level code runs in that
  phase too, so what it adds stays; a property made non-configurable
  stays, as in `resetWindow()`. Node's and Vitest's own globals that a
  test reassigns (`global.fetch = vi.fn()`) are not restored, nor is a
  global a module loaded once set (a polyfill's `IntersectionObserver`)
  when a test replaces it; use `vi.stubGlobal`. A file whose tests all
  skip runs no `beforeAll`, so the next reset deletes nothing. The fast
  project runs its setup files in order (`sequence.setupFiles: 'list'`,
  set on the root config too, where Vitest 2-4 read it; their default,
  `'parallel'`, could run the reset after a setup file and undo what it
  did). About 0.1 ms per file.
- **Same files and tests as the project's run.** Vitest passes only a few
  command-line options to the projects of `test.projects` (isolate, pool,
  retry, testTimeout, ...); the split's projects stood for the root
  project and lost the rest, so `--typecheck.enabled=false` left type
  tests on (tanstack-query: 493 `*.test-d.ts` tests the project's run does
  not have). A config hook in the generated projects applies the root's
  command-line options a project needs (typecheck, environment, dir,
  timeouts, mock options, ...) with Vitest's own parser. The root
  `include` moves into the projects (a project that extends the config
  file got it concatenated with its own, and the isolated project ran
  every file), and type tests run once, in the fast project.
- **The environment as a /@fs/ id in the fast project.** Vitest 3
  (3.0.9, 3.2.4) caches the environment's loader per root together with
  the first file's RPC channel; for an environment path outside the Vite
  root (floating-ui's packages/react: root `test/unit`, warpdom in
  `node_modules`) the next file in a shared worker asks that stale channel
  to resolve the path and waits forever (floating-ui: 165 tests without a
  result, 610 s instead of 16 s, also with `vmThreads`). A `/@fs/` id
  needs no resolving. Vitest 1.2 to 5.0 accept it, isolated or not;
  Vitest 4 and later do not hang either way.
- **State version 2** (`vitest-fast-state.js`): `isolate`, `leaky`,
  `learned` (isolated, fast and split times, every split time of the
  learning, the number of test files), `reason`, `runs`, `slowStreak`,
  `relearnIn`, `relearn`, `decisions` (the last 10 mode decisions with
  reason and times; the fields after `runs` are optional). A
  version 1 file may have been learned with the defects above, so it
  counts as nothing learned and the next run learns again.

## Learning cost and break-even

A learning runs the suite isolated (t_iso; its result is the run's
result, so it costs nothing extra), once without isolation (t_fast,
stopped at 1.25 t_iso + 10 s) and the split k times, 1 <= k <= 4 (a
split that still differs adds the differing files and runs again):

    learning time  = t_iso + t_fast + sum of the k split times
    cost           = t_fast + k * t_split          (beyond a plain run)

`learned.fast` and `learned.splits` record t_fast and every split time.
When the learning chooses split, each later run saves t_iso - t_split
(less the reruns of newly failing files, one each), so the learning has
paid for itself after

    N* = (t_fast + k * t_split) / (t_iso - t_split)

runs. With r = t_split / t_iso and t_fast close to t_split (true when few
files leak): N* = (k + 1) r / (1 - r). For r = 0.3: 0.86 runs with k = 1,
2.1 with k = 4; for r = 0.9 (a 10% gain): 18 and 45. When the learning
chooses isolated, its cost is not paid back (isolated mode then costs a
plain run). A switch to isolated by slow split runs adds a learning every
`--relearn-after` runs (default 10) while split does not pay, at most
(t_fast + k t_split) / 10 per run on average.

## Measured

GitHub Actions, warpdom 2606b3d (2026-10-14), 16 open-source Vitest suites
and Excalidraw, 4-core runners, up to 5 rounds (ariakit 1, CopilotKit 2,
Excalidraw 3), every configuration in each round. Speedup: median of
per-round ratios.

| Suite | mode | over jsdom default | over warpdom drop-in | over the fastest jsdom configuration that keeps every result |
| --- | --- | --- | --- | --- |
| VueUse | split | 9.62x | 5.17x | 9.62x (jsdom default) |
| MUI | split | 6.67x | 3.73x | 1.54x (`isolate: false`) |
| Vuetify | split | 5.61x | 3.80x | 1.11x (`isolate: false` + cleanup) |
| Radix | split | 4.73x | 2.59x | 1.47x (`isolate: false`) |
| naive-ui | split | 3.36x | 3.01x | **0.67x** (`isolate: false`) |
| tanstack-query | 7 of 19 projects split | 2.41x | 1.59x | 2.41x (jsdom default) |
| CopilotKit | vue project split | 1.52x | 1.22x | 1.52x (jsdom default) |
| the other 9 suites and Excalidraw | isolated, or split within noise | 1.05-1.59x | 0.98-1.03x | melt-ui **0.84x** (VM pool), others 1.01-1.59x |
| **median, 16 Vitest suites** | | **1.54x** | **1.01x** | **1.27x** |

Where sharing pays, fast mode is several times faster than both jsdom
and the drop-in; where it does not, it runs the suite isolated and costs
what the drop-in costs (no suite was slower than the drop-in beyond the
A/A noise). On naive-ui and melt-ui a jsdom configuration that keeps
every result is faster. Floating-ui, solid, melt-ui and solid-primitives
(Vitest < 3.2), ariakit (three `--project` arguments) and Excalidraw
were measured with the research harness's emulation of these rules,
because `warpdom vitest run` needs Vitest 3.2 or later; on older Vitest
it runs Vitest as configured, which is the drop-in. One test (ark-ui,
which fails on jsdom and passes intermittently on warpdom) passed once
in a shared file while failing in every isolated run of that job: most
likely a flaky pass, not demonstrably a leak.
<!-- source: docs/research/data/ci-2026-10-14-5942dc9-RESULTS.md sections 2-7 (runs 38567560217, 38567579662, 38567598200; per-suite ratios with ranges; medians with 95% two-level bootstrap intervals: 1.54x (1.27-3.56x), 1.01x (1.00-2.73x), 1.27x (1.06-1.52x); the other suites: analog, ariakit, ark-ui, emoji-picker-element, floating-ui, solid, svelte, melt-ui, solid-primitives, Excalidraw; ark-ui's best correct jsdom configuration is jsdom default by the job's flaky set, 0.56x of its VM pool if that counts) and data/ci-2026-10-14-5942dc9-computed.md. Earlier laptop measurement (docs/head-to-head.md, 2026-10-09, ten suites, 3 rounds: MUI 6.1x, Vuetify 4.1x, Radix 3.3x over jsdom default) is superseded. -->
