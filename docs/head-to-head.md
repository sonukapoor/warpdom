# Head-to-head: jsdom, happy-dom, warpdom

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
