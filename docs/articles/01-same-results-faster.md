# jsdom's test results, faster on every suite we measured

<!--
DRAFT, not published. Author: Sonu Kapoor.
Title alternatives (pick one that the final numbers support):
- "jsdom's test results, faster on every suite we measured" (GitHub
  Actions, 2026-10-12: 14 suites, drop-in median 1.32x (95% interval 1.25x-1.57x), range
  1.08x-8.84x; fast mode median 1.64x, up to 8.1x)
- "Same results as jsdom, faster where the DOM is the bottleneck"
- "A test DOM written from the specs: 42,000 tests, jsdom's results"
Decisions (2026-10-12): projects are named (results are verifiable);
the headline is the drop-in median with the per-suite range; mistakes
in our own measurement are reported openly (pinned files).
Every number has a source comment next to it. Paths are relative to the
warpdom repository unless they start with dom-api-tracer/.
-->

If your component tests run on jsdom, a large part of every run is jsdom
itself. When we profiled nine real open-source suites, jsdom was a median
37% of their CPU time. happy-dom, the fast alternative, was a median 9%.
<!-- source: dom-api-tracer/docs/env-experiment.md (2026-10-08, 9 suites); PLAN.md Decisions 2026-10-08 -->

So why not switch to happy-dom? We tried that too. Of nine suites we ran
on both, six have tests that pass on jsdom and fail on happy-dom (ariakit,
AG Grid and Kobalte had none). React Spectrum lost 1,359 of 8,456, MUI 197
of 6,770 (176 of them are tests MUI skips when it is not on jsdom), Element
Plus 133, Radix 18, react-hook-form 7. Some of these are behavior gaps.
Many are tests coupled to jsdom's object shapes: 661 of React Spectrum's
failures come from `jest.spyOn(HTMLElement.prototype, 'offsetWidth', 'get')`
style mocks of getters that happy-dom defines somewhere else. The speedup
was real but uneven: a median 1.4x in wall time, from 0.8x (react-hook-form
got slower) to 3.4x.
<!-- source: dom-api-tracer/docs/env-experiment.md, results table and "Why tests fail on happy-dom" -->

This article is about a third option I have been building: **warpdom**, a
DOM implementation for unit and component tests that installs as a Vitest
or Jest environment in place of jsdom. The goal is narrow: give every test
the same result it gets on jsdom, and get there faster. warpdom is private
and unreleased. Before asking anyone to try it, I want to show the
evidence, including where it does not win.

## The approach

**Written from the specifications.** warpdom is an independent
implementation of the WHATWG DOM and HTML standards and CSSOM. It is not a
fork or a wrapper of jsdom or happy-dom, and I did not read their source.
jsdom is the black-box reference for behavior: when a test can observe a
difference, I check what jsdom does and write a parity test. Data tables
(interfaces, reflected attributes, CSS value grammars) are generated from
the specs' machine-readable definitions (@webref/idl and @webref/css).
HTML parsing uses parse5.
<!-- source: PLAN.md Decisions 2026-10-09 "warpdom is written from the specs, not from jsdom"; 2026-10-11 CSS value validation -->

**Scoped by what tests actually use.** Before writing any code I built a
tracer that records which DOM APIs real test suites call. On 20 projects
(4,151 test files, about 80,000 tests), tests used about 17% of jsdom's
catalog of DOM members.
<!-- source: PLAN.md Status (2026-10-08): "per environment 17.1% of jsdom's catalog" -->

**Built for near-free startup.** Test runners give every test file a
fresh environment, so loading the DOM library is paid over and over. An
early spike showed that loading jsdom costs about 176 ms per fresh worker
(happy-dom about 85 ms), and that across 33 Vitest packages environment
setup is a median 29% of run time. warpdom creates interfaces only when a
test first touches them: creating a window went from 2.75 ms to 0.42 ms
with that change, and later to 0.18 ms.
<!-- source: PLAN.md Decisions 2026-10-09 "Fast-start spike succeeded" and "Per-file setup is half of test time"; 2026-10-11 "Interfaces are created on first use" (2.75 -> 0.42 ms) and "Descriptors are built on first use too" (0.38 -> 0.18 ms). Micro-benchmarks on Node 22.17.1. -->

