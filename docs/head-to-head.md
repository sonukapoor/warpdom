# Head-to-head: jsdom, happy-dom, warpdom

> Experiment log of 2026-10-09 (laptop, warpdom of that day), kept as a
> record. Current drop-in numbers are in the README's "Measured" section;
> current fast mode numbers (GitHub Actions, warpdom 5942dc9) are in
> docs/fast-mode.md, "Measured".
> <!-- source (branch docs/paper-revision): docs/research/data/ci-2026-10-14-5942dc9-RESULTS.md -->

*2026-10-09. Vitest, Node 22.23.3, two workers. 3 suites x 3 DOMs x 3
modes, 3 interleaved rounds; times are medians. "Differs" counts tests
whose status differs from jsdom's isolated run, per round. Raw:
scratchpad headtohead.csv.*

Modes: isolated (Vitest's default); `--no-isolate` (files share modules
and one window per worker); fast (`--no-isolate` plus per-file cleanup:
a fresh window per file for jsdom and happy-dom, `warpdom/vitest/reset`
for warpdom).

## Radix (React, 982 tests)

| DOM | Mode | Time | Differs |
| --- | --- | --- | --- |
| jsdom | isolated | 17.4 s | reference |
| jsdom | no-isolate | 6.8 s | 0/0/0 |
| jsdom | fresh window | 46.0 s | 605 |
| happy-dom | isolated | 13.2 s | 18/18/18 |
| happy-dom | no-isolate | 5.4 s | 18/18/18 |
| happy-dom | fresh window | 47.3 s | ~600 |
| warpdom | isolated | 10.2 s | 0/0/0 |
| warpdom | no-isolate | 5.3 s | 0/0/0 |
| warpdom | reset | 5.3 s | 0/0/0 |

## Vuetify (Vue, 947 tests)

| DOM | Mode | Time | Differs |
| --- | --- | --- | --- |
| jsdom | isolated | 15.7 s | reference |
| jsdom | no-isolate | 3.0 s | 23/23/5 |
| jsdom | fresh window | 28.0 s | ~70 |
| happy-dom | isolated | 9.5 s | 4/4/4 |
| happy-dom | no-isolate | 27.1 s | 4/10/32 |
| happy-dom | fresh window | 3.6 s | 13/8/8 |
| warpdom | isolated | 10.0 s | 0/0/0 |
| warpdom | no-isolate | 32.3 s | 6/6/0 |
| warpdom | reset | 3.0 s | 0/0/5 |

## emoji-picker-element (custom elements, Vitest 3, 160 tests)

| DOM | Mode | Time | Differs |
| --- | --- | --- | --- |
| jsdom | isolated | 22.2 s | reference |
| jsdom | no-isolate / fresh window | 10.8 / 6.8 s | 60 / 75 |
| happy-dom | isolated | 20.0 s | 1/1/1 |
| happy-dom | no-isolate / fresh window | 37.3 / 59.2 s | 54 / 66 |
| warpdom | isolated | 19.6 s | 0/0/0 |
| warpdom | no-isolate / reset | 29.4 / 28.2 s | 34 / 34 |

## Reading

- Isolated, warpdom is the only DOM with jsdom's results on all three, and
  faster than jsdom (1.7x, 1.6x, 1.1x). happy-dom is as fast (faster on
  Vuetify) but differs on 18, 4 and 1 tests.
- Turning isolation off is the big lever, and jsdom users can partly have
  it already: Radix on jsdom with `--no-isolate` is 6.8 s with the same
  results; warpdom's reset mode is 1.3x faster than that.
- On Vuetify only warpdom's reset is close to correct without isolation
  (5.2x faster than jsdom isolated); one round in three had 5 differing
  tests. Cause: two test files leave fake timers on. Fixed: the reset setup
  now also undoes Vitest's per-file state (timers, spies, stubs); 5 of 5
  runs since then match jsdom exactly (2.9 s).
