<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="docs/brand/warpdom-lockup-dark.svg">
    <img src="docs/brand/warpdom-lockup-light.svg" alt="warpdom" width="360">
  </picture>
</p>

# warpdom

[![DOI](https://zenodo.org/badge/DOI/10.5281/zenodo.23378613.svg)](https://doi.org/10.5281/zenodo.23378613)

A DOM for unit and component tests: **your tests get the same results as
on jsdom, faster.** A drop-in environment for Vitest and Jest, written
from the WHATWG specifications.

- **Same results.** On 23 open-source suites (14 we tuned on, such as MUI,
  React Spectrum, handsontable, Radix, Vuetify, ariakit and svelte, about
  43,600 tests; and 9 held out, about 13,500 tests), every test has the
  status it has on jsdom, apart from flaky tests and a short list of
  explained differences (below). In 12 CI jobs, 17 of the 25 suites (with
  two web applications) had no test that differed from jsdom in any round.
  <!-- source: docs/research/data/ci-2026-10-13-208ad49-computed.md "Versions" (own-b rows: tests per suite, 43,587 tuning, 13,526 held-out); ci-2026-10-13-208ad49-RESULTS.md section 7 (17 of 25 suites, 503 suite-rounds); ci-2026-10-13-208ad49-correctness-warpdom-default.tsv -->
- **Faster on every suite we tuned on.** Drop-in, warpdom was faster than
  jsdom on all 13 tuning suites in each of three independent runs: a
  median of about 1.27x, from 1.03x (solid) to 1.89x (MUI) per suite.
  handsontable, whose core runs jsdom 16.7, ran about 8–9x faster at the
  measured commit and about 3.2x on its current branch, which has since
  added its own jsdom speed-ups; it is reported separately.
  <!-- source: docs/research/data/ci-2026-10-13-208ad49-computed.md "Tuning: warpdom speedup per run and between runs" (per-run medians: solid 1.03x, material-ui 1.88-1.89x; handsontable 7.97-8.87x) and "Cross-suite medians of the drop-in speedup" (1.28x, 1.27x, 1.26x; 3 runs pooled 1.27x); "Version rule" (handsontable core 16.7.0); RESULTS.md 2.1 (faster on all 13 in every run), 2.4 (handsontable 9.07x and 9.27x in two more jobs); runs 38426985620, 38427009322, 38427031231 -->
- **Check it on your own suite in one command**: `npx warpdom compare`.

Status: pre-release. Numbers, method and raw data:
[docs/research/README.md](docs/research/README.md), measured with
[dom-api-tracer](https://github.com/sonukapoor/dom-api-tracer).

## Requirements

Node 22.12 or later. Vitest 2 or later (tested with 2, 3, 4 and 5) or Jest
27 or later (tested with 27 and 30). Fast mode needs Vitest 3.2 or later.

## Setup

```sh
npm install --save-dev warpdom
```

**Vitest.** Vitest takes a path (or a `vitest-environment-<name>` package)
as `test.environment`; warpdom exports the path:

```js
// vitest.config.js
import { defineConfig } from 'vitest/config';
import { environment } from 'warpdom/vitest/environment';

export default defineConfig({
  test: { environment },
});
```

Or install the small companion package `vitest-environment-warpdom` too,
and use the name: `test: { environment: 'warpdom' }`.

With `test.projects`, set it on the projects that use jsdom today.

**Jest.**

```js
// jest.config.js
module.exports = {
  testEnvironment: 'warpdom/jest',
};
```

Or install the small companion package `jest-environment-warpdom` too, and
use the name, as with jsdom: `testEnvironment: 'warpdom'`, and
`/** @jest-environment warpdom */` in test files (Jest 27 to 30).

Test files that choose jsdom with a comment (`/** @vitest-environment jsdom */`,
`@jest-environment jsdom`) keep using jsdom; change the comment to switch
them.

Switch those comments too, even if the files pass on jsdom. Vitest groups
test files by environment name and runs each group on its own workers, so
files whose comment names another environment than the config run apart
from the others. In a suite whose files share module state
(`isolate: false`), that changes which files run before which in a
worker, and with it the result of order-dependent tests: one of solid's
tests passes or fails by that order alone, on jsdom and on warpdom alike.
Use the same name in the config and in the comments (`environment:
'warpdom'` with `vitest-environment-warpdom`, and
`/** @vitest-environment warpdom */`), or remove the comments.
<!-- source: docs/research/data/investigations/solid-transition/README.md (Vitest 2's non-isolated forks pool groups files by environment name; one name for all files: 10/10 pass on both DOMs; two names: 7/10 jsdom, 6/10 warpdom). Grouping by name: vitest 2.1.9 dist/chunks/resolveConfig*.js, groupBy(filesWithEnv, ({ environment }) => environment.name) -->

### Which jsdom warpdom behaves like

Test suites encode the behavior of the jsdom version they were written
against (for example, `getComputedStyle` returned empty strings for most
properties before jsdom 29, and initial values since). warpdom detects the
jsdom your project installs (and, for jsdom 26 and earlier, the cssstyle
version it loads) and follows that version's observable behavior. With
jsdom alone, another jsdom version changed test results in 13 of 23
projects we measured ([Version dependence](#version-dependence)). To set
it yourself:
<!-- source: docs/research/data/ci-2026-10-13-208ad49-RESULTS.md 6 (13 of 23) -->

```js
// Vitest
test: { environment, environmentOptions: { warpdom: { jsdom: '26.1.0' } } }
// Jest
testEnvironmentOptions: { jsdom: '26.1.0' }
```

warpdom models jsdom 20.0.3 to 30.1.2. With a newer jsdom installed (a
later minor or major release), tests get jsdom 30.1.2's behavior and
warpdom prints a warning once; a weekly check
([upstream-watch](.github/workflows/upstream-watch.yml)) opens an issue
when such a release appears.

## Check your suite first: `warpdom compare`

```sh
npx warpdom compare                 # one round: results and an indicative speedup
npx warpdom compare --rounds 3      # numbers worth quoting
npx warpdom compare --correctness   # results only (for CI)
```

Run it where you run `vitest` or `jest`. It runs your suite on jsdom (or
happy-dom, whichever you use) and on warpdom, and reports every test whose
status changes, grouped by error, and the speedup. Nothing in your project
is edited. It exits 1 if any test that passes on jsdom fails on warpdom. The
report's summary contains no file or test names, so it can be shared.
Monorepos with Vitest projects or workspaces and Jest projects are
supported. Details: [docs/compare.md](docs/compare.md).

One caveat: on the warpdom side, compare switches Vitest test files that
pin jsdom with a comment to another environment name than the config's,
so they run in a separate group (see Setup). In a suite with
`isolate: false` and order-dependent tests, that alone can change a
result; check such a difference with the comments switched.
<!-- source: src/compare/index.js (warpdom role: environment = warpdom's path, pinned = 'warpdom-compare'); docs/research/data/investigations/solid-transition/README.md -->

## Switch: `warpdom migrate`

```sh
npx warpdom migrate            # dry run: the plan, nothing changed
npx warpdom migrate --apply    # make the changes, then install
```

Run it at the root of your project after `warpdom compare` (compare needs
jsdom still installed). It switches every place that picks jsdom or
happy-dom to `warpdom`: Vitest configs, projects and workspace files,
`environmentMatchGlobs`, Jest configs and package.json `"jest"`,
`@vitest-environment` / `@jest-environment` comments and `--environment`
flags in scripts, each with an exact text edit. It adds `warpdom` and
`vitest-environment-warpdom` or `jest-environment-warpdom` where jsdom was
declared, removes jsdom, happy-dom and their environment packages when
nothing imports them any more, and prints the install command (it does not
install). What it cannot change exactly (a computed environment, one
inherited from another package) is listed as manual, and lines that
mention jsdom (setup files, polyfills, console filters) are listed for
review. It also warns about release-age settings (pnpm
`minimumReleaseAge`, yarn `npmMinimalAgeGate`) with the date the new
packages can be installed. warpdom behaves like the jsdom version it finds
installed, so when migrate removes a jsdom version other than the one
warpdom assumes by default, it pins that version next to the environment
(`environmentOptions.warpdom.jsdom`, `testEnvironmentOptions.jsdom`) and
your tests keep their current jsdom behavior (`--no-keep-jsdom-version`
leaves it out). Details:
[docs/migrate.md](docs/migrate.md).

## Faster still

**Fast mode (Vitest).** Vitest isolates every test file, and reloading
modules per file is a large part of a component suite's time. Fast mode runs files
without isolation and resets warpdom's window between them; files that
still leak module state are learned and run isolated. How much it gains
depends on how much of a suite's time goes into reloading modules per
file; measure it on your suite before relying on it.

Measured on GitHub Actions on 16 open-source Vitest suites (up to 5 rounds;
warpdom 2606b3d): where sharing pays it is much faster than both jsdom's
default and warpdom's drop-in, e.g. VueUse 9.6x over jsdom (5.2x over the
drop-in), MUI 6.7x (3.7x), Vuetify 5.6x (3.8x), Radix 4.7x (2.6x),
naive-ui 3.4x (3.0x), tanstack-query 2.4x (1.6x). Where sharing does not
pay it runs the suite isolated (or splits for a gain within noise) and
equals the drop-in (0.98-1.03x on the other suites). Median over the
16: 1.54x over jsdom's default, 1.01x over the drop-in. Against the
fastest jsdom configuration that keeps every result (`isolate: false`, a
cleanup, or the VM pool), the median is 1.27x, and it is slower on two
suites (naive-ui 0.67x; melt-ui 0.84x). On Vitest older than 3.2,
`warpdom vitest run` is not available and runs Vitest as configured,
that is, the drop-in. Four of the 16 suites (melt-ui among them) run an
older Vitest and ariakit passes three `--project` arguments, so those
five were measured with our harness's emulation of the same rules.
<!-- source: docs/research/data/ci-2026-10-14-5942dc9-RESULTS.md sections 2 and 3 (runs 38567560217, 38567579662, 38567598200; per suite: speedup over jsdom-default and over warpdom-default; 7 of 17 suites beyond the A/A noise; 16 Vitest suites: 1.54x (1.27-3.56x) over jsdom default, 1.01x (1.00-2.73x) over the drop-in, 1.27x (1.06-1.52x) over the best correct jsdom configuration, 1.21x if ark-ui's VM pool counts; naive-ui 0.67x vs jsdom-shared, melt-ui 0.84x vs jsdom-vm); floating-ui, solid, melt-ui and solid-primitives (Vitest < 3.2) and ariakit were measured with the harness's emulation of the same rules; src/vitest-fast-cli.js ("fast mode needs Vitest 3.2 or later ...; running Vitest as configured") -->
| Suite | Mode chosen | vs jsdom default | vs best correct jsdom setup | vs warpdom drop-in |
| --- | --- | ---: | ---: | ---: |
| VueUse | split | **9.62x** | 9.62x | 5.17x |
| MUI | split | **6.67x** | 1.54x | 3.73x |
| Vuetify | split | **5.61x** | 1.11x | 3.80x |
| Radix | split | **4.73x** | 1.47x | 2.59x |
| naive-ui | split | 3.36x | 0.67x | 3.01x |
| tanstack-query | 7 of 19 projects split | 2.41x | 2.41x | 1.59x |
| CopilotKit | vue split | 1.52x | 1.52x | 1.22x |
| ark-ui | partly split | 1.59x | 1.59x | 1.01x |
| floating-ui / melt-ui | isolated | 1.56x / 1.44x | 1.01x / 0.84x | 1.01x / 0.99x |
| 7 more suites | isolated | 1.05-1.35x | – | 0.98-1.03x |
| **Median of 16** | | **1.54x** | **1.27x** | **1.01x** |
<!-- source: docs/research/data/ci-2026-10-14-5942dc9-RESULTS.md 2-3 and ci-2026-10-14-5942dc9-computed.md (runs 38567560217, 38567579662, 38567598200; best correct jsdom setup: the fastest of jsdom default, isolate: false, isolate: false with a cleanup, and the VM pool that kept every result in every round) -->

[docs/fast-mode.md](docs/fast-mode.md)

```js
// vitest.config.js
import { withFastMode } from 'warpdom/vitest/fast';
export default withFastMode({ test: { environment: 'warpdom' } });
```

```sh
npx warpdom vitest run
```

**Fast frames (opt-in).** `requestAnimationFrame` normally waits 16.7 ms of
real time per frame, in jsdom and warpdom. With `fastFrames`, frames run as
soon as the event loop gets to them; suites whose test helpers wait for
frames get much faster (ariakit 1.6x over warpdom's default). A few tests
can change result, so it is off by default: check with
`npx warpdom compare --fast-frames`.
<!-- source: docs/research/README.md 3.6 "Fast frames" (run 38197900923, experiment branch exp/fast-frames: ariakit 467.9 -> 291.5 s, 1.61x over warpdom default; ariakit 12 differences instead of 9, ark-ui 6 instead of 3-4) -->
[docs/fast-frames.md](docs/fast-frames.md)

```js
// Vitest
test: { environment, environmentOptions: { warpdom: { fastFrames: true } } }
// Jest
testEnvironmentOptions: { fastFrames: true }
```

## Measured

All numbers below are from GitHub Actions runs on one frozen commit,
warpdom 8630317 (2026-10-13): hosted Linux runners with 4 cores, pinned
project commits, each project's own runner, config and jsdom, 2 workers.
In each job the DOMs alternate on the same machine: an untimed warm-up,
then 5 rounds with the order rotated. A speedup is the median of the
per-round ratios, so it never mixes machines. Raw data, scripts and every
derived number: [docs/research/](docs/research/README.md)
(`docs/research/data/ci-2026-10-13-208ad49-*`).
<!-- source: docs/research/data/ci-2026-10-13-208ad49-RESULTS.md 1 (runs, protocol, 139 environment records: warpdom 8630317, Node 22.23.3, 4 cores) and "Conventions" -->

### At a glance

| | Result |
| --- | --- |
| Drop-in speed, 13 suites, 3 independent runs | median **1.28x / 1.27x / 1.26x** faster than jsdom; every suite faster in every run (1.03x to 1.89x) |
| handsontable (jsdom 16.7, outside the medians) | **8.0-8.9x** (593 s to 69 s); 2.5x on the first run after install |
| Held-out suites (8) | median **1.36x** (1.01x to 1.96x) |
| Applications | Excalidraw **1.21x**, Wire **1.03x**, 0 tests changed |
| Same results | 17 of 25 suites: no test changed in any round; the other 45 tests are each explained below |
| happy-dom, for comparison | median 1.25-1.28x faster than jsdom, but changes results in 12 of 13 suites |
| Fast mode, 16 Vitest suites | up to **9.6x** over jsdom (VueUse); median 1.54x over jsdom, 1.01x over the drop-in |
| Version dependence (jsdom alone) | another jsdom version changes results in **13 of 23** projects |
| Web Platform Tests | **87.4%** of subtests (jsdom: 80.5%) |
<!-- source: docs/research/data/ci-2026-10-13-208ad49-computed.md "Cross-suite medians of the drop-in speedup", "Tuning: warpdom speedup per run and between runs", "handsontable per package", threeway-heldout and threeway-apps reports; ci-2026-10-13-208ad49-RESULTS.md 7 (correctness inventory: 17 of 25 suites, 45 tests), 5 (versions: 13 of 23); ci-2026-10-14-5942dc9-RESULTS.md 2-3 (fast mode); wpt/ci-2026-10-13-208ad49/summary.md -->

### Drop-in speed and results

The first of three identical runs (run 38426985620), sorted by jsdom
time. Times are the median of 5 rounds. The range is the suite's speedup
in each of the three runs.
<!-- source: docs/research/data/ci-2026-10-13-208ad49-threeway-tuning/run1-38426985620/report.md (times, speedups, tests differing: most in any round); ci-2026-10-13-208ad49-computed.md "Tuning: warpdom speedup per run and between runs" (per-run medians: min-max) -->

| Suite | jsdom | happy-dom | **warpdom** | **warpdom vs jsdom** | **warpdom, 3 runs** | Tests that change result: happy-dom / warpdom |
| --- | ---: | ---: | ---: | ---: | --- | --- |
| ariakit | 537.3 s | 232.1 s | **407.2 s** | **1.32x** | **1.32–1.39x** | 51 / **7 ¹** |
| CopilotKit | 456.5 s | 48.6 s ² | **366.3 s** | **1.24x** | **1.23–1.25x** | 4,681 / **0** |
| React Spectrum | 419.9 s | 363.1 s | **338.4 s** | **1.24x** | **1.19–1.26x** | 1,441 / **0** |
| MUI | 264.0 s | 185.1 s | **141.2 s** | **1.89x** | **1.88–1.89x** | 1,042 / **0** |
| ark-ui | 205.7 s | 141.5 s | **130.8 s** | **1.59x** | **1.56–1.61x** | 116 / **3 ³** |
| svelte | 91.4 s | 85.5 s | **84.6 s** | **1.08x** | **1.08–1.09x** | 288 / **1 ⁴** |
| Vuetify | 39.6 s | 26.7 s | **26.8 s** | **1.49x** | **1.49–1.52x** | 4 / **0** |
| emoji-picker-element | 37.2 s | 32.3 s | **29.1 s** | **1.28x** | **1.18–1.28x** | 1 / **0** |
| Radix | 29.6 s | 19.7 s | **16.4 s** | **1.79x** | **1.75–1.86x** | 18 / **0** |
| floating-ui | 23.7 s | 18.8 s | **15.5 s** | **1.53x** | **1.52–1.55x** | 14 / **0** |
| analog | 19.3 s | 17.3 s | **16.0 s** | **1.20x** | **1.19–1.21x** | 2 / **0** |
| react-hook-form | 12.8 s | 14.2 s | **10.3 s** | **1.24x** | **1.21–1.24x** | 8 / **0** |
| solid | 3.4 s | 3.1 s | **3.3 s** | **1.03x** | **1.03x in each** | 0 / **1 ⁵** |

¹ Tests that fail on jsdom and pass on warpdom.
² CopilotKit is fast on happy-dom because 4,681 of its tests break there.
³ Tests that fail on jsdom and pass on warpdom, and one that is flaky on
jsdom too (2 without it).
⁴ A deliberate difference (`DOMException`, below).
⁵ An order-dependent test of solid's, not a DOM difference (below).
<!-- source: run1-38426985620/report.md (ark-ui 3 (2) without flaky; CopilotKit happy-dom 4681); ci-2026-10-13-208ad49-RESULTS.md 7 (classes: ariakit 7 failed>passed in every round; ark-ui largeStep and Toast fail on jsdom, smallStep flaky; svelte deliberate); docs/research/data/investigations/solid-transition/README.md (solid) -->

- **Median:** 1.28x, 1.27x and 1.26x in the three runs (95% two-level
  bootstrap 1.22–1.54x, 1.21–1.54x, 1.19–1.55x), 1.27x over the three
  runs' rounds pooled. The suites fall into two groups, about 1.0x to
  1.3x and 1.5x to 1.9x, so read the table rather than the median.
  Between runs, a suite's speedup moved by a median of 2.3% and at most
  8.6% (emoji-picker-element), although absolute times moved by up to
  1.6x with the runner's CPU (Radix on jsdom: 28.9 s to 46.8 s).
  <!-- source: ci-2026-10-13-208ad49-computed.md "Cross-suite medians of the drop-in speedup" and "Tuning: warpdom speedup per run and between runs" (spread median 2.3%, max 8.6%); RESULTS.md 2.1 (two clusters; radix jsdom 28.9-46.8 s) -->
- **Where the gain is small:** a faster DOM only speeds up the part of a
  run spent in the DOM; compilers, frameworks, module loading and waiting
  stay as they are. solid (1.03x; single rounds 0.97x to 1.06x) and svelte
  (1.08x to 1.09x) gain little, as do the held-out taiga-ui (1.01x,
  0.99x to 1.03x) and react-router (1.04x) and the Wire web app (1.03x,
  1.00x to 1.03x).
  <!-- source: ci-2026-10-13-208ad49-computed.md "Tuning: warpdom speedup per run and between runs" (solid pooled 0.97-1.06x; svelte 1.08-1.09x), "Held-out (run 38427053627)" (taiga-ui 1.01x, 0.99-1.03; react-router 1.04x, 1.03-1.06), "Applications (run 38427075297)" (wire-webapp 1.03x, 1.00-1.03) -->
- **happy-dom** is about as fast (median 1.25x, 1.27x, 1.28x over jsdom
  in the three runs) but changes results in 12 of the 13 suites, and is
  slower than jsdom on react-hook-form (0.88x to 0.94x).
  <!-- source: ci-2026-10-13-208ad49-computed.md "happy-dom vs jsdom, same procedure"; RESULTS.md 2.5 (12 of 13, all but solid; react-hook-form 0.88-0.94x) -->

### handsontable

Reported apart from the medians because its core, React and Vue packages
run jsdom 16.7.0, older than the jsdom 20 the medians require. With a
warm Jest cache the whole suite ran 8.62x faster in the run above (593.2 s
on jsdom, 69.2 s on warpdom) and 7.97x to 8.87x in the three runs; the
core package alone 11.2x to 12.5x, the Angular wrapper (jsdom 20.0.3)
1.86x to 1.98x. On the first run after install, when both DOMs pay for a
cold transform cache and the Angular wrapper's compile, it was about 2.5x
(2.53x to 2.55x). 3 tests differ, all deliberately (below). happy-dom
completed no timed round.

On handsontable's current branch (develop at fa6f901, measured
2026-10-14 with warpdom 0.1.1, 5 rounds) the speedup is smaller, 3.17x
(251 s on jsdom, 79 s on warpdom; core 3.48x): handsontable has since
added its own workarounds for jsdom's slowness (a stylesheet mock and a
patch of jsdom's CSS library), which make its jsdom baseline faster. 7 of
its new tests test that patch of jsdom's CSS library, which warpdom does
not have, so they fail on warpdom.
<!-- source: GitHub Actions run 38647824283 (sonukapoor/dom-api-tracer, timing, unpinned, handsontable develop fa6f901a17ea7293b97e4147486f58a171c8b58a, warpdom v0.1.1, jsdom-default and warpdom-default, 5 rounds): 251.2 s vs 79.2 s, 3.17x; per package core 3.48x; test/__tests__/jsdomComputedStyleSpeed.unit.js 7 of 8 tests fail on warpdom -->
<!-- source: ci-2026-10-13-208ad49-computed.md "Version rule" and "handsontable per package"; RESULTS.md 2.4 (cold first run 2.54x, 2.55x, 2.53x; happy-dom no timed round) -->

### Held-out suites and two applications

**Held-out.** Nine projects warpdom was not tuned on (naive-ui, taiga-ui,
melt-ui, dom-testing-library, tanstack-query, solid-primitives, VueUse,
react-router, downshift; about 13,500 tests). At first contact 58 tests
(0.43%) differed; fixing their causes means the set is no longer unseen.
Drop-in, 5 rounds: a median of 1.36x (95% two-level bootstrap 1.05x to
1.69x) over the 8 projects with valid jsdom rounds, from 1.01x (taiga-ui)
to 1.96x (VueUse); solid-primitives 1.14x from its raw rounds (its jsdom
runs report 901 or 922 tests, so the broken-round rule drops them). In
the 17 CI rounds that ran each of them, only these tests changed result:
tanstack-query 1 (the `ownerNode` difference below), melt-ui 1
(speed-sensitive, below) and solid-primitives 4 (an order dependence of
the project's own, below), plus flaky tests.
<!-- source: docs/research/README.md 3.7 (58 of about 13,500, 0.43%); ci-2026-10-13-208ad49-computed.md "Held-out (run 38427053627)", "Cross-suite medians" (8 suites 1.36x, 1.05-1.69x) and solid-primitives raw rounds (1.14x, 1.11-1.19); "Versions" (tests per suite, 13,526); RESULTS.md 2.2 and 7 -->

**Web applications.** Excalidraw ran 1.21x faster (1.20x to 1.23x) and
the Wire web app 1.03x (1.00x to 1.03x, about equal), with no test that
changed result. happy-dom changed 44 and 63 of their tests and ran Wire at
0.54x of jsdom's speed. Both apps drove fixes when they were first tried
(2 and 141 tests differed then), so this is a migration case study, not
held-out evidence.
<!-- source: docs/research/data/ci-2026-10-13-208ad49-threeway-apps/report.md (run 38427075297); RESULTS.md 2.3; docs/research/data/apps/ci-2026-10-12-apps-before/report.md (run 38304848528: 2 and 141 differing) -->

### Version dependence

Suites encode the jsdom version they were written against. Measured with
jsdom alone, no warpdom: running each project on jsdom 20.0.3, 26.1.0 or
30.1.2 instead of its own version changed the status of tests in 13 of
23 projects (counting tests that ran; files that fail to load under a
forced version are left out). It is concentrated: ariakit 258 tests
(13.9%) on jsdom 20, React Spectrum 138 on jsdom 30, svelte 38, the others
1 to 16. Even a minor update of cssstyle, the CSS library jsdom 26 and
earlier load (4.1.0 to 4.6.0), changed 12 svelte tests. warpdom therefore
follows the jsdom (and cssstyle) each project installs. Given the latest
jsdom's behavior instead of their own, warpdom would differ from jsdom in
more tests in 7 of 23 suites: React Spectrum 0 → 146, svelte 1 → 25,
handsontable 3 → 23, downshift 0 → 7, ark-ui 2–3 → 6, CopilotKit 0 → 1,
dom-testing-library 0 → 1.
<!-- source: docs/research/data/ci-2026-10-13-208ad49-computed.md "Versions" (runs 38427202342, 38427223850); RESULTS.md 6 (13 of 23; ariakit 258, 13.93%; React Spectrum 138; svelte 38; cssstyle 4.1.0 -> 4.6.0: 12) and 5 (A4, runs 38427136397, 38427158136: 7 of 23) -->

### Web Platform Tests

On WPT's `dom`, `domparsing`, `html/dom` and `css/cssom` (963 files),
warpdom passes 87.4% of subtests (jsdom 30.1.2: 80.5%), with a per-file
score of 75.7% (jsdom: 71.0%). warpdom was worked on against these tests,
so they are not an independent check. The runner is in [wpt/](wpt/).
<!-- source: docs/research/data/wpt/ci-2026-10-13-208ad49/summary.md (run 38427179332, WPT 87b5d13099: warpdom 116,410 of 133,248, 87.4%, score 75.7%; jsdom 107,200 of 133,158, 80.5%, score 71.0%) -->

Full tables, method, profiles and caveats:
[docs/research/README.md](docs/research/README.md).

## Differences from jsdom

API by API, how warpdom, jsdom, happy-dom and linkedom each support the
web platform (behavior checks for commonly used APIs, existence of every
Web IDL interface and member) is on [DOMParity](https://domparity.github.io),
a separate reference site with the same method for every engine (maintained
by warpdom's author).

warpdom matches jsdom's observable behavior where tests depend on it, and
otherwise follows the standards. Deliberate differences, each with a test
(full list in [PLAN.md](PLAN.md), "Deliberate deviations from jsdom").
Those that changed a test in the 25 measured suites:

- `DOMException` is an `Error` in the test's realm, as the standard says
  (in Vitest's default pools jsdom's is not): 1 svelte test.
- `CSSStyleSheet.ownerNode` is the owning element in the jsdom 27 and 28
  profiles, as in jsdom 29 and later; the jsdom 20 to 26 profiles have no
  `ownerNode`, as those versions. Measured on each release, jsdom 27.0 has
  no `ownerNode`, 27.1 and 27.2 give `null`, and 27.3 to 28.1 an internal
  object that is not a Node: 1 tanstack-query test (jsdom 27.4).
- warpdom reports no style-sheet parse errors to the console. jsdom 16
  cannot parse CSS nesting, drops such a sheet and reports "Could not
  parse CSS stylesheet": 3 handsontable tests of its filter for that
  message (`jsdomThemeCssFilter.unit.js`).
<!-- source: PLAN.md "Deliberate deviations from jsdom" (DOMException, svelte whitespace-at-block-start; ownerNode measured per release, tanstack-query PiPContext.test.tsx; handsontable jsdomThemeCssFilter.unit.js); docs/research/data/ci-2026-10-13-208ad49-RESULTS.md 7 (svelte 27 of 27 rounds, tanstack-query 17 of 17, handsontable 22 of 22) -->

Results that change for other reasons:

- **Tests that fail on jsdom and pass on warpdom:** ariakit 7 (in every
  round), and ark-ui's Toast and NumberInput `largeStep` tests (some
  rounds). They count as differences because the goal is jsdom's results.
- **Speed-sensitive (melt-ui):** a Context Menu test fails in some rounds
  (7 of 17) on warpdom. It stubs `requestAnimationFrame` with a 16 ms
  timer, and warpdom finishes a Svelte transition sooner. A Dropdown Menu
  test of the same kind fails on jsdom too now and then; for the Context
  Menu test the cause is inferred from that one, not shown.
- **Order dependence (solid):** solid's suite shares module state between
  files (`isolate: false`). Its transition test fails whenever
  `suspense.spec` ran before it in the same worker without
  `external-source.spec` in between, on jsdom and on warpdom: in all 32
  such runs, and it passed in all 98 others. On CI it failed on warpdom
  in 24 of 27 rounds and never on jsdom, because the harness gave solid's
  files with an `@vitest-environment` comment another environment name
  than the config on warpdom only, which put them in a separate group (see
  Setup).
- **Order dependence (solid-primitives):** one of its files leaves fake
  timers on; 4 timer tests that run after it in the same worker time out
  (4 of 17 rounds), on jsdom too when forced into that order. On CI that
  order occurred only under warpdom.
<!-- source: docs/research/data/ci-2026-10-13-208ad49-RESULTS.md 7 (ariakit 23 of 23 rounds; ark-ui largeStep 10 of 27, Toast 25 of 27; melt-ui Context Menu 7 of 17, speed-sensitive by analogy; solid-primitives 4 of 17, forced order fails on jsdom too, held-out/local-2026-10-12-solid-primitives-order/; slow order warpdom-only on CI); ci-2026-10-13-208ad49-correctness-jsdom-learned.tsv (melt-ui Dropdown Menu 2 of 5 rounds on jsdom); docs/research/data/investigations/solid-transition/README.md (solid: 24 of 27 rounds; 130 runs, 32 failed, 98 passed; environment groups) -->

Other deliberate differences:

- `isTrusted` is an accessor on `Event.prototype`, not an own property of
  every event (much faster to create events; only interface-shape checks
  can tell).
- `tabindex="abc"` gives the element's default tab index (jsdom: 0); a
  disabled `fieldset` is not focusable.
- Standard behavior where jsdom deviates: `FormData` and disabled options,
  `formnovalidate`, `Selection.containsNode`, event handler re-registration
  order, failed custom elements and `:defined`, XPath functions jsdom's
  engine gets wrong, namespaced attributes in selectors and `dataset`,
  MutationObserver's transient observers and notification order,
  directionality in shadow trees, `document.write` across several calls,
  `visibilityState` and cookies of documents without a browsing context,
  CSSOM rule-list and `@page` rules, XML serialization details,
  `getElementsByName` (HTML elements only), a removed iframe's
  `contentWindow` (null).
- Additions jsdom lacks: `innerText`/`outerText`, `Selection.direction`,
  Range `getClientRects()`/`getBoundingClientRect()` (empty), `ToggleEvent`,
  `TouchList`, `TimeRanges` on media elements, element interfaces and
  reflected attributes from the current HTML standard.
- Kept the same in every jsdom profile: `MediaList` normalization (jsdom
  30's) and writable style indexed properties (jsdom 26's).
<!-- source: PLAN.md "Deliberate deviations from jsdom" -->

Not implemented (jsdom lacks these too): layout (sizes and positions are
0, as in jsdom), `inert`, loading external style sheets, scripts or pages,
navigation to other documents.

Not implemented, unlike jsdom: `XMLHttpRequest`. In 4,151 test files of 20
projects we traced, no test used it; HTTP libraries that feature-detect it
(axios) fall back to Node's HTTP client, which request mocking (nock, msw)
intercepts as well. If your suite tests XHR itself, `warpdom compare` will
show it; please report it.

## API

```js
import { createWindow } from 'warpdom';

const window = createWindow({ url: 'http://localhost/', jsdom: '30.1.2', fastFrames: false });
window.document.body.innerHTML = '<p>hello</p>';
```

`warpdom/compare` exports `compare(options)`, the API behind the CLI;
`warpdom/migrate` exports `migrate({ cwd, apply })`, which returns the plan.

## Development

```sh
npm test              # unit and parity tests (node:test; parity tests run jsdom side by side)
npm run bench:load    # cold load and window creation
npm run bench:hot     # hot DOM members against jsdom and happy-dom
node wpt/run.mjs dom/nodes --engine warpdom,jsdom   # Web Platform Tests
```

warpdom is written from the specifications; jsdom is used as a black-box
reference (its source is not read or copied). Plans and decisions:
[PLAN.md](PLAN.md); architecture: [docs/design.md](docs/design.md).

## Citing

If you use warpdom in research, please cite it: GitHub's "Cite this
repository" button reads [CITATION.cff](CITATION.cff), and each release is
archived on Zenodo with a DOI.

## License

MIT. Generated data tables in `src/` are derived from the Unicode Character
Database (`src/bidi-data.js`, Unicode License v3) and from
[webref](https://github.com/w3c/webref) (`src/css-data.js`,
`src/html-elements.js`, `src/event-handler-names.js`; MIT); the scripts
that generate them are in [scripts/](scripts/). The Web Platform Tests
are not included: the runner in [wpt/](wpt/) uses a separate checkout
(WPT is under the 3-Clause BSD License).
