# warpdom research record

The living record of warpdom's evaluation, kept so it can become a paper or
article. Every number here comes from a file named next to it; the small
raw files are copied into [`data/`](data/) because their originals lived in
temporary or untracked locations. Paths starting with `dom-api-tracer/`
are in the measurement repository (`~/Projects/dom-api-tracer`);
`.corpus-env/` there is untracked local output.

*Last updated 2026-10-11.*

## 1. Goal and research questions

warpdom is a DOM implementation for unit and component tests, written from
the WHATWG/CSSOM specifications (not derived from jsdom or happy-dom), that
installs as a Vitest or Jest environment in place of jsdom. The claim to
test is that a DOM built for near-free startup and jsdom's observable
behavior makes real suites faster **without changing any test's result**.

- **RQ1 (correctness):** Can an independent implementation give every test
  in large real suites the same status (pass, fail, skip) as jsdom?
- **RQ2 (speed):** How much faster are real suites, isolated (the
  runners' default) and in configurations warpdom enables (VM pool,
  fast mode without per-file isolation)?
- **RQ3 (where time goes):** Once the DOM is fast, what dominates suite
  time, and what bounds further gains?
- **RQ4 (what "jsdom-compatible" means):** Which jsdom behaviors do suites
  depend on, and are they stable across jsdom versions?

Prior measurements that motivated the work (stage 1, dom-api-tracer
`docs/`): tests use about 17% of jsdom's DOM surface
(`stage1-report.md`); jsdom is a median 37% of CPU time in jsdom suites
and happy-dom 9%, but every jsdom suite moved to happy-dom lost tests
(`env-experiment.md`); per-file environment setup is a median 29% of
Vitest run time (`setup-cost.md`). Summarized in [PLAN.md](../../PLAN.md)
("Decisions", 2026-10-08 and 2026-10-09).

## 2. Method

### 2.1 Corpus

14 open-source projects from the dom-api-tracer corpus
(`dom-api-tracer/corpus/corpus.json`, which records per package why it is
included and how it must be built). Runner and the DOM the project itself
uses:

| Project | Kind | Runner | Project's own DOM | Packages run |
| --- | --- | --- | --- | --- |
| material-ui (MUI) | React design system | Vitest | jsdom | mui-material, mui-system, mui-utils, mui-lab |
| react-spectrum | React design system, a11y | Jest | jsdom | root project |
| handsontable | data grid | Jest | jsdom | core + React, Vue 3, Angular wrappers |
| react-hook-form | React forms | Jest | jsdom (jest-fixed-jsdom) | web project |
| radix-primitives | React headless | Vitest | jsdom | unit project |
| vuetify | Vue design system | Vitest | jsdom | unit project |
| emoji-picker-element | web component, shadow DOM | Vitest 3 | jsdom | root |
| floating-ui | positioning (React, Vue) | Vitest 3 | jsdom | react, react-dom, dom, vue |
| ark-ui | headless, 4 frameworks | Vitest | happy-dom (React, Vue), jsdom (Solid, Svelte) | react, vue, solid, svelte |
| analog | Angular meta-framework | Vitest | jsdom | 9 packages (1 browser-only, skipped) |
| CopilotKit | app components (React, Vue, Angular, WC) | Vitest | jsdom | 7 packages |
| ariakit | React + Solid a11y | Vitest | happy-dom (+ some jsdom files) | root |
| svelte | framework runtime | Vitest | jsdom (per file) | root |
| solid | framework runtime | Vitest 2 (`isolate: false`) | jsdom | packages/solid |

Excluded from the comparison so far (PLAN.md, "Next steps" 3): ag-grid
(behavioural suite times out; two tests take 420 s and 180 s on jsdom),
kobalte (workspace package not built), nuxt-ui (jsdom baseline broken),
element-plus (pins jsdom 16). The corpus's mantine and ngx-formly are not
part of these surveys.

### 2.2 How each suite is run

All runs use the dom-api-tracer harness `scripts/trace-corpus.mjs`, which
never edits project files: it writes a temporary wrapper config next to the
package's own Vitest/Jest config that overrides the test environment, runs
the project's **own** runner binary, and reads the runner's JSON report.
Settings for every run here: `--max-workers 2`, Node 22.23.3 (`nvm exec`;
MUI needs >= 22.23.3), one corpus run at a time.

- **jsdom:** Vitest uses the project's installed jsdom, or the harness
  provides jsdom 30 when the project has none; Jest uses the project's
  `jest-environment-jsdom` (Jest 30 bundles jsdom 26).
- **warpdom:** copied into the package as
  `node_modules/warpdom.dom-trace.copy/` (as an installed package would
  be; Vitest 3 hangs loading an environment from outside the project root
  once workers are reused), environment `src/vitest.js` or `src/jest.js`.
  warpdom detects the installed jsdom version and follows its behavior
  (finding F1).

### 2.3 Correctness: same status per test

For each project, a jsdom baseline run and a warpdom run produce per-test
statuses keyed by package, test file and full test name
(`dom-api-tracer/scripts/research/survey-warpdom.sh`). The metric is the
number of tests whose status differs, in either direction (a test that
fails on jsdom and passes on warpdom counts as a difference). Files that
fail to load count once as a file entry. Differences are grouped by error
message with `scripts/research/diffgroups.cjs` and investigated one by one.

Baselines: 7 projects use a jsdom run from 2026-10-08
(`.corpus-env/jsdom-time`: handsontable, react-spectrum, react-hook-form,
floating-ui, MUI, radix, ariakit); the other 7 get a fresh jsdom run in
the same survey, immediately before warpdom (`.corpus-env/jsdom-base`).

### 2.4 Timing protocol

`scripts/research/timing-vitest.sh` / `timing-jest.sh`: per round, per
project, jsdom then warpdom (Vitest: also both with `--pool=vmThreads`),
back to back; 3 rounds; the reported time is the runner time the harness
measures, summed over the project's packages. Tables here give the median
per configuration and the **ratio of the medians** (jsdom / warpdom).
`scripts/research/timing-report.cjs` instead prints the median of the
per-round ratios; the two differ by up to 0.07 on these data (e.g. MUI
1.88x vs 1.87x, solid 0.93x vs 1.00x). Each timing row also records how
many tests differed from the baseline in that run.

Fast mode (Vitest only; [docs/fast-mode.md](../fast-mode.md)): files run
without isolation with warpdom's per-file reset (`src/vitest-reset.js`),
except files that leak module state, which are learned once and run
isolated; the mode (split or isolated) is chosen by timing both
(`scripts/research/learned.sh`).

Head-to-head with happy-dom (2026-10-09, 3 suites x 3 DOMs x 3 modes, 3
interleaved rounds): `scripts/research/headtohead.sh`,
[docs/head-to-head.md](../head-to-head.md).

**On GitHub Actions (from 2026-10-12).** `dom-api-tracer/.github/workflows/timing.yml`
runs the same protocol (`timing-rounds.sh`) with one job per project on
GitHub-hosted Linux runners, each project checked out at the commit pinned
in `dom-api-tracer/corpus/pins.json`, and combines the per-project CSVs
into the same report. jsdom and warpdom alternate within one job, so a
ratio never mixes machines. Jobs on different projects run on different
machines, so absolute times are not comparable across rows. Inputs select
the projects, rounds, warpdom ref, configurations (including experiment
configurations such as `warpdomframes-default`) and per-file phase timings
(`perfile-reporter.mjs`, Vitest only: environment setup, prepare, collect,
setup files and tests per test file, compared with `perfile.cjs`). Every
job uploads its CSV, environment record and harness logs. This is the
reference setup from now on: anyone with access can rerun it, and it is
not affected by other work on a laptop.

