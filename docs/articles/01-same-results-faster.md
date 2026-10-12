# jsdom's test results, 1.5x faster in the median: what we measured on real suites

<!--
DRAFT, not published. Author: Sonu Kapoor.
Title alternatives (pick one that the final numbers support):
- "jsdom's test results, 1.5x faster in the median" (GitHub Actions run
  2026-10-12, valid suites so far; range 1.26x-8.84x, all faster)
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
| svelte | framework runtime | Vitest | 7,873 | being re-measured (see below) |
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
- 30 are `<select>`, media and hydration gaps, being fixed now.

[TODO: svelte's final count after the fixes]
<!-- source: PLAN.md 2026-10-12 entries (jsdom 25 profile, cssstyle); dom-api-tracer ceffbd6 -->

The path there is in the logs: React Spectrum went from 304 differences to
0 in a day; ariakit from 59 to 9; solid from 136 to 1; handsontable from
8,418 on the first Jest run to 16 to 3.
<!-- source: docs/research/README.md 3.1 "Earlier" column; data/surveys/survey.log, survey-jest.log, survey3.log, survey8.log -->

## Evidence 2: speed

Measured on 2026-10-12 on GitHub Actions: one hosted Linux runner per
project, pinned commits, 3 rounds with jsdom and warpdom alternating on
the same machine.
<!-- source: dom-api-tracer Actions run 38194812094; combined CSV and report in its timing-report artifact -->

| Suite | Runner | jsdom | warpdom | Speedup | Tests that differ |
| --- | --- | --- | --- | --- | --- |
| handsontable | Jest | 826.1 s | 92.2 s | **8.84x** | 3 |
| radix-primitives | Vitest | 45.5 s | 23.7 s | 1.93x | 0 |
| material-ui | Vitest | 359.4 s | 189.9 s | 1.90x | 0 |
| ark-ui | Vitest | [TODO] | [TODO] | [TODO] | 1 |
| ariakit | Vitest | 830.2 s | 545.9 s | 1.52x | 9 |
| vuetify | Vitest | 45.0 s | 30.3 s | 1.51x | 0 |
| floating-ui | Vitest 3 | 27.7 s | 18.7 s | 1.49x | 0 |
| emoji-picker-element | Vitest 3 | 52.9 s | 39.9 s | 1.33x | 0 |
| react-hook-form | Jest | 20.3 s | 15.7 s | 1.29x | 0 |
| analog | Vitest | 43.3 s | 34.4 s | 1.26x | 0 |
| react-spectrum | Jest | 762.7 s | 620.6 s | 1.26x | 0 |
| CopilotKit | Vitest | [TODO] | [TODO] | [TODO] | 0 |
| svelte | Vitest | [TODO] | [TODO] | [TODO] | [TODO] |
| solid | Vitest 2 | [TODO] | [TODO] | [TODO] | 0 |

[TODO: fill ark-ui and CopilotKit from their re-runs (in run 38194812094
two of their three jsdom rounds were broken by a harness bug, caught
because those jsdom runs disagreed with their own baseline), svelte and
solid from their re-measurement; recompute the median.]

warpdom is faster on every suite measured so far. The median over the
ten complete rows above is **1.50x** (range 1.26x to 8.84x). That is the
number to remember, not the 8.84x.
[TODO: recompute over all valid rows]

The GitHub runners are shared 2-core virtual machines. On my laptop
(Apple M4 Pro, 14 cores) the same suites gain less (median 1.40x over 12
suites, 2026-10-12, 2 rounds). The biggest change is ariakit: 1.10x on
the laptop, 1.52x on a runner. On a fast machine its tests mostly wait on
real-time timers and animation frames, so a faster DOM saves little; on
a slower one, more of the run is CPU work. CI runners are where test time
costs money, so they are the better reference.
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
the product. The drop-in median is 1.50x, so by that measure warpdom is
not there yet. What it does show: jsdom's results on every suite, faster
on every suite, 1.5x to 2x where the DOM is a large part of the work and
up to 8.8x where it dominates. The larger multiples for the rest come
from not paying per-file isolation (below).

### Against happy-dom

Only three suites have a head-to-head with happy-dom so far (2026-10-09):

| Suite | jsdom | happy-dom | warpdom | Tests that differ on happy-dom / warpdom |
| --- | --- | --- | --- | --- |
| Radix | 17.4 s | 13.2 s | 10.2 s | 18 / 0 |
| Vuetify | 15.7 s | 9.5 s | 10.0 s | 4 / 0 |
| emoji-picker-element | 22.2 s | 20.0 s | 19.6 s | 1 / 0 |
<!-- source: docs/head-to-head.md (Radix, Vuetify, emoji-picker tables) -->

happy-dom is as fast as warpdom here, and faster on Vuetify. So for
happy-dom users, warpdom is a correctness switch, not a speed one. linkedom
is not in any comparison yet.

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

Measured on 2026-10-10, before the 2026-10-11 changes, 10 Vitest suites:

| Suite | jsdom default | warpdom fast mode | Speedup | Tests that differ |
| --- | --- | --- | --- | --- |
| MUI | 86.3 s | 14.2 s | 6.08x | 0 |
| Vuetify | 15.1 s | 3.7 s | 4.08x | 0 |
| Radix | 17.1 s | 5.2 s | 3.29x | 0 |
| ark-ui | 75.8 s | 50.0 s | 1.53x (stays isolated) | 8 |
| analog | 13.9 s | 11.5 s | 1.21x (stays isolated) | 0 |
| emoji-picker-element | 22.9 s | 19.2 s | 1.19x | 0 |
| CopilotKit | 200.1 s | 171.5 s | 1.17x (stays isolated) | 21 |
| ariakit | 419.6 s | 374.8 s | 1.12x (stays isolated) | 27 |
| solid | 1.5 s | 1.4 s | 1.07x (stays isolated) | 2 |
| svelte | 36.5 s | 35.4 s | 1.03x | 0 |
<!-- source: docs/head-to-head.md "Fast mode that learns"; data/timing/learned-2026-10-10.csv. The differences are the residuals of that date, the same as isolated runs then. -->

Never slower than jsdom (lowest 1.03x), median 1.20x, geometric mean
1.75x. The big wins need suites whose time is DOM work and whose files do
not leak module state; ark-ui, CopilotKit and ariakit have too many leaky
files (138, 273 and 41) and stay isolated. [TODO: re-measure fast mode
with current warpdom]

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

The first full run (2026-10-11) covered four areas: `dom`, `domparsing`,
`html/dom` and `css/cssom`; 963 test files, about 133,000 subtests.
<!-- source: docs/research/data/wpt/full-2026-10-11-summary.md (warpdom fc9d262, WPT 87b5d13099) -->

| | warpdom | jsdom 30.1.2 |
| --- | --- | --- |
| Subtests passed | 111,785 (83.9%) | 107,191 (80.5%) |
| Score per file | 66.5% | 71.5% |
| Files where every subtest passes | 556 | 620 |
| Wall clock for the run | 393 s | 752 s |

Two numbers, because they answer different questions:

- **Subtests passed** counts every check once. A few files generate
  thousands of subtests (`dom/ranges` alone has 44,494), so this number is
  dominated by them. warpdom is ahead here.
- **Score per file** is how wpt.fyi scores browsers: each file gets
  passed/total, and the files are averaged. A file with 3 subtests weighs
  as much as one with 1,500. warpdom is **behind** here, 66.5% against
  71.5%.

The gap is mostly one area. In `html/dom`, warpdom passes more subtests
than jsdom (84.2% against 76.3%) but fully passes far fewer files (36
against 79), and scores 38.8% against 69.4%. warpdom is also behind on
`dom/events` (77.8 vs 79.8), `dom/nodes` (68.0 vs 69.1), `dom/ranges`
(87.6 vs 88.6), `dom/abort` (83.3 vs 100) and the top-level `dom/` files
(69.9 vs 83.4). It is ahead or level on `css/cssom` (64.8 vs 63.8),
`dom/traversal` (92.5 vs 89.6), `domparsing` (86.9 vs 84.9),
`dom/lists` and `dom/collections` (100 for both).
<!-- source: docs/research/data/wpt/full-2026-10-11-summary.md, side-by-side table -->

Since that run, three more pieces of work landed, each measured on its
own directory: `html/dom` top-level files 65.5% -> 72.4% (jsdom 67.1%),
document tree accessors 40.5% -> 98.1% (jsdom 95.6%), global attributes
34.9% -> 74.8% (jsdom 72.2%), `dom/abort` 83.3% -> 100%, top-level `dom/`
files 69.9% -> 80.3% (jsdom 83.4%). A full re-run is needed before
quoting a new total. [TODO: re-measure: full WPT run with current main]
<!-- source: PLAN.md "2026-10-12: WPT html/dom reflection..." (wpt-misc), "2026-10-11: Global attributes, directionality", "Document tree accessors" -->

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
