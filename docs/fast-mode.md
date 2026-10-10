# Fast mode for Vitest

Vitest isolates every test file by default: each file gets fresh modules
and a fresh environment, and reloading modules per file is most of a
component suite's run time. Without isolation (`isolate: false`) files share
modules and are much faster, but state leaks between them; with jsdom the
DOM itself leaks (listeners, attributes, focus), so suites break.

warpdom's fast mode runs files without isolation and resets the window
between files (same objects, fresh state), and runs the files that still
leak (module state the reset cannot reach) isolated. It decides by
measuring, so it is never slower than isolated runs.

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

- **First run (or `--learn`)**: times the suite isolated, runs it without
  isolation to find leaky files (fail without isolation, pass isolated),
  times the split, and keeps the faster mode in `.warpdom/fast-mode.json`
  (commit it). The result shown is the isolated run's.
- **Later runs**: in split mode, the project becomes `<name>` (no isolation,
  warpdom's reset) and `<name> (isolated)` (the leaky files), in one Vitest
  run. A file that fails without isolation is run again isolated and its
  isolated result counts; if it passes there it leaks, and it runs isolated
  from then on. So a newly leaking file never shows a false failure.
- Plain `vitest run` with the helper uses what the file says, without the
  rerun.

## Measured (docs/head-to-head.md)

Ten open-source suites against jsdom's default run, median of 3 rounds: never
slower (lowest 1.03x), MUI 6.1x, Vuetify 4.1x, Radix 3.3x; suites whose
files leak module state, or that spend little time in the DOM, stay at
1.0-1.6x.
