# WPT conformance runner

Runs [Web Platform Tests](https://web-platform-tests.org/) (testharness.js
tests) against warpdom, and against jsdom as a reference, and reports a
conformance number per WPT directory: test files, subtests, subtests passed.
Every results file records the WPT commit, the warpdom commit, the engine
version and the Node version, so numbers are comparable over time.

The runner is written from WPT's public documentation (testharness.js API,
test types, `META` comments, file name flags, generated boilerplate for
`.any.js` and `.window.js`). jsdom is used only as a black box through its
public API.

## Setup

A sparse, shallow WPT checkout (about 45 MB with these directories):

```sh
cd ~/Projects
git clone --depth 1 --filter=blob:none --sparse https://github.com/web-platform-tests/wpt.git wpt
cd wpt
git sparse-checkout set dom domparsing html/dom css/cssom resources common interfaces
# optional: git sparse-checkout add html/semantics/forms
```

`resources/` (testharness.js, idlharness.js, WebIDL parser) and
`interfaces/` (IDL files for idlharness tests) are needed by most
directories; `common/` by some. The runner finds the checkout at
`~/Projects/wpt`, `$WPT_DIR` or `--wpt <dir>`. jsdom comes from warpdom's
dev dependencies.

## Running

```sh
# one directory, warpdom only
node wpt/run.mjs dom/nodes

# several directories, warpdom and jsdom side by side
node wpt/run.mjs dom/traversal dom/collections --engine warpdom,jsdom

# a deterministic sample of 30 files (same files for the same seed and checkout)
node wpt/run.mjs dom/nodes --sample 30 --seed 1 --engine warpdom,jsdom

# single files, or a substring filter
node wpt/run.mjs dom/nodes/Node-isEqualNode.html
node wpt/run.mjs dom/nodes --filter ParentNode

# another warpdom checkout (e.g. main) with this runner
node wpt/run.mjs dom/nodes --warpdom ~/Projects/warpdom
```

Options: `--jobs N` (files in parallel, default 1), `--max-memory MB`
(resident memory per test process, default 1536: a watchdog polls it four
times a second and stops a file that goes over, recorded as CRASH with
the reason; the JS heap limit is set to 75% of it), `--timeout-multiplier X`
(scales testharness.js timeouts: 10 s per file, 60 s for `timeout=long`),
`--out <dir>` (default `wpt/results/<timestamp>/`, ignored by git),
`--depth N` (group the tables by the first N path segments),
`--no-skip` (ignore `expectations.json`), `--include-testdriver`,
`--include-tentative`, `--quiet`.

Harness self-test (a failure there is a runner problem, not an engine bug):

```sh
node wpt/selftest/run.mjs
```

## Results

`<out>/<engine>.json`:

```js
{
  meta: { engine, engineVersion, warpdomCommit, warpdomSrcDirty, wptCommit, node, os, cpu,
          date, paths, sample, timeoutMultiplier, wallClockMs, ... },
  results: {                       // per test id (file path plus variant query)
    "dom/nodes/Node-isEqualNode.html": {
      file, harness: "OK" | "ERROR" | "TIMEOUT" | "PRECONDITION_FAILED" | "CRASH",
      message, durationMs,
      subtests: [{ name, status: "PASS" | "FAIL" | "TIMEOUT" | "NOTRUN" | "PRECONDITION_FAILED", message }],
      notes?,                      // runner notes: scripts not available, engine "not implemented" logs
      log?                         // tail of the process output when the harness status is not OK
    }
  },
  skipped: { id: reason },         // expectations.json, testdriver, tentative
  notRunnable: { id: reason }      // XML documents, worker-only tests
}
```

`<out>/summary.md` has a table per engine and, with several engines, a side
by side table. `node wpt/summary.mjs <out> [--depth N] [--diff]` rebuilds the
tables from results files; `--diff` lists subtests that pass in one engine and
not the other.

Columns:

- **Subtests / Passed / Pass rate**: every subtest counts once. A file that
  reports no subtests counts as one subtest, passed if the harness status is
  OK.
- **Score**: per file, as wpt.fyi does: each file contributes
  passed/subtests, averaged over files. A file with 1,500 generated subtests
  (dom/traversal) weighs as much as one with 3, so the score is the better
  headline number; the raw pass rate is dominated by a few large files.
- **Side by side**: each engine is scored against the union of the subtest
  names any engine reported for a file. When a harness error stops one
  engine early, the subtests it never defined count as failures for it.

## How a test runs

1. **Discovery** (`lib/discover.mjs`): `.html`/`.htm` files that load
   `/resources/testharness.js`; `.any.js` (when its `META: global` includes
   window, the default) and `.window.js` as the generated `.any.html` and
   `.window.html` pages; one test per variant (`<meta name="variant">`,
   `META: variant`). Not tests: `resources/`, `support/`, `tools/`,
   `crashtests/`, references, `-manual` files. XML documents (`.xhtml`,
   `.svg`) and worker-only tests are listed as not runnable.
