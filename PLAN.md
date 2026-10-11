# warpdom plan

> This plan lives in the warpdom repository (private:
> github.com/sonukapoor/warpdom) since 2026-10-09. Measurement tools and
> reports stay in the dom-api-tracer repository; `docs/...` paths below that
> are not in this repo refer to it.

## Goal

A new DOM implementation for JavaScript testing: faster than happy-dom, with
near-jsdom spec correctness, shipped as a drop-in Vitest/Jest environment.
Long term: replace jsdom and happy-dom for unit tests, then expand to SSR and
edge runtimes (the core must not depend on Node built-ins).

Adoption evidence matters as much as code: reproducible benchmarks, public
WPT conformance numbers, and real projects migrating.

## Roadmap

1. **Measure** (current): trace which DOM APIs real test suites use, across
   20-30 popular open-source component libraries; publish the aggregated
   report.
2. **Build the DOM** (separate repo): pure-JS core, compact internal tree,
   lazily materialized node objects, near-free environment startup, parse5
   for parsing at first. Scope and hot paths come from stage 1 data.
3. **Prove it**: Vitest + Jest environments, WPT pass-rate dashboard,
   benchmarks on real suites vs jsdom/happy-dom/linkedom, including losses.
4. **Adoption**: migration PRs to well-known OSS projects showing CI time saved.

## Product

**warpdom: a DOM for unit tests that loads almost instantly and behaves like
jsdom**, shipped as a drop-in Vitest and Jest environment. An independent
implementation of the WHATWG DOM/HTML standards (not a fork or wrapper),
jsdom-compatible where tests can observe it, scoped by measured usage.

## Status

Stage 1 data collection is complete (2026-10-08): 20 projects, 4,151 test
files, ~80,000 tests, jsdom and happy-dom, traced with the final tracer on
Node 22.23.3; every project passes the same tests with and without the
tracer. First report draft: `docs/stage1-report.md` (figures from
`scripts/report-data.mjs`).

Corpus result (`.corpus/report/`, regenerate with the harness):

- 1,159 DOM members used. The catalog (7,431) is the union of several jsdom
  and happy-dom versions, so per-environment coverage is the fairer figure
  for the report.
- 1,148 members used; per environment 17.1% of jsdom's catalog, 17.4% of
  happy-dom's. 165 members are used by at least half of the projects
  ("core"); 815 by at least two.
- 56 members cover 90% of the 282M recorded operations; 8 cover 50%. Three
  projects (AG Grid, React Spectrum, Mantine) make 76% of operations, so the
  report ranks members with every project weighted equally.
- Used by every project except Svelte's runtime suite (which reads almost
  nothing outside its own compiled output): `Document#body`,
  `Document#createElement`, `Node#appendChild`,
  `EventTarget#addEventListener`, `Node#parentNode`, `Element#setAttribute`,
  `Element#getAttribute`, `Element#querySelectorAll`, `Node#nodeType`,
  `Element#attributes`, `Element#innerHTML`, ...
- `window#navigator` is read by all 20, probably environment detection in
  test tooling (runner and library code is counted).
- Raw operation counts are concentrated in a few files and suites (see the
  Testing Library `waitFor` finding and the grid findings below).
- Tracer overhead: mostly 0-20%; Jest + jsdom suites with heavy DOM work
  up to ~2x (Handsontable core 2.1x, Mantine 1.9x).

## Corpus

Run with `node scripts/trace-corpus.mjs --repos-dir ~/Projects`. Why each
package is included or excluded is in the `notes` field of `corpus/corpus.json`.

Same-status survey on warpdom (2026-10-11, after the jsdom profile, cookies,
base URLs, FileReader, AbortSignal, trusted events, window operations and
targets): tests whose status differs from jsdom's. 0 in react-hook-form,
Vuetify, svelte, floating-ui, emoji-picker-element, analog, Radix, MUI,
CopilotKit. react-spectrum 1 (304 a day earlier; left: CSS value validation,
ProgressBar width undefined%). handsontable 16 (CSS value validation).
ark-ui 1 (Editable: a typing race that fails about 1 run in 3 under load).
solid 1 (fails on jsdom too in some file orders, isolate: false). ariakit:
9 tests fail on jsdom and pass on warpdom (proxy defineProperty, a
CompositionEvent view check).

