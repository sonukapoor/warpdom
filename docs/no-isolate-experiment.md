# Where the remaining time goes, and running without isolation

*2026-10-09. Vitest 4, Node 22.23.3, two workers.*

## A faster DOM alone has a ceiling

On Radix, warpdom matches jsdom's results and runs in 11.5 s against 20.0 s
(jsdom) and 13.0 s (happy-dom). CPU profiles show why more DOM speed will
not move that much:

| | jsdom run | warpdom run |
| --- | --- | --- |
| CPU time | 29.6 s | 14.6 s |
| In the DOM | ~14.7 s (50%) | a few percent |

The rest is the same in both: Vitest starts a process per test file (45 for
Radix) and loads Vitest, React, Testing Library and axe in each (module
loading and file system calls are about a third of CPU), then React, axe
and transforms. Across the stage 1 corpus jsdom is 26-54% of CPU, so a DOM
swap alone tops out around 1.4-2.2x.

Idle time looked like a second lever (jsdom suites spend much longer
waiting than happy-dom ones), and jsdom's requestAnimationFrame waits about
18 ms where happy-dom's runs immediately. But running warpdom's frames
immediately changed Radix only from ~10.6 s to ~10.35 s, and Handsontable's
helpers enforce minimum waits regardless of the DOM. Not pursued.

## Running without isolation

`--no-isolate` shares processes and modules between test files. Vitest then
keeps one window per worker, so DOM state leaks between files.

| Suite | Isolated | `--no-isolate` | `--no-isolate` + fresh jsdom window per file |
| --- | --- | --- | --- |
| Radix (warpdom) | 11.6 s | 6.2 s, same results | (not needed) |
| Radix (jsdom) | 17.8 s | 7.4 s, same results | (not needed) |
| Vuetify (jsdom) | 17 s, 943 pass / 4 fail | 29 s, 915 / 32 | **4 s, 943 / 4: same tests** |
| emoji-picker-element (jsdom) | 24 s, 157 pass | 11 s, 97 / 60 fail | 7 s, 82 / 75 fail |

The fresh window was a setup file run first in each test file that created
a new JSDOM and installed it with Vitest's `populateGlobal`.

- **Vuetify's no-isolate failures are DOM state** (listeners accumulating on
  the shared document, e.g. the hotkey tests). A fresh window per file fixes
  them all: 4.25x faster than isolated, identical results.
- **emoji-picker's are window-bound module state.** Its modules define
  custom elements once, against the first window's `HTMLElement`; shared
  modules never redefine them in a new window, so a fresh window fails more.

## Direction

Reset the document and window state between test files while keeping the
window, its interface objects and registries (what shared modules hold on
to): a new document, no leftover listeners, timers, storage or location,
but the same `HTMLElement`, `customElements` and prototypes. That should fix
both kinds of failure, and only a DOM with near-free setup can do it per
file. To try once warpdom passes Vuetify and emoji-picker isolated.

## Result: warpdom's per-file reset

`warpdom/vitest/reset` (a setup file listed first) resets the window in
place before each test file (`src/reset.js`): the same document, window,
interface objects and custom element definitions, but an emptied initial
tree (the same `html`, `head` and `body` elements, since Testing Library's
`screen` holds `document.body`), no listeners, handlers, attributes or
added properties on them (libraries mark a document they have set up),
focus, selection, observers, animation frames, URL, history and viewport
back to their initial state.

warpdom, Vitest, two workers:

| Suite | Isolated | `--no-isolate` | `--no-isolate` + reset |
| --- | --- | --- | --- |
| Radix | 10.4 s, 976 pass | 5.7 s, same | 6.1 s, same tests pass |
| Vuetify | 10.8 s, 943 pass / 4 fail | 32.6 s, 914 / 33 | **3.0 s, same tests as isolated** |
| emoji-picker | 19.7 s, 157 pass | 29.2 s, 123 / 34 | 28.1 s, 123 / 34 |

Against jsdom isolated (Radix 20.0 s, Vuetify 15.0 s) that is 3.3x and 5x
with identical results. emoji-picker's failures are module state the
reset cannot reach: it detects ResizeObserver once, when its module loads
(`resizeObserverSupported`), and one test file removes it; with shared
modules, later files inherit that.

So a suite can use the fast mode when its tests do not depend on per-file
module state; the reset covers the DOM side, which is the common leak
(Vuetify's listeners). Suites that leak module state stay isolated.

Found along the way: Vitest 3 cannot load an environment from outside the
project root a second time with `--no-isolate` (its resolve call times
out, even for an empty environment). Installed as a package, warpdom is
inside the project, so this only affected the experiment setup.

## Follow-up: Vitest state between files

In the head-to-head (docs/head-to-head.md), one round in three had 5
Vuetify tests time out in reset mode. Cause: `ripple.spec.ts` and
`helpers.spec.ts` turn on fake timers and never turn them off; without
isolation, a later file in the same worker inherits frozen timers. The
reset setup file now also undoes Vitest's per-file runtime state (real
timers, restored spies, unstubbed globals and environment variables), as
isolation would.