- A fresh jsdom or happy-dom window per file breaks Radix (Testing
  Library's screen and React hold the old document.body); warpdom resets
  in place for that reason.
- warpdom without isolation and without reset took 32 s on Vuetify against
  jsdom's 3.0 s. Not a scaling problem: one file (click-outside.spec.ts)
  took 30 s of it, its tests waiting out timeouts under the fake timers
  another file left on; which DOM's worker gets that file order is chance.
  Every other file was as fast or faster than on jsdom.
- emoji-picker leaks module state (feature detection at import): no mode
  without isolation works for any DOM.

## Two more ways to run (2026-10-09, single runs)

**Vitest's VM pool (`--pool=vmThreads`)**: still one isolated context per
test file, but cheaper than a process per file. warpdom supports it
through `setupVM` (Node's host globals copied into the context).

| Suite | jsdom default | warpdom default | warpdom vmThreads | jsdom vmThreads |
| --- | --- | --- | --- | --- |
| Radix | 17.4 s | 10.2 s | 7.8 s, 0 differ | 8.8 s, 1 differs |
| Vuetify | 15.7 s | 10.0 s | 5.4 s, 0 differ | breaks (754 differ) |
| emoji-picker | 22.2 s | 19.6 s | 18.2 s, 6 differ | breaks (140 differ) |

MUI (mui-material, mui-system, mui-utils, mui-lab; 6,751 tests, React and
emotion), 2026-10-09, Node 22.23.3, 2 workers, median of 3 interleaved
rounds; every run has the same status as jsdom isolated for every test:

| Configuration | Rounds | Median | vs jsdom default |
| --- | --- | --- | --- |
| jsdom default | 88.3, 89.4, 91.0 s | 89.4 s | 1.0x |
| warpdom default | 49.3, 51.5, 51.6 s | 51.5 s | 1.7x |
| jsdom vmThreads | 28.1, 29.3, 29.1 s | 29.1 s | 3.1x |
| warpdom vmThreads | 23.4, 23.1, 22.8 s | 23.1 s | 3.9x |

Unlike Vuetify and emoji-picker, MUI runs correctly on jsdom with
vmThreads, so most of the gain there comes from the pool: warpdom adds
1.26x on top. warpdom's lead is largest where jsdom cannot use the pool.

`--pool=threads` was no faster than the default forks pool (Radix: jsdom
17.3 s, warpdom 10.2 s): the cost is reloading modules per file, not
starting processes.

**Fast mode with a safety net**: run without isolation (warpdom reset),
then rerun the failing files isolated and take their results there.

| Suite | warpdom isolated | fast + safety net | files rerun | differ from jsdom |
| --- | --- | --- | --- | --- |
| Radix | 11.3 s | 5.8 s | 0 | 0 |
| Vuetify | 10.6 s | 4.7 s | 1 | 0 |
| emoji-picker | 20.3 s | 41.3 s | 12 | 0 |

(Times include the harness's startup, hence a little higher.)

So warpdom with vmThreads is fully isolated and 2.2-2.9x faster than
jsdom's default on Radix and Vuetify, where jsdom cannot run that pool
on two of the three suites. The safety net makes fast mode correct
everywhere, but costs more than it saves where many files leak
(emoji-picker), so it needs to learn which files to keep isolated.

## Seven more suites (2026-10-09)

Vitest, 2 workers, Node 22.23.3; per round each suite ran jsdom and
warpdom in the default pool and with `--pool=vmThreads`, one after another;
median of 3 rounds. The machine was loaded by other work (Spotlight
indexing, load average up to 14), so absolute times are noisy; the
speedups are taken within a round, then the median. "differ" counts tests
whose status differs from jsdom's isolated run.

| Suite | jsdom | warpdom | jsdom vmThreads | warpdom vmThreads | warpdom vs jsdom | best warpdom with jsdom's results | differ (warpdom / jsdom vm / warpdom vm) |
| --- | --- | --- | --- | --- | --- | --- | --- |
| ark-ui | 76.5 s | 50.0 s | 29.8 s | 26.9 s | 1.53x | 2.84x (vmThreads) | 3 / 1 / 4 |
| floating-ui | 10.0 s | 6.5 s | 6.6 s | hangs | 1.52x | 1.52x | 0 / 0 / 165 |
| analog | 13.7 s | 11.9 s | 12.9 s | 11.9 s | 1.17x | 1.20x (vmThreads) | 0 / 5 / 0 |
| CopilotKit | 201.4 s | 172.1 s | 69.6 s | 65.3 s | 1.16x | 1.16x | 15 / 1947 / 1974 |
| ariakit | 405.6 s | 362.6 s | 355.9 s | 360.9 s | 1.12x | 1.12x | 22 / 6 / 24 |
| svelte | 38.2 s | 36.8 s | 33.8 s | 33.8 s | 1.02x | 1.02x | 0 / 30 / 30 |
| solid | 1.4 s | 1.5 s | 1.4 s | 1.4 s | 1.00x | 1.00x | 1 / 0 / 0 |

With Radix (1.71x), Vuetify (1.57x), MUI (1.74x) and emoji-picker (1.13x)
from above, the median over 11 suites is **1.17x** in the default pool and
**1.20x** for the best configuration that keeps jsdom's results (2.8-5.2x
on Vuetify, MUI, Radix and ark-ui). That is under PLAN's kill criterion
(~1.8x).

The gain follows how much of a suite's time is DOM work: component suites
(ark-ui, floating-ui, Radix, Vuetify, MUI) gain 1.5-1.7x by default;
suites dominated by compiler tests (svelte), their own waits (ariakit) or
application logic (CopilotKit) gain little, and solid's whole suite takes
1.4 s. vmThreads breaks CopilotKit on both DOMs and does not help ariakit.

floating-ui hangs with vmThreads on warpdom because of a Vitest 3 bug: an
environment that is not built in, loaded from outside Vitest's root
(floating-ui sets root to test/unit), times out in its worker's resolveId
call once workers are reused (vmThreads, isolate: false), whether loaded
by path or as the vitest-environment-warpdom package. Vitest 4 and 5 do
not have it (Radix, Vuetify, MUI).

## Fast mode that learns, so it is never slower (2026-10-10)

Fast mode (no isolation plus warpdom's per-file reset) with a plain
safety net (rerun failing files isolated) can lose to isolated runs: files
that leak state run twice, and on emoji-picker it took 40.2 s against
jsdom's 24.0 s. The learning version measures instead of guessing. A
learning run per suite times warpdom isolated, finds the leaky files (they
fail without isolation) and times the split: leaky files isolated, the
rest without isolation. Later runs use the cheaper of the two; new
failures still get the safety net and join the leaky list.

Vitest, 2 workers, Node 22.23.3, median of 3 rounds, each round jsdom's
default run first (also the baseline for "differ"):

| Suite | jsdom default | warpdom learned | Speedup | Mode | Differ |
| --- | --- | --- | --- | --- | --- |
| MUI | 86.3 s | 14.2 s | 6.08x | split | 0 |
| Vuetify | 15.1 s | 3.7 s | 4.08x | split | 0 |
| Radix | 17.1 s | 5.2 s | 3.29x | split | 0 |
| ark-ui | 75.8 s | 50.0 s | 1.53x | isolated | 8 |
| analog | 13.9 s | 11.5 s | 1.21x | isolated | 0 |
| emoji-picker | 22.9 s | 19.2 s | 1.19x | split | 0 |
| CopilotKit | 200.1 s | 171.5 s | 1.17x | isolated | 21 |
| ariakit | 419.6 s | 374.8 s | 1.12x | isolated | 27 |
| solid | 1.5 s | 1.4 s | 1.07x | isolated | 2 |
| svelte | 36.5 s | 35.4 s | 1.03x | split | 0 |

(ark-ui first chose the split with too-broad exclusion patterns: its
React, Solid, Vue and Svelte packages share test file names; with exact
paths the split is not faster and isolated wins, timed in the default-pool
rounds above. floating-ui is left out: Vitest 3 hangs with environments
from outside its root once workers are reused; isolated it is 1.52x.)

Never slower than jsdom (lowest 1.03x); median 1.20x, geometric mean
1.75x; all ten suites together 888 s on jsdom, 687 s on warpdom. The
differences are the known residuals (CopilotKit and ariakit include tests
that pass only on warpdom; ark-ui's signature pad), the same as isolated.
Large wins need suites whose time is DOM work and whose files do not leak
module state (MUI, Vuetify, Radix); where many files leak (ark-ui 138,
CopilotKit 273, ariakit 41) fast mode cannot help and isolated is kept.

## Jest (2026-10-10)

warpdom's Jest environment (`testEnvironment: 'warpdom/jest'`), Jest 30,
2 workers, median of 3 rounds with jsdom (jest-environment-jsdom) and
warpdom run back to back per round. Jest always isolates test files, so
there is no fast mode: the gain is the environment's setup and the DOM.

| Suite | jsdom | warpdom | Speedup | Differ |
| --- | --- | --- | --- | --- |
| handsontable | 560.1 s | 217.6 s | 2.54x | 34 |
| react-spectrum | 156.2 s | 100.8 s | 1.48x | 304 |
| react-hook-form | 6.5 s | 5.4 s | 1.20x | 0 |

handsontable by package (round 3): core 336.4 s against 25.7 s (13x, 520
files of table rendering), React wrapper 14.7 s against 7.8 s, Vue
wrapper 4.0 s against 2.6 s, Angular wrapper 189.2 s against 181.5 s (its
time is compiling Angular). Open: react-spectrum's 304 differences;
handsontable's 34 (CSS value validation, its theme-stylesheet parse error
that only jsdom reports, computed style details).