| Project | Framework / kind | DOM | Status (2026-10-08) | Files | Tests | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| floating-ui | React, Vue positioning | jsdom | traced | 24 | 340 | |
| solid | Solid runtime | jsdom | traced | 27 | 482 | `isolate: false` |
| analog | Angular | jsdom | traced | 18 | 194 | needs release build; 1 package browser-only |
| CopilotKit | React, Vue, Angular, web components | jsdom | traced | 327 | 3,860 | needs build; some files fail in both runs |
| handsontable | data grid | jsdom | traced | 554 | 8,082 | core + React/Vue/Angular wrappers |
| ag-grid | data grid | happy-dom | traced | 717 | 11,694 | release branch b36.2.0 |
| material-ui | React design system | jsdom | traced | 266 | 6,770 | needs Node >= 22.23.3 |
| ariakit | React + Solid a11y | happy-dom (+ some jsdom files) | traced | 264 | 1,857 | |
| element-plus | Vue design system | jsdom (+ some happy-dom files) | traced | 161 | 2,634 | |
| ngx-formly | Angular forms | happy-dom (Jest) | traced | 60 | 854 | |
| kobalte | Solid headless | jsdom | traced | 23 | 192 | one early run showed 182 vs 189 passing; all later runs 189/189 |
| radix-primitives | React headless | jsdom | traced | 45 | 982 | |
| react-hook-form | React forms | jsdom (Jest) | traced | 124 | 1,515 | |
| vuetify | Vue design system | jsdom | traced | 73 | 947 | browser project excluded |
| svelte | Svelte runtime | jsdom | traced | 9 | 7,879 | coarse: few files, many samples |
| react-spectrum | React design system, a11y | jsdom (Jest) | traced | 384 | 8,456 | |
| emoji-picker-element | web component, shadow DOM | jsdom | traced | 31 | 160 | only jsdom-tested WC library found |
| mantine | React design system | jsdom (Jest) | traced | 727 | 17,861 | TS Jest config; tracer overhead 1.9x |
| nuxt-ui | Vue/Nuxt design system | happy-dom | traced | 143 | 4,056 | needs `dev:prepare` |
| ark-ui | React/Vue/Solid/Svelte headless | happy-dom + jsdom | traced | 174 | 1,245 | needs bun 1.4 (via npx) |
| taiga-ui | Angular design system | jsdom (Jest) | deferred | | | needs Node >= 26 and an Nx build |
| motion | React | | candidate | | | Jest, not installed |
| preact | Preact | | rejected | | | Vitest browser mode |
| cve-lite-cli `examples/*` | - | | rejected | | | lockfile-only fixtures |
| Angular Material, Chart.js | Angular, - | | rejected | | | Karma (real browser) |

All traced projects pass the same tests with and without the tracer. Every
project was (re-)traced on 2026-10-08 with the final tracer on Node 22.23.3.

**Shortlist (2026-10-07 survey of 45 repos on GitHub; not cloned yet).**
Verdicts are from configs only; builds and per-file environments unverified.

| # | Project | Framework / kind | Runner, DOM | Notes |
| --- | --- | --- | --- | --- |
| 1 | mui/material-ui | React design system | Vitest, jsdom | ~380 files; needs `TEST_SCOPE=node`, `TZ=UTC` |
| 2 | adobe/react-spectrum | React design system, a11y | Jest, jsdom | ~460 files; yarn 4; `STRICT_MODE=1 VIRT_ON=1` |
| 3 | ariakit/ariakit | React + Solid a11y | Vitest, **happy-dom** | ~480 files |
| 4 | element-plus/element-plus | Vue design system | Vitest, jsdom | ~160 files |
| 5 | nuxt/ui | Vue/Nuxt design system | Vitest, **happy-dom** | ~150 files; `--project vue`; may need `nuxt prepare` |
| 6 | chakra-ui/ark | React/Vue/Solid/Svelte headless | Vitest, happy-dom (React, Vue), jsdom (Solid, Svelte) | ~176 files; bun |
| 7 | mantinedev/mantine | React design system | Jest, jsdom | ~725 files; `jest.config.ts` |
| 8 | taiga-family/taiga-ui | Angular design system | Jest, jsdom | ~300 files; config in package.json, run via nx |
| 9 | ngx-formly/ngx-formly | Angular forms | Jest, **happy-dom** | ~60 files; first Jest + happy-dom suite |
| 10 | react-hook-form | React forms | Jest, jsdom | ~124 files; `TEST_ENV=web` |
| 11 | sveltejs/svelte | Svelte runtime | Vitest, jsdom (per-file comment) | ~20 files driving ~2,300 samples; coarse per-file data |
| 12 | radix-ui/primitives | React headless | Vitest, jsdom | ~45 files |
| 13 | vuetifyjs/vuetify | Vue design system | Vitest, jsdom | ~73 unit files; `--project unit` |
| 14 | primevue or reka-ui | Vue | Vitest, jsdom | ~80 files each |
| 15 | kobaltedev/kobalte | Solid headless | Vitest, jsdom, no-isolate | ~42 files |
| 16 | vuejs/core | Vue runtime | Vitest, jsdom | ~32 files; `--project unit-jsdom` |
| 17 | ant-design/ant-design | React design system | Jest, jsdom | ~640 files; huge |
| 18 | emoji-picker-element | vanilla custom element, shadow DOM | Vitest, jsdom | ~31 files; only usable web-component suite found |
| 19 | vueuse or vee-validate | Vue composables / forms | Vitest, jsdom | |