### 2.5 Profiling

`trace-corpus.mjs --profile` runs every test process with `--cpu-prof`.
`dom-api-tracer/scripts/profile-share.mjs` splits sampled CPU time (idle
excluded) into DOM, framework, Testing Library, runner, transforms, project
code, GC, Node internals and other; built-in frames are charged to their
nearest caller with a source file. `scripts/research/prof-top-dom.cjs`
ranks functions within warpdom's own files. Profiled runs are slower than
timed runs and are used only for shares, never for speedups.
`profile-share.mjs --json` also reports idle time per process (summed
over processes): time a test process spends waiting, e.g. on timers. A
suite whose idle time dwarfs its CPU time cannot gain much from a faster
DOM (3.4, F6). CPU shares are robust to other load on the machine; wall
times are not.

### 2.6 Micro-benchmarks

warpdom's `bench/` ([bench/README.md](../../bench/README.md)): cold load
and window creation (`load.js`), hot members against jsdom and happy-dom
(`hot.js`), and focused scripts for node creation, style writes, the
cascade, dispatch, URLs, windows and environment setup. Rule: at least 5
runs, before and after alternating, medians, Node version noted.

### 2.7 Hardware and environment

Recorded with `dom-api-tracer/scripts/research/record-env.mjs`
([data/environment-2026-10-11.json](data/environment-2026-10-11.json),
written after the runs below): Apple M4 Pro, 14 cores, 24 GiB, macOS
(Darwin 25.6.0), arm64; corpus runs on Node 22.23.3, micro-benchmarks on
Node 22.17.1 (PLAN.md). From now on the survey and timing scripts write
this record next to every run, including the commit of every corpus
checkout; the runs in this document predate that, so their project commits
are only known to be the local checkouts as of 2026-10-08 to 2026-10-11.

GitHub Actions runs (2026-10-12 on): `ubuntu-latest` runners, Node
22.23.3. Each job's environment record (CPU model, cores, memory, all
commits) is in its artifact. Hosted runners are shared virtual machines
with fewer cores than the laptop, so absolute times are 2-3x the laptop's
(react-hook-form: jsdom 18.8 s vs 6.3 s) and ratios can differ. Small
suites differ most (solid: 0.94x on the runner, 1.07x on the laptop, both
invalid; see the correction in section 3).

## 3. Results

