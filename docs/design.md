# warpdom design

## Goal

A drop-in test environment for Vitest and Jest that loads almost instantly
and behaves like jsdom, so existing suites run unchanged and faster. Evidence
for the goal is summarized in `PLAN.md`; the measurements live in the
dom-api-tracer repository.

## Architecture

**Implementation once, windows cheap.** Every interface (`Node`, `Element`,
`HTMLElement`, ...) is declared once per module load as a table of property
descriptors. `createWindow()` builds the window's own prototype chain from
those tables: one fresh prototype object and constructor per interface. A test
patching `window.HTMLElement.prototype` therefore changes only that window, as
in jsdom, while the expensive part (defining behavior) is never repeated.

**Lazy where possible.** The per-window layer is the next target for
laziness: interfaces a test never touches should not be set up (the spike
spent 2.2 ms per window copying 3,710 members; happy-dom needs 0.3 ms).

**Internal state off the public surface.** Node state lives in fields keyed
by module-private symbols, so it is invisible to `Object.keys`, `for...in`
and serializers like pretty-format, and cannot collide with test code.

**Shape follows jsdom.** Members are defined on the same interface as in
jsdom (e.g. `offsetWidth` on `HTMLElement.prototype` as an accessor), since
tests spy on them there. The interface list and member placement can be
checked against `spikes/fast-start/shapes.json` in dom-api-tracer.

**No Node built-ins in the core**, so the same code can later run in edge
runtimes and SSR.

## Load-time budget

Cold load in a fresh process, measured by `npm run bench:load`:

| | Load |
| --- | --- |
| jsdom 30 | 176 ms |
| happy-dom 20 | ~85 ms |
| spike prototype | 11 ms |
| **warpdom budget** | **<= 30-40 ms with the full milestone scope** |

## Milestone 1: Radix Primitives passes on warpdom

Radix's suite (45 test files, 982 tests, Vitest + jsdom, React + Testing
Library) is the first target: mid-sized, typical component-library usage,
already in the corpus.

1. Vitest environment adapter (`warpdom/vitest`), installing window globals
   the way Vitest's jsdom environment does.
2. Implement what Radix uses: 297 members according to the tracer, ordered by
   breadth; HTML parsing for `innerHTML` through parse5.
3. Run the suite through the dom-api-tracer harness
   (`--environment` with a warpdom option), iterate until it passes the same
   tests as on jsdom.
4. Measure: wall time and per-file environment time vs jsdom and happy-dom,
   and cold load time against the budget.

Then react-hook-form (Jest) for the Jest adapter, then MUI.