Alternates: chakra-ui, solid-primitives, melt-ui, TanStack/router (build
first), headlessui (Jest 26 / jsdom 16), formkit (build first).

Rejected by the survey: lit, shoelace/webawesome, FAST, LWC, Ionic core
(real browser or Stencil mock-doc); angular/components, ng-bootstrap,
ng-zorro, primeng, spartan (real browser); skeleton, bits-ui components,
primer/react, preact, @preact/signals (Vitest browser mode); formik,
final-form, TanStack table/virtual/form (too little DOM use).

**Gap:** web components and Lit are almost all tested in real browsers, so the
corpus will be thin there (emoji-picker-element, plus CopilotKit's
web-components package).

## Deliberate deviations from jsdom

Where jsdom departs from the standard in ways no realistic test relies on,
warpdom follows the standard. Each has a test. To publish in the docs.

- `tabIndex` parses the attribute with the rules for parsing integers:
  `tabindex="abc"` gives the element's default (-1 on a div); jsdom gives 0.
- A disabled `fieldset` is not focusable even with a `tabindex`; jsdom
  focuses it.
- A document without a browsing context has `visibilityState` 'hidden'
  (jsdom: 'prerender', no longer a state in the standard), and
  `document.onvisibilitychange` runs (jsdom does not call it).
- A document from DOMParser is cookie-averse (no browsing context):
  `document.cookie` is empty and ignores writes; jsdom gives it a cookie
  store of its own.
- A submit button with `formnovalidate` submits without validating the
  form; jsdom only honors the form's `novalidate`.
- The `input` event fired by clicking a checkbox or radio button is
  composed; jsdom's is not.
- `Selection.containsNode(node, true)` follows the Selection API's partial
  containment (jsdom returns false for a selection inside the node);
  `Selection.direction` exists (jsdom lacks it).
- Additive, to watch in the corpus: Range `getClientRects()` and
  `getBoundingClientRect()` (CSSOM View) exist and return empty results;
  jsdom lacks them, so code that feature-detects them takes another path.
- An event handler set again after being set to null is registered anew,
  after listeners added since (the standard's own example); jsdom keeps
  its old position.
- `new FormData(form)` skips disabled options, gives `_charset_` the
  encoding and fires `formdata`; jsdom includes them, gives '' and fires
  nothing.
- ShadowRoot has delegatesFocus, slotAssignment, clonable and
  serializable (jsdom lacks the first two).
- A custom element whose constructor threw is "failed" and does not match
  `:defined`; jsdom matches it.
- Element interfaces and reflected attributes come from the current
  standard's IDL: `<search>` and `<menuitem>` are HTMLElement (jsdom:
  HTMLUnknownElement), `<selectedcontent>` exists, and reflections jsdom
  lacks (srcset, relList, sandbox, ...) are present. Not `inert`:
  libraries feature-detect it (react-aria then uses the inert attribute
  instead of aria-hidden) and warpdom does not implement inertness, so it
  is left out, as in jsdom (src/reflect.js FEATURE_DETECTED). Members that
  change a library's code path only get added with their behavior.
- Media elements' buffered/played/seekable are TimeRanges (start/end throw
  IndexSizeError out of range) and `error` is null; jsdom gives plain
  objects returning 0, and undefined.
- `document.write` appends to the document's input stream (several writes
  between open() and close() add up); jsdom replaces the document with
  each chunk.
- `postMessage(message, '/')` is delivered ('/' is the window's own
  origin); jsdom drops it.
- The details `toggle` event is a ToggleEvent (oldState, newState), and
  ToggleEvent exists; jsdom fires a plain Event.
- A removed iframe's `contentWindow` and `contentDocument` are null (its
  window is discarded); jsdom keeps returning the old ones.
- After a fragment navigation `history.state` (and popstate's `state`) is
  null; jsdom leaves it undefined.
- Clicking an `<a>` without `href` does nothing; jsdom navigates to the
  document's URL without its fragment.
- A TouchEvent's touch lists are TouchLists (length, item(), indexing,
  iteration), and TouchList exists; jsdom uses arrays.
- getComputedStyle expands the `flex-flow` shorthand (jsdom ignores it)
  and does not apply a disabled style sheet (jsdom does).