> **Correction, 2026-10-12: svelte and solid were not fully measured.**
> Vitest takes a test file's environment from a `@vitest-environment
> jsdom` comment before the config. The harness switched only the config,
> so files with that comment stayed on jsdom in every "warpdom" run before
> 2026-10-12. Measured on the jsdom baselines:
> - **svelte:** 8 of 34 files, 6,656 of 7,879 tests (84.5%);
> - **solid:** 14 of 27 files, 268 of 482 tests (55.6%);
> - ariakit 1.5%; CopilotKit and handsontable under 1%, mostly `node` pins, which are correct anyway;
> - the other 9 suites: none.
>
> So the svelte and solid rows below (correctness and speed) compare
> mostly jsdom with jsdom. They are kept for the record but must not be
> cited. The harness now switches these files without editing them
> (dom-api-tracer ceffbd6). With that fix, solid passes all 482 tests on
> warpdom, and svelte has 55 tests that pass on jsdom and fail on
> warpdom: jsdom 25 profile gaps, `<select>`, media, hydration. Those are
> being fixed (PLAN.md). Both suites are to be re-measured.


### 3.1 Correctness (RQ1)

Latest full survey, 2026-10-11 afternoon (warpdom code as merged to main,
up to commit fcd0b51 by timestamp; the commit was not recorded):
[data/surveys/survey8.log](data/surveys/survey8.log). "Tests" is the
number of test entries in the jsdom baseline.

| Project | Tests | jsdom passed | warpdom passed | Differ | Earlier | Remaining differences |
| --- | --- | --- | --- | --- | --- | --- |
| react-spectrum | 8,446 | 8,317 | 8,317 | **0** | 304 (2026-10-10, survey-jest.log) | |
| handsontable | 8,062 | 8,062 | 8,059 | 3 | 16 (2026-10-11 morning, survey3.log); 8,418 on the first Jest run (survey-jest.log) | all 3 in `jsdomThemeCssFilter.unit.js`, which tests a workaround for a style-sheet parse error only jsdom reports; warpdom deliberately does not reproduce the error |
| svelte (invalid, see correction) | 7,873 | 7,818 | 7,818 | ~~0~~ 55 after the fix | 0 (2026-10-09, survey.log) | |
| material-ui | 6,751 | 5,878 | 5,878 | **0** | 0 (survey3.log) | |
| CopilotKit | 3,427 | 2,275 | 2,275 | **0** | 362 (survey.log) | coverage dropped: see below |
| ariakit | 1,852 | 1,811 | 1,820 | 9 | 59 (survey.log) | all 9 fail on jsdom and pass on warpdom (proxy defineProperty, a CompositionEvent view check; PLAN.md "Corpus") |
| react-hook-form | 1,505 | 1,505 | 1,505 | **0** | 0 (survey-jest.log) | |
| ark-ui | 1,244 | 1,189 | 1,187 | 2 | 6 (survey.log) | Editable typing race (fails about 1 run in 3 under load); a NumberInput test that also fails on jsdom with the current checkout |
| radix-primitives | 982 | 976 | 976 | **0** | 0 (survey3.log) | |
| vuetify | 822 | 818 | 818 | **0** | 0 (survey3.log) | |
| solid (invalid, see correction) | 480 | 480 | 479 | 1 (0 after the fix) | 136 (survey.log) | `transition.spec` fails on jsdom too in some file orders (`isolate: false` shares solid's module state) |
| floating-ui | 339 | 333 | 333 | **0** | 14 (survey.log) | |
| analog | 196 | 187 | 187 | **0** | 0 (survey.log) | |
| emoji-picker-element | 160 | 157 | 157 | **0** | 7 (survey3.log) | |

Totals: 42,139 baseline test entries; 15 differences in 4 projects. 9 of
them are tests that fail on jsdom and pass on warpdom (ariakit), 3 a
deliberate deviation (handsontable), 3 flaky or failing on jsdom in other
runs (ark-ui, solid).

CopilotKit: in this survey 231 test files failed to load on **both** DOMs
(react-core 107, vue 81, angular 42, web-inspector 1;
`.corpus-env/survey-warpdom/CopilotKit-run/status.json` and
`.corpus-env/jsdom-base/CopilotKit-run/status.json`, identical counts),
because workspace package builds were missing in the local checkout. The
baseline therefore has 3,427 entries and 2,275 passing, against 3,910 and
3,750 in earlier surveys (survey3.log to survey7.log, all 0-14 differences).

The difference counts per survey (data/surveys/, chronological: survey.log
and survey2.log 2026-10-09; survey-jest.log and survey-ht.log 2026-10-10;
survey3.log to survey8.log 2026-10-11) show the path: compatibility work
was driven entirely by these differences, grouped by error message.

### 3.2 Speed (RQ2)

Latest timing per suite; jsdom and warpdom alternating, 2 workers, median
of 3 rounds; speedup = jsdom median / warpdom median. "Default" is the
runner's default isolated pool. Dates differ per row, and warpdom changed
between them; the 2026-10-09 Vitest rows were measured while the machine
was loaded by other work (load average up to 14,
[docs/head-to-head.md](../head-to-head.md)) and before several
compatibility fixes (differences in that run in the last column).

| Suite | Runner | Source | jsdom | warpdom | Speedup | Other configurations (speedup vs jsdom default) | Differ in timed runs |
| --- | --- | --- | --- | --- | --- | --- | --- |
| handsontable | Jest | timing-jest-2026-10-11-after.csv | 475.8 s | 156.7 s | **3.04x** | | 3 |
| material-ui | Vitest | timing-2026-10-11-after.csv | 87.0 s | 46.2 s | **1.88x** | vmThreads: jsdom 26.8 s (3.25x), warpdom 21.3 s (4.08x; 1.26x over jsdom vmThreads); learned fast mode 14.2 s vs 86.3 s (6.08x, learned-2026-10-10.csv) | 0 |
| radix-primitives | Vitest | headtohead-2026-10-09.csv | 17.4 s | 10.2 s | 1.71x | happy-dom 13.2 s (18 differ); learned fast mode 5.2 s vs 17.1 s (3.29x) | 0 |
| vuetify | Vitest | headtohead-2026-10-09.csv | 15.7 s | 10.0 s | 1.57x | happy-dom 9.5 s (4 differ); learned fast mode 3.7 s vs 15.1 s (4.08x) | 0 |
| floating-ui | Vitest 3 | timing-2026-10-09.csv | 10.0 s | 6.5 s | 1.54x | warpdom vmThreads hangs (Vitest 3 bug) | 0 |
| ark-ui | Vitest | timing-2026-10-09.csv | 76.5 s | 50.0 s | 1.53x | vmThreads: warpdom 26.9 s (2.84x), jsdom 29.8 s | 3 |
| react-spectrum | Jest | timing-jest-2026-10-11-after.csv | 138.0 s | 98.9 s | **1.40x** | | 0 |
| react-hook-form | Jest | timing-jest-2026-10-10.csv | 6.5 s | 5.4 s | 1.20x | | 0 |
| CopilotKit | Vitest | timing-2026-10-09.csv | 201.4 s | 172.1 s | 1.17x | vmThreads breaks the suite on both DOMs | 15 |
| analog | Vitest | timing-2026-10-09.csv | 13.7 s | 11.9 s | 1.15x | learned: 11.5 s vs 13.9 s (1.21x, isolated kept) | 0 |
| emoji-picker-element | Vitest 3 | headtohead-2026-10-09.csv | 22.2 s | 19.6 s | 1.13x | happy-dom 20.0 s (1 differs); learned 19.2 s vs 22.9 s (1.19x) | 0 |
| ariakit | Vitest | timing-2026-10-09.csv | 405.6 s | 362.6 s | 1.12x | | 22 |
| svelte (invalid) | Vitest | timing-2026-10-09.csv | 38.2 s | 36.8 s | 1.04x | | 0 |
| solid (invalid) | Vitest 2 | timing-2026-10-09.csv | 1.4 s | 1.5 s | 0.93x | learned (isolated): 1.4 s vs 1.5 s (1.07x) | 1 |

All sources are in [data/timing/](data/timing/). Over these 14 latest
measurements the median default-pool speedup is 1.30x (mixed dates, so an
indication, not a single-session result). The earlier single-session
figure over 11 Vitest suites (2026-10-09) was a median 1.17x by default and
1.20x for the best configuration with jsdom's results; the learning fast
mode was never slower than jsdom (lowest 1.03x), median 1.20x, geometric
mean 1.75x over 10 suites (docs/head-to-head.md; PLAN.md 2026-10-10).
PLAN's kill criterion is a median below ~1.8x in the recommended
configuration across 10+ suites; by that measure the product is not yet
proven, and the gain concentrates in DOM-heavy suites (finding F4).

Changes during 2026-10-11 (CSS value validation, interfaces created on
first use, jsdom version profile), same protocol before and after
(timing-*-2026-10-11.csv vs timing-*-2026-10-11-after.csv). jsdom itself
ran 5-13% faster in the second session, so compare ratios:

| Suite | Before: jsdom / warpdom | Speedup | After: jsdom / warpdom | Speedup | Differ before -> after |
| --- | --- | --- | --- | --- | --- |
| MUI default | 92.1 / 49.4 s | 1.86x | 87.0 / 46.2 s | 1.88x | 0 -> 0 |
| MUI vmThreads | 28.8 / 22.2 s | 1.30x | 26.8 / 21.3 s | 1.26x | 0 -> 0 |
| react-spectrum | 150.5 / 108.9 s | 1.38x | 138.0 / 98.9 s | 1.40x | 1 -> 0 |
| handsontable | 545.7 / 210.7 s | 2.59x | 475.8 / 156.7 s | 3.04x | 16 -> 3 |

**Re-timing, 2026-10-12 (laptop, one session, current warpdom).** All
14 suites with the same protocol and warpdom main as of 2026-10-12, in
one session. It was stopped during round 3 to move timing to GitHub
Actions. So the table below has 2 rounds per suite (3 for
react-hook-form and solid), and the median of 2 rounds is the lower
value. Round 2 of react-spectrum and CopilotKit overlapped with a
profiling run (22:22-22:35) and is slower in both configurations; it
does not enter their median.
Data: [data/timing/timing-2026-10-12-local-partial.csv](data/timing/timing-2026-10-12-local-partial.csv),
environment record next to it.

| Suite | jsdom | warpdom | Speedup | Differ |
| --- | --- | --- | --- | --- |
| handsontable | 477.1 s | 151.7 s | 3.09x | 3 |
| material-ui | 85.0 s | 44.1 s | 1.87x | 0 |
| radix-primitives | 17.1 s | 10.0 s | 1.71x | 0 |
| vuetify | 15.2 s | 8.9 s | 1.62x | 0 |
| floating-ui | 9.7 s | 6.2 s | 1.56x | 0 |
| ark-ui | 74.3 s | 47.2 s | 1.54x | 1 |
| react-hook-form | 6.3 s | 5.0 s | 1.26x | 0 |
| CopilotKit | 142.5 s | 114.6 s | 1.24x | 0 |
| analog | 13.3 s | 10.8 s | 1.23x | 0 |
| react-spectrum | 128.2 s | 105.9 s | 1.21x | 0 |
| emoji-picker-element | 21.6 s | 19.1 s | 1.13x | 0 |
| ariakit | 401.1 s | 359.1 s | 1.10x | 9 |
| solid (invalid) | 1.5 s | 1.4 s | 1.07x | 1 |
| svelte (invalid) | 35.6 s | 35.0 s | 1.01x | 0 |

Single-session median over the 14 suites: **1.25x** (default pool, drop-in);
over the 12 valid ones (without svelte and solid) **1.40x** (middle
pair 1.26x and 1.54x, so the median is sensitive to which suites are in
the corpus). warpdom is faster on all 14; 5 suites gain
1.5x or more. Speedup ratios
here are the median of per-round ratios (`timing-report.cjs`). The
GitHub Actions run of the same 14 suites (3 rounds, pinned commits) is to
replace this table (PLAN.md).

### 3.3 handsontable per package

Round 3 of timing-jest-2026-10-11-after.csv (a single round, not a median;
[jsdom](data/timing/handsontable-jsdom-round3-2026-10-11-after.status.json),
[warpdom](data/timing/handsontable-warpdom-round3-2026-10-11-after.status.json)):

| Package | Files | Tests | jsdom | warpdom | Speedup |
| --- | --- | --- | --- | --- | --- |
| core (`handsontable`) | 520 | 7,615 | 330.8 s | 24.1 s | 13.7x |
| React wrapper | 18 | 111 | 14.2 s | 7.7 s | 1.84x |
| Vue 3 wrapper | 6 | 42 | 3.9 s | 2.5 s | 1.58x |
| Angular wrapper | 14 | 314 | 125.4 s | 121.8 s | 1.03x |
| Total | 558 | 8,082 | 474.3 s | 156.1 s | 3.04x |

The Angular wrapper's time is Angular compilation and does not depend on
the DOM. The equivalent round on 2026-10-10 (docs/head-to-head.md, "Jest"):
core 336.4 s vs 25.7 s, React 14.7 vs 7.8, Vue 4.0 vs 2.6, Angular 189.2
vs 181.5. jsdom's core time reflects heavy getComputedStyle use (the
tracer counted 940 calls per test file, PLAN.md 2026-10-08).

### 3.4 Where the time goes (RQ3)

CPU profile of MUI's four packages on warpdom, 2026-10-11 (warpdom
3dc99c7 by timestamp, after all changes above; 273 test files, 274 profiled processes,
92.2 s of sampled CPU, idle excluded):
[data/profile/mui-warpdom-2026-10-11.profile-share.txt](data/profile/mui-warpdom-2026-10-11.profile-share.txt),
[data/profile/mui-warpdom-2026-10-11.top-dom.txt](data/profile/mui-warpdom-2026-10-11.top-dom.txt).

| Category | Share of CPU |
| --- | --- |
| Node internals (module loading, file system) | 19.1% |
| Vitest and other runner code | 18.0% |
| React and other frameworks | 16.1% |
| DOM category (warpdom + parse5/entities) | 11.3% |
| of which warpdom's own source | 8.0% |
| Testing Library and its helpers | 9.4% |
| other dependencies | 6.1% |
| transforms (Vite, esbuild, Babel, ...) | 4.8% |
| project code (tests, library under test) | 3.7% |
| garbage collection | 3.5% |
| other | 7.9% |

Within warpdom's 7.4 s: interface prototype creation (`materialize`,
window.js) 10.9%; top-level module code (per-process initialization:
css.js 7.3%, window.js 4.0%, interfaces.js 2.2%, ...) 19.2% summed over all
files; live-range bookkeeping on node removal (`ranges.js`) 5.4%; tree
insertion and removal, the cascade and selector matching follow at 1-3%
each.

For comparison: on Radix, jsdom was 50% of a 29.6 s CPU profile; warpdom a
few percent of 14.6 s ([docs/no-isolate-experiment.md](../no-isolate-experiment.md)).

### 3.5 Micro-benchmarks of the 2026-10-11 changes

From PLAN.md ("Decisions", 2026-10-11), measured with bench/window-bench.mjs,
bench/env-bench.mjs and bench/style-miss-bench.mjs:

- Interfaces created on first use: createWindow 2.75 ms -> 0.42 ms; Vitest
  environment setup + teardown per test file 3.0 ms -> 0.63 ms; module
  load 25.4 -> 26.7 ms with the CSS grammars (once per worker).
- CSS value validation: repeated style writes unchanged (~130 ns, cached);
  unique values 449 -> 562 ns per write (+25%).

**ariakit, 2026-10-12** (both DOMs; profiles ran while the laptop was
also running timing, so CPU shares are usable and wall times are not):
[data/profile/ariakit-jsdom-2026-10-12.profile-share.txt](data/profile/ariakit-jsdom-2026-10-12.profile-share.txt),
[data/profile/ariakit-warpdom-2026-10-12.profile-share.txt](data/profile/ariakit-warpdom-2026-10-12.profile-share.txt)
(JSON with idle time next to them),
[data/profile/ariakit-warpdom-2026-10-12.top-dom.txt](data/profile/ariakit-warpdom-2026-10-12.top-dom.txt).

| | jsdom | warpdom |
| --- | --- | --- |
| CPU in test processes | 321.7 s | 180.5 s (-44%) |
| of which DOM | 130.9 s (40.7%) | 17.5 s (9.7%), 7.5x less |
| idle in test processes (summed) | 871.9 s | 824.7 s |

warpdom removes most of ariakit's DOM cost, but the suite is
wait-bound: its test processes are idle for about 4.6x as long as they
compute. The waits come from ariakit's own interaction helpers
(`@ariakit/test`, `sleep.ts`). After every simulated click, key press or
hover they await two animation frames and a 4 ms timer. Animation frames
in jsdom and warpdom fire on a real 60 Hz clock (16.7 ms), so every
interaction costs at least about 37 ms of wall time regardless of the DOM.
Within warpdom's CPU, the top functions are the cascade (`ruleIndex`,
`computedValue`, `cascaded`: about 10%), the 1 ms clock behind
`performance.now` and frames, interface creation (`materialize`, 3%) and
event dispatch.

**Per operation, three DOMs** (bench/hot.js: the hottest members in the
traced corpus; ns per operation, median of 3 runs; laptop, Node 22.23.3,
warpdom 2e0293c, jsdom 30.1.2, happy-dom 20.14;
[data/hot-2026-10-12-three-dom.txt](data/hot-2026-10-12-three-dom.txt)):

| Operation | warpdom | jsdom | happy-dom | jsdom / warpdom | happy-dom / warpdom |
| --- | --- | --- | --- | --- | --- |
| appendChild (build 1000) | 87.6 | 762.1 | 353 | 8.7x | 4.0x |
| insertBefore first (1000) | 123.7 | 1,129 | 978.3 | 9.1x | 7.9x |
| removeChild all (1000) | 167.7 | 1,431 | 1,121 | 8.5x | 6.7x |
| nextSibling walk | 11.4 | 45.9 | 88.1 | 4.0x | 7.7x |
| previousSibling walk | 11.5 | 44.7 | 90.2 | 3.9x | 7.8x |
| parentNode chain (depth 20) | 7.4 | 45.5 | 9.2 | 6.1x | 1.2x |
| childNodes[i] loop | 107.6 | 202.3 | 79.1 | 1.9x | 0.7x |
| firstElementChild + nextElementSibling | 9.8 | 47.6 | 87.8 | 4.9x | 9.0x |
| getAttribute | 17.2 | 55.3 | 59.6 | 3.2x | 3.5x |
| setAttribute | 50.6 | 175.4 | 553.3 | 3.5x | 10.9x |
| getElementById (1000 elements) | 38.2 | 163.9 | 44.8 | 4.3x | 1.2x |
| dispatchEvent (depth 20, document listener) | 1,435 | 3,947 | 5,296 | 2.7x | 3.7x |
| querySelector #id | 50.1 | 1,188 | 50.4 | 23.7x | 1.0x |
| querySelectorAll [data-index="999"] | 106.8 | 358,920 | 61.3 | 3,361x | 0.6x |
| querySelectorAll * (Testing Library) | 107.7 | 41,555 | 56.2 | 386x | 0.5x |
| querySelectorAll after a change (uncached) | 17,428 | 371,456 | 107,873 | 21.3x | 6.2x |
| matches("div > span:nth-child(odd)") | 21.4 | 579 | 24.5 | 27.1x | 1.1x |
| closest("[data-index]") | 114.8 | 7,912 | 242.6 | 68.9x | 2.1x |

warpdom is faster than jsdom on every operation (2-9x on tree and
attribute operations, 24-3,361x on selector queries, which jsdom matches
without caching). happy-dom is faster on repeated querySelectorAll calls
on an unchanged tree (it serves them from a cache: 56-61 ns vs warpdom's
107-108 ns) and on `childNodes[i]` loops; once the tree changes, a query
costs warpdom 6.2x less. Micro-benchmarks explain where suite time goes
but do not predict suite speedups (section 3.4).

### 3.6 GitHub Actions, 2026-10-12: three DOMs, fast mode, WPT

All on hosted Linux runners (2 cores), corpus at the commits in
`dom-api-tracer/corpus/pins.json`, warpdom main as of each run, Node
22.23.3, 3 rounds, configurations alternating within one job. Speedups are
medians of per-round ratios.

**Three-way** (run 38201339795, warpdom 42e87b2 with the svelte fixes;
[data/timing/ci-2026-10-12-three-way/](data/timing/ci-2026-10-12-three-way/)).
handsontable is left out: its jsdom run of the core package exceeded the
harness's 20-minute limit in every round, so the comparison counted all
of warpdom's core results as differences (warpdom itself passed 7,612 of
7,615, as before). The harness now uses a 45-minute limit and marks a round
with a failed package as NA (dom-api-tracer b25a690).

| Suite | jsdom | warpdom | happy-dom | warpdom vs jsdom | happy-dom vs jsdom | warpdom vs happy-dom | differ from jsdom: warpdom / happy-dom |
| --- | --- | --- | --- | --- | --- | --- | --- |
| material-ui | 472.4 s | 247.2 s | 333.8 s | 1.90x | 1.41x | 1.36x | 1 / 1,039 |
| radix-primitives | 44.4 s | 23.6 s | 29.6 s | 1.88x | 1.51x | 1.25x | 0 / 18 |
| ark-ui | 235.2 s | 143.0 s | 163.8 s | 1.60x | 1.45x | 1.15x | 2 / 115 |
| floating-ui | 29.4 s | 18.8 s | 22.6 s | 1.57x | 1.30x | 1.20x | 0 / 14 |
| ariakit | 829.6 s | 539.6 s | 462.6 s | 1.54x | 1.79x | 0.86x | 11 / 51 |
| vuetify | 80.5 s | 52.0 s | 53.1 s | 1.54x | 1.53x | 1.01x | 0 / 4 |
| emoji-picker-element | 53.1 s | 40.2 s | 46.0 s | 1.32x | 1.16x | 1.14x | 0 / 1 |
| react-hook-form | 23.8 s | 17.5 s | 22.3 s | 1.32x | 1.04x | 1.28x | 0 / 7 |
| react-spectrum | 709.9 s | 550.7 s | 628.4 s | 1.26x | 1.20x | 1.17x | 0 / 1,445 |
| CopilotKit | 468.5 s | 373.9 s | 50.9 s | 1.25x | 9.01x | 0.13x | 0 / 4,676 |
| analog | 41.2 s | 33.5 s | 35.9 s | 1.25x | 1.15x | 1.07x | 0 / 2 |
| svelte | 137.9 s | 125.2 s | 126.4 s | 1.10x | 1.09x | 1.01x | 1 / 288 |
| solid | 5.2 s | 4.8 s | 4.7 s | 1.08x | 1.11x | 0.94x | 1 / 0 |

- Medians over these 13 suites: warpdom vs jsdom **1.32x**, happy-dom vs
  jsdom 1.30x, warpdom vs happy-dom 1.14x.
- **Uncertainty** (timing-report.cjs, dom-api-tracer b7f3188 of
  2026-10-12; [report](data/timing/ci-2026-10-12-three-way/report-without-handsontable.md)):
  - Within a suite, the 3 per-round ratios are tight: most within ±3%
    (MUI 1.89-1.92x, ariakit 1.53-1.54x, Radix 1.85-1.92x). React
    Spectrum is the exception, 1.23-1.59x, from one outlying round.
  - The median across suites has a 95% bootstrap interval of
    **1.25-1.57x** (warpdom) and 1.15-1.51x (happy-dom), resampling suites
    and their rounds.
  - That width comes from which suites are in the corpus, not from timing
    noise: the speedups fall into two groups (about 1.1-1.3x and 1.5-1.9x),
    and the median sits between them. A headline "median" should always be
    given with this interval and the per-suite table.
- warpdom is faster than jsdom on all 13. happy-dom is faster than warpdom on
  ariakit, solid and (by breaking it) CopilotKit, and about level on
  Vuetify and svelte.
- Correctness separates them: happy-dom changes test results in 12 of 13
  suites (CopilotKit 4,676 tests, React Spectrum 1,445, MUI 1,039, svelte
  288, ark-ui 115). CopilotKit's 9x on happy-dom is largely the suite
  failing fast.
- warpdom's differences:
  - MUI 1, ark-ui 2 and solid 1 are flaky tests that change on jsdom too.
  - svelte's 1 is the DOMException deviation (PLAN.md).
  - ariakit's 11 are its 9 known tests that fail on jsdom and pass on
    warpdom, plus 2 in `shims.jsdom.test.ts`. That file is pinned to jsdom,
    so it first ran on warpdom here. The 2 were a real gap (the
    `modifier*` init members of `getModifierState`), fixed in 0bdec62.
- CopilotKit was also re-run two-way after the broken rounds of run
  38194812094: jsdom 432.9 s, warpdom 342.7 s, 1.26x, 0 differences
  ([data/timing/ci-2026-10-12-copilotkit/](data/timing/ci-2026-10-12-copilotkit/)).

**Fast mode** (run 38201346054, learned.sh, Vitest suites only;
[data/timing/ci-2026-10-12-fastmode/](data/timing/ci-2026-10-12-fastmode/)):

| Suite | jsdom default | warpdom fast mode | mode | Speedup | Differ |
| --- | --- | --- | --- | --- | --- |
| material-ui | 361.9 s | 44.9 s | split | 8.14x | 2 |
| vuetify | 47.2 s | 7.2 s | split | 6.56x | 0 |
| radix-primitives | 51.9 s | 8.6 s | split | 6.03x | 0 |
| CopilotKit | 550.3 s | 314.0 s | split | 1.72x | 0 |
| emoji-picker-element | 52.3 s | 31.6 s | split | 1.67x | 0 |
| ark-ui | 351.6 s | 214.4 s | isolated | 1.64x | 2 |
| floating-ui | 36.9 s | 23.1 s | isolated | 1.60x | 0 |
| ariakit | 673.8 s | 468.5 s | isolated | 1.43x | 14 |
| analog | 31.5 s | 25.7 s | isolated | 1.22x | 0 |
| svelte | 99.4 s | 90.7 s | isolated | 1.08x | 2 |
| solid | 4.6 s | 4.3 s | isolated | 1.05x | 2 |

Median **1.64x** (was 1.20x on 2026-10-10 on the laptop, with older
warpdom). "isolated" means learning kept per-file isolation because it was
faster; then fast mode equals warpdom default.

**Fast frames** (run 38197900923, experiment branch `exp/fast-frames`,
before the pinned-file fix; [data/timing/ci-2026-10-12-fastframes/](data/timing/ci-2026-10-12-fastframes/)):
ariakit 465.2 -> 291.5 s (1.61x over warpdom default, 2.31x over jsdom),
no gain on ark-ui, floating-ui, Radix and Vuetify. It changes results:
ariakit 12 differences instead of 9, ark-ui 6 instead of 3-4. So it can
only be an opt-in, like fast mode (F6).

**WPT** (warpdom run 38201266741, warpdom d1358bf, WPT 87b5d13099, one
job per area; [data/wpt/ci-2026-10-12-summary.md](data/wpt/ci-2026-10-12-summary.md)):

| | warpdom | jsdom 30.1.2 |
| --- | --- | --- |
| Subtests passed | 113,318 of 133,221 (85.1%) | 107,201 (80.5%) |
| Score per file | **72.5%** | 71.1% |
| Files where every subtest passes | 611 | 613 |
| Wall clock, summed over jobs | 676 s | 1,463 s |

Second run the same evening (run 38272794602, warpdom cad3ce8, after the
DOM gaps and WPT work; [data/wpt/ci-2026-10-12-evening-summary.md](data/wpt/ci-2026-10-12-evening-summary.md)):
score per file **75.9%** vs jsdom 71.1%, subtests 87.4% vs 80.4%, html/dom
84.4% vs 68.0%, top-level dom/ 95.9% vs 93.2%, dom/ranges 89.2% vs 88.6%,
dom/nodes 74.0% vs 68.2%. Behind only in dom/events, 78.7% vs 79.8%: the
isTrusted deviation (PLAN.md). Wall clock summed over jobs: 666 s vs
1,397 s.

The first run: warpdom now leads on the per-file score too (2026-10-11: 66.5% vs 71.5%);
html/dom 71.5% vs 68.0%. Behind: the top-level `dom/` files (80.3% vs
93.4%), `dom/events` (77.8% vs 79.8%), `dom/ranges` (87.6% vs 88.6%).

**Safety run after the day's merges** (run 38261958358, one round, jsdom
vs warpdom, 13 suites, warpdom 752c090 with innerText, namespaced
attributes, XPath, the fastFrames opt-in and the getModifierState fix;
[data/timing/ci-2026-10-12-safety/](data/timing/ci-2026-10-12-safety/)):
no test changed from pass to fail in any suite. Differences:
- ariakit 7, all tests that fail on jsdom and pass on warpdom (the 2
  shim tests now pass on both);
- ark-ui 3 and solid 1, flaky tests that also change on jsdom;
- svelte 1, the DOMException deviation;
- 0 in the other 9 suites.

### 3.7 Held-out set, 2026-10-12

Nine projects warpdom was never tuned on (dom-api-tracer
`corpus/held-out.json`, pinned in `corpus/held-out-pins.json`), measured
as warpdom was at 2db6583: per-test status on jsdom and on warpdom, one run
each on the laptop, 2 workers. Nothing was fixed before measuring.
[data/held-out/](data/held-out/) (per-test results of both runs, the
corpus and pin files).

| Project | Kind | Runner / jsdom | Tests | Differ |
| --- | --- | --- | --- | --- |
| naive-ui | Vue | Vitest 4 / jsdom 27.4 | 1,246 | 0 |
| taiga-ui | Angular | Jest 29 / jsdom 20.0 | 2,604 | 0 |
| melt-ui | Svelte 4 | Vitest 1.2 / jsdom 24.0 | 770 | 0 |
| dom-testing-library | framework-free | Jest 29 / jsdom 20.0 | 657 | 1 |
| tanstack-query | 7 frameworks | Vitest 4 / jsdom 27.4 | 2,821 | 2 |
| solid-primitives | Solid | Vitest 2.1 / jsdom 25 | about 920 | 4 |
| vueuse | Vue | Vitest 4 / jsdom 30.0 | 940 | 10 |
| react-router | React | Jest 30 / jsdom 26.1 | 2,446 | 17 |
| downshift | React | Jest 29 / jsdom 20.0 | 1,110 | 24 |

58 of about 13,500 tests differ (0.43%); 4 of 9 projects have none. All 58
pass on jsdom and fail on warpdom. Causes (confirmed by a probe outside the
suite unless marked):
- **Internal state visible to Jest's equality (7, react-router):** warpdom
  keeps state in an own enumerable symbol property on some objects
  (FormData, AbortSignal); `toEqual` and snapshots see it.
- **`history.back()`/`go()`/`forward()` are no-ops (8, react-router).**
- **A test replaces `global.document` (19, downshift):** warpdom's
  `window.document` is writable, jsdom's is a getter without a setter, so
  there the assignment is ignored.
- **The jsdom 20 profile:** jsdom 20 serializes `border: 0` as `0px` and
  drops `clip: rect(0 0 0 0)` (5, downshift); warpdom's oldest modeled
  version was 25. jsdom 20 also logs "Not implemented" for
  `getComputedStyle(el, pseudo)` (1, dom-testing-library).
- **Missing `CloseEvent` (5, vueuse).**
- **`Event.timeStamp`** is relative to the time origin in warpdom and can be
  0 under fake timers; jsdom's is a Date.now() value (4, vueuse).
- **`<input type=image>` submitter coordinates** in form data (2,
  react-router).
- **`CSSStyleSheet.ownerNode`** returns jsdom 27's internal object, without
  an `id` (1, tanstack-query).
- Not yet explained: requestAnimationFrame under Vitest's fake timers with
  `isolate: false` (4, solid-primitives; likely), Lit context reconnection
  under fake timers (1, tanstack-query), a Vue CSS variable switch (1,
  vueuse).

`warpdom compare --correctness` on three of them (dom-testing-library,
react-router, vueuse) found the same differences as the harness. It
needed `NODE_OPTIONS=--experimental-vm-modules` for react-router and gave
no hint; it still runs browser-mode projects it does not compare.

**Timing before the fixes** (GitHub Actions run 38280058454, warpdom
3275164, three DOMs, 3 rounds;
[data/held-out/ci-2026-10-12-before-timing/](data/held-out/ci-2026-10-12-before-timing/)):

| Project | jsdom | warpdom | happy-dom | warpdom vs jsdom | differ: warpdom / happy-dom |
| --- | --- | --- | --- | --- | --- |
| vueuse | 60.0 s | 32.7 s | 49.5 s | 1.84x | 10 / 58 |
| downshift | 14.4 s | 8.4 s | 9.8 s | 1.71x | 24 / 19 |
| tanstack-query | 83.8 s | 55.8 s | 65.4 s | 1.50x | 2 / 1 |
| melt-ui | 46.8 s | 33.1 s | 40.4 s | 1.41x | 0 / 10 |
| dom-testing-library | 6.5 s | 5.0 s | 5.7 s | 1.30x | 1 / 23 |
| naive-ui | 334.1 s | 298.7 s | 316.3 s | 1.12x | 0 / 23 |
| taiga-ui | 595.1 s | 589.5 s | 87.9 s | 1.01x | 0 / 2,604 |
| react-router | 48.7 s | 48.9 s | 50.8 s | 1.00x | 17 / 83 |
| solid-primitives | 3.8 s | 21.9 s | 3.4 s | **0.18x** | 8 / 13 |

- Median warpdom vs jsdom over the 9 unseen projects: 1.30x (95% bootstrap
  interval 1.01-1.71x); happy-dom vs jsdom 1.16x (1.06-1.47x).
- **solid-primitives was 5.7x slower on warpdom**: its animation frames
  ran on Node's timer captured when the window was created, not on the
  global's, so Vitest's fake timers did not advance them and tests waited
  in real time (the cause the held-out fixes found; fixed in c4c9571,
  after which solid-primitives took 4.5 s against jsdom's 5.2 s). An unseen
  suite can hit a slow path that no tuning suite exercised.
- happy-dom changed 2,604 of taiga-ui's results (the whole suite), which is
  why its time there is low.

**After the fixes** (warpdom c4c9571, which merged the held-out fixes;
GitHub Actions run 38284524015, one round, jsdom vs warpdom, each project
on its own runner;
[data/held-out/ci-2026-10-12-after/](data/held-out/ci-2026-10-12-after/)):
**1 differing test** in the 9 projects, the deliberate deviation in
tanstack-query (jsdom 27-29's CSSStyleSheet.ownerNode, PLAN.md); 0 in the
other 8. warpdom is faster on all 9 (one round, indicative):

| Project | jsdom | warpdom | Ratio |
| --- | --- | --- | --- |
| melt-ui | 79.0 s | 26.0 s | 3.04x |
| vueuse | 91.5 s | 46.9 s | 1.95x |
| tanstack-query | 128.7 s | 82.5 s | 1.56x |
| downshift | 14.4 s | 9.5 s | 1.52x |
| dom-testing-library | 6.0 s | 4.9 s | 1.22x |
| solid-primitives | 5.2 s | 4.5 s | 1.16x |
| naive-ui | 245.1 s | 224.3 s | 1.09x |
| react-router | 43.2 s | 40.8 s | 1.06x |
| taiga-ui | 638.1 s | 614.7 s | 1.04x |

The fixes were driven by these 9 projects, so after them the set is no
longer held out; the "before" numbers above remain the held-out result.
A new held-out set is needed to measure parity on unseen suites again.

What this says about the corpus result: parity on unseen suites is high
(99.6% of tests) but not exact. Most causes are classes of behavior that
the tuning corpus did not exercise (history traversal, jsdom 20,
assignment to `document`, Jest's deep equality on DOM objects), not
one-off bugs. Several affect many tests at once, so fixing a cause matters
more than the count. Rejected candidates and why: dom-api-tracer
`scripts/research/README.md`, "Held-out set".

## 4. Findings

**F1. "jsdom-compatible" is not one target: suites encode the jsdom
version they were written against.** Observed behavior changes tests
depend on (PLAN.md, 2026-10-11 decision; data/css/sweep*.json):
getComputedStyle left most undeclared values empty before jsdom 29 and
gives initial values since (react-aria relies on the empty values, MUI on
opacity 1); no PointerEvent or pointer handlers before 27 (click() fires a
MouseEvent); computed styles accept writes before 28 (react-aria fakes
position: relative on them); focus() ignores display: none and [hidden]
before 30.1.2, a patch release; CSS value validation for every known
property from 27 (jsdom 26 rejects an invalid value for 57 of the 595
properties it knows; 27 for all 637, 30 for all 814); a `CSS` namespace
only from 30; jsdom 26 does not shorten box shorthands (margin: 0 0 stays
0px 0px). Jest 30's jest-environment-jsdom bundles jsdom 26 while Vitest
projects use whichever jsdom they install, so one corpus needs several
behaviors at once. warpdom takes a jsdom version (`createWindow({ jsdom })`), detected
by its adapters from the installed jsdom, and follows the observable
behavior of that version. Up to jsdom 26 the version alone is not enough:
CSS behavior follows the cssstyle 4.x the lockfile resolved (svelte's
jsdom 25.0.1 with cssstyle 4.1.0: undeclared computed color '' instead of
canvastext, url() without quotes), so the adapters pass that version too
(PLAN.md, 2026-10-12).

**F2. Spec-generated CSS value validation can match jsdom without false
rejections and at little cost.** Grammars generated from the
specifications' value definitions (@webref/css), matched by a small
tokenizer, failing open where a grammar is unreadable or a type is defined
only in prose, cached per property and value and per value shape (numbers
replaced by their class). Against jsdom 30 over 35,420 property/value
pairs, 0 values jsdom accepts are rejected; 1,101 values jsdom rejects are
accepted (fail-open) (PLAN.md; data/css/val-parity-jsdom30.json; script
`dom-api-tracer/scripts/research/css-parity/val-parity.mjs`). Whole-suite
cost not measurable (3.2); this fixed react-spectrum's last
differences (`width: undefined%`) and most of handsontable's.

**F3. Lazy interfaces make per-file setup nearly free.** A window used to
define about 300 interfaces with thousands of members; a test touches a
few dozen. Creating each interface on first access (constructor
properties start as accessors) cut window creation 2.75 -> 0.42 ms and
per-file environment setup 3.0 -> 0.63 ms while keeping per-window
prototypes, so a prototype mock cannot leak into the next file (3.5).

**F4. Once the DOM is fast, the runner, framework and module loading
dominate.** On MUI warpdom is 8% of CPU; Node internals, Vitest, React and
Testing Library are 63% together (3.4). Whole-suite speedups therefore
follow the suite's DOM share: 13.7x for handsontable's DOM-heavy core but
1.0-1.2x for wait- or logic-heavy suites (ariakit, CopilotKit; svelte
and solid are to be re-measured, see the correction in section 3). The largest remaining multiples come from not paying
per-file isolation: warpdom's in-place reset makes fast mode correct
where a fresh jsdom window per file breaks suites (Radix: 605 differences
with fresh jsdom windows, 0 with warpdom's reset; docs/head-to-head.md),
giving 3.3-6.1x on MUI, Radix and Vuetify.

**F5. Exact per-test parity is reachable on large suites.** 10 of 14
projects (42,139 baseline tests in all 14) have no status difference; the
remaining 15 differences are explained (3.1). Differences are also a
bug-finding signal in the other direction: ariakit's 9 tests fail on
jsdom and pass on warpdom.

**F6. Some suites are bound by real-time waits, not by the DOM.**
ariakit's DOM CPU drops 7.5x on warpdom, but its run time only 1.10x. Its
test helpers wait for animation frames, which jsdom and warpdom pace with
real time (3.4). A faster DOM cannot shorten those waits. Making frames
fire without the real-time wait could ("fast frames"). That changes the
order of frames relative to short timers, so it would be an opt-in that
needs per-test verification. Measured on GitHub Actions (3.6): ariakit 1.61x faster than warpdom's
default, no change on ark-ui, floating-ui, Radix and Vuetify, and about 6
more test differences across ariakit and ark-ui. Built as an opt-in, the
`fastFrames` option (docs/fast-frames.md); `warpdom compare
--fast-frames` shows a suite's gain and the tests it changes.

**F7. Why the speedup varies between suites.** A suite's time is DOM work
plus everything else (compiling, framework, runner, test code, waiting),
and warpdom changes only the first. Three effects explain the spread
from 1.01x to 3.09x:
1. **The DOM share.** It is high in MUI, Radix and handsontable, and low
   in wait-bound ariakit (F4, F6).
2. **The mix of DOM operations.** warpdom is not uniformly faster. The
   cascade (`getComputedStyle`) does real work in both DOMs and
   dominates warpdom's own profile on MUI and ariakit.
3. **Fixed costs in small suites** (open). The first explanation of
   solid's slowdown (a one-time cost of about 0.8 s per worker from
   loading warpdom as a custom environment) was wrong. Per-file timings
   (run 38197895182) did show that cost on the first file of each worker,
   but a CPU profile showed why: 14 of solid's files pinned jsdom with a
   comment, so the "warpdom" run loaded both DOMs. That is the correction
   at the top of section 3. Whether small suites lose to fixed costs
   remains to be measured with all files on warpdom.

The same per-file comparison is planned for `warpdom compare`
([docs/compare.md](../compare.md)), so users can see which of their files
gain or lose.

## 5. Threats to validity

- **Few rounds, no confidence intervals.** 3 rounds per configuration;
  medians only. Machine load varied between sessions (jsdom 5-13% faster in
  the second 2026-10-11 session; load average up to 14 on 2026-10-09).
- **Mixed dates and warpdom versions** in the speed table; only the
  2026-10-11 rows (MUI, react-spectrum, handsontable) are current.
- **Corpus commits not pinned** before 2026-10-12. Project commits were
  not recorded for the earlier runs. record-env now records them, and
  `dom-api-tracer/corpus/pins.json` pins 18 projects for the GitHub
  Actions runs; CopilotKit's checkout lost builds
  between surveys, shrinking its coverage. 7 jsdom baselines are from
  2026-10-08 and were not re-run with the warpdom runs.
- **Flaky tests** (ark-ui Editable, solid transition.spec under
  `isolate: false`) make single-run difference counts noisy by 1-2.
- **The harness copies warpdom into each package** and overrides the
  environment through a wrapper config; a real installation could differ
  (e.g. module resolution), though the copy mimics an installed package.
- **Profiling overhead**: shares come from `--cpu-prof` runs, which are
  slower than timed runs.
- **Selection bias** (now measured on a held-out set, 3.7: 0.43% of tests differ there, against almost none in the corpus). Most projects were added because they test with
  jsdom and run in Node; real-browser suites (most web-component
  libraries) are out of scope. Compatibility fixes were driven by this
  same corpus, so parity on it overstates parity on unseen suites; a
  held-out set is needed.
- **happy-dom is only in the 2026-10-09 head-to-head** (3 suites);
  linkedom is in no comparison.
- **Hardware**: one Apple M4 Pro laptop for all results up to 2026-10-12.
  Linux numbers from GitHub-hosted runners are being collected (2.4,
  2.7). Runners are shared virtual machines, so their noise differs from
  the laptop's.
- **Harness limits can masquerade as differences.** A package that
  times out or produces no results on one DOM made every test in it count
  as a difference (handsontable, 2026-10-12). Rounds with a failed package
  are now NA, and jsdom rounds that disagree with the jsdom baseline in
  more than 5 tests are flagged.
- **Concurrent load on the laptop** is not always visible to the
  measurement: other jobs ran on timers during some sessions, and on
  2026-10-12 a profiling run overlapped one timing round (3.2). This is
  why the reference timing moved to GitHub Actions.

## 6. Open work for a paper

1. **WPT conformance number** for warpdom (and jsdom, happy-dom on the same
   subset), to complement corpus parity.
2. **happy-dom and linkedom in every comparison** (correctness and speed),
   not only 3 suites.
3. **More rounds and confidence intervals**: at least 5 alternating rounds,
   bootstrap intervals on the ratios, one quiet machine, one session for
   all suites.
4. **Pinned corpus**: record-env output with every run; publish the
   commits and lockfiles; re-run all 14 baselines with the warpdom runs.
5. **A real application suite** (not a library), and a held-out set of
   projects not used to drive compatibility work.
6. Re-time the 2026-10-09 rows (and Jest's react-hook-form) with current
   warpdom; profile handsontable core, whose 2026-10-11 gain is larger than
   cheaper startup explains (PLAN.md).
7. Linux CI timings (the setting where test time costs money): the GitHub
   Actions workflow exists (2.4); the first full 14-suite run is from
   2026-10-12.

## 7. Reproduction

**Suite timings from this repository (from 2026-10-12):**
[bench/corpus/README.md](../../bench/corpus/README.md) has the corpus files
with their pinned commits, the tools (`checkout.mjs`, `time.mjs`,
`report.mjs`, built on `compare()`, the code behind `warpdom compare`), the
`corpus-timing` GitHub Actions workflow, the exact commands for each
published table, the expected runtimes and what each output means. For
example, the three-way table of 3.6:

```sh
node bench/corpus/checkout.mjs --repos-dir ~/corpus-repos <projects...>
node bench/corpus/time.mjs --repos-dir ~/corpus-repos --rounds 3 --csv timing.csv <projects...>
node bench/corpus/report.mjs timing.csv
```

or `gh workflow run corpus-timing.yml -f projects=<a,b> -f rounds=3`.
The numbers published up to 2026-10-12 were measured with dom-api-tracer's
harness, described below; bench/corpus/README.md lists how the two differ
(checked to give the same tests, differences and times on react-hook-form
and floating-ui). Fast mode, the vm pool, per-file timings and profiles are
not ported yet and remain as below.

**Up to 2026-10-12 (dom-api-tracer):** Prerequisites: corpus checkouts under `~/Projects/<name>` with installs
and builds as `dom-api-tracer/corpus/corpus.json` describes; warpdom at
`~/Projects/warpdom` (or `WARPDOM_DIR`); nvm with Node 22.23.3. Run one
corpus command at a time, on an otherwise idle machine. From
`dom-api-tracer/` (all scripts in `scripts/research/`, see its README):

1. **Correctness:** `scripts/research/survey-warpdom.sh <projects...> | tee survey.log`
   (creates jsdom baselines where missing); then
   `node scripts/research/diffgroups.cjs <project>` for each project with
   differences.
2. **Speed:** `scripts/research/timing-vitest.sh .corpus-env/timing-<date>.csv 3 <vitest projects>`
   and `scripts/research/timing-jest.sh .corpus-env/timing-jest-<date>.csv 3 <jest projects>`;
   `node scripts/research/timing-report.cjs <csv>`.
3. **Fast mode and head-to-head:** `scripts/research/learned.sh <csv> 3 <projects>`,
   `scripts/research/headtohead.sh <csv>`.
4. **Profile:** `node scripts/trace-corpus.mjs --repos-dir ~/Projects --only material-ui --environment warpdom --profile --max-workers 2 --out .corpus-env/prof-mui`,
   then `node scripts/profile-share.mjs .corpus-env/prof-mui/profiles` and
   `node scripts/research/prof-top-dom.cjs .corpus-env/prof-mui/profiles`.
5. **CSS parity (seconds, no corpus):**
   `node scripts/research/css-parity/val-parity.mjs <warpdom> jsdom out.json`,
   `val-sweep.mjs jsdom26|jsdom`, `shorthand-sweep.mjs`, `shorthand-sets.mjs`,
   `zero-run.mjs`.
6. **Micro-benchmarks (warpdom):** `npm run bench:load`, `npm run bench:hot`,
   `node bench/<name>-bench.mjs [checkout]` per [bench/README.md](../../bench/README.md).

**Without a laptop:** run the `timing` workflow in dom-api-tracer
(Actions, "timing", "Run workflow"; or `gh workflow run timing -f
projects=<a,b> -f rounds=3 [-f warpdom_ref=<ref>] [-f "configs=..."]
[-f perfile=true]`). The run's summary page shows the table; the
`timing-report` artifact has the combined CSV, environment records and
per-file timings.

Survey and timing scripts write an environment record (commits of all
corpus checkouts, warpdom, Node, OS, CPU, memory) next to their output.
