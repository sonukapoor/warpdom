# jsdom's test results, faster on every suite we tuned on

<!--
DRAFT, not published. Author: Sonu Kapoor.
Title alternatives (pick one that the final numbers support):
- "jsdom's test results, faster on every suite we tuned on" (GitHub
  Actions, warpdom 208ad49, 2026-10-13: faster on all 13 tuning suites in
  three runs, drop-in median about 1.27x, 1.03x-1.89x per suite; about
  8-9x on handsontable, reported separately; fast mode at 5942dc9,
  2026-10-14: median 1.54x over jsdom's default, 1.01x over the drop-in)
- "Same results as jsdom, faster where the DOM is the bottleneck"
- "A test DOM written from the specs: 42,000 tests, jsdom's results"
Decisions (2026-10-12): projects are named (results are verifiable);
the headline is the drop-in median with the per-suite range; mistakes
in our own measurement are reported openly (pinned files, environment
groups). 2026-10-14: every measured number from the frozen re-run at
warpdom 208ad49 (branch docs/paper-revision,
docs/research/data/ci-2026-10-13-208ad49-*).
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
  runner (4 cores), each project checked out at a pinned commit, all on
  one frozen warpdom commit (208ad49). Within a job, jsdom, warpdom and
  happy-dom alternate on the same machine, an untimed warm-up and then 5
  rounds with the order rotated, so a ratio never mixes machines. Times
  are medians; the speedup is the median of the per-round ratios, given
  with the range of those ratios. 2 test workers, Node 22.23.3. The whole
  workflow ran three times independently. Anyone with access can rerun
  it.
- **Correctness:** the status of every test on warpdom against the jsdom
  run of the same round, in every timed run. A jsdom run that disagrees
  with its own baseline marks the round as broken, so its time is not
  used.
- **Scripts and data:** `dom-api-tracer/scripts/research/` and
  `.github/workflows/timing.yml`; raw CSVs, logs and environment records
  in warpdom's `docs/research/data/` and the workflow's artifacts.
<!-- source (branch docs/paper-revision): docs/research/data/ci-2026-10-13-208ad49-RESULTS.md 1 (runs, protocol, environment records) and "Conventions" (with 5 rounds the bootstrap interval equals the range); ci-2026-10-13-208ad49-threeway-tuning/README.md; dom-api-tracer/scripts/research/README.md "Timing on GitHub Actions" -->

## Evidence 1: the same result for (almost) every test

The final check ran on the frozen commit (warpdom 208ad49): 12 CI jobs
that each ran jsdom and warpdom side by side, 503 rounds of a suite in
all, about 43,600 tests in the 14 projects. Nine of them had **zero**
tests with a different status in any round.
<!-- source (branch docs/paper-revision): docs/research/data/ci-2026-10-13-208ad49-RESULTS.md 7 (12 jobs, 503 paired suite-rounds); ci-2026-10-13-208ad49-correctness-warpdom-default.tsv; ci-2026-10-13-208ad49-computed.md "Versions" (tests per suite: own-b rows, 43,587 in all) -->

| Project | Kind | Runner | Tests | Tests that differ from jsdom (any round) |
| --- | --- | --- | --- | --- |
| react-spectrum | React design system, accessibility | Jest | 8,456 | **0** (304 in an earlier survey) |
| handsontable | data grid | Jest | 8,082 | 3 (deliberate, below) |
| svelte | framework runtime | Vitest | 7,879 | 1 (deliberate, below) |
| material-ui (MUI) | React design system | Vitest | 6,770 | **0** |
| CopilotKit | app components, 4 frameworks | Vitest | 4,683 | **0** |
| ariakit | React + Solid accessibility | Vitest | 1,852 | 7 |
| react-hook-form | React forms | Jest | 1,515 | **0** |
| ark-ui | headless, 4 frameworks | Vitest | 1,245 | 5 |
| radix-primitives | React headless | Vitest | 982 | **0** |
| vuetify | Vue design system | Vitest | 947 | **0** |
| solid | framework runtime | Vitest 2 | 482 | 1 (an order-dependent test, below) |
| floating-ui | positioning | Vitest 3 | 340 | **0** |
| analog | Angular meta-framework | Vitest | 194 | **0** |
| emoji-picker-element | web component, shadow DOM | Vitest 3 | 160 | **0** |

"Tests" counts the test entries of a jsdom run, including skipped ones.
<!-- source (branch docs/paper-revision): ci-2026-10-13-208ad49-computed.md "Versions" (own-b rows); ci-2026-10-13-208ad49-correctness-warpdom-default.tsv (distinct tests per suite: ariakit 7, ark-ui 5, handsontable 3, solid 1, svelte 1); react-spectrum 304: docs/research/README.md 3.1 "Earlier" column -->

The remaining differences, and what causes each:

- **ariakit, 7:** all seven fail on jsdom and pass on warpdom, in every
  round (a document that answers its default view or node type with an
  element, `CompositionEvent` members, a named `activeElement` form
  control, a click fallback). They count as differences because the goal is jsdom's
  results, not "more passing".
- **handsontable, 3:** all in `jsdomThemeCssFilter.unit.js`, which tests
  handsontable's filter for a style sheet parse error that only jsdom 16
  reports (it cannot parse CSS nesting). warpdom deliberately does not
  reproduce that error.
- **ark-ui, 5:** three tests that fail on jsdom and pass on warpdom in
  some or most rounds (a Toast test and two NumberInput `largeStep`
  tests), and two that are flaky on jsdom as well.
- **svelte, 1:** a deliberate deviation (`DOMException`, below).
- **solid, 1:** an order-dependent test of solid's, which our harness
  exposed on warpdom only (below).
<!-- source (branch docs/paper-revision): ci-2026-10-13-208ad49-RESULTS.md 7 (per-test classes and rounds); PLAN.md "Deliberate deviations from jsdom" -->

One caveat belongs right next to this table: these same projects drove
the compatibility work, so parity on them overstates parity on a suite
warpdom has never seen. That is what the next section measures.
<!-- source: docs/research/README.md 5 (Selection bias) -->

### Suites warpdom was never tuned on

Nine more projects, chosen and pinned before measuring (naive-ui,
taiga-ui, melt-ui, dom-testing-library, tanstack-query, solid-primitives,
vueuse, react-router, downshift; about 13,500 tests). At first contact,
58 tests differed (0.43%), all passing on jsdom and failing on warpdom;
3 of the 9 projects had none. The causes were classes of behavior the
tuning corpus never exercised: `history.back()`, jsdom 20's CSS
serialization, a test assigning to `global.document`, Jest's deep
equality seeing internal state.
<!-- source: docs/research/README.md 3.7 (branch docs/paper-revision; data/held-out/; "3 of 9 projects have none", corrected from 4 on 2026-10-13) -->

After fixing those causes, the final check (warpdom 208ad49, every CI
job that ran them, 17 rounds each) left, in the held-out nine, apart from
flaky tests: 1 deliberate difference in tanstack-query
(`CSSStyleSheet.ownerNode`, below), 1 melt-ui test that fails in some
rounds (7 of 17), and 4 solid-primitives tests that time out (4 of 17)
when a file of the project that leaves fake timers on runs before them
in the same worker (jsdom fails the same 4 in that order). The melt-ui
test stubs `requestAnimationFrame` with a 16 ms timer, and warpdom
completes a Svelte transition sooner; a Dropdown Menu test of the same
kind fails on jsdom too now and then, but for this one the
speed-sensitivity is inferred, not shown. On CI the solid-primitives
order came up only under warpdom, presumably because warpdom reaches the
next file sooner. Because the fixes were driven by these nine, they are
no longer held out; the 0.43% is the held-out result.
<!-- source (branch docs/paper-revision): docs/research/data/ci-2026-10-13-208ad49-RESULTS.md 7 (tanstack-query 17 of 17; melt-ui Context Menu 7 of 17, speed-sensitive by analogy; solid-primitives 4 of 17, forced order fails on jsdom too, data/held-out/local-2026-10-12-solid-primitives-order/; slow order warpdom-only on CI, "not demonstrated"); ci-2026-10-13-208ad49-correctness-jsdom-learned.tsv (melt-ui Dropdown Menu on jsdom, 2 of 5 rounds) -->

Two web applications, Excalidraw and the Wire web app, went the same way:
2 and 141 differing tests when first tried, 0 on both after the fixes
they drove (also in every round at 208ad49) (the 139 of Wire's were two files that did not run at all,
because warpdom's Jest teardown deleted globals while a database
library's promise chain was still running).
<!-- source (branch docs/paper-revision): docs/research/README.md 3.8 "Web applications"; data/apps/ci-2026-10-12-apps-before/report.md (run 38304848528); data/ci-2026-10-13-208ad49-threeway-apps/report.md (run 38427075297: 0 differing on both) -->

### Measurement mistakes we caught

Vitest lets a test file choose its environment with a comment,
`/** @vitest-environment jsdom */`, and that comment wins over the config.
Our harness switched only the config. So in every "warpdom" run before
2026-10-12, files with that comment silently stayed on jsdom. Most suites
have none, but svelte has 8 such files holding 84.5% of its tests, and
solid has 14 holding 55.6%. Our earlier "0 differences" for svelte was
largely jsdom compared with jsdom.
<!-- source: docs/research/README.md section 3, "Correction, 2026-10-12" -->

The harness now switches those files too, without editing them, and so
does `warpdom compare`. With the fix, svelte showed 55 real differences:
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

The fix had a side effect we found only in the final runs. Vitest groups
test files by environment name and runs each group on its own workers.
On jsdom, solid's config and its 14 pinned files all say `jsdom`: one
group. On warpdom, the harness gives the config warpdom's path and the
pinned files another name: two groups. solid's suite shares module state
between files (`isolate: false`), and one of its tests, in
`transition.spec.tsx`, fails whenever `suspense.spec.tsx` ran before it in
the same worker without `external-source.spec.ts` in between. Two groups
make that order much more likely. On CI it failed on warpdom in 24 of 27
rounds and never on jsdom. Locally, with a fixed file order, jsdom and
warpdom gave the same result for every order, and over 130 full-suite
runs the test failed in exactly the 32 runs with that order, on either
DOM. With one environment name for all files the test passed 10 of 10
times on both DOMs; with two names, 7 of 10 on jsdom and 6 of 10 on
warpdom. It is a test-order dependence in
solid's suite, which the harness exposed; any user who switches the
config but not the comments gets the same split, which is why the README
now asks to switch them too. The CI numbers above still count it as a
warpdom difference.
<!-- source (branch docs/paper-revision): docs/research/data/investigations/solid-transition/README.md (grouping by environment name; 24 of 27 rounds; fixed-order table; 130 runs, 32 failing with that order, 98 passing; grouping table: one name 10/10 on both, two names 7/10 jsdom and 6/10 warpdom) -->

The path there is in the logs: React Spectrum went from 304 differences to
0 in a day; ariakit from 59 to 9 (7 since); solid from 136 to 1; handsontable from
8,418 on the first Jest run to 16 to 3.
<!-- source: docs/research/README.md 3.1 "Earlier" column; data/surveys/survey.log, survey-jest.log, survey3.log, survey8.log; ariakit 7 (branch docs/paper-revision): data/ci-2026-10-13-208ad49-RESULTS.md 7 -->

## Evidence 2: speed

Measured on 2026-10-13 on GitHub Actions: one hosted Linux runner (4
cores) per project, pinned commits, warpdom 208ad49, a warm-up and 5
rounds with jsdom, warpdom and happy-dom alternating on the same machine.
The table is the first of three identical runs, sorted by jsdom time; the
last column gives the speedup in each of the three.
<!-- source (branch docs/paper-revision): docs/research/data/ci-2026-10-13-208ad49-threeway-tuning/run1-38426985620/report.md; ci-2026-10-13-208ad49-computed.md "Tuning: warpdom speedup per run and between runs" (runs 38426985620, 38427009322, 38427031231) -->

| Suite | jsdom | warpdom | happy-dom | Tests that differ from jsdom: warpdom / happy-dom | warpdom speedup (3 runs) |
| --- | ---: | ---: | ---: | --- | ---: |
| ariakit | 537.3 s | 407.2 s | 232.1 s | 7 / 51 | 1.32x (1.32–1.39x) |
| CopilotKit | 456.5 s | 366.3 s | 48.6 s ¹ | 0 / 4,681 | 1.24x (1.23–1.25x) |
| React Spectrum | 419.9 s | 338.4 s | 363.1 s | 0 / 1,441 | 1.24x (1.19–1.26x) |
| MUI | 264.0 s | 141.2 s | 185.1 s | 0 / 1,042 | 1.89x (1.88–1.89x) |
| ark-ui | 205.7 s | 130.8 s | 141.5 s | 3 / 116 | 1.59x (1.56–1.61x) |
| svelte | 91.4 s | 84.6 s | 85.5 s | 1 / 288 | 1.08x (1.08–1.09x) |
| Vuetify | 39.6 s | 26.8 s | 26.7 s | 0 / 4 | 1.49x (1.49–1.52x) |
| emoji-picker-element | 37.2 s | 29.1 s | 32.3 s | 0 / 1 | 1.28x (1.18–1.28x) |
| Radix | 29.6 s | 16.4 s | 19.7 s | 0 / 18 | 1.79x (1.75–1.86x) |
| floating-ui | 23.7 s | 15.5 s | 18.8 s | 0 / 14 | 1.53x (1.52–1.55x) |
| analog | 19.3 s | 16.0 s | 17.3 s | 0 / 2 | 1.20x (1.19–1.21x) |
| react-hook-form | 12.8 s | 10.3 s | 14.2 s | 0 / 8 | 1.24x (1.21–1.24x) |
| solid | 3.4 s | 3.3 s | 3.1 s | 1 / 0 | 1.03x (1.03x in each) |

Times are the median of 5 rounds; the speedup is the median of the
per-round ratios (jsdom and warpdom on the same machine in the same
round). Tests that differ: the most in any round.
¹ CopilotKit runs fast on happy-dom because 4,681 of its tests break
there.
<!-- source (branch docs/paper-revision): run1-38426985620/report.md -->

handsontable is not in the table. Its core, React and Vue packages run
jsdom 16.7.0, older than the jsdom 20 we require for a suite to enter
the medians, so it is reported separately below.
<!-- source (branch docs/paper-revision): ci-2026-10-13-208ad49-computed.md "Version rule"; ci-2026-10-13-208ad49-RESULTS.md "Conventions" (version rule) -->

**warpdom was faster than jsdom on all 13 suites, in each of the three
runs, but by very different amounts.** solid (1.03x in each run, single
rounds 0.97x to 1.06x) and svelte (1.08x to 1.09x) gain little; so do
two held-out projects, taiga-ui (1.01x, single rounds 0.99x to 1.03x)
and react-router (1.04x), and the Wire web app (1.03x, 1.00x to 1.03x).
The other suites fall into two groups: about 1.2x to 1.3x (compile-,
logic- or wait-heavy suites) and 1.5x to 1.9x (DOM-heavy ones). A median
across them is therefore uncertain: 1.28x, 1.27x and 1.26x in the three
runs (95% bootstrap intervals 1.22x to 1.54x, 1.21x to 1.54x and 1.19x to
1.55x, resampling suites and their rounds). Within a suite the
measurements are tight: between the three runs, a suite's speedup moved
by a median of 2.3% and at most 8.6%. Read the per-suite table, not the
median.
<!-- source (branch docs/paper-revision): ci-2026-10-13-208ad49-RESULTS.md 2.1 (faster on all 13 in every run; two clusters); ci-2026-10-13-208ad49-computed.md "Tuning: warpdom speedup per run and between runs" (solid pooled 0.97-1.06x; spread median 2.3%, max 8.6%), "Cross-suite medians of the drop-in speedup", "Held-out (run 38427053627)" (taiga-ui, react-router), "Applications (run 38427075297)" (wire-webapp) -->

On the held-out projects the drop-in median was 1.36x (95% interval
1.05x to 1.69x) over the 8 with valid jsdom rounds, from 1.01x (taiga-ui)
to 1.96x (VueUse) per project; solid-primitives ran 1.14x from its raw
rounds (its jsdom runs report 901 or 922 tests, so the broken-round rule
drops them). Excalidraw ran 1.21x faster.
<!-- source (branch docs/paper-revision): ci-2026-10-13-208ad49-computed.md "Cross-suite medians of the drop-in speedup" (held-out, 8 suites), "Held-out (run 38427053627)", solid-primitives raw rounds; "Applications (run 38427075297)" (excalidraw 1.21x, 1.20-1.23) -->

**happy-dom is about as fast** (median 1.25x, 1.27x and 1.28x over jsdom
in the three runs), and faster than warpdom on ariakit, solid and, by
breaking it, CopilotKit. **But it changes test results in 12 of 13
suites**: 4,681 tests in CopilotKit (its 9x is the suite largely failing
fast), 1,441 in React Spectrum, 1,042 in MUI, 288 in svelte. On the Wire
web app it changed 63 tests and was slower than jsdom (0.54x).
warpdom's differences are 0 to 3 per suite, except ariakit:
- ariakit's 7 are tests that fail on jsdom and pass on warpdom.
- ark-ui's 3 fail on jsdom (or are flaky there) and pass on warpdom.
- svelte's 1 is the deliberate deviation above.
- solid's 1 is the order-dependent test above.
<!-- source (branch docs/paper-revision): run1-38426985620/report.md; ci-2026-10-13-208ad49-computed.md "happy-dom vs jsdom, same procedure"; ci-2026-10-13-208ad49-RESULTS.md 2.3 (Wire happy-dom 63, 0.54x), 2.5 (12 of 13) and 7 (classes) -->

The median is modest because a faster DOM only speeds up the part of a run
spent in the DOM. Compiling (svelte), the framework and the runner stay as
they are. On a laptop (Apple M4 Pro, 14 cores) the median was 1.41x over
12 of the suites (2026-10-12, an earlier warpdom, 2 rounds, without
svelte and solid), and ariakit gained least of all there: 1.11x, against
1.32x to 1.39x on runners. On a fast machine, its tests mostly wait for
real-time timers and animation frames; on a slower one, more of the run
is CPU work. CI runners are where test time costs money, so they are the
better reference.
<!-- source: docs/research/README.md 3.2 "Re-timing, 2026-10-12" (12 valid suites 1.41x; ariakit 1.11x), 3.4 (ariakit profile), F6; runners (branch docs/paper-revision): ci-2026-10-13-208ad49-computed.md "Tuning: warpdom speedup per run and between runs" (ariakit 1.32-1.39x) -->

### handsontable

handsontable shows where the gain comes from. Split by package (the run
above, warm Jest cache):

| Package | jsdom | Files | Tests | jsdom time | warpdom time | Speedup (3 runs) |
| --- | --- | --- | --- | --- | --- | --- |
| core | 16.7.0 | 520 | 7,615 | 540.3 s | 44.7 s | 12.08x (11.16–12.52x) |
| React wrapper | 16.7.0 | 18 | 111 | 27.2 s | 10.5 s | 2.59x (2.35–2.59x) |
| Vue 3 wrapper | 16.7.0 | 6 | 42 | 8.8 s | 5.2 s | 1.69x (1.63–1.69x) |
| Angular wrapper | 20.0.3 | 14 | 314 | 17.2 s | 8.8 s | 1.98x (1.86–1.98x) |
| whole suite | | | | 593.2 s | 69.2 s | 8.62x (7.97–8.87x) |
<!-- source (branch docs/paper-revision): ci-2026-10-13-208ad49-computed.md "handsontable per package" (three-way runs 1-3) and "Version rule"; file and test counts: timing-handsontable artifact of run 38194812094 (Jest summaries) -->

The core package renders tables: our tracer counted 940
`getComputedStyle` calls per test file in it. The suite total depends on
the cache: on the first run after install, both DOMs pay for a cold Jest
transform cache and the Angular wrapper's compile (279.2 s on jsdom,
271.2 s on warpdom in the run above), so on a cold cache, common on CI,
the suite is about 2.5x faster (2.53x to 2.55x) rather than 8 to 9x.
<!-- source: PLAN.md Decisions 2026-10-08 "Handsontable is layout- and style-heavy"; branch docs/paper-revision: ci-2026-10-13-208ad49-RESULTS.md 2.4 (warm-up angular-wrapper 279.2 vs 271.2 s; cold 2.54x, 2.55x, 2.53x) -->

I set myself a kill criterion before this work: a median under about 1.8x
across 10+ suites in the recommended configuration would mean rethinking
the product. Drop-in, the median is about 1.27x, so that alone does not
meet it. Fast mode (below), meant as the recommended configuration for
Vitest, does not meet it either: over 16 Vitest suites its median is
1.54x faster than jsdom's default, with large gains on some suites and
none over the drop-in on most.
<!-- source (branch docs/paper-revision): docs/research/data/ci-2026-10-14-5942dc9-RESULTS.md section 3 (16 Vitest suites: 1.54x (1.27-3.56x) over jsdom default; 1.01x over the drop-in; 7 of 17 suites beyond the A/A noise) -->
What the data does show: jsdom's results on every suite apart from the
differences listed above, and faster than jsdom on every tuning suite,
by a few percent on some (solid 1.03x, svelte 1.08x) and up to 1.9x on
others.
<!-- source (branch docs/paper-revision): ci-2026-10-13-208ad49-RESULTS.md 2.1 and 10 ("The pre-registered 1.8x target: neither the drop-in (about 1.27x) nor measured isolation reaches it") -->
<!-- source: PLAN.md Decisions 2026-10-09 "Prove the switch is worth it" -->

### Against happy-dom

The table above is the head-to-head: happy-dom is a speed alternative to
jsdom, but not a drop-in one. For a suite that already runs on happy-dom,
warpdom is mainly a correctness switch: in the median it is about as fast
(1.07x faster than happy-dom in this run), and it is slower on ariakit,
solid and, because happy-dom breaks it, CopilotKit; on Vuetify they are
equal.
<!-- source (branch docs/paper-revision): run1-38426985620/report.md ("warpdom vs happy-dom 1.07x"; ariakit 0.57x, solid 0.97x, vuetify 1.00x, CopilotKit 0.13x) -->

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

That is why the next lever is not paying for per-file isolation.
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

How much fast mode gains depends on how much of a suite's time goes into
reloading modules per file, and on how many of its files leak. On GitHub
Actions (16 open-source Vitest suites, up to 5 rounds), it was clearly
faster than warpdom's drop-in on 7 of 17 suites: VueUse 9.6x over jsdom's
default (5.2x over the drop-in), MUI 6.7x (3.7x), Vuetify 5.6x (3.8x),
Radix 4.7x (2.6x), naive-ui 3.4x (3.0x), tanstack-query 2.4x (1.6x) and
CopilotKit 1.5x (1.2x). On the others it ran isolated, or split for a
gain within noise, and equalled the drop-in (0.98-1.03x). Over the 16:
a median 1.54x over jsdom's default and 1.01x over the drop-in.

The fair comparison is with what jsdom users can already do: turn
isolation off, add a cleanup between files, or use the VM pool, where
that keeps every test's result. Against the fastest such configuration
fast mode was a median 1.27x faster, and slower on two suites: naive-ui,
where plain `isolate: false` on jsdom keeps every result and is faster
(0.67x), and melt-ui, against jsdom's VM pool (0.84x). On seven suites
every jsdom alternative changed results. The fix that made VueUse and
naive-ui split was itself found by this comparison: an unhandled error
was blamed on the file that happened to be running, so learning kept
both suites isolated. Fast mode needs Vitest 3.2 or later; on older
Vitest, `warpdom vitest run` runs Vitest as configured, which is the
drop-in. Four of the 16 suites (floating-ui, solid, melt-ui,
solid-primitives) run an older Vitest and ariakit passes three
`--project` arguments, so those five were measured with the harness's
emulation of the same rules.
<!-- source (branch docs/paper-revision): docs/research/data/ci-2026-10-14-5942dc9-RESULTS.md sections 2-4 and 7 (runs 38567560217, 38567579662, 38567598200, warpdom 5942dc9; per-suite speedups over jsdom-default and warpdom-default; 16-suite medians 1.54x (1.27-3.56x), 1.01x (1.00-2.73x), 1.27x (1.06-1.52x) over the best correct jsdom configuration; naive-ui 0.67x vs jsdom-shared, melt-ui 0.84x vs jsdom-vm; every jsdom alternative changes results on CopilotKit, analog, ariakit, ark-ui, emoji-picker-element, tanstack-query, VueUse; at 208ad49 VueUse and naive-ui stayed isolated in 6 of 6 learnings); warpdom src/vitest-fast-cli.js ("fast mode needs Vitest 3.2 or later ...; running Vitest as configured") -->

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

The latest run (on GitHub Actions, warpdom 208ad49, the same commit as
the suite measurements) covers four areas: `dom`, `domparsing`,
`html/dom` and `css/cssom`; 963 test files, about 133,000 subtests.
<!-- source (branch docs/paper-revision): docs/research/data/wpt/ci-2026-10-13-208ad49/README.md and summary.md (run 38427179332, WPT 87b5d13099) -->

| | warpdom | jsdom 30.1.2 |
| --- | --- | --- |
| Subtests passed | 116,410 of 133,248 (87.4%) | 107,200 of 133,158 (80.5%) |
| Score per file | **75.7%** | 71.0% |
<!-- source (branch docs/paper-revision): docs/research/data/wpt/ci-2026-10-13-208ad49/summary.md, per-engine "Total" rows -->

Two numbers, because they answer different questions:

- **Subtests passed** counts every check once. A few files generate
  thousands of subtests (`dom/ranges` alone has 44,494), so this number is
  dominated by them.
- **Score per file** is how wpt.fyi scores browsers: each file gets
  passed/total, and the files are averaged. A file with 3 subtests weighs
  as much as one with 1,500.

warpdom is ahead on both. On 2026-10-11 it was behind on the score per
file (66.5% against 71.5%), mostly because of `html/dom`, which is now
84.4% against jsdom's 68.0%. It is behind in one area, `dom/events`
(78.7% vs 79.8%), by a deliberate choice: the standard makes `isTrusted`
an own property of every event, and doing that made creating an event 2.3x
slower, for a difference only interface-shape tests can see. These tests
are not an independent check: warpdom was worked on against them.
<!-- source (branch docs/paper-revision): docs/research/data/wpt/ci-2026-10-13-208ad49/summary.md "Side by side" (html/dom 84.4% vs 68.0%, dom/events 78.7% vs 79.8%); ci-2026-10-13-208ad49-RESULTS.md 10 item 8 (not an independent check); 66.5% vs 71.5%: docs/research/README.md 3.6 -->

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
  on the second. Jest 30 still bundles jsdom 26. With jsdom alone, no
  warpdom involved, running a project on another jsdom version changed
  test results in 13 of 23 projects. warpdom detects the installed jsdom
  version and follows its observable behavior. This gets its own
  article.
- **Profile, then optimize what a test file pays once.** On MUI, ~21% of
  warpdom's time was module initialization and ~11% creating prototypes,
  not DOM operations. Making both lazy cut a simulated test file in a
  fresh process from 39.0 ms to 31.3 ms (micro-benchmark, Node 22.17.1).
- **Differences point both ways.** Comparing every test's status found
  warpdom bugs, but also seven ariakit tests that fail on jsdom and pass
  on warpdom, and an order dependence in solid's suite that our own
  harness exposed.
- **Where warpdom deliberately differs from jsdom**, it follows the
  standard, and only where no realistic test relies on jsdom's behavior
  (for example, `tabindex="abc"` gives the element's default, -1 on a
  div; jsdom gives 0). The full list is kept in the project's plan and
  will be published with the docs.
<!-- source: PLAN.md Decisions 2026-10-11 (jsdom generation; Descriptors are built on first use), "Deliberate deviations from jsdom"; docs/research/README.md F1, F5; 13 of 23 and ariakit 7 (branch docs/paper-revision): docs/research/data/ci-2026-10-13-208ad49-RESULTS.md 6 and 7 -->

## Limits, honestly

- **Not available.** warpdom is a private, unreleased project.
- **Shared machines.** GitHub's runners are shared and come with
  different CPUs (six models in these runs), so a single round can be off
  by several percent, and a suite's jsdom time differed by up to 1.6x to
  1.8x between the three runs. Ratios within a round are steadier (a
  suite's speedup moved by at most 8.6% between runs, handsontable
  11.3%), but 5 rounds are still a small sample, and all runs used one
  class of 4-core runner.
<!-- source (branch docs/paper-revision): docs/research/data/ci-2026-10-13-208ad49-RESULTS.md 1 (six CPU models), 2.1 and 9 "Runners" (absolute times up to 1.6-1.8x; spread at most 8.6%, handsontable 11.3%) -->
- **Selection bias.** The corpus drove the compatibility work. Projects
  were chosen because they test with jsdom in Node; web component
  libraries mostly test in real browsers and are barely represented.
- **Our own harness has had bugs** (the pinned files above, the
  environment groups that exposed solid's order dependence, and broken
  jsdom rounds caught by the per-test comparison). All were found by the
  method itself, but there may be others. The solid test still counts
  as a warpdom difference in the CI numbers.
- **happy-dom** is compared on every suite where it completed (not
  handsontable) and the two web apps; **linkedom** on none.
- **The held-out set is used up.** Its differences drove fixes, so a new
  held-out set is needed to measure parity on unseen suites again; the
  web apps are a migration case study for the same reason.
- **The harness copies warpdom into each project** to mimic an installed
  package; a real installation could still differ.
- **Not implemented** (jsdom lacks most of these too): layout, `inert`,
  loading `<link rel=stylesheet>` sheets. Fast mode needs
  Vitest 3.2 or later. Some suites in the corpus could not be compared at
  all yet (ag-grid's behavioural suite times out; element-plus pins jsdom
  16).
<!-- source: docs/research/README.md 5 "Threats to validity", 2.1 (excluded projects), 3.7 ("no longer held out"); README.md "Differences from jsdom" (innerText and XPath are implemented) -->

## What's next

1. `npx warpdom compare`: run your own suite on jsdom and on warpdom, and
   see every test whose result changes and the speedup, on your machine.
   On the warpdom side it currently gives pinned Vitest files another
   environment name than the config, as the harness did, so the same
   grouping caveat applies.
2. Fast mode where it does not pay yet: it equals the drop-in on most
   suites, and jsdom without isolation is faster on naive-ui.
3. linkedom in the comparison, next to happy-dom.
4. A new held-out set, since the first one drove fixes, and more
   application suites.
5. WPT beyond the four areas measured so far, published with the
   runner, so anyone can check it.
6. Then: make it public, and offer migration PRs where the numbers say
   they are worth it.
<!-- source: docs/compare.md; docs/research/README.md 6; PLAN.md Roadmap; src/compare/index.js (warpdom side: environment = warpdom's path, pinned files = 'warpdom-compare') -->

If you maintain a jsdom suite that is slow and DOM-heavy (grids, rich
components, lots of `getComputedStyle`), I would like to hear about it:
that is where this matters, and it is the kind of suite I want in the
held-out set.