2. **One process per test file** (`lib/child.mjs`), at most `--jobs` at a
   time. Each file gets a fresh realm, window, timers and globals; a hang or
   crash affects only that file. The parent kills a process at the harness
   timeout plus 15 s and keeps the subtests it reported so far.
3. **The window** (`lib/engines.mjs`):
   - warpdom: `createWindow({ url })` installed on the process's global object
     the way warpdom's Vitest environment does it (`installWindow` from
     `src/vitest.js`, Node's timers kept), so test scripts, warpdom and the
     built-ins share one realm (`assert_throws_js(TypeError, ...)` compares
     constructors). Interface objects are then made data properties of the
     global, as WebIDL requires (installWindow uses accessors).
   - jsdom: `new JSDOM('', { url, runScripts: 'outside-only' })`; scripts run
     in its VM context. The runner waits for jsdom's own initial load event
     first.
   - URL: `http://web-platform.test:8000/<path>` (`https://...:8443` for
     `.https.` files).
4. **Loading the page** (`lib/page.mjs`). Neither engine loads pages or runs
   `<script>` elements here, so the runner does: it parses the page with the
   engine's `DOMParser`, then moves the nodes one at a time, in tree order,
   into the window's document, as a parser inserts them. A script runs as
   soon as it is inserted, so it sees the elements before it and not those
   after it; tasks and microtasks run between scripts. Deferred and async
   classic scripts and module scripts run after parsing, in order. Then
   `DOMContentLoaded` fires at the document and `load` at the window (trusted
   events in warpdom). External scripts are read from the checkout;
   `/resources/testharnessreport.js` is replaced by the runner's reporter,
   which turns off testharness.js's HTML output and sends results to the
   parent. `.sub.` files get wptserve's host, port, query and location
   substitutions. A `fetch()` serves files of the checkout (for idlharness's
   IDL files); other origins fail as network errors.
5. **Errors**: an exception thrown by a script, a timer or a listener fires an
   `ErrorEvent` at the window and an unhandled rejection an
   `unhandledrejection` event, which testharness.js turns into harness
   status ERROR, as in a browser.

## Expectations

`expectations.json` lists tests that are not run, each with a reason; a
path ending in `/` covers a directory, `engines` limits an entry to some
engines. Entries are only for tests that cannot work in a DOM-only runner
(network, other origins, iframes loading pages, layout and scrolling, user
input) or that hang. A test that runs and fails is a result, not a skip.
Two groups are skipped by the runner itself: tests that load
`/resources/testdriver.js` (user input automation through WebDriver; most of
`dom/events/`), and tentative tests (proposals not yet in a standard).
Skipped and not-runnable tests are listed in every results file.

## Limits of the method

- **Not a browser.** No server (`.py` handlers, headers files, redirects,
  other origins), no iframes or windows loading pages, no layout, no user
  input, no workers. Tests that need these fail, time out or are skipped.
  Numbers are for the subset of WPT a DOM for unit tests can meet, and are
  not comparable with browser numbers on wpt.fyi.
- **The page is loaded by the runner, not the engine.** Not modeled:
  `document.readyState` changes, `document.currentScript`,
  `document.write`, the parser's error recovery while scripts run (the whole
  page is parsed first and then inserted), character encodings (pages are
  read as UTF-8), quirks mode of the main document in jsdom (warpdom's
  document takes the parsed page's mode), import maps, style sheet and
  image loading. Scripts inserted by tests are not executed by
  either engine (warpdom never runs scripts; jsdom does not with
  `outside-only`), so tests of script execution fail for both.
- **Engine-specific setup**: warpdom runs on the global object of the
  process with the Vitest environment's installation, so window operations
  on the global are accessors (idlharness notices) and `performance` and
  the timers are Node's. jsdom with `outside-only` does not compile event
  handler content attributes (`onload="..."`), and its load events are
  untrusted (no public API fires trusted events).
- **Samples**: `--sample` picks files by a hash of their path and the seed;
  a sample's pass rate is an estimate for the directory, not its number.
- **One machine, one run.** Results are deterministic apart from tests that
  race with timers; durations depend on the machine.

## Memory

A full run over dom, domparsing, html/dom and css/cssom with two engines and
`--jobs 2` once pushed a 24 GB machine into running out of memory: html/dom
has files with tens of thousands of generated subtests. Run large
directories separately, keep `--jobs 1` for full runs, and keep the
`--max-memory` limit (the runner warns at startup when jobs x limit is more
than half of the free memory).

