# warpdom

A DOM for unit and component tests: **your tests get the same results as
on jsdom, and run faster.** A drop-in environment for Vitest and Jest,
written from the WHATWG specifications.

- **Same results.** On 14 open-source suites (MUI, React Spectrum,
  handsontable, Radix, Vuetify, ariakit, svelte and more; about 42,000
  tests), every test has the status it has on jsdom, apart from flaky
  tests and a short list of deliberate differences (below).
- **Faster on every suite we measured**: 1.08x to 8.8x drop-in; with fast
  mode (Vitest), 6x to 8x on DOM-heavy suites.
- **Check it on your own suite in one command**: `npx warpdom compare`.

Status: pre-release. Numbers, method and raw data:
[docs/research/README.md](docs/research/README.md).

## Requirements

Node 22.12 or later. Vitest 2 or later (tested with 2, 3, 4 and 5) or Jest
27 or later (tested with 27 and 30). Fast mode needs Vitest 3.2 or later.

## Setup

```sh
npm install --save-dev warpdom
```

**Vitest.** Vitest takes a path (or a `vitest-environment-<name>` package)
as `test.environment`; warpdom exports the path:

```js
// vitest.config.js
import { defineConfig } from 'vitest/config';
import { environment } from 'warpdom/vitest/environment';

export default defineConfig({
  test: { environment },
});
```

Or install the small companion package `vitest-environment-warpdom` too,
and use the name: `test: { environment: 'warpdom' }`.

With `test.projects`, set it on the projects that use jsdom today.

**Jest.**

```js
// jest.config.js
module.exports = {
  testEnvironment: 'warpdom/jest',
};
```

Test files that choose jsdom with a comment (`/** @vitest-environment jsdom */`,
`@jest-environment jsdom`) keep using jsdom; change the comment to switch
them.

### Which jsdom warpdom behaves like

Test suites encode the behavior of the jsdom version they were written
against (for example, `getComputedStyle` returned empty strings for most
properties before jsdom 29, and initial values since). warpdom detects the
jsdom your project installs (and, for jsdom 26 and earlier, the cssstyle
version it loads) and follows that version's observable behavior. To set it
yourself:

```js
// Vitest
test: { environment, environmentOptions: { warpdom: { jsdom: '26.1.0' } } }
// Jest
testEnvironmentOptions: { jsdom: '26.1.0' }
```

## Check your suite first: `warpdom compare`

```sh
npx warpdom compare                 # one round: results and an indicative speedup
npx warpdom compare --rounds 3      # numbers worth quoting
npx warpdom compare --correctness   # results only (for CI)
```

Run it where you run `vitest` or `jest`. It runs your suite on jsdom (or
happy-dom, whichever you use) and on warpdom, and reports every test whose
status changes, grouped by error, and the speedup. Nothing in your project
is edited. It exits 1 if any test that passes on jsdom fails on warpdom. The
report's summary contains no file or test names, so it can be shared.
Monorepos with Vitest projects or workspaces and Jest projects are
supported. Details: [docs/compare.md](docs/compare.md).

## Faster still

**Fast mode (Vitest).** Vitest isolates every test file, and reloading
modules per file is most of a component suite's time. Fast mode runs files
without isolation and resets warpdom's window between them; files that
still leak module state are learned and run isolated. It measures both and
keeps the faster, so it is never slower than a normal run.
[docs/fast-mode.md](docs/fast-mode.md)

```js
// vitest.config.js
import { withFastMode } from 'warpdom/vitest/fast';
export default withFastMode({ test: { environment: 'warpdom' } });
```

```sh
npx warpdom vitest run
```

**Fast frames (opt-in).** `requestAnimationFrame` normally waits 16.7 ms of
real time per frame, in jsdom and warpdom. With `fastFrames`, frames run as
soon as the event loop gets to them; suites whose test helpers wait for
frames get much faster (ariakit 1.6x). A few tests can change result, so it
is off by default: check with `npx warpdom compare --fast-frames`.
[docs/fast-frames.md](docs/fast-frames.md)

```js
// Vitest
test: { environment, environmentOptions: { warpdom: { fastFrames: true } } }
// Jest
testEnvironmentOptions: { fastFrames: true }
```

## Measured

Time to run each suite: GitHub Actions, Linux, pinned project commits,
median of 3 rounds, 2026-10-12, drop-in (each project's own jsdom and
config, 2 workers):

