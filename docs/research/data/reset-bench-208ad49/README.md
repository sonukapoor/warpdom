# warpdom reset micro-benchmark and size counts at 208ad49

warpdom commit `208ad49` (`208ad49e83f09da7f4ba8ffb01cbb14958e7a60a`), measured 2026-10-14
in a detached worktree of that commit with `npm ci`.

## Files

- `reset-bench.mjs`: the benchmark script.
- `results.txt`: environment and raw output of the run reported below. `results.json` holds the same run as JSON.
- `results-repeats.txt`: two more runs of the same command, to show how much runs vary.
- `count-interfaces.mjs`: counts the interface objects a window exposes (used in `size-208ad49.txt`).
- `size-208ad49.txt`: lines of code, interface count, version-keyed behaviors and deviations, each with the command that produced it.

## What was measured

This measures how long one in-place window reset takes (`src/reset.js`). warpdom's Vitest no-isolate mode
(`warpdom/vitest/reset`) runs this reset before each test file instead of creating a new window.

The window is set up the way `src/vitest.js` `setup()` sets it up for Vitest's default (non-VM) pools,
with `environmentOptions { warpdom: { jsdom: '30.1.2' } }`:

1. `createWindow({ url: 'http://localhost:3000', jsdom: '30.1.2', cssstyle: undefined, fastFrames: false })`
2. `installWindow(globalThis, window, { hostKeys: VITEST_HOST_KEYS, alwaysKeys: VITEST_ALWAYS_KEYS })`
3. `snapshotWindow(window)`

The environment's error and console hooks were left out.

Two operations are timed:

- **env reset** is the function `src/vitest.js` registers under `Symbol.for('warpdom.vitest.reset')`. It runs
  `restore.resetOverrides()` and then `resetWindow(window)`.
- **resetWindow** is `resetWindow(window)` on its own.

The benchmark covers three states. Before every reset the state is dirtied again, then `await setImmediate`
lets microtasks and observer callbacks run. Only the reset call is timed, with `process.hrtime.bigint()`.
Each state gets 50 warm-up iterations, which are discarded, and then 200 timed iterations.

- **(a) untouched**: a fresh window (doctype, html, head, body).
- **(b) typical test file**: 484 elements and 816 nodes in total.
  - Markup and listeners:
    - `body.innerHTML` with a header, a list of 60 items with buttons, and a form of 20 labelled inputs plus a select.
    - A 40x4 table built with `createElement`/`appendChild`, a portal div with inline style, and a `<style>` in head.
    - Body class, body style and the html `lang` attribute.
    - Listeners on the document, the window, the body, every button and every input.
    - `document.onvisibilitychange` and `window.onbeforeunload`.
  - Focus, observers and stored state:
    - Focus on an input.
    - Two MutationObservers (body subtree, document subtree), with a record pending.
    - 10 `localStorage` items, a `sessionStorage` item and a cookie.
  - Timers, navigation and selection:
    - Five 60 s window `setTimeout`s and one `setInterval`.
    - A `requestAnimationFrame` and a `history.pushState`.
    - A selection.
  - Globals:
    - An added property on the window object (`__APP_STATE__`).
    - Global overrides of `matchMedia` and `scrollTo`.
    - Expando properties on the document and the body.
- **(c) large tree**: `body.innerHTML` with a 2,000-row table, giving 12,005 elements and 18,007 nodes. It also has a
  document listener, a MutationObserver on the body and focus on a `td`.

After every reset the script checks the following and recorded no problems in any run:

- body and head are empty, and body has no attributes
- `activeElement` is body
- `localStorage` is empty, there is no cookie and the URL is back to `http://localhost:3000/`
- the added window property is gone

## Command

```
cd docs/research/data/reset-bench-208ad49
node reset-bench.mjs <warpdom-208ad49-worktree> --json results.json
```

The warpdom path can also be given as `WARPDOM_DIR`. `BENCH_REPS`, `BENCH_WARMUP` and `BENCH_JSDOM` override the defaults (200, 50, `30.1.2`).

## Environment

- Apple M4 Pro, 24 GB RAM (`hw.memsize` 25769803776), macOS (Darwin 25.6.0, arm64)
- Node v22.17.1
- A laptop in normal use; no CPU pinning; the defaults of the run were used (no `--expose-gc`, no forced GC).

## Results (ms per reset, `results.txt`)

| timed | state | nodes before reset | median | p10 | p90 | max |
|---|---|---:|---:|---:|---:|---:|
| env reset | (a) untouched | 5 | 0.049 | 0.022 | 0.085 | 2.58 |
| env reset | (b) typical test file | 816 | 0.085 | 0.041 | 0.127 | 5.89 |
| env reset | (c) large tree | 18,007 | 0.077 | 0.065 | 0.172 | 12.06 |
| resetWindow only | (a) untouched | 5 | 0.046 | 0.017 | 0.089 | 9.14 |
| resetWindow only | (b) typical test file | 816 | 0.088 | 0.054 | 0.138 | 3.38 |
| resetWindow only | (c) large tree | 18,007 | 0.078 | 0.061 | 0.177 | 20.04 |

The two repeat runs (`results-repeats.txt`) varied as follows:

| state | env reset median | env reset p90 |
|---|---|---|
| (a) untouched | 0.047-0.059 | 0.085-0.112 |
| (b) typical test file | 0.079-0.088 | 0.144-0.149 |
| (c) large tree | 0.078-0.080 | 0.166-0.170 |

In the repeat runs, max values went up to 88 ms.

Summary: the median reset takes under 0.1 ms in every state, and p90 stays under 0.2 ms. Tree size has little effect because
the reset detaches only the children of the document and of the four kept nodes (doctype, html, head, body). It does not walk the subtree.

## Caveats

- This is a micro-benchmark on a laptop. Absolute numbers depend on the machine and its load.
- The max values are single outliers (up to 88 ms in one repeat run). They are most likely garbage-collection pauses, and the
  large-tree state creates the most garbage. The max is the least stable statistic; the medians and p90 are stable across runs.
- The timing covers only warpdom's reset. The file `src/vitest-reset.js` runs four more calls before each test file in no-isolate
  mode, and none of them is timed here: `vi.useRealTimers()`, `vi.restoreAllMocks()`, `vi.unstubAllGlobals()` and `vi.unstubAllEnvs()`.
  Vitest's own per-file work is not timed either (module graph, setup files, collecting tests).
- The work a reset leaves for later is not counted. That includes garbage collection of the detached tree, and the cost of
  recreating state on first use in the next file.
- A test that assigns `globalThis.x` under Vitest's non-VM pools writes to Node's global, not to the window. The window reset does
  not remove such a property; the benchmark therefore sets its "library global" on the window object.
- The jsdom 30.1.2 profile was the only one measured.