**Measured per test, not per suite.** "The suite still passes" hides too
much. For every project we run jsdom and warpdom and compare the status
(pass, fail, skip) of every single test, keyed by package, file and full
test name. A test that fails on jsdom and passes on warpdom also counts as
a difference. Every compatibility fix in warpdom was driven by these
differences, grouped by error message and investigated one at a time.
<!-- source: docs/research/README.md 2.3 -->

## How we measured

- **Corpus:** 14 open-source projects, run with their own test runner
  binary and their own config. A harness writes a temporary wrapper config
  next to the project's config that swaps the test environment; it never
  edits project files.
- **Runners:** Vitest (11 projects) and Jest (3 projects). The jsdom
  baseline is the jsdom the project installs (Jest 30's
  `jest-environment-jsdom` bundles jsdom 26).
- **Timing:** on GitHub Actions, one job per project on a hosted Linux
  runner, each project checked out at a pinned commit. Within a job,
  jsdom and warpdom alternate for 3 rounds on the same machine, so a
  ratio never mixes machines. Medians; the speedup is the median of the
  per-round ratios. 2 test workers, Node 22.23.3. Anyone with access can
  rerun the workflow.
- **Correctness:** the status of every test on warpdom against the jsdom
  baseline, in every timed run. A jsdom run that disagrees with its own
  baseline marks the run as broken, so its time is not used.
- **Scripts and data:** `dom-api-tracer/scripts/research/` and
  `.github/workflows/timing.yml`; raw CSVs, logs and environment records
  in warpdom's `docs/research/data/` and the workflow's artifacts.
<!-- source: docs/research/README.md 2.1-2.4, 2.7; dom-api-tracer/scripts/research/README.md "Timing on GitHub Actions" -->

## Evidence 1: the same result for (almost) every test

The latest full survey (2026-10-11) covers 42,139 test entries across the
14 projects. Ten projects have **zero** tests with a different status.
<!-- source: docs/research/README.md 3.1; docs/research/data/surveys/survey8.log -->

| Project | Kind | Runner | Tests | Tests that differ from jsdom |
| --- | --- | --- | --- | --- |
| react-spectrum | React design system, accessibility | Jest | 8,446 | **0** (304 a day earlier) |
| handsontable | data grid | Jest | 8,062 | 3 |
| svelte | framework runtime | Vitest | 7,879 | 1 (a deliberate deviation, below) |
| material-ui (MUI) | React design system | Vitest | 6,751 | **0** |
| CopilotKit | app components, 4 frameworks | Vitest | 3,427 | **0** |
| ariakit | React + Solid accessibility | Vitest | 1,852 | 9 |
| react-hook-form | React forms | Jest | 1,505 | **0** |
| ark-ui | headless, 4 frameworks | Vitest | 1,244 | 2 |
| radix-primitives | React headless | Vitest | 982 | **0** |
| vuetify | Vue design system | Vitest | 822 | **0** |
| solid | framework runtime | Vitest 2 | 482 | **0** (re-measured 2026-10-12) |
| floating-ui | positioning | Vitest 3 | 339 | **0** |
| analog | Angular meta-framework | Vitest | 196 | **0** |
| emoji-picker-element | web component, shadow DOM | Vitest 3 | 160 | **0** |

"Tests" counts test entries in the jsdom baseline, including skipped ones
(MUI has 6,751 entries, of which 5,878 pass on both).

The remaining differences, and what causes each:

- **ariakit, 9:** all nine fail on jsdom and pass on warpdom (a proxy
  `defineProperty` case and a `CompositionEvent` view check). They count
  as differences because the goal is jsdom's results, not "more passing".