| Suite | jsdom | warpdom | happy-dom | Tests that change result: warpdom / happy-dom |
| --- | ---: | ---: | ---: | --- |
| ariakit | 13m 50s | 9m 00s | 7m 43s | 11 / 51 |
| handsontable | 13m 46s | 1m 32s | – | 3 / – |
| React Spectrum | 11m 50s | 9m 11s | 10m 28s | 0 / 1,445 |
| MUI | 7m 52s | 4m 07s | 5m 34s | 1 / 1,039 |
| CopilotKit | 7m 48s | 6m 14s | 50.9 s ¹ | 0 / 4,676 |
| ark-ui | 3m 55s | 2m 23s | 2m 44s | 2 / 115 |
| svelte | 2m 18s | 2m 05s | 2m 06s | 1 / 288 |
| Vuetify | 1m 20s | 52.0 s | 53.1 s | 0 / 4 |
| emoji-picker-element | 53.1 s | 40.2 s | 46.0 s | 0 / 1 |
| Radix | 44.4 s | 23.6 s | 29.6 s | 0 / 18 |
| analog | 41.2 s | 33.5 s | 35.9 s | 0 / 2 |
| floating-ui | 29.4 s | 18.8 s | 22.6 s | 0 / 14 |
| react-hook-form | 23.8 s | 17.5 s | 22.3 s | 0 / 7 |
| solid | 5.2 s | 4.8 s | 4.7 s | 1 / 0 |

¹ CopilotKit is faster on happy-dom because 4,676 of its tests break there.
handsontable's happy-dom run is still to be measured.

warpdom is faster than jsdom on every suite: from 1.08x (solid) to 8.8x
(handsontable). The suites fall into two groups, about 1.1x to 1.3x and
1.5x to 1.9x (plus handsontable), so a single median says little: over the
13 three-way suites it is 1.32x, with a 95% bootstrap interval of 1.25x to
1.57x. A faster DOM only speeds up the part of a run spent in the DOM;
compilers, frameworks and waiting stay as they are.
warpdom's changed results are flaky tests that also change on jsdom,
ariakit tests that fail on jsdom and pass on warpdom (plus two fixed since),
and one deliberate difference in svelte. Full tables, fast mode, profiles
and caveats: [docs/research/README.md](docs/research/README.md).

Web Platform Tests (dom, domparsing, html/dom, css/cssom; 963 files):
warpdom passes 87.4% of subtests (jsdom 30: 80.4%), with a per-file score of
75.9% (jsdom: 71.1%). The runner is in [wpt/](wpt/).

## Differences from jsdom

warpdom matches jsdom's observable behavior where tests depend on it, and
otherwise follows the standards. Deliberate differences, each with a test
(full list in [PLAN.md](PLAN.md), "Deliberate deviations from jsdom"):

- `DOMException` is an `Error` in the test's realm, as the standard says
  (in Vitest's default pools jsdom's is not).
- `tabindex="abc"` gives the element's default tab index (jsdom: 0); a
  disabled `fieldset` is not focusable.
- Standard behavior where jsdom deviates: `FormData` and disabled options,
  `formnovalidate`, `Selection.containsNode`, event handler re-registration
  order, failed custom elements and `:defined`, XPath functions jsdom's
  engine gets wrong.
- Additions jsdom lacks: `innerText`/`outerText`, `Selection.direction`,
  Range `getClientRects()`/`getBoundingClientRect()` (empty), element
  interfaces and reflected attributes from the current HTML standard.

Not implemented (jsdom lacks these too): layout (sizes and positions are
0, as in jsdom), `inert`, loading external style sheets, scripts or pages,
navigation to other documents.

Not implemented, unlike jsdom: `XMLHttpRequest`. In 4,151 test files of 20
projects we traced, no test used it; HTTP libraries that feature-detect it
(axios) fall back to Node's HTTP client, which request mocking (nock, msw)
intercepts as well. If your suite tests XHR itself, `warpdom compare` will
show it; please report it.

## API

```js
import { createWindow } from 'warpdom';

const window = createWindow({ url: 'http://localhost/', jsdom: '30.1.2', fastFrames: false });
window.document.body.innerHTML = '<p>hello</p>';
```

`warpdom/compare` exports `compare(options)`, the API behind the CLI.

## Development

```sh
npm test              # unit and parity tests (node:test; parity tests run jsdom side by side)
npm run bench:load    # cold load and window creation
npm run bench:hot     # hot DOM members against jsdom and happy-dom
node wpt/run.mjs dom/nodes --engine warpdom,jsdom   # Web Platform Tests
```

warpdom is written from the specifications; jsdom is used as a black-box
reference (its source is not read or copied). Plans and decisions:
[PLAN.md](PLAN.md); architecture: [docs/design.md](docs/design.md).

## License

MIT
