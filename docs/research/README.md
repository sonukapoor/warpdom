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

### 2.5 Profiling

`trace-corpus.mjs --profile` runs every test process with `--cpu-prof`.
`dom-api-tracer/scripts/profile-share.mjs` splits sampled CPU time (idle
excluded) into DOM, framework, Testing Library, runner, transforms, project
code, GC, Node internals and other; built-in frames are charged to their
nearest caller with a source file. `scripts/research/prof-top-dom.cjs`
ranks functions within warpdom's own files. Profiled runs are slower than
timed runs and are used only for shares, never for speedups.

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

## 3. Results

### 3.1 Correctness (RQ1)

Latest full survey, 2026-10-11 afternoon (warpdom code as merged to main,
up to commit fcd0b51 by timestamp; the commit was not recorded):
[data/surveys/survey8.log](data/surveys/survey8.log). "Tests" is the
number of test entries in the jsdom baseline.

| Project | Tests | jsdom passed | warpdom passed | Differ | Earlier | Remaining differences |
| --- | --- | --- | --- | --- | --- | --- |
| react-spectrum | 8,446 | 8,317 | 8,317 | **0** | 304 (2026-10-10, survey-jest.log) | |
| handsontable | 8,062 | 8,062 | 8,059 | 3 | 16 (2026-10-11 morning, survey3.log); 8,418 on the first Jest run (survey-jest.log) | all 3 in `jsdomThemeCssFilter.unit.js`, which tests a workaround for a style-sheet parse error only jsdom reports; warpdom deliberately does not reproduce the error |
| svelte | 7,873 | 7,818 | 7,818 | **0** | 0 (2026-10-09, survey.log) | |
| material-ui | 6,751 | 5,878 | 5,878 | **0** | 0 (survey3.log) | |
| CopilotKit | 3,427 | 2,275 | 2,275 | **0** | 362 (survey.log) | coverage dropped: see below |
| ariakit | 1,852 | 1,811 | 1,820 | 9 | 59 (survey.log) | all 9 fail on jsdom and pass on warpdom (proxy defineProperty, a CompositionEvent view check; PLAN.md "Corpus") |
| react-hook-form | 1,505 | 1,505 | 1,505 | **0** | 0 (survey-jest.log) | |
| ark-ui | 1,244 | 1,189 | 1,187 | 2 | 6 (survey.log) | Editable typing race (fails about 1 run in 3 under load); a NumberInput test that also fails on jsdom with the current checkout |
| radix-primitives | 982 | 976 | 976 | **0** | 0 (survey3.log) | |
| vuetify | 822 | 818 | 818 | **0** | 0 (survey3.log) | |
| solid | 480 | 480 | 479 | 1 | 136 (survey.log) | `transition.spec` fails on jsdom too in some file orders (`isolate: false` shares solid's module state) |
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
| svelte | Vitest | timing-2026-10-09.csv | 38.2 s | 36.8 s | 1.04x | | 0 |
| solid | Vitest 2 | timing-2026-10-09.csv | 1.4 s | 1.5 s | 0.93x | learned (isolated): 1.4 s vs 1.5 s (1.07x) | 1 |

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
behavior of that version.

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
1.0-1.2x for compiler-, wait- or logic-heavy suites (svelte, ariakit,
CopilotKit, solid). The largest remaining multiples come from not paying
per-file isolation: warpdom's in-place reset makes fast mode correct
where a fresh jsdom window per file breaks suites (Radix: 605 differences
with fresh jsdom windows, 0 with warpdom's reset; docs/head-to-head.md),
giving 3.3-6.1x on MUI, Radix and Vuetify.

**F5. Exact per-test parity is reachable on large suites.** 10 of 14
projects (42,139 baseline tests in all 14) have no status difference; the
remaining 15 differences are explained (3.1). Differences are also a
bug-finding signal in the other direction: ariakit's 9 tests fail on
jsdom and pass on warpdom.

## 5. Threats to validity

- **Few rounds, no confidence intervals.** 3 rounds per configuration;
  medians only. Machine load varied between sessions (jsdom 5-13% faster in
  the second 2026-10-11 session; load average up to 14 on 2026-10-09).
- **Mixed dates and warpdom versions** in the speed table; only the
  2026-10-11 rows (MUI, react-spectrum, handsontable) are current.
- **Corpus commits not pinned.** Project commits were not recorded for
  these runs (record-env now does this); CopilotKit's checkout lost builds
  between surveys, shrinking its coverage. 7 jsdom baselines are from
  2026-10-08 and were not re-run with the warpdom runs.
- **Flaky tests** (ark-ui Editable, solid transition.spec under
  `isolate: false`) make single-run difference counts noisy by 1-2.
- **The harness copies warpdom into each package** and overrides the
  environment through a wrapper config; a real installation could differ
  (e.g. module resolution), though the copy mimics an installed package.
- **Profiling overhead**: shares come from `--cpu-prof` runs, which are
  slower than timed runs.
- **Selection bias.** Most projects were added because they test with
  jsdom and run in Node; real-browser suites (most web-component
  libraries) are out of scope. Compatibility fixes were driven by this
  same corpus, so parity on it overstates parity on unseen suites; a
  held-out set is needed.
- **happy-dom is only in the 2026-10-09 head-to-head** (3 suites);
  linkedom is in no comparison.
- **Hardware**: one Apple M4 Pro laptop; no Linux/x86 CI numbers.

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
7. Linux CI timings (the setting where test time costs money).

## 7. Reproduction

Prerequisites: corpus checkouts under `~/Projects/<name>` with installs
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

Survey and timing scripts write an environment record (commits of all
corpus checkouts, warpdom, Node, OS, CPU, memory) next to their output.