- **handsontable, 3:** all in `jsdomThemeCssFilter.unit.js`, which tests
  handsontable's workaround for a style sheet parse error that only jsdom
  reports. warpdom deliberately does not reproduce that error.
- **ark-ui, 2:** an Editable test with a typing race that fails about one
  run in three under load, and a NumberInput test that also fails on jsdom
  with the current checkout.
<!-- source: docs/research/README.md 3.1, "Remaining differences"; PLAN.md Corpus -->

Two caveats belong right next to this table. First, CopilotKit's number is
weaker than it looks: in this survey 231 of its test files failed to load
on **both** DOMs because workspace builds were missing in my local
checkout, so it covers 3,427 test entries instead of the 3,910 of earlier
surveys (which showed 0 to 14 differences). Second, these same projects
drove the compatibility work, so parity on them overstates parity on a
suite warpdom has never seen. A held-out set of projects is on the list
below.
<!-- source: docs/research/README.md 3.1 (CopilotKit paragraph) and 5 (Selection bias) -->

### A measurement mistake we caught

Vitest lets a test file choose its environment with a comment,
`/** @vitest-environment jsdom */`, and that comment wins over the config.
Our harness switched only the config. So in every "warpdom" run before
2026-10-12, files with that comment silently stayed on jsdom. Most suites
have none, but svelte has 8 such files holding 84.5% of its tests, and
solid has 14 holding 55.6%. Our earlier "0 differences" for svelte was
largely jsdom compared with jsdom.
<!-- source: docs/research/README.md section 3, "Correction, 2026-10-12" -->

The harness now switches those files too, without editing them, and so
does `warpdom compare`. With the fix, solid has all 482 tests with the
same status. svelte showed 55 real differences:
- 25 came from svelte's jsdom 25 depending on an older cssstyle (the CSS
  library jsdom uses), whose behavior warpdom now follows. Examples: the
  computed `color` of an element, and `url()` written without quotes.
- 29 were real gaps in `<select>` selection, mutation observers on
  nodes moved between documents, inline scripts, `volumechange` and
  `draggable`, all fixed.
- 1 remains on purpose: in Vitest's default pools jsdom's `DOMException`
  is not an `Error` in the test's realm; warpdom's is, as the standard
  says, and one svelte test formats errors differently because of it.
<!-- source: PLAN.md 2026-10-12 entries (jsdom 25 profile, cssstyle); dom-api-tracer ceffbd6 -->

The path there is in the logs: React Spectrum went from 304 differences to
0 in a day; ariakit from 59 to 9; solid from 136 to 1; handsontable from
8,418 on the first Jest run to 16 to 3.
<!-- source: docs/research/README.md 3.1 "Earlier" column; data/surveys/survey.log, survey-jest.log, survey3.log, survey8.log -->

## Evidence 2: speed

Measured on 2026-10-12 on GitHub Actions: one hosted Linux runner (2
cores) per project, pinned commits, 3 rounds with jsdom, warpdom and
happy-dom alternating on the same machine.
<!-- source: docs/research/README.md 3.6; dom-api-tracer Actions run 38201339795 (three-way), 38200262078 (CopilotKit), 38194812094 (handsontable) -->

| Suite | jsdom | warpdom | happy-dom | Tests that differ from jsdom: warpdom / happy-dom | warpdom speedup |
| --- | ---: | ---: | ---: | --- | ---: |
| ariakit | 13m 50s | 9m 00s | 7m 43s | 11 / 51 | 1.54x |
| handsontable* | 13m 46s | 1m 32s | – | 3 / – | 8.84x |
| React Spectrum | 11m 50s | 9m 11s | 10m 28s | 0 / 1,445 | 1.26x |
| MUI | 7m 52s | 4m 07s | 5m 34s | 1 / 1,039 | 1.90x |
| CopilotKit | 7m 48s | 6m 14s | 50.9 s ¹ | 0 / 4,676 | 1.25x |
| ark-ui | 3m 55s | 2m 23s | 2m 44s | 2 / 115 | 1.60x |
| svelte | 2m 18s | 2m 05s | 2m 06s | 1 / 288 | 1.10x |
| Vuetify | 1m 20s | 52.0 s | 53.1 s | 0 / 4 | 1.54x |
| emoji-picker-element | 53.1 s | 40.2 s | 46.0 s | 0 / 1 | 1.32x |
| Radix | 44.4 s | 23.6 s | 29.6 s | 0 / 18 | 1.88x |
| analog | 41.2 s | 33.5 s | 35.9 s | 0 / 2 | 1.25x |
| floating-ui | 29.4 s | 18.8 s | 22.6 s | 0 / 14 | 1.57x |
| react-hook-form | 23.8 s | 17.5 s | 22.3 s | 0 / 7 | 1.32x |
| solid | 5.2 s | 4.8 s | 4.7 s | 1 / 0 | 1.08x |