- `option.form` is its select's form owner (jsdom: the nearest ancestor
  form), and the list of options follows the standard's current
  definition (options nested in other elements inside the select count).

## Decisions

- **2026-10-09: Prove the switch is worth it before pushing adoption.**
  So far: about 2.5x faster than jsdom with the VM pool and about 3x with
  fast mode, identical results, on 3 suites; barely faster than happy-dom
  by default (its users would switch for correctness, not speed); no Jest.
  The claim that would convince: one config line, 2-3x faster, zero
  failures, on 10+ well-known projects across Jest and Vitest, plus a
  public conformance number. Plan: (1) 8-10 more corpus suites, isolated
  and VM pool, median speedup and failures; (2) a Jest adapter and 3-4 Jest
  suites; (3) one large real-world application suite. Kill criterion: a
  median under ~1.8x, or most suites needing large compatibility work,
  means rethinking the product.

- **2026-10-11: Behave like the jsdom generation the tests were written
  for.** "Like jsdom" is not one target: getComputedStyle left most
  undeclared values empty before jsdom 29 and gives initial values since,
  and tests encode whichever they ran on (react-aria relies on the empty
  values, MUI on opacity 1). jest-environment-jsdom (Jest 30) bundles jsdom
  26. So warpdom takes a jsdom major version (createWindow({ jsdom })),
  detected by the adapters (Jest: the jsdom jest-environment-jsdom brings;
  Vitest: the project's jsdom), default current. Only behaviors that
  changed in ways tests observe go into the profile; computed-style
  defaults are the first. Also: members jsdom lacks that libraries
  feature-detect are added only with their behavior (inert left out).
  In the profile so far: before 29, empty computed-style defaults; before
  27, no PointerEvent or pointer handlers, and click() fires a MouseEvent;
  before 30.1.2 (a patch release, 2026-10-04), focus() ignores display:
  none and [hidden] (ark-ui's signature pad focuses a [hidden] input). So
  the option takes a full version too ('30.1.1'); the adapters pass the
  installed one, and a bare major means its latest release.
  Also before 28: computed styles accept writes (react-aria fakes
  position: relative on them). Not in the profile yet (declared values are
  parsed without knowing their window): jsdom 26 does not shorten box
  shorthands (margin: 0 0 stays 0px 0px), and jsdom before 28 keeps a lone
  0 as written for properties its CSS layer did not know (inset: 0).
  CSS value validation (jsdom drops width: 0 10px): done 2026-10-11, see
  below.
- **2026-10-11: CSS value validation from the specifications' grammars.**
  Style writes, cssText, style attributes and style sheets drop invalid
  values and unknown properties, as CSSOM says and jsdom does (react-spectrum
  sets width: undefined%). Grammars are generated from @webref/css
  (src/css-grammar.js); src/css-values.js tokenizes values and matches them
  against the value definition syntax. It fails open: a grammar it cannot
  read, or a type defined only in prose, accepts every value. Against
  jsdom 30, 35,420 property/value pairs: no valid value rejected; about
  1,100 invalid ones accepted (fail-open). jsdom profile: from 27 every
  property is checked; jsdom 26 checked about 60 (the list is in css.js,
  observed black-box). Grammar overrides where browsers implement other
  drafts (SVG 2 paint for fill/stroke, legacy keywords) are in the
  generator. Not done: calc() simplification as jsdom serializes it.
  Performance (hot path, recorded per the rules): results are cached per
  mode, property and value (repeated writes unchanged, ~130 ns), and per
  value shape (numbers replaced by their class), so values that change
  every write cost one scan and a lookup: 449 -> 562 ns per write in the
  unique-values benchmark, +25%, which validation needs.
- **2026-10-11: Interfaces are created on first use.** A window defined
  every interface's prototype (about 300, thousands of members) when
  created; a test touches a few dozen. The window's constructor properties
  and the internal protos table start as accessors that create the
  interface (parent first) and then become data properties; each is
  created once per window, and a deleted or replaced constructor property
  stays so. Image, Audio and Option are lazy too, and the CSS validation
  mode is set when CSSStyleProperties is created. createWindow 2.75 ms ->
  0.42 ms; Vitest environment setup + teardown per test file 3.0 ms ->
  0.63 ms. Prototypes stay per window (shared ones would be cheaper still,
  but a prototype mock left in place would leak into the next test file).
  Module load: 25.4 -> 26.7 ms with the CSS grammars (once per worker).
  Corpus note: solid's transition.spec fails on jsdom too when its files
  run in a certain order (isolate: false shares solid's module state), so
  its one difference is a solid flake, not warpdom.
- **2026-10-10: Kill criterion measured; learning fast mode.** Over 11
  suites the default pool gives a median 1.17x (best configuration 1.20x):
  under the ~1.8x criterion. The gain follows the suite's DOM share:
  component suites 1.5-1.7x by default, 3-6x in fast mode; compiler-,
  wait- or logic-heavy suites ~1.0-1.2x. Fast mode with a plain safety net
  could be slower than jsdom; a learning fast mode (time isolated and the
  split once, keep the cheaper) is never slower: lowest 1.03x, median
  1.20x, geometric mean 1.75x (docs/head-to-head.md). Positioning, if we
  continue: jsdom's results, never slower, 3-6x for DOM-heavy component
  suites; not "faster for everyone". Built (2026-10-10, docs/fast-mode.md):
  withFastMode (one Vitest project becomes a fast and an isolated one) and
  `warpdom vitest run` (learns once, reruns files that fail without
  isolation, isolated, so results are never wrong); tried on Vuetify and
  mui-material with jsdom's results. Jest environment built (warpdom/jest):
  react-hook-form identical, handsontable 2.54x (core 13x), react-spectrum
  1.48x with 304 differences to fix. Next: react-spectrum, CSS value
  validation, a WPT conformance number, a real application's suite;
  Vitest < 3.2 and the Vitest 3 bug report (public, Sonu's call) later.
- **2026-10-09: Fast mode: no isolation plus warpdom's per-file reset.**
  `warpdom/vitest/reset` resets the window in place before each test file.
  With `--no-isolate`, Radix runs in 6.1 s and Vuetify in 3.0 s with exactly
  the isolated results (jsdom isolated: 20.0 s and 15.0 s, so 3.3x and 5x).
  It does not fix module-state leaks (emoji-picker), so it is opt-in per
  suite. Details in docs/no-isolate-experiment.md.

- **2026-10-09: The next speed lever is per-file reset without isolation,
  not a faster DOM.** `docs/no-isolate-experiment.md`: on Radix the DOM is
  now a few percent of CPU (jsdom: 50%); the rest is per-file processes,
  module loading and React. With `--no-isolate` and a fresh jsdom window per
  file, Vuetify ran 4.25x faster with identical results; emoji-picker
  (custom elements defined once by shared modules) got worse. Direction: a
  warpdom reset that gives each file a clean document and window state but
  keeps the window's interface objects and registries.

- **2026-10-07: Outermost counting for every environment.** jsdom calls its
  own public API for selector matching and style resolution (one
  `getComputedStyle` call reads ~1,000 `Node`/`Element` getters). Under the
  old count-all default, 92% of recorded operations on floating-ui + solid
  were jsdom internals (8.29M vs 675k). Counting re-opens inside event
  dispatch and custom element lifecycle callbacks so user code is still
  measured. Traces made before this change overcount and should be discarded.
- **2026-10-07: Inject the tracer via a temporary wrapper config** next to
  each package's own Vitest/Jest config, never editing project files. Run the
  project's own runner binary (npx picked up a stray global Vitest 4), and
  always compare against an untraced baseline (two checkouts had broken
  installs that looked like tracer failures).
- **2026-10-07: Data grids as priority targets.** Sonu reports Handsontable
  is very slow under jsdom and AG Grid likely too, while Playwright (real
  browser) is fast on both. Grids are DOM-heavy (many cells, measurement,
  scroll virtualization), so they (a) show which hot paths matter beyond
  typical component tests and (b) make strong stage 3 benchmarks with three
  reference points: jsdom, happy-dom and a real browser via Playwright.
  Caveat: jsdom has no layout, so grids may take different code paths than
  in a browser; the trace will show which.
- **2026-10-07: Report breadth first; treat raw ops as concentrated.** Raw
  operation totals are dominated by a few test files (see Status), so the
  stage 1 report ranks members by how many projects and files use them, and
  shows per-member concentration (share of ops from the top file). Testing
  Library's `waitFor` + `getBy*` error dumps are real, hot test work: fast
  attribute iteration and text reads matter, and the pattern is a stage 3
  benchmark candidate.
- **2026-10-07: Corpus runs are throttled and exclusive.** Two full
  Handsontable runs overlapped (one had been moved to the background) and
  overheated the machine. The harness now defaults to 2 test workers, holds a
  lock so only one run is active, and removes wrapper configs left by killed
  runs. Large suites (Handsontable core, AG Grid) are run by Sonu when
  convenient, not started from a chat session.
- **2026-10-09: Performance rules.** Hot operations O(1) (linked-node tree,
  caches invalidated by version counters, id index, compiled selectors, no
  allocation in hot getters), measured with micro-benchmarks against jsdom
  and happy-dom. Rules in `docs/design.md`. The first implementation used
  child arrays (O(n) sibling access, insertion and removal); replaced before
  further features are built on it.
- **2026-10-09: Build warpdom.** Product decided after the measurements
  and the fast-start spike: a new test DOM, jsdom-compatible, near-free
  startup. Name chosen: warpdom (free on npm and GitHub). Private repository
  for now; public once milestone 1 works and has a benchmark. The DOM is
  written fresh (jsdom and happy-dom are compatibility references, not code
  sources); parse5 may be reused for HTML parsing.
- **2026-10-09: Fast-start spike succeeded.** `docs/fast-start-spike.md`:
  the per-file cost is loading the DOM library (jsdom 176 ms, happy-dom ~85
  ms per fresh worker), not creating windows. A jsdom-shaped prototype (219
  interfaces, 3,710 members, per-window prototypes for isolation) loads in
  11 ms; on 100 trivial test files in Vitest it removed 93% of jsdom's cost
  and 85% of happy-dom's (3.9 s vs 15.2 s and 8.5 s). Compatibility is not
  yet tested and remains the main risk.
- **2026-10-09: Per-file setup is half of test time; the DOM owns the
  bigger part of it.** `docs/setup-cost.md`: across 33 Vitest packages,
  environment setup is a median 29% of time and module imports 15%; tests
  24%. Skipping setup with `--no-isolate` gives 2-7x where safe, but only 5
  of 16 large packages kept all tests passing. Environment setup (fresh DOM
  window per file) can be made cheap without sharing state, so it is DOM
  product territory; import cost is runner territory (Vitest is active
  there). Product direction under consideration: a test DOM built for
  near-free startup and jsdom compatibility (sharpened Product A), rather
  than a test runtime (Product B).
- **2026-10-08: The case is jsdom compatibility at happy-dom speed, not
  "faster than happy-dom".** Experiment on 9 suites (`docs/env-experiment.md`):
  jsdom is a median 37% of CPU time in jsdom suites, happy-dom 9%; switching
  to happy-dom gives a median 1.4x wall-time speedup but every jsdom suite
  lost tests (behavior gaps, plus tests coupled to jsdom's object shapes such
  as spying on prototype getters). A DOM faster than happy-dom could save at
  most ~10% of test time. Routes to weigh: improve happy-dom's compatibility,
  speed up jsdom, or build a jsdom-shaped, happy-dom-fast DOM.
- **2026-10-08: Report review decisions.** An independent fact-check
  verified ~190 figures and flagged overstated wording, all fixed: causal
  claims about tooling are framed as measured in a controlled test, "returns
  zero" is qualified (mocks are invisible to the tracer), host share is given
  per project (median 5.4%, raw 29% is mostly two Jest suites), pass parity
  is stated as identical pass/fail/skip counts with the 369 pre-existing
  failures disclosed, and merged CSSStyleProperties/CSSStyleDeclaration
  figures are given. `performance.now` was confirmed by stack sampling to
  come from React's scheduler; it is only visible under Jest because Vitest
  supplies its own `performance`. Constructors are not counted for this
  report (it would mean replacing global constructors and risks breaking
  `instanceof` checks). Aggregated data is in `docs/data/`; per-file traces
  go in a release at publication; figures wait for the publication venue.
- **2026-10-08: Every window on a shared global is instrumented.** Vitest 2
  with `isolate: false` (solid) installs a new jsdom window per test file on
  the same global; the tracer only instrumented the first, so solid recorded
  nothing. Fixed; solid re-traced.
- **2026-10-08: Private-symbol members are not DOM API.** happy-dom keys
  ~50 internal methods with private symbols (`[getTokenList]`, ...). The
  report leaves them out of every figure; only well-known symbols count.
- **2026-10-08: Host APIs reported separately.** `Performance#now` (62.5M
  calls, React Spectrum and Mantine) and `navigator` are host services, not
  the document tree: 29% of operations.
- **2026-10-08: Listener wrappers are transparent.** zone.js stores what
  `addEventListener` receives and Angular's DebugElement identifies its own
  listeners by their source text (`__ngUnwrap__`); the wrappers broke 18
  ngx-formly tests. Wrappers now report the original listener's
  `toString()`, name and length.
- **2026-10-08: Count only listener code during event dispatch.** Counting
  used to re-open for the whole `dispatchEvent`/`click`/... call, so the DOM
  implementation's own dispatch work was counted (AG Grid on happy-dom:
  millions of `Event#eventPhase`, `Event#type`, `[getTokenList]`). Fixed:
  listeners and `on*` handlers are wrapped at registration and counting
  re-opens only while they run. Traces made before this fix (all projects so
  far) are re-run in the final pass.
- **2026-10-08: Corpus runs use Node 22.23.3** (`nvm exec 22.23.3`), which
  newer repos require (material-ui needs >=22.23.3, AG Grid ^22.21.1); Sonu's
  default Node stays 22.17.1. All projects are re-run on it in the final pass
  so the dataset uses one Node version.
- **2026-10-08: pnpm 12 needs a newer Corepack.** Corepack 0.33 (bundled
  with Node 22.17) looks for pnpm 12's removed `bin/pnpm.cjs`. Sonu upgraded
  to Corepack 0.36 (engine warning on Node 22.17, works); the stale cached
  pnpm 12 downloads also had to be deleted from
  `~/.cache/node/corepack/v1/pnpm/`.
- **2026-10-08: Grids do far more DOM work per test.** AG Grid: 155k
  operations per test file vs 46k (CopilotKit) and 1k-28k for other
  component libraries; `HTMLElement#style` 9,655 and `requestAnimationFrame`
  113 per file. Both grids share members no component library uses:
  `before`, `prepend`, `childElementCount`, `offsetTop`/`offsetLeft`,
  `border*Width`, `queueMicrotask`.
- **2026-10-08: Handsontable is layout- and style-heavy.** Per test file it
  calls `getComputedStyle` 940 times and reads `clientHeight`/`clientWidth`/
  `offsetWidth`/`scrollWidth`/... 150-260 times each, far more than any other
  project. jsdom has no layout, so every one of those reads returns 0; grid
  code under jsdom measures nothing. `HTMLElement#style` alone is 13.6% of its
  operations. Candidates for the new DOM: a cheap `getComputedStyle` and an
  optional simple layout model.
- **2026-10-08: Tracer never instruments ECMAScript built-ins of any realm.**
  jsdom's window has its own realm; the prototype walk stopped only at this
  realm's `Object.prototype`, so jsdom's `Object.prototype` (11 methods) was
  wrapped in every jsdom run. Under Jest, test code runs in that realm, so
  `hasOwnProperty`/`valueOf`/... calls were counted as DOM use and slowed the
  suites. Fixed (walk stops at any prototype-less root); all jsdom projects
  were re-run on 2026-10-08 (floating-ui, solid, analog, CopilotKit,
  Handsontable), all matching their baselines. Handsontable's core suite
  overhead dropped from 3.2x to 2.2x. happy-dom shares Node's realm and was
  unaffected.
- **2026-10-07: Tracer never wraps test framework globals.** Found on
  Handsontable: Jest installs `describe`/`it`/... on the jsdom window, the
  tracer wrapped them as window functions and the wrappers hid `it.each`,
  breaking 38 of 520 files. Known framework globals are excluded by name, and
  any window function with extra own properties is skipped (DOM functions
  never have them).
- **2026-10-07: Corpus builds.** Monorepos often test against built
  workspace packages; corpus entries can declare a `build` command (run with
  `NX_NO_CLOUD=true` so results do not depend on other projects' remote
  caches).
- **2026-10-07: Tracer is a no-op in non-DOM files.** Found on CopilotKit:
  files with `// @vitest-environment node` used to fail under the tracer.
- **2026-10-07: `DOM_TRACE_PROJECT`** names the project so monorepo packages
  count as one project in breadth metrics.

- **2026-10-09: warpdom is written from the specs, not from jsdom.**
  Algorithms come from the DOM/HTML/CSSOM/Selection specs, designed for
  warpdom's tree; jsdom's and happy-dom's source is not read or copied, even
  though their licenses would allow it. Their code carries their
  architecture's costs, and an independent implementation is part of the
  pitch. jsdom remains the black-box reference for behavior (parity tests),
  and data tables are generated from the specs' WebIDL (@webref/idl).
  Cleanup: focus update steps rewritten from the HTML standard, select and
  form activation reviewed against the spec, reflection and element tables
  regenerated from @webref/idl.

## Next steps

1. Milestone 1 (`docs/design.md`): Radix Primitives' suite passes on warpdom
   with the same results as on jsdom. Progress (2026-10-09): Vitest adapter,
   inline styles, all HTML element interfaces, linked-node tree with O(1)
   navigation and id index, live collections, events, MutationObserver,
   window features, on-demand getComputedStyle, TreeWalker/NodeIterator,
   HTML serialization and lazily loaded parsing (parse5), Attr/NamedNodeMap,
   classList, dataset, a compiled and cached CSS selector engine, layout
   stubs and DOMRect, reflected attributes (280, generated from data), form
   controls (values, checkedness, selectedness, labels, validation,
   submit/reset, click() with activation behavior; tested for parity
   against jsdom scenario by scenario), focus (focusing steps, events,
   activeElement, tabIndex), documents without a window and
   DOMImplementation with adoption, screen, canvas stubs, and the CSS object
   model (style sheets, rules, insertRule), ranges and selection, event
   handlers, FormData, shadow DOM core with dispatch per the DOM standard.
   **Done (2026-10-09): all 982 Radix tests have the same status on
   warpdom as on jsdom** (976 pass, 6 skipped/todo, 0 differences).
   Timings (Radix, Vitest, 2 workers, median of 3 interleaved runs):
   jsdom 20.0 s, happy-dom 13.0 s (18 tests fail), warpdom 11.5 s
   (1.75x faster than jsdom, 12% faster than happy-dom).
2. Second suites (2026-10-09), same status as jsdom for every test:
   - Vuetify (Vue, 947 tests): needed the CSS namespace, ARIA reflection
     (Vue sets ariaLabel as a property), the style attribute rule, document
     collections, multi-token autocomplete. jsdom 15.0 s, warpdom 10.0 s.
   - emoji-picker-element (custom elements + shadow DOM, Vitest 3, 160
     tests): needed custom elements, template content cloning and
     transformMode for Vitest 3. jsdom 21.7 s, warpdom 19.3 s (waits).
   - MUI (mui-material, mui-system, mui-utils, mui-lab; React + emotion,
     6,751 tests, 2026-10-09): same status as jsdom for every test. Needed
     class strings (Symbol.toStringTag; Vitest's diff deep-clones objects
     that stringify as [object Object]), a "jsdom" user agent token
     (libraries skip layout checks by it), NamedNodeMap named properties,
     the cascade in getComputedStyle (emotion's style elements), computed
     colors, TouchEvent, and 0px for declared zero lengths.
     Timings (median of 3, docs/head-to-head.md): jsdom 89.4 s, warpdom
     51.5 s; vmThreads: jsdom 29.1 s, warpdom 23.1 s, all with jsdom's results.
     jsdom works with vmThreads here, so warpdom's lead over the pool alone
     is 1.26x.
     Load cost of the MUI work (bench/load.js, Node 22.17.1, median of 5
     interleaved runs against 43b97a4): cold load 19.3 -> 20.0 ms, heap
     after load and one window 2.60 -> 2.83 MB; later windows unchanged.
     Accepted: the cascade, colors and CSS property data are what emotion
     suites need, and load stays well inside the 30-40 ms budget. Tried
     emitting the CSS data as a JSON string parsed on first use: -2% cold
     load (within noise), -3% heap; below the 3% bar, reverted.
3. Survey of the other 11 Vitest corpus suites (2026-10-09), each run
   once on warpdom (isolated) against jsdom: svelte (7,818 passing) and
   analog (187) identical; floating-ui, ariakit, element-plus, CopilotKit,
   ark-ui, solid with differences, fixed since in: user agent token form
   (jsdom/), link URL members and navigation, namespaced attributes,
   DOMParser (HTML) and XMLSerializer, iframes, details toggle,
   window.event, same-frame cancelAnimationFrame, Web Storage,
   MessageEvent and postMessage, progress/meter, slots, shorthand and
   declared color serialization. Reruns pending. Not comparable yet:
   ag-grid (behavioural suite timed out; two export tests take 420 s and
   180 s on jsdom), kobalte (workspace package not built: most files fail
   on both DOMs), nuxt-ui (jsdom baseline broken), element-plus pins
   jsdom 16 (some of its tests rely on behavior jsdom 30 dropped).
   Harness: warpdom now runs from a copy inside the package (Vitest hangs
   loading an environment from outside the root with isolate: false).
   Load cost of this round (bench/load.js, Node 22.17.1, median of 5
   against eafface): cold load 19.5 -> 20.6 ms, heap 2.84 -> 2.99 MB,
   window creation unchanged; hot members unchanged (bench:hot, all
   within +-2.4%). Accepted: the new interfaces are what the suites use;
   still well inside the budget. Lazy interface creation is the next
   candidate if load grows. Style writes regressed 88.6 -> 196.8 ns with
   declared color serialization; fixed with a cache (92.0 ns).
   Per-file reset (fast mode): Radix 6.1 s and Vuetify 3.0 s with isolated
   results; emoji-picker leaks module state and stays isolated.
   Later: enumerated attributes limited to only known values beyond the
   common ones (referrerPolicy, loading, decoding, fetchPriority, ...
   return their raw value), links (anchor URL members, activation), on* handler properties,
   value normalization in the CSSOM beyond zero lengths, the XML
   serializer for XML documents.
   Then timings against jsdom and happy-dom, and the load-time budget.
2. Reserve the npm name `warpdom` (placeholder package; Sonu's call, since
   publishing is public).
3. Publish the stage 1 report (venue, figures, raw traces) around the time
   warpdom goes public.
