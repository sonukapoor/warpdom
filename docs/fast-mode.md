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
the isolated time, so it is not slower than isolated runs beyond noise.

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
warpdom vitest run [vitest arguments]
```

## What it does

- **First run (or `--learn`)**: a plain isolated run (its result is the
  run's result), then two quiet runs: one without isolation and the split.
  Files whose results without isolation differ from the isolated run's
  (any test's status, a missing test or file), that fail without
  isolation, or that have an unhandled error there are the files to
  isolate. The split must reproduce the isolated results and beat the
  isolated time by more than the noise margin, else the mode is isolated.
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
  rerun). A split run that is no faster than the learned isolated time
  switches the mode to isolated.
- **Hangs and timeouts**: a run without isolation that takes much longer
  than the isolated one is stopped. When learning, that means isolated
  mode; in a split run, the run falls back to an isolated run (its result
  counts) and the mode becomes isolated. A run that writes no report, or
  has an unhandled error outside any test file, is treated the same way.
- Plain `vitest run` with the helper uses what the file says, without the
  rerun.

## Design decisions

The rules, and why (CI evaluation of 2026-10-12, warpdom 77bec904: learned
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
- **Margin.** Split is chosen only if t_split < t_iso - max(5% of t_iso,
  0.5 s). Paired A/A runs on CI vary by 0.8% (median) and 3.1% (95th
  percentile); the learning measures each mode once, and its isolated run
  is the first and coldest. Learnings within a few percent flipped between
  modes (emoji-picker-element, svelte, solid), and a suite gaining under
  5% from the split gains little anyway.
- **Feedback (P3 after learning).** Each split run compares its own time
  (without the reruns, which a file needs once) with the learned isolated
  time; a split no faster than that switches to isolated for good (until
  `--learn`). So a split that stops paying (more files isolated, a slower
  machine) costs at most one run.
- **Isolated mode costs exactly a plain run.** Vitest runs in the CLI's
  process with the arguments as given: no second Node process, no added
  reporters (the CLI used to replace the project's reporters with
  `default` and `json`, and wrote the JSON report every run). On CI the
  isolated mode cost 4-8% over the drop-in on analog (eight packages, all
  isolated) and svelte.
- **Deadlines.** A learning run without isolation is stopped at 1.25 x
  t_iso + 10 s, a split run at 1.5 x t_iso + 30 s (its state may come from
  another machine). The process group is killed, workers included.
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
  `learned` (isolated, fast and split times), `reason`, `runs`. A
  version 1 file may have been learned with the defects above, so it
  counts as nothing learned and the next run learns again.

## Measured (docs/head-to-head.md)

Ten open-source suites against jsdom's default run, median of 3 rounds: never
slower (lowest 1.03x), MUI 6.1x, Vuetify 4.1x, Radix 3.3x; suites whose
files leak module state, or that spend little time in the DOM, stay at
1.0-1.6x.