Times are the median of 3 rounds; the speedup is the median of the
per-round ratios (jsdom and warpdom back to back on the same machine).
¹ CopilotKit runs fast on happy-dom because 4,676 of its tests break
there.

\* handsontable is from the two-way run the same day: in the three-way
run its jsdom core package hit the harness's time limit, so that run says
nothing about it. [TODO: re-run handsontable three-way with the 45-minute
limit]

**warpdom is faster than jsdom on all 14 suites**, from 1.08x to 8.84x.
The suites fall into two groups: about 1.1x to 1.3x (compile-, logic- or
wait-heavy suites) and 1.5x to 1.9x (DOM-heavy ones), with handsontable far
above. A median across them is therefore uncertain: 1.32x over the 13
suites of the three-way run, with a 95% bootstrap interval of 1.25x to
1.57x (resampling suites and their rounds). Within a suite the
measurements are tight: most suites' three rounds agree within 3%. Read
the per-suite table, not the median, and certainly not the 8.84x.
<!-- source: docs/research/README.md 3.6 "Uncertainty"; dom-api-tracer timing-report.cjs b7f3188 -->

**happy-dom is about as fast** (median 1.30x over jsdom), and faster
than warpdom on ariakit and solid. **But it changes test results in 12
of 13 suites**: 4,676 tests in CopilotKit (its 9x is the suite largely
failing fast), 1,445 in React Spectrum, 1,039 in MUI, 288 in svelte.
warpdom's differences are 0 to 2 per suite, except ariakit:
- ariakit's 11 are 9 tests that fail on jsdom and pass on warpdom, plus
  2 that exposed a real gap (`getModifierState` with the `modifier*`
  init members), fixed since.
- The 1s and 2s in MUI, ark-ui and solid are flaky tests that also change
  on jsdom.
- svelte's 1 is the deliberate deviation above.
<!-- source: docs/research/README.md 3.6 -->

The median is modest because a faster DOM only speeds up the part of a run
spent in the DOM. Compiling (svelte), the framework and the runner stay as
they are. On a laptop (Apple M4 Pro, 14 cores) the same suites gain a bit
less (median 1.40x over 12 suites, 2026-10-12, 2 rounds), and ariakit
gains least of all there: 1.10x, against 1.54x on a runner. On a fast
machine, its tests mostly wait for real-time timers and animation frames;
on a slower one, more of the run is CPU work. CI runners are where test
time costs money, so they are the better reference.
<!-- source: docs/research/README.md 3.2 "Re-timing, 2026-10-12", 3.4 (ariakit profile), F6 -->

handsontable shows where the gain comes from. Split by package (round 3
of the same run):

| Package | Files | Tests | jsdom | warpdom | Speedup |
| --- | --- | --- | --- | --- | --- |
| core | 520 | 7,615 | 759.4 s | 56.4 s | 13.5x |
| React wrapper | 18 | 111 | 32.3 s | 11.6 s | 2.8x |
| Vue 3 wrapper | 6 | 42 | 11.1 s | 6.4 s | 1.7x |
| Angular wrapper | 14 | 314 | 22.2 s | 11.3 s | 2.0x |
<!-- source: timing-handsontable artifact of run 38194812094, Jest summaries in timing-*/logs/handsontable/*.log -->

The core package renders tables: our tracer counted 940
`getComputedStyle` calls per test file in it. On the laptop the same
package gains 13.7x; the suite total differs between machines because the
Angular wrapper's compile time weighs more there.
<!-- source: PLAN.md Decisions 2026-10-08 "Handsontable is layout- and style-heavy"; docs/research/README.md 3.3 -->

I set myself a kill criterion before this work: a median under about 1.8x
across 10+ suites in the recommended configuration would mean rethinking
the product. Drop-in, the median is 1.32x (95% interval 1.25x-1.57x), so that alone does not
meet it. Fast mode (below) is the recommended configuration for Vitest:
its median over 11 suites is 1.64x, still under 1.8x, with 6x to 8x on
the suites whose time is DOM work. What the data does show: jsdom's
results on every suite, faster on every suite.

### Against happy-dom

The table above is the head-to-head: happy-dom is a speed alternative to
jsdom, but not a drop-in one. For a suite that already runs on happy-dom,
warpdom is mainly a correctness switch: in the median it is 1.14x faster
than happy-dom, and it is slower on ariakit and solid.
<!-- source: docs/research/README.md 3.6 -->

### Per operation

Whole-suite numbers hide where the difference is. Per DOM operation, on
the hottest members of the traced suites (ns per operation, median of 3
runs on a laptop):

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

warpdom is faster than jsdom on every operation, by 2-9x on tree and
attribute work and by orders of magnitude on selector queries. happy-dom
wins on repeated queries of an unchanged tree, which it serves from a
cache, and on index loops over `childNodes`; after a change, warpdom's
queries are 6x cheaper. None of this predicts a suite's speedup: that
depends on how much of the run is DOM work (next section).
<!-- source: docs/research/README.md 3.5; data/hot-2026-10-12-three-dom.txt -->

### Where the time goes once the DOM is fast

A CPU profile of MUI's four packages on warpdom (2026-10-11, 273 test
files, 92.2 s of sampled CPU):

| Category | Share of CPU |
| --- | --- |
| Node internals (module loading, file system) | 19.1% |
| Vitest and other runner code | 18.0% |
| React and other frameworks | 16.1% |
| DOM (warpdom + parse5) | 11.3% (warpdom's own code: 8.0%) |
| Testing Library | 9.4% |
| everything else | 26.1% |
<!-- source: docs/research/README.md 3.4; data/profile/mui-warpdom-2026-10-11.profile-share.txt. "everything else" = other deps 6.1 + transforms 4.8 + project code 3.7 + GC 3.5 + other 7.9 -->

For comparison, on Radix jsdom was 50% of a 29.6 s CPU profile, and
warpdom a few percent of 14.6 s. A faster DOM has a ceiling: after it, the
runner reloading modules for every test file is the largest cost.
<!-- source: docs/no-isolate-experiment.md "A faster DOM alone has a ceiling" -->

### Not paying for isolation: fast mode and the VM pool

That is why the larger multiples come from not paying per-file isolation.
Running Vitest with `--no-isolate` shares modules between files, but the
DOM leaks between them. Giving each file a fresh jsdom window breaks
suites in another way: on Radix, 605 tests differ, because Testing
Library's `screen` and React hold on to the old `document.body`. warpdom
instead resets its window in place between files (same objects, fresh
state): Radix has 0 differences that way.
<!-- source: docs/head-to-head.md (Radix table, "fresh window" 605); docs/no-isolate-experiment.md "Result: warpdom's per-file reset" -->

Some files still leak module state that no DOM reset can reach (for
example, a module that feature-detects ResizeObserver once at import). So
warpdom's fast mode learns: it times the suite isolated, finds the leaky
files, times a split (leaky files isolated, the rest shared) and keeps the
faster. A file that fails without isolation is re-run isolated, so a
newly leaking file does not show a false failure.
<!-- source: docs/fast-mode.md; docs/no-isolate-experiment.md -->

Measured on GitHub Actions on 2026-10-12, 11 Vitest suites, 3 rounds,
against jsdom's default pool in the same job:

| Suite | jsdom default | warpdom fast mode | Mode learned | Speedup | Tests that differ |
| --- | --- | --- | --- | --- | --- |
| MUI | 361.9 s | 44.9 s | split | **8.14x** | 2 |
| Vuetify | 47.2 s | 7.2 s | split | 6.56x | 0 |
| Radix | 51.9 s | 8.6 s | split | 6.03x | 0 |
| CopilotKit | 550.3 s | 314.0 s | split | 1.72x | 0 |
| emoji-picker-element | 52.3 s | 31.6 s | split | 1.67x | 0 |
| ark-ui | 351.6 s | 214.4 s | isolated | 1.64x | 2 |
| floating-ui | 36.9 s | 23.1 s | isolated | 1.60x | 0 |
| ariakit | 673.8 s | 468.5 s | isolated | 1.43x | 14 |
| analog | 31.5 s | 25.7 s | isolated | 1.22x | 0 |
| svelte | 99.4 s | 90.7 s | isolated | 1.08x | 2 |
| solid | 4.6 s | 4.3 s | isolated | 1.05x | 2 |
<!-- source: docs/research/README.md 3.6; dom-api-tracer Actions run 38201346054 -->

Median 1.64x, never slower than jsdom. "isolated" means learning found
that sharing files did not pay off for that suite, so it runs like warpdom
by default. The big wins need suites whose time is DOM work and whose
files do not leak module state.

Vitest's VM pool (`--pool=vmThreads`) is the other lever, and jsdom users
can sometimes have it already. On MUI, jsdom works with vmThreads (26.8 s)
and warpdom adds only 1.26x on top (21.3 s). warpdom's lead is larger
where jsdom breaks under the pool: on Vuetify, jsdom with vmThreads had
754 tests differ, while warpdom ran in 5.4 s with none (2026-10-09, single
runs). The pool breaks CopilotKit on both DOMs, and on floating-ui
(Vitest 3) warpdom hangs with vmThreads because of a Vitest 3 bug with
environments loaded from outside the project root.
<!-- source: data/timing/timing-2026-10-11-after.csv (MUI vm rows); docs/research/README.md 3.2; docs/head-to-head.md "Two more ways to run" and "Seven more suites" -->

## Evidence 3: Web Platform Tests

Real suites show that warpdom behaves like jsdom where those suites look.
The Web Platform Tests (WPT) are the shared conformance suite that browser
engines test themselves against, so they show how close it is to the
standards everywhere else. I wrote a runner that executes WPT's
testharness.js tests in warpdom and, as a reference, in jsdom 30.1.2, on
the same files.
<!-- source: wpt/README.md -->

The latest run (2026-10-12, on GitHub Actions) covers four areas: `dom`,
`domparsing`, `html/dom` and `css/cssom`; 963 test files, about 133,000
subtests.
<!-- source: docs/research/README.md 3.6; data/wpt/ci-2026-10-12-evening-summary.md (warpdom cad3ce8, WPT 87b5d13099) -->

| | warpdom | jsdom 30.1.2 |
| --- | --- | --- |
| Subtests passed | 116,422 (87.4%) | 107,201 (80.4%) |
| Score per file | **75.9%** | 71.1% |
| Wall clock, summed over jobs | 666 s | 1,397 s |

Two numbers, because they answer different questions:

- **Subtests passed** counts every check once. A few files generate
  thousands of subtests (`dom/ranges` alone has 44,494), so this number is
  dominated by them.
- **Score per file** is how wpt.fyi scores browsers: each file gets
  passed/total, and the files are averaged. A file with 3 subtests weighs
  as much as one with 1,500.

warpdom is ahead on both. Two days earlier it was behind on the score per
file (66.5% against 71.5%), mostly because of `html/dom`, which is now
84.4% against jsdom's 68.0%. It is behind in one area, `dom/events`
(78.7% vs 79.8%), by a deliberate choice: the standard makes `isTrusted`
an own property of every event, and doing that made creating an event 2.3x
slower, for a difference only interface-shape tests can see.

Limits of these numbers: the runner is not a browser. There is no server,
no layout, no user input, no workers and no pages loading in iframes;
tests that need them fail or are skipped (319 files skipped, the same for
both engines). The numbers are for the part of WPT a DOM for unit tests
can meet, and they are not comparable with browser numbers on wpt.fyi.
<!-- source: wpt/README.md "Limits of the method"; summary skipped column -->

## What we learned (short)

- **"Like jsdom" is not one target.** Test suites encode the behavior of
  the jsdom version they were written against: `getComputedStyle` returned
  empty strings for most undeclared properties before jsdom 29 and initial
  values since, and react-aria's tests rely on the first while MUI's rely
  on the second. Jest 30 still bundles jsdom 26. warpdom detects the
  installed jsdom version and follows its observable behavior. This gets
  its own article.
- **Profile, then optimize what a test file pays once.** On MUI, ~21% of
  warpdom's time was module initialization and ~11% creating prototypes,
  not DOM operations. Making both lazy cut a simulated test file in a
  fresh process from 39.0 ms to 31.3 ms (micro-benchmark, Node 22.17.1).
- **Differences point both ways.** Comparing every test's status found
  warpdom bugs, but also nine ariakit tests that fail on jsdom and pass
  on warpdom.
- **Where warpdom deliberately differs from jsdom**, it follows the
  standard, and only where no realistic test relies on jsdom's behavior
  (for example, `tabindex="abc"` gives the element's default, -1 on a
  div; jsdom gives 0). The full list is kept in the project's plan and
  will be published with the docs.
<!-- source: PLAN.md Decisions 2026-10-11 (jsdom generation; Descriptors are built on first use), "Deliberate deviations from jsdom"; docs/research/README.md F1, F5 -->

## Limits, honestly

- **Not available.** warpdom is a private, unreleased project.
- **Few rounds.** 3 rounds per configuration, medians, no confidence
  intervals. GitHub's runners are shared machines, so a single round can
  be off by several percent.
- **Selection bias.** The corpus drove the compatibility work. Projects
  were chosen because they test with jsdom in Node; web component
  libraries mostly test in real browsers and are barely represented.
- **Our own harness has had bugs** (the pinned files above, and broken
  jsdom rounds caught by the per-test comparison). Both were found by the
  method itself, but there may be others.
- **happy-dom** is compared on three suites only; **linkedom** on none.
- **The harness copies warpdom into each project** to mimic an installed
  package; a real installation could still differ.
- **Not implemented** (jsdom lacks most of these too): layout, `innerText`,
  `inert`, XPath, loading `<link rel=stylesheet>` sheets. Fast mode needs
  Vitest 3.2 or later. Some suites in the corpus could not be compared at
  all yet (ag-grid's behavioural suite times out; element-plus pins jsdom
  16).
<!-- source: docs/research/README.md 5 "Threats to validity", 2.1 (excluded projects) -->

## What's next

1. `npx warpdom compare`: run your own suite on jsdom and on warpdom, and
   see every test whose result changes and the speedup, on your machine.
2. More rounds and confidence intervals on the GitHub runs.
3. happy-dom (and linkedom) in every comparison, correctness and speed.
4. A held-out set of projects that did not drive the compatibility work,
   and one real application's suite (not a library).
5. A full WPT re-run, published with the runner, so anyone can check it.
6. Then: make it public, and offer migration PRs where the numbers say
   they are worth it.
<!-- source: docs/compare.md; docs/research/README.md 6; PLAN.md Roadmap -->

If you maintain a jsdom suite that is slow and DOM-heavy (grids, rich
components, lots of `getComputedStyle`), I would like to hear about it:
that is where this matters, and it is the kind of suite I want in the
held-out set.
