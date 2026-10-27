# warpdom plan

> This plan lives in the warpdom repository (github.com/sonukapoor/warpdom,
> public since 2026-10-14) since 2026-10-09. Measurement tools and
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

Revised 2026-10-17. The aim is to become the default DOM for unit tests. That
takes more than API count: switching must be risk-free, warpdom must be clearly
faster, more complete than jsdom, used in public by well-known projects,
built into the test runners, and maintained in a way large projects can rely
on. "All APIs" is not the goal: without a rendering engine, real layout,
canvas drawing, WebGL or media cannot be meaningful (that is what Vitest's
browser mode is for). The goal is the most complete DOM for unit tests:
every API that makes sense without layout, behaving as the standards say.

Done so far (stages 1-3 of the original plan):
- **Measure:** dom-api-tracer traced DOM API use across the corpus
  (see Corpus).
- **Build:** this repository, an independent implementation of the WHATWG
  and W3C standards that reproduces each jsdom version's observable behavior.
- **Prove:** the JWE paper (submitted 2026-10-16), public WPT numbers and
  benchmarks on 25 real suites; drop-in 1.2-1.9x faster than jsdom on the
  tuning suites, 4.5x on Ant Design.

Milestones from here, each with its exit criterion:

**M1: Parity with jsdom (0.1.x).** warpdom's API set includes jsdom's for
every modeled jsdom version, and every measured suite gives jsdom's results.
- #1-#4: crypto, TextEncoder/TextDecoder, Blob/File, performance (done,
  0.1.5).
- #23, #25, #27, #28, #32: console, URL, URLSearchParams, Headers,
  WebAssembly (branch feat/parity-group1, 2026-10-18 below).
- #20, #31, #33, #34, #52-#54, #56-#59, #65, #66: ElementInternals,
  PromiseRejectionEvent, BlobEvent, PageTransitionEvent, the device
  motion member interfaces, the plugin API, media track lists,
  CSSMediaRule.matches, CSSNestedDeclarations (branch fix/misc-parity,
  2026-10-19 below).
- #26: WebSocket, the host's (branch fix/websocket-window, 2026-10-19
  below). #22, #30: XMLHttpRequest, on by default (decided 2026-10-19;
  branch feat/xhr, 2026-10-20 below).
- #67, #68, #69, #77: XPathException, getSVGDocument(), event handlers per
  version, Window member kinds and prototype chain, `<search>` and
  `<selectedcontent>` (branch fix/small-parity, 2026-10-20 below).
- #18: a CI test that warpdom's window has every interface and member jsdom's
  has, per version, so a gap cannot reappear unnoticed. Test in place (branch
  test/jsdom-api-superset, 2026-10-19 below); its KNOWN list holds what is
  still open.
- #19: WPT on all test-DOM-relevant areas by default, results published.
- #17: the DOMParity audit is automated: the weekly upstream watch
  (scripts/api-gaps.mjs) opens one parity issue per interface with gaps
  (at most 15 a run, largest first) and keeps one "Beyond jsdom" checklist
  of core APIs only other test DOMs have, for M2. 2026-10-17 data: 41 parity
  interfaces beyond #1-#4 (ElementInternals, SVGSVGElement, XMLHttpRequest,
  console, URL, URLSearchParams, WebSocket, Headers, ...), 119 checklist items.
- #13 (done), #14, #15: differences found while adopting (Ant Design,
  Element Plus on jsdom 16, Storybook on happy-dom); #80: Mantine (the user
  agent style sheet, branch fix/mantine-floating-ui, 2026-10-20 below).
- Exit: #18 green on every jsdom version; 0 unexplained differing tests in
  the corpus and the adoption projects; DOMParity's "Test DOM core" coverage
  for warpdom at or above jsdom's (2026-10-17: 52.8% vs 57.1%).

**M2: Modern APIs, opt-in (0.2).** The web APIs jsdom lacks, written from the
standards, behind an opt-in so default results stay jsdom's.
- #5: the opt-in design (an environment option, per API and all at once).
- #6-#12: matchMedia, ResizeObserver, IntersectionObserver, dialog
  show/showModal/close, scrollIntoView, Web Animations, structuredClone; then
  the remaining core gaps that DOMParity (#17) lists, by measured usage.
- Each API ships with its WPT area passing (as far as possible without
  layout) and a note in docs on what "without layout" means for it.
- Exit: with the opt-in on, warpdom has the highest "Test DOM core" coverage
  of all test DOMs on DOMParity, with behavior checks passing.

**M3: Modern APIs on by default (0.3 or 1.0).** After the opt-in has been
used in real projects for at least one release cycle without regressions,
turn it on by default for new installs (or per jsdom profile: projects that
pin an old jsdom version keep the old API set). Documented as a breaking
change, with `warpdom migrate` and `warpdom compare` showing any test whose
result would change.
- Exit: the corpus and the adopted projects show no unexplained result
  changes with the APIs on.

**M4: Adoption.** Projects running their tests on warpdom in public. The
traction plan below (2026-10-21) sets the order of work.
- Lesson (2026-10-21): two large libraries declined adoption PRs, Vuetify
  ("1-2 years if it gets enough traction") and Mantine ("not while warpdom is
  pre-1.0"). Libraries are conservative; applications, which pay for CI
  minutes, are where test environments get switched (the public switches to
  happy-dom were Gitea, cylc-ui, pulfalight, Element Web). First merged
  adoptions: applications whose jsdom unit jobs set their CI time.
- A full switch replaces jsdom completely (no two DOM packages). A
  non-blocking side job that runs `warpdom compare` next to jsdom is also
  acceptable: it keeps jsdom and reports result differences and time saved
  on every run.
- Open PRs: MUI, Radix, handsontable, floating-ui, downshift (and the
  solid-primitives bug fix). Closed: Vuetify, Mantine, Ant Design (bot).
- Exit: at least ten well-known projects running on warpdom, with their CI
  time saved documented.

**M5: Documented and widely used with the test runners.** Vitest does not add
or promote further built-in environments (a maintainer on
vitest-dev/vitest#7842, closed as not planned), so the goal is not a built-in
`environment: 'warpdom'` but: warpdom in Vitest's ecosystem CI
(vitest-dev/vitest-ecosystem-ci, run three times a week and visible to the
Vitest team), listed in awesome-vitest (done) and awesome-jest, and used by
the projects of M4.

**M6: Sustainable maintenance.** What large projects ask before depending on
a single maintainer: GitHub Sponsors (live 2026-10-17), contributor docs and
labeled issues, a release process with the weekly upstream watch, security
policy, and more maintainers over time. What 1.0 means and needs, and the
support policy: docs/road-to-1.0.md, docs/stability.md and SECURITY.md
(2026-10-21 below).

**Later:** SSR and edge runtimes (the core already avoids Node built-ins).

## Traction plan (2026-10-21)

Why: the adoption PRs showed that numbers alone don't convince maintainers;
what they ask for is maturity (1.0; its criteria are proposed in
[#99](https://github.com/sonukapoor/warpdom/pull/99), docs/road-to-1.0.md)
and traction (other users). This plan builds both. Research of 2026-10-21;
status updated as items land.

| # | Action | Effort | Why | Status |
|---|---|---|---|---|
| 1 | Publish from GitHub Actions with npm trusted publishing and provenance | ~1 h + one-time npm setup by Sonu | jsdom, happy-dom and Vitest publish with provenance; it's the first thing a security review checks | PR in progress |
| 2 | OpenSSF Scorecard action, actions pinned to SHAs, branch protection on main; optionally the OpenSSF Best Practices badge | 2-3 h | Visible trust signals for a single-maintainer project | PR in progress: Scorecard workflow and badge, every action pinned to a commit SHA except CVE Lite CLI (`@v1` on purpose), Dependabot for actions, CVE Lite dependency scan in CI (2026-10-21: no known vulnerabilities). Branch protection and the Best Practices badge are Sonu's settings |
| 3 | A `warpdom compare` GitHub Action for a non-blocking side job (keeps jsdom, posts result differences and time saved) | 1-2 days | The cheapest yes for a conservative maintainer; builds evidence on their own suite over time (precedents: eslint-plugin-oxlint next to ESLint, rolldown-vite, react-compiler-healthcheck) | Open |
| 4 | First adoptions in applications whose jsdom unit jobs set CI time (candidates below); open a PR only after `compare` shows zero differences and a measured speedup | ~1 day each | Applications switch test environments; libraries wait | Open |
| 5 | Join Vitest's ecosystem CI (a `tests/warpdom.ts` like vitest-pool-example; its helpers assume pnpm) | ~½ day | Runs against Vitest main three times a week, visible to the Vitest team | Open |
| 6 | Add warpdom to awesome-jest (jest-community/awesome-jest, "Environments") | 15 min | Lasting discoverability for Jest users | Open |
| 7 | "Show and tell" in Vitest Discussions and the Vitest Discord: the reproducible benchmark, WPT numbers, `npx warpdom compare`, and where warpdom loses | ~2 h | Early users from the right audience, within Vitest's "custom environments are fine" stance | Open |
| 8 | Bus factor and 1.0: road to 1.0 and stability policy ([#99](https://github.com/sonukapoor/warpdom/pull/99)), CONTRIBUTING with labeled good first issues, a second npm maintainer when possible | ongoing | Exactly what the "pre-1.0" answers point at | 1.0 doc in review |

Candidate applications (jsdom unit suites that dominate CI shards; job
minutes from one default-branch run, including install):

| Project | Runner | Unit DOM jobs | Note |
|---|---|---|---|
| n8n-io/n8n | Vitest, `environment: 'jsdom'` | ~63 job-min (4 frontend shards x 2 Node) | |
| grafana/grafana | Jest, `testEnvironment: 'jsdom'` | ~49 job-min (16 shards) | |
| mattermost/mattermost | Jest, `testEnvironment: 'jsdom'` | ~32 job-min (4 shards) | |
| apache/superset | Jest, custom environment extending jsdom | ~37 job-min (8 shards) | |
| getsentry/sentry | Jest, custom jsdom-based environment | ~32 job-min (16 shards) | needs an extendable warpdom environment |
| backstage/backstage | Jest, jsdom + @jest/environment-jsdom-abstract | not comparable | needs an extendable base; its CI skips tests that passed before (success cache; pull requests also test only changed packages), so a default-branch run has no DOM job-minutes to compare (2026-10-21, run 39624431674: 2 jobs, test step 11-14 s) |
| RocketChat/Rocket.Chat, twentyhq/twenty, PostHog/posthog | Jest, jsdom | smaller or mixed | |
| excalidraw/excalidraw, mastodon/mastodon | Vitest, jsdom | 2-3 min | small savings, well-known |

Product work this implies: an extendable environment for projects that
subclass jsdom's (Sentry, Superset, Backstage), and the compare Action (3).

Current numbers to beat (2026-10-21): 4 stars, about 420 npm downloads a
month, one maintainer. A competitor, vitest-environment-rsdom ("drop-in jsdom
replacement accelerated with Rust"), appeared on 2026-10-09.

## Adoption plan after the library declines (2026-10-23)

Why: Vuetify (closed), Mantine (closed 2026-10-21) and MUI
([mui/material-ui#49502](https://github.com/mui/material-ui/issues/49502),
on hold 2026-10-23) accepted the speed and parity numbers and declined a
young dependency in their test stack. MUI also said it may drop jsdom for
real-browser tests. So the next stretch is about being a safe dependency,
not about more speed or parity. This plan extends the traction plan above
and is worked through in order.

Positioning: warpdom is for projects that keep a simulated DOM in their
unit tests for speed: applications, mid-size libraries and Jest users.
Projects moving their DOM tests to real browsers are not the audience.

Outreach rules until 1.0, or until two or three projects run warpdom in
CI:
- No new adoption PRs to large libraries (Ant Design, Radix, React
  Spectrum and similar). Open RFCs and PRs (MUI) stay open and quiet: no
  pushes, rebases or pings; one short reply where a maintainer answered.
  Ant Design #59606 is not reopened for now.
- Go back to a library only with a concrete trigger: 1.0, or a named
  project that has run warpdom in CI for a few months.
- Applications first, after `compare --rounds 3` (or more) on their own
  suite shows zero differences with nothing left out (no files or projects reported as not
  compared or not run, no flaky baseline or warpdom results; check the Vitest grouping
  caveat in the README) and a measured speedup.

| # | Step | Why | Status |
|---|---|---|---|
| A1 | Release 0.1.8, the first from CI with npm provenance | The release history and provenance are the first maturity signals | Waiting on #118 (Ant Design regression from #103) and merges |
| A2 | Release every one to two weeks, small, with release notes | A steady npm history answers "two weeks old" | Starts after 0.1.8 |
| A3 | README: how warpdom is verified (black-box measurement against 19 jsdom versions, WPT, the corpus of 20+ real suites run before every merge, review on every change, benchmarks on every PR) | Answers the quality concern behind "mostly AI generated" with evidence, not argument | Open |
| A4 | Publicly checkable compatibility: DOMParity and WPT pass rates updated automatically | "Same results as jsdom" becomes something anyone can check | DOMParity live; automation open |
| A5 | The compare GitHub Action (traction item 3): a non-blocking job that runs a project's suite on jsdom and warpdom and reports differences and time saved | Evidence on other projects' own CI without asking for a decision | Open |
| A6 | Applications (traction item 4): screen n8n, Grafana, Mattermost and Superset by jsdom unit-test CI time, run `compare`, then one carefully measured PR | Applications care about CI minutes and adopt younger tools | Open |
| A7 | Easy way back: document an opt-in setup with a one-line revert, and the compare mode as a safety net | Lowers the cost of saying yes | Open |
| A8 | Cascade parity found while fixing #117: #121 (jsdom 20 to 28.0 ignore specificity), #122, #123; found with #121: #136, #137, #138 | Suites on jsdom 26/27, Ant Design among them | #121 in review (fix/document-order-cascade) |

The MUI reply (to be posted by Sonu) accepts the hold, leaves the draft
PR open, and names the 1.0 criteria as the bar.

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

Latest survey (after CSS validation, lazy interfaces, the range fast path,
XML, WebIDL collections, CSSOM, DOM methods and the html/dom work; main at
8a78ca5): 0 differences in react-spectrum, react-hook-form, Vuetify, svelte,
floating-ui, emoji-picker-element, analog, Radix, MUI, CopilotKit (its local
checkout lacks some package builds: 231 files fail to load on both DOMs).
handsontable 3 (all in jsdomThemeCssFilter.unit.js: a jsdom style sheet
parse error warpdom deliberately does not reproduce). ark-ui 1 (NumberInput
largeStep, fails on jsdom too with the current checkout). solid 1 (as
above). ariakit 9 (as above).

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

- `DOMException` is an `Error` in the test realm (`e instanceof Error` is
  true), as the standard requires. In Vitest's default pools, jsdom's
  `DOMException` comes from jsdom's own script context, so it is not an
  `Error` there. One known test depends on jsdom's behavior: svelte
  `tests/hydration/test.ts::whitespace-at-block-start` (svelte appends to
  the message of `Error`s only). Decided 2026-10-12: keep the standard;
  matching jsdom would change error handling in every suite.
- `isTrusted` is an accessor on `Event.prototype`, not an own accessor
  of every event as the DOM standard's [LegacyUnforgeable] requires (and
  jsdom has). Defining it per event made `new Event` 2.3x slower (42 -> 96
  ns); only interface-shape checks (WPT idlharness,
  `Event-isTrusted.any.html`) can tell. Decided 2026-10-12 when merging
  feat/wpt-dom: dom/events scores 78.6% instead of 79.75% (jsdom 79.8%).
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
- An iframe's `getSVGDocument()` returns its content document when that is
  an SVG document, else null (always null: frames never hold SVG
  documents); jsdom 20 to 30 have the method but every call throws a
  TypeError from inside jsdom (2026-10-20, #67).
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
- Namespaced attributes: `#id` and `.class` selectors match only the
  attributes in no namespace (jsdom's selector engine also matches an
  `id` or `class` attribute set with setAttributeNS); `[*|name]` and
  `[|name]` follow Selectors 4 (jsdom 30 matches `[href]` and `[*|href]`
  against any attribute whose qualified name ends in `:href`, and jsdom
  25/26 reject `[|name]`); `dataset` lists only `data-*` attributes in no
  namespace (jsdom includes namespaced ones); `:lang()` reads `xml:lang`
  in the XML namespace (jsdom ignores it).
- XPath follows XPath 1.0 and the DOM standard where jsdom's engine is
  broken: `name()`, `namespace-uri()`, `lang()` and `local-name()` in
  predicates work (jsdom throws), prefixed name tests match by namespace
  (jsdom matches nothing), `substring()` rounds per the spec (jsdom:
  `substring("12345", 0, 3)` is "5"), numbers never use exponents and
  "1e3" is NaN, an unresolvable prefix is a NamespaceError (jsdom returns
  an empty result), syntax errors are SyntaxError DOMExceptions (jsdom: a
  plain Error), result types and contexts are converted as WebIDL says
  (jsdom rejects `'1'` as a type), `createNSResolver(node)` returns the node
  (jsdom 30 throws), results have their class strings
  (`[object XPathResult]`). Kept from jsdom (tests can see it): an
  unprefixed element name test matches elements in any namespace and any
  case (so `//svg` and `//entry` in an Atom document find elements, as in
  jsdom; the HTML standard matches only HTML elements, lowercased, and
  elements in no namespace); iterators are invalidated by tree and
  attribute changes in the jsdom 30 profile only (jsdom 25/26 never
  invalidate them).
- Additive: `innerText` and `outerText` exist on HTMLElement (jsdom 25 to
  30 have neither, so there assignments are expandos and reads give
  `undefined`; see the 2026-10-12 section below).
- Element interfaces and reflected attributes come from the current
  standard's IDL, with reflections jsdom lacks (srcset, relList, sandbox,
  ...) present; but `<menuitem>` (#51), `<search>` and `<selectedcontent>`
  (#69, 2026-10-20) are HTMLUnknownElement and there is no
  HTMLSelectedContentElement, as in jsdom 20 to 30. Not `inert`:
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
- getComputedStyle does not apply a disabled style sheet (jsdom does).
  (It no longer expands `flex-flow`: as in jsdom, flex-flow, gap,
  overflow, border-radius, inset, outline and the other shorthands jsdom
  does not expand leave their longhands unset; issue #36.)
- `option.form` is its select's form owner (jsdom: the nearest ancestor
  form), and the list of options follows the standard's current
  definition (options nested in other elements inside the select count).
- XML: the HTML serializer (innerHTML, outerHTML) writes a processing
  instruction as `<?target data>` and an element in the HTML, SVG or
  MathML namespace by its local name (`h:div` as `<div>`), as the HTML
  standard says; jsdom leaves processing instructions out and keeps the
  prefix. `wholeText` includes adjacent CDATA sections (they are Text
  nodes); jsdom stops at them. DOMParser reads single-quoted entity values
  in a doctype's internal subset and expands character references in them
  (XML 1.0 4.5); jsdom gives a parsererror document, or keeps the
  reference as text. The text of a parsererror element
  (`line:column: message`) has other messages and positions than jsdom's.
- NodeIterator follows the pre-removing steps, also for nodes its own
  filter removes (WPT NodeIterator-removal: 25/25; jsdom 6/25).
- CSSOM rule lists follow CSS Cascade/Namespaces: @import and @namespace
  rules after other rules, and inside grouping rules, are dropped (jsdom 30
  keeps the late ones); keyframes outside 0%-100% are dropped (jsdom keeps
  120%); invalid @page selectors drop the rule (jsdom keeps `@page foo
  :left`); insertRule('{}') is a SyntaxError (jsdom 30 inserts it).
- `new CSSStyleSheet({ media, disabled, baseURL })` applies its options
  (jsdom ignores them); an invalid baseURL throws NotAllowedError.
- @page rules are grouping rules with CSSMarginRule children and a
  CSSPageDescriptors style that keeps size, page-orientation, marks and
  bleed (jsdom 30 has neither interface and drops size).
- Style declarations' indexed properties (style[0]) are writable data
  properties, as in jsdom 26; jsdom 30 makes them read-only (read-only
  ones made every style write ~15% slower).
- MediaList normalization (lowercase, "not all" for invalid queries) is
  jsdom 30's in every profile; jsdom 26 kept media text as written, so the
  jsdom 26 profile also applies `@media SCREEN` rules (jsdom 26 matched
  "screen" case-sensitively).
- An element in the HTML, SVG or MathML namespace with a prefix
  (`createElementNS(HTML, 'h:div')`) serializes with its local name, as the
  HTML serialization algorithm says; jsdom writes the qualified name.
- MutationObserver follows the DOM standard where jsdom does not:
  transient registered observers (a removed subtree stays observed through
  the old ancestors' subtree registrations until observers are next
  notified), observers notified in the order they were created, and an
  `attributeFilter` that lets no namespaced attribute through.
- The directionality (`:dir()`, the computed `direction`, form
  submission's dirname) follows the current HTML standard in every jsdom
  profile: elements in a shadow tree take their host's directionality
  (jsdom 30: ltr), a dir=auto slot skips assigned elements with a dir
  attribute and bdi elements (jsdom 30 reads their text), and dirname
  gives the control's directionality (jsdom reads only its own dir
  attribute, so an inherited or dir=auto rtl gives ltr). jsdom 26's
  `:dir()` (a bdi without strong characters takes its parent's direction,
  input values ignored, results stale after changes) is not emulated;
  before this warpdom matched neither `:dir(ltr)` nor `:dir(rtl)`.
- `translate` inherits through non-HTML elements (jsdom 30 gives
  undefined for an HTML element inside SVG), and `:lang()` reads `lang`
  in no namespace only on HTML and SVG elements, `xml:lang` (XML
  namespace) first.
- `document.getElementsByName` returns only HTML elements, as the HTML
  standard says; jsdom (26 to 30) also returns SVG and other elements with
  a name attribute.
- Document named properties (jsdom 30 profile) are own accessor
  properties of the document, listed by Object.getOwnPropertyNames in the
  order they appeared; jsdom makes them read-only data properties that
  cannot be deleted or redefined, listed in tree order. Assignment fails
  the same way (TypeError in strict mode). See 2026-10-11, dom-tree
  accessors.
- `document.lastModified` is the current time when read (the source
  file's time is not known); jsdom gives the document's creation time.
- `document.cookie` ignores a cookie string with a NUL (RFC 6265bis);
  jsdom truncates it there (CR and LF still truncate in both).
- USVString reflections (`ping`, `srcset`, `imageSrcset`) replace lone
  surrogates with U+FFFD; jsdom keeps them in `ping`.
- `CSSStyleSheet.ownerNode` in the jsdom 27 and 28 profiles is the owning
  element, as in jsdom 29 and 30. Black box, measured on each release
  (2026-10-12): jsdom 27.0.0 has no ownerNode property, 27.1 and 27.2 give
  null, 27.3 to 28.1 an internal object without `id` (not a Node), 29.0
  and later the element. No realistic code should depend on the 27/28
  behaviors. One known test does: tanstack-query
  `packages/query-devtools/src/__tests__/contexts/PiPContext.test.tsx` "should
  copy parent "#_goober" "textContent" into the PiP mirror when the observer
  fires" (on jsdom 27.4 the mirrored style gets no id, so the test's own
  #_goober is the one updated). jsdom 20 to 26 profiles have no ownerNode
  at all, as those versions.
- No style-sheet parse error is reported to the console. jsdom 16 (with
  cssom 0.4.4) cannot parse CSS nesting: it drops such a sheet and reports
  "Error: Could not parse CSS stylesheet" through `console.error` (as
  handsontable's test helper describes it). warpdom reproduces this in no
  profile. Known tests that depend on it: 3 tests in handsontable
  `handsontable/test/__tests__/jsdomThemeCssFilter.unit.js`, which check
  handsontable's Jest-only filter for that message and expect jsdom to
  report it. They differ in every round at 8630317
  (docs/research/data/ci-2026-10-13-208ad49-RESULTS.md section 7).
- Submit buttons' formAction, formMethod, formEnctype and the document's
  obsolete body colors (fgColor, linkColor, vlinkColor, alinkColor,
  bgColor) exist; jsdom lacks them.
- `FileReader` reads the platform's Blob too (Node's `fetch` responses in
  Vitest's default pools, where fetch is Node's); jsdom's throws "parameter
  1 is not of type 'Blob'". Kept from before warpdom had its own Blob.
- `TextDecoder` labels: only ASCII whitespace is trimmed (Encoding
  standard); jsdom 30 also accepts labels wrapped in NUL, vertical tab or
  non-ASCII whitespace (WPT encoding/api-invalid-label: 3,000+ subtests).
- `TextDecoder` for Big5, EUC-JP, EUC-KR, GBK, gb18030, ISO-2022-JP and
  Shift_JIS is the platform's (ICU in Node): Big5's four two-code-point
  pointers, ISO-2022-JP's ESC error handling, Shift_JIS byte 0x1A and
  Big5 end-of-queue handling differ from the standard and from jsdom
  (13 WPT encoding subtests). Writing these decoders means shipping their
  indexes (hundreds of KB); no measured test decodes these encodings.
- `TextEncoder.encode()` returns an array of the test's realm in every
  profile; jsdom 27.4 returns one of jsdom's own realm (fixed in 28.1), so
  `instanceof Uint8Array` fails there under Jest.
- `URL` and `URLSearchParams` parse and serialize with the platform's
  parser (Ada in Node 22), as the `URL` of Vitest's jsdom environment
  does: IDNA edge cases (WPT IdnaTestV2, toascii, url-origin `xn--`
  hosts) and opaque paths with trailing spaces differ from jsdom's
  whatwg-url. jsdom 23 to 27's `URL.parse()` returns an object that is not
  `instanceof URL` (fixed in 28); warpdom's always is.
- `WebSocket` is the platform's (Node's), not an own interface: sockets,
  their events (MessageEvent, CloseEvent) and errors are Node's, not the
  window's. jsdom's is its own, with real connections too. Decided
  2026-10-19 (option A, below): one test file of one project used it.
- An iframe's `WebAssembly` (and console) is made in warpdom's one realm:
  its `WebAssembly` is the top-level window's realm's, where jsdom gives
  each frame its own realm.
- warpdom's style sheets do not nest rules (CSS Nesting): `.a { color: red;
  & .b {} margin: 0 }` keeps only the declarations before the nested rule
  and drops the rule, so no `CSSNestedDeclarations` object is ever made
  (the interface exists from jsdom 27.2). jsdom 27.2 and 28 keep the nested
  rule (and drop the later declarations), 29 and later also make a
  `CSSNestedDeclarations` of them. Not done: it needs nesting in the CSSOM
  parser, serializer and cascade.
- `CSSNestedDeclarations` (like the other CSS rule interfaces) is an
  illegal constructor in every profile; jsdom 27.2 and 28's (rrweb-cssom)
  can be constructed and has `[object Object]` as its class string.
- Accessors and methods called on the wrong object throw warpdom's
  "Illegal invocation" TypeError (jsdom: "'get x' called on an object that
  is not a valid instance of DeviceMotionEventAcceleration."), as
  everywhere in warpdom.
- `XMLHttpRequest` makes its requests with the host's `fetch` (2026-10-20,
  branch feat/xhr): `getAllResponseHeaders()` lists headers sorted by name
  with repeated headers combined (jsdom: as received; from 28 repeated
  headers on separate lines); upload progress is not measured (the upload
  events report the whole body when the response's headers arrive, as
  jsdom's do); synchronous requests throw a NotSupportedError at send()
  (jsdom: a child process); cookies are not sent or stored (jsdom shares
  its jar with document.cookie both ways); file: URLs fail (jsdom 28+ reads
  the file); requests carry fetch's Sec-Fetch-Mode, and an about:blank
  iframe's no Referer (jsdom: about:blank); a redirect that fails its CORS
  check is a network error (jsdom before 28 fires error, then follows the
  redirect to load); a DataView body is sent (jsdom 28+ sends none); jsdom before
  28 never completes a POST redirected by 301, 302 or 303 (warpdom follows
  it as GET), goes on with a request aborted in loadstart and throws
  Node's error from send() for ftp: and about: URLs (warpdom: a network
  error); network errors that jsdom before 27 reports are worded by fetch
  (CORS failures in jsdom's words); the method `patch` in lowercase makes
  Node's fetch print a warning once; the Referer has no credentials and no
  fragment (jsdom sends the document's URL with both, and before 28 a
  redirected request's previous URL as requested); a header named
  `__proto__` reaches fetch (jsdom loses it; Node's fetch drops it from
  the wire, so the server sees what it sees from jsdom 28+); a request
  stopped (abort(), open()) in an upload progress or load handler fires
  nothing more (jsdom fires the upload's remaining load and loadend, and
  from 28 a readystatechange with readyState 2 at the stopped or reopened
  request; #92).

## Decisions

- **2026-10-19: XMLHttpRequest and WebSocket (decided by Sonu)** (issues
  #22, #26, #30).
  - **WebSocket:** option A, `window.WebSocket` is the host's WebSocket
    (Node's), aliased, not an own interface (branch
    fix/websocket-window, 2026-10-19 below). Its events and errors are
    Node's, not the window's (README, "Differences from jsdom"). An own
    spec implementation wrapping the host's (option B, 1-2 days) only if
    `warpdom compare` or a user report shows a test that needs it: the
    tracer saw WebSocket in 1 test file of 1 project, which already
    passes.
  - **XMLHttpRequest:** reverses the 2026-10-12 "XMLHttpRequest stays
    out" decision, because of the 2026-10-17 rule that everything jsdom
    has is on by default (M1); XHR and XMLHttpRequestEventTarget exist
    in every jsdom version.
    - Implemented from the spec on top of the host's `fetch`, on by
      default, with an `xhr: false` escape hatch for suites that rely on
      the Node-http fallback (axios then takes the XHR path again, as on
      jsdom; release note).
    - Synchronous XHR (`open(m, url, false)`) throws a clear error: jsdom
      uses a child process for it, which the core can't, and the tracer
      measured no use.
    - Upload progress is approximated (fetch has no upload progress), and
      jsdom's cookie jar is not modeled.
    - Checks: the WPT `xhr/` area (added to the default areas), a
      mock-compat test (msw, nock, axios) and the corpus check.
    - It comes in a separate branch after the three parity PRs merge.
  - **Rejected:** an interface-only XHR stub whose `send()` fails: axios
    would detect XHR and every request would fail.

- **2026-10-11: XML documents.** Real suites barely parse XML: in the
  stage 1 traces only ag-grid's excel-export test (happy-dom) parses XML,
  `DOMParser.parseFromString(..., 'text/xml')` then `querySelector` on
  the XML; DOMParser's other callers (handsontable, mantine, element-plus,
  analog) parse HTML; createCDATASection is never called and
  createProcessingInstruction only by happy-dom's own XML parser (4 calls
  in that file). The tracer records calls, not arguments, so the MIME type
  comes from reading the tests. Built anyway because WPT needs it (dom/
  traversal, domparsing, dom/nodes create CDATA sections, processing
  instructions and XML documents) and because a test that does parse XML
  must not get a parsererror document. Done: CDATASection and
  ProcessingInstruction (creation checks, character data, cloning,
  traversal bits, HTML and XML serialization), element prefixes,
  DOMParser for the four XML types (namespaces, CDATA, comments,
  processing instructions, doctype, internal-subset entities, a
  parsererror document for input that is not well-formed), the XML
  fragment parsing algorithm (innerHTML, outerHTML, insertAdjacentHTML,
  createContextualFragment in XML documents) and XML serialization with
  the well-formedness checks for their getters, getElementsByTagName by
  qualified name, the NodeIterator pre-removing steps. Well-formedness
  comes from **@rgrove/parse-xml** 5.0.0 (ISC, no dependencies,
  maintained, passes the XML conformance suite's relevant tests, 12 KB
  minified), chosen over saxes (one dependency, last release 2022) and
  sax-js (lenient about well-formedness); it builds a tree, on which
  warpdom resolves namespaces itself. Loaded with require the first time
  XML is parsed (3.8 ms then, 0.1 ms per small document after), like
  parse5; `setXmlParserLoader()` for other runtimes. It needs Node >=
  22.12 (require of an ES module without a warning); Node 20 is past its
  end of life. Module load (fresh processes, 15 alternating runs, medians,
  Node 22.17.1): 18.0 -> 18.4 ms (+2%, the new module); hot members
  unchanged (3 interleaved runs each, all within noise, none slower).
  WPT: dom/traversal 48 -> 1,602 of 1,607 subtests (jsdom 1,583; three
  files errored on createCDATASection), domparsing 215 -> 321 of 498
  (score 63.2% -> 84.8%; jsdom 84.9%), dom/nodes 3,791 -> 6,454 subtests
  passed (score 73.9% -> 78.6%). Not done: HTML named entities for XHTML
  documents with a known public identifier (browsers read them; jsdom
  does not), markup inside entity values (kept as text), external
  entities and DTDs, getElementsByTagNameNS, Document.rootElement,
  XMLDocument.load and XMLHttpRequest's responseXML, case-sensitive type
  selectors for HTML elements in XML documents.

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
  none and [hidden] (ark-ui's signature pad focuses a [hidden] input);
  before 30, no document named properties (checked black-box: 26.1,
  27.2, 29.1.1 have none, 30.1.2 has them). So
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
- **2026-10-11: Descriptors are built on first use too.** A CPU profile of
  MUI (a fresh worker per test file) showed ~21% of warpdom's time in
  module initialization and ~11% in creating prototypes. Now an interface's
  descriptors are built the first time any window creates it (mixins and
  reflected attributes merged then, CSSStyleProperties' 1,639 accessors
  built directly), and prototypes take their members before their
  prototype: V8 builds a hidden class per member on an object that has a
  prototype, and those were not shared between windows (Object.create(null),
  members one by one, then setPrototypeOf; same keys, order, descriptors
  and chain). Node 22.17.1, medians of alternating fresh processes against
  main, noisy shared machine: module load 22.4 -> 15.0 ms; createWindow
  0.38 -> 0.18 ms; Vitest setup + touch + teardown 2.20 -> 0.54 ms; one
  simulated test file in a fresh process 39.0 -> 31.3 ms; hot members
  unchanged (+-4%, noise). Tried and dropped (< 3%): CSS property names as
  one string, a shared lazy protos table, a dictionary window object,
  Object.getOwnPropertyDescriptors for members. Next: V8 compiling the
  modules is ~8 ms of the load (Node's compile cache cut the import
  17.5 -> 12.5 ms in a quick test), then the first style write (grammar
  parsing in css-values.js, ~1.3 ms cold).
- **2026-10-11: Suite timings before and after validation and lazy
  interfaces** (median of 3, 2 workers, jsdom and warpdom alternating;
  .corpus-env/timing*-2026-10-11*.csv). The machine ran faster in the
  second session (jsdom 5-13% faster too), so compare the ratios:
  MUI default 1.86x -> 1.88x (warpdom 49.4 -> 46.2 s), vmThreads 1.30x ->
  1.26x; react-spectrum (Jest) 1.38x -> 1.40x (108.9 -> 98.9 s), now with
  no difference from jsdom; handsontable (Jest) 2.59x -> 3.04x (210.7 ->
  156.7 s; jsdom 545.7 -> 475.8 s), 16 -> 3 differences. Validation cost
  nothing measurable on whole suites. The handsontable gain is more than
  the cheaper startup explains (about 1.3 s over ~550 files); likely the
  jsdom 26 code paths it now takes (no CSS namespace: its own size parser;
  invalid declarations dropped). Not profiled yet.
  Corpus note: solid's transition.spec fails on jsdom too when its files
  run in a certain order (isolate: false shares solid's module state), so
  its one difference is a solid flake, not warpdom.
- **2026-10-11: Collections and named access per WebIDL and HTML.**
  Live collections (src/collections.js) stay one Proxy each: a live object
  can only show own properties for indices that appeared since its last
  read through a trap, and defining them eagerly would cost every tree
  mutation a pass over every live collection. The traps now follow
  WebIDL's legacy platform objects: indices and names (HTMLCollection,
  NamedNodeMap; unenumerable) are own properties in order, read-only and
  undeletable (TypeError in strict mode), names are hidden by own and
  inherited properties, ids like "0" or "-1" are names, internal state is
  not visible through an object inheriting from a collection; plus
  HTMLOptionsCollection's indexed setter and item() with ToUint32. An
  array index is found by a character scan instead of a regex, so reads
  got faster (focused bench, Node 22.17.1, median of 5 alternating runs
  against main, ns per element): children[i] loop 122 -> 100,
  childNodes[i] loop 129 -> 103, children.item(i) 56 -> 39, attributes[i]
  loop 145 -> 113, children.length 70 -> 60, attributes.length 74 -> 62,
  attributes.type 66 -> 61, getElementsByClassName index loop 376 -> 355,
  for-of unchanged; bench:hot childNodes[i] -15%, querySelectorAll -20%.
  Named access on the Window (src/named-access.js): a WindowProperties
  proxy between Window.prototype and EventTarget.prototype, answering from
  a map of the document's named objects rebuilt after tree changes. Reads
  of the window's own members and Window.prototype are unchanged; reads
  that pass it on the window object itself get slower: inherited
  EventTarget members 7 -> 24 ns, Object.prototype members 7 -> 26 ns,
  missing names 6 -> 36 ns. Accepted: test code does not read the window
  object (the environments install bound copies of its members on the
  global, and document.defaultView is the global), and warpdom's own code
  does not read EventTarget members through it. Load (bench/load.js,
  median of 7 alternating): cold 18.6 -> 18.8 ms, first window 1.37 ->
  1.40 ms, next windows 0.182 -> 0.183 ms. The environment globals get no
  named access: under Vitest that is what jsdom's environment does
  (window is Node's global, checked: window.foo for an id is undefined);
  under Jest, jsdom's window is the global and has it, but a named
  properties object in the VM context's sandbox chain breaks the
  context's built-in lookups (Math read undefined in a probe) and every
  global lookup there would pass a trap, so it is left out until a suite
  needs it. The WPT runner installs it on its global (the window there).
  WPT (dom, html/dom, domparsing, css/cssom): dom/collections score 54.2%
  -> 97.4% (left: getElementsByTagNameNS), total 52.4% -> 55.0%, harness
  OK 870 -> 877 files.
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
- **2026-10-11: CSSOM conformance (WPT css/cssom).** Full directory, 250
  files, warpdom 45.4% -> 59.4% score, 58.8% -> 66.5% subtests (2,523 ->
  2,854 of 4,294; jsdom 30.1.2: 63.8%, 66.6%), no file worse. Fixed from the
  specs, with parity tests where jsdom agrees: rule parsing and mutation
  (insertRule/appendRule take exactly one rule, @import/@namespace
  constraints, detached rules, argument counts, @import layer/supports and
  an empty imported styleSheet as in jsdom 30, keyframes keyText and
  indexed getter, @page with margin rules and CSSPageDescriptors,
  @container, @scope, @counter-style), selectorText validation (loose, as
  jsdom 30), MediaList normalization, style elements re-parsed on child
  changes, HTMLStyleElement.disabled, indexed and iterable
  CSSStyleDeclaration. Behaviors where warpdom differed from jsdom and now
  matches it per profile: rules in top-level `@media all/screen` apply in
  getComputedStyle (jsdom 26: screen only); style writes queue
  MutationObserver records and attributeChangedCallback (and
  el.attributes saw a style attribute added by a style write late);
  `style.x = undefined` is ignored (warpdom removed the declaration);
  custom properties keep their text and case; integers keep their digits;
  `, ` in min()/max()/clamp()/gradients (27+), between font families and
  background layers; url() quoted in background(-image) (27+: also
  content, list-style-image, mask-image, filter); background-position
  split into -x/-y and serialized as x y per layer, the background
  shorthand setting all its longhands, background-repeat shortest form
  (27+); `color: red !important; color: blue` keeps red (27+); writing ''
  to a computed style throws (28+); CSS-wide keywords lowercased; jsdom 26
  profile: insertRule ignores text after the rule.
  Performance (bench/style-bench.mjs, bench/style-miss-bench.mjs, cold
  import; medians of 7 alternating runs against main 4d964eb, Node
  22.17.1, shared machine): style write 93.9 -> 90.4 ns, repeated writes
  126.9 -> 126.6 ns, unique values 515.5 -> 524.0 ns (+1.6%), cold load
  15.68 -> 15.86 ms. The unique-value cost is the declared-value checks
  added on cache misses (function arguments, url(), CSS-wide keywords) and
  the attribute bookkeeping each write now does for MutationObservers,
  custom element reactions and el.attributes, which correctness needs.
  Left as is, deliberately: the declaration block's shorthand model
  (jsdom 30 expands padding into longhands, merges border/overflow/
  outline/list-style; warpdom keeps the jsdom-generation behavior already
  chosen), computed-style length and indexed names (jsdom 30 lists
  cascaded properties, jsdom 26 more), adoptedStyleSheets and
  ShadowRoot.styleSheets (jsdom lacks them and Lit feature-detects
  adoptedStyleSheets), <link rel=stylesheet> loading and load/error events
  (jsdom does not fetch by default either: link.sheet is null, the
  HTMLLinkElement-disabled tests wait for a load that never comes, and
  cross-origin SecurityError needs a fetched sheet). Not done: computed
  lengths absolutized (em, rem, vh, in, calc() simplified), which jsdom
  30 does and 26-29 do not (checked black-box with 27.2, 27.4, 29.1): the
  next CSS parity item, best checked on a jsdom 30 corpus suite; system
  colors beyond the grammar's list (mark), oklch() serialization. Many
  remaining css/cssom failures need window named access (`target`,
  `iframe` as globals), which is another branch's area.

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
     interleaved runs against f210f2a): cold load 19.3 -> 20.0 ms, heap
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
   against 75bc864): cold load 19.5 -> 20.6 ms, heap 2.84 -> 2.99 MB,
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
   value normalization in the CSSOM beyond zero lengths.
   Then timings against jsdom and happy-dom, and the load-time budget.
2. Reserve the npm name `warpdom` (placeholder package; Sonu's call, since
   publishing is public).
3. Publish the stage 1 report (venue, figures, raw traces) around the time
   warpdom goes public.

## 2026-10-11: DOM methods, insertion checks, events (branch wpt-dom-methods)

WPT (warpdom, score per file / subtests passed): dom/nodes 56.9% -> 64.0%
(3,803 -> 4,606), dom/events 70.8% -> 75.8% (515 -> 586), dom/traversal
73.5% -> 76.5%, domparsing 63.2% -> 64.9%; no file lost a subtest. Most of
the rest of dom/nodes and dom/traversal (Node-contains, Node-properties,
NodeIterator, TreeWalker: ~3,900 subtests) stops at createCDATASection and
createProcessingInstruction in the shared setup (XML branch).
Done: pre-insertion and replace validity in the standard's order (parents
that cannot have children, the document's one element and doctype, host-
including ancestors through shadow and template hosts), one mutation record
per replaceChild / replaceChildren / textContent / innerHTML / outerHTML /
fragment insertion, ChildNode viable siblings, isEqualNode, element
prefixes (tagName "X:B"), getElementsByTagName(NS) by qualified name,
document and Attr cloning, name validation (DOM's valid element/attribute
local names), createAttributeNS, namespace lookups, template contents in an
inert document, NodeIterator pre-removing steps, :valid/:invalid,
DOMTokenList iterators from Array.prototype, window.event for every target
(the top-level window: listeners run in its realm), default passive touch
and wheel listeners, createEvent's table, listener option conversions,
@@unscopables, DOMParser quirks mode / scripting disabled / URL, transient
MutationObserver registrations.
Environment: on* handler properties on the global now read the window
(Vitest-style installs kept a separate override, so `window.onblur = null`
hid a handler set by `<body onblur>`).
Hot paths (Node 22.17.1, medians of 7 alternating runs against main;
shared machine): insertion and removal (bench/insert-bench.mjs) 55.6 ->
58.0 ns per operation (+4%); createElement + appendChild + text + Event
(create-bench) 179.5 -> 176.6 ns; bench:hot (5 runs) insertBefore first
+5%, removeChild all +5%, appendChild build +2%, setAttribute and
dispatchEvent unchanged; cold load 15.8 -> 15.7 ms. Reason for the
insertion cost: the standard's validity checks (parent and node types,
host-including ancestors, the document rules) and one mutation record per
operation; the element-or-text-into-element case is checked inline in
O(depth) (the existing ancestor walk) and the document rules run only for
a document parent. Name validation is paid once per distinct name
(createElement and attribute names are remembered after the first check).
Not done: setAttribute/removeAttribute on several attributes with the same
qualified name in different namespaces (attributes are keyed by qualified
name: Element-setAttribute, Element-removeAttribute, attributes.html,
getElementById-namespaced-id, Element-setAttributeNodeNS),
Node.moveBefore (jsdom lacks it; libraries feature-detect it), document
character sets, live-collection and named-property cases (collections
branch), DragEvent and TextEvent (jsdom lacks them too).
- **2026-10-11: First full WPT run** (wpt/, WPT 87b5d13099, warpdom cd971f2;
  dom, domparsing, html/dom, css/cssom; 963 files, 133k subtests;
  docs/research/data/wpt/full-2026-10-11-summary.md). Subtests passed:
  warpdom 111,785 (83.9%), jsdom 30.1.2 107,191 (80.5%). Per-file score
  (wpt.fyi style): warpdom 66.5%, jsdom 71.5%. Ahead or level: css/cssom
  64.8 vs 63.8, dom/collections 100 vs 100, dom/lists, dom/traversal 92.5 vs
  89.6, domparsing 86.9 vs 84.9. Behind: html/dom 38.8 vs 69.4 (more
  subtests pass, far fewer files fully: next target), dom/ top-level files,
  dom/abort, dom/events 77.8 vs 79.8, dom/nodes 68.0 vs 69.1, dom/ranges
  87.6 vs 88.6. Wall clock: warpdom 393 s, jsdom 752 s. Earlier the same
  day (sample of 139 files, before the four WPT branches): 63.6% vs 82.8%.

## 2026-10-11: Global attributes, directionality (branch wpt-global-attributes)

WPT html/dom/elements/global-attributes (WPT 87b5d13099): per-file score
34.9% -> 74.8% (jsdom 30.1.2: 72.2%), subtests 109 -> 231 of 250 (jsdom
217); no file lost a subtest.
Done: the directionality from the HTML standard (src/directionality.js):
dir states, dir=auto and bdi (first strong character of the contained
text, skipping bdi/script/style/textarea and elements with a dir state),
auto-directionality form controls (input and textarea values), slots
(assigned nodes; a slot in a shadow tree gives its host's direction),
shadow roots to hosts; `:dir()`; the computed `direction` from the
rendering section's rules ([dir], bdi, input[type=tel]; jsdom 26 profile
keeps '' as jsdom 26 does); dirname in form submission. Strong
bidirectional types come from the UCD (scripts/generate-bidi-data.mjs ->
src/bidi-data.js, 2.5 KB of runs decoded on first non-ASCII lookup).
`HTMLElement.translate` (translation mode), `Document.dir`, `:lang()`
from the language of a node (xml:lang, lang on HTML/SVG, shadow host),
dataset setter errors (SyntaxError, InvalidCharacterError).
Design: directionality is computed when asked and never stored, so
insertion, removal, text and attribute changes do no work for it in any
document (no dir=auto gate needed); a query walks the ancestors and, for
dir=auto/bdi, the descendants up to the first strong character.
Benchmarks (Node 22.17.1, alternating against main, medians of 5): cold
load 17.3 -> 17.0 ms, first window 1.49 -> 1.72 ms (the sum is unchanged:
18.8 ms; the shift follows the name of the new `translate` member, not
work per window), later windows 0.175 -> 0.178 ms; bench:hot (5 runs each
order) within noise; dataset set 159.0 -> 158.5 ns, dataset get 135.5 ->
133.8 ns, an undeclared computed property 76.8 -> 76.4 ns,
matches(':lang(en)') 30.5 -> 29.1 ns. No hot-path slowdown.
Not done: `innerText` (jsdom lacks it; two dir-assorted and one dynamic
test set it), manual slot assignment (`slot.assign()`, jsdom lacks it),
CSS inheritance through slots in the flat tree (getComputedStyle of a
slotted element inherits from its node-tree parent, as in jsdom), several
attributes with one qualified name in different namespaces
(custom-attrs.html; attributes are keyed by qualified name), MathML
elements' dataset (no MathMLElement, as in jsdom), and harness limits:
the-lang-attribute-* measure :lang through layout (offsetWidth),
cdata-dir_auto loads an XHTML iframe.
- **2026-10-11: Document tree accessors** (branch wpt-dom-tree-accessors;
  WPT html/dom/documents/dom-tree-accessors, 46 files). Score 40.5% ->
  98.1%, subtests 94 -> 247 of 263 (jsdom 30.1.2: 95.6%, 243). Done:
  `document.getElementsByName` (it was missing), the `document.body`
  setter, `document.title` per HTML (only ASCII whitespace stripped, SVG
  documents use the root's SVG title, documents whose root is neither
  HTML nor svg have no settable title), and document named properties
  (forms, images, embeds, objects, iframes; Document is
  [LegacyOverrideBuiltIns], so `<form name="body">` hides document.body
  as in jsdom 30 and browsers). Design (src/document-named.js): no Proxy
  around the document; the names are own accessor properties of the
  document, defined when a name appears and deleted when it goes, so reads
  of document members never pass a trap. A deleted property leaves a V8
  object in dictionary mode (document member reads 8 -> 18 ns), so the
  document is made fast again after each deletion (used once as a
  constructor's prototype). Bookkeeping happens in the walk the tree
  already makes for the id index, and only in documents that have owned
  an embed/form/iframe/img with a name or an object with a name or id
  (`namedCandidates`; rare in real suites: plain forms, imgs and inputs do
  not count); name and id changes come through the attribute change
  steps. jsdom before 30 has no named properties, so the profile leaves
  them out. Left: Document.currentScript (the runner does not model it;
  jsdom 2/18, warpdom 3/18) and one nameditem-names subtest (property
  names in tree order: an own property named "42" is listed first, as for
  any object).
  Performance (Node 22.17.1, medians of 5-7 alternating runs against
  main, focused bench in the session scratchpad): setAttribute of id or
  name on any element 42.1 -> 46.3 ns (+10%, the attribute change step
  that checks for the five element types; other attributes unchanged);
  inserting and removing a 4-node subtree in a document with named
  elements 68.7 -> 105.3 ns (+53%, the named walk; a document with ids
  already pays about that: 127.2 -> 127.8 ns, unchanged); bench:hot all
  within +-4% (setAttribute 45.7 -> 46.3 ns), create-bench and
  insert-bench unchanged; document member reads unchanged (10.9 -> 11.2
  ns, noise). Load: cold 17.6 -> 17.2 ms, first window 1.55 -> 1.72 ms
  (together unchanged), next windows 0.187 -> 0.185 ms.

## 2026-10-12: WPT html/dom reflection, resource metadata, dom/abort, dom/ (branch wpt-misc)

WPT 87b5d13099, warpdom score per file (subtests passed), before -> after,
same runner: html/dom/ top-level files 65.5% -> 72.4% (58,180 -> 59,275 of
67,354; jsdom 67.1%); html/dom/documents/resource-metadata-management 56.4%
-> 83.9% (12 -> 17 of 20; jsdom 77.3%); dom/abort 83.3% -> 100%; dom/
top-level files 69.9% -> 80.3% (1,643 -> 1,719; jsdom 83.4%). No file lost
a subtest. aria-attribute-reflection.html was 0/41 because nullable
reflections stored undefined as "undefined" (now 41/41).
Done: WebIDL undefined -> null for nullable reflections (ARIA, role,
crossOrigin); "-0" parses to 0; ASCII case-insensitive keywords; "1.e2";
[LegacyNullToEmptyString]; USVString reflections; submit buttons' form*
overrides; document dir, applets, clear/captureEvents/releaseEvents,
referrer, lastModified, body colors; title/script/a text, datalist
options, map areas, meter/progress labels, track readyState, object
contentDocument, constants on prototypes, navigator productSub/vendorSub,
PointerEvent persistentDeviceId; @@unscopables writable per window;
NodeFilter as a legacy callback interface object; operation lengths;
removing an iframe stops its window's timers and AbortSignal.timeout; a
cookie with a NUL is ignored. Runner: load events no longer use a deleted
window.Event (dom/interface-objects.html); warpdom's document takes the
parsed page's mode (document-compatmode-03).
Performance (Node 22.17.1, medians of 5 alternating runs against main):
cold load 17.7 -> 17.5 ms, first window 1.50 -> 1.56 ms (the new
interface entries and per-window @@unscopables objects; inside budget),
next windows 0.180 -> 0.184 ms; bench:hot within noise. input.type:
14.3 -> 12.7 ns (a lowercase known type skips lowercasing).
Tried and reverted: naming accessor functions "get <name>" (idlharness
checks it, ~550 subtests): +0.3 ms per first window (renaming ~400
functions), not worth it for a check no test suite makes.
Left: element reflection (ariaActiveDescendantElement, ariaLabelledByElements;
jsdom lacks them, libraries may feature-detect them), inert, referrerPolicy,
loading, decoding, fetchPriority, link.as, enterKeyHint, translate,
draggable (feature detection risk; behavior not implemented), XPath
(XPathResult, document.evaluate), accessKeyLabel, input width/height,
img width/height setter range, idlharness argument-count checks (every
operation would need a length check) and accessor names, the global's
addEventListener identity (Vitest-style install), readyState transitions
and Last-Modified headers (runner), iframes loading cross-origin pages.
- **2026-10-12: Node 22.12 or later.** `engines.node` is `>=22.12` (was
  `>=20.19`): the XML parser dependency needs it, and Node 20 is past its
  end of life. `.nvmrc` selects Node 22 (`nvm use` picks the newest 22.x
  installed; 22.17.1 and 22.23.3 here).
- **2026-10-12: html/dom after the html/dom work** (main 8a78ca5, WPT
  87b5d13099, --jobs 1; docs/research/data/wpt/htmldom-2026-10-12-summary.md):
  per-file score warpdom 72.1% vs jsdom 69.4% (was 38.8%); subtests
  59,796 vs 52,869 of 69,303. Ahead or level in every subdirectory except
  innerText/outerText (both 3.2%: neither has innerText).
- **2026-10-12: Reproducibility and a compare command before going
  public.** Two audiences need two tools. (1) People checking our claims
  should reproduce the published numbers from the warpdom repository alone,
  so before warpdom goes public the corpus timing moves here (harness,
  corpus list with pinned commits, timing scripts and the GitHub Actions
  workflow, e.g. under bench/corpus/). Until then it stays in
  dom-api-tracer (.github/workflows/timing.yml, corpus/pins.json,
  scripts/research/), which goes back to its original purpose afterwards:
  tracing which DOM APIs test suites use. (2) People trying warpdom on
  their own project need one command, `npx warpdom compare`: runs the
  project's tests on jsdom and on warpdom alternating, reports the speedup
  and every test whose status differs (the corpus survey for one project),
  next to the existing `warpdom vitest run`, with a CI example. It is also
  how we collect evidence from real application suites.
  Design: docs/compare.md (decided: 1 indicative round by default, warm-up
  only with more rounds, per-file environment comments reported but not
  switched in v1, no happy-dom column, exit code 1 on any pass-to-fail
  change, the corpus timing reuses `compare()`).

- **2026-10-12: Timing moves to GitHub Actions; why speedups vary.**
  - Laptop timings can be disturbed by other jobs, so the reference
    timing now runs in dom-api-tracer's `timing` workflow: one job per
    project, pinned commits, alternating DOMs, with options for
    experiment configurations and per-file phase timings.
  - The local single-session re-timing (2 rounds, stopped early) gives a
    drop-in median of 1.25x over 14 suites, faster on all 14.
  - ariakit is wait-bound: warpdom does 7.5x less DOM work, but the test
    processes mostly wait for animation frames paced at a real 60 Hz.
    Experiment `exp/fast-frames` (frames without the real-time wait,
    opt-in) is being measured.
  - solid is 0.94x on a runner. That was first blamed on a 0.8 s cost of
    loading warpdom as a custom environment in Vitest 2. That was wrong:
    14 of solid's files pin jsdom with a `@vitest-environment` comment,
    so the "warpdom" run loaded both DOMs. The same affected svelte
    (84.5% of its tests). The harness now switches such files
    (dom-api-tracer ceffbd6); see the correction in docs/research/README.md
    section 3. With the switch, svelte shows 55 real differences, now being
    fixed.
  - Details in docs/research/README.md (3.2, 3.4, F6, F7).

## 2026-10-12: `warpdom compare`, milestones 1-3 (branch feat/compare)

Implemented (docs/compare.md): `src/compare/` (Node only; exported as
`warpdom/compare`) and `warpdom compare` in bin/warpdom.js. The harness
pieces from dom-api-tracer's trace-corpus.mjs moved here without the tracer:
wrapper configs named `*.warpdom-compare.<role>.*` (only such names, the
`node_modules/.warpdom-compare` copy and directories compare created while
empty are ever deleted), `<out>/pending.json` written before every temporary
file, cleanup in finally, on SIGINT/SIGTERM/SIGHUP and by the next run, a
lock per output directory, `git status --porcelain` before and after. A
config probe (the wrapper describes the projects and stops the runner)
finds the DOM projects before any test runs; exit 2 when there are none.
`--correctness` (one run each), `--rounds n` (alternating; untimed warm-up
pair when n >= 2), flaky detection on both sides, regression/fixed/other
classes and groups by status change and first error line, report.md
(summary without file or test names, then details), results.json, logs,
environment record. Per-file environment comments are counted and their
tests left out of the comparison (status changes there are listed).
Smoke tests (2 workers): solid packages/solid (Vitest 2) same results;
14 of its files (268 of 482 tests) pin jsdom with a comment, and warpdom
is 1.21x slower there (the warpdom run loads both DOMs); one
transition test in a pinned file failed in warpdom runs only (isolate:
false shares the worker). react-hook-form (Jest 30, jest-fixed-jsdom):
1,524 tests same, 1.14x faster over 2 rounds.
Open: monorepos (milestone 4), --explore (5); Jest tests of Node
projects are counted in the totals (Jest's JSON has no project per file);
the solid numbers argue for switching docblock-pinned files after all.
Update (same day): compare now switches Vitest test files that pin jsdom
or happy-dom with a comment (as the corpus harness does since
dom-api-tracer ceffbd6): the wrapper patches fs.promises.readFile in
Vitest's main process so the comment names `warpdom-compare` (resolved as
a temporary `vitest-environment-warpdom-compare` package) or the baseline;
Jest pins stay reported and not compared. solid again: all 482 tests
compared, same results; 1.03x faster over 2 rounds (spread 1.01x-1.05x),
was 1.21x slower with both DOMs loaded. The "Transition memo stale read"
test passed in all 4 warpdom runs (it failed in 3 of 4 when pinned files
stayed on jsdom next to warpdom files in the shared worker), which points
to the mixed environments in one worker.

- **2026-10-12: jsdom 25 and its cssstyle (svelte).** svelte (Vitest 4,
  jsdom 25.0.1, all files on warpdom) showed that jsdom 26 and earlier
  behave like the cssstyle 4.x they load, not only like their own version:
  svelte's lockfile has cssstyle 4.1.0, a fresh jsdom 25 install gets
  4.6.0. Observed (black box, jsdom 25.0.1 with each cssstyle 4.x, jsdom 26
  and 30):
  - Undeclared computed color (and the border colors derived from it): ''
    before cssstyle 4.4, 'CanvasText' in 4.4 and 4.5, 'canvastext' from
    4.6 (jsdom 26), rgb(0, 0, 0) from jsdom 27.
  - url() in background and background-image serializes without quotes
    before cssstyle 4.3.1 (url('a.png') -> url(a.png), also in the style
    attribute and the computed value), quoted from 4.3.1 on.
  - cssstyle 4 parses 54 properties (margin, padding, the border ones,
    width, height, top..left, colors, fonts, flex, background); every other
    value is kept as written: min-height: 0 stays 0 (warpdom wrote 0px),
    gap: +.5 stays +.5. Same in jsdom 25 and 26.
  - Computed border shorthands (border, border-top..left, border-width,
    -style, -color) are the declared values, colors as written: border:
    100px solid pink computes to 100px solid pink (jsdom 30: rgb(255, 192,
    203)); border declares the sides too, a later border-top-color does not
    change them, border-top-width alone leaves border-top empty. jsdom 27
    and 28 differ again (border '' for named colors); not modeled.
  - Vitest's jsdom environment defines global getters for matchMedia,
    createPopup, scrollLeft and scrollTop even though jsdom lacks them, so
    a test that assigns Window.prototype.matchMedia (svelte's helpers) makes
    window.matchMedia work; warpdom's Vitest environment now does the same.
  warpdom: createWindow takes `cssstyle` (the adapters read it next to the
  jsdom they detect; `environmentOptions.warpdom.cssstyle` /
  `testEnvironmentOptions.cssstyle` override), validation mode 'jsdom25'
  (= 'jsdom26' with unquoted url()s) for cssstyle before 4.3.1, and
  compat.rootColor. Without a cssstyle version the jsdom 25/26 profile
  stays as before (latest 4.x). svelte: 55 -> 30 differences; the rest are
  <select>, media, draggable, hydration and script execution.
  Not modeled: cssstyle before 4.4 also leaves float and the font
  properties unparsed and parses the others more loosely (52 properties
  differ from 4.6 on a sweep, e.g. border: 1px solid #ff0000 keeps #ff0000,
  currentcolor stays the computed border color); jsdom 26 lowercases units
  in parsed lengths (1PX -> 1px).
- **2026-10-12: svelte's remaining differences: select, observers,
  scripts, media.** With all of svelte's files on warpdom, 30 tests still
  differed after the jsdom 25 profile; now 1.
  - select: the selectedness setting algorithm reran after any change in
    the document (treeRev), so a select left with no selected option
    (selectedIndex = -1, or a value matching none) got its first option
    back at the next unrelated change. It now reruns only when the list of
    options gained or lost options (compared lazily with the list it last
    settled), when an option asks for a reset, or when the size or
    multiple attribute is set (jsdom does that even for the same value).
    jsdom also reruns it for any element inserted or removed anywhere in
    the select; not modeled (no subtree revision counters). Like jsdom, a
    disabled attribute change does not reset (WPT's newer
    select-attribute-change-reset expects it: 2 subtests).
    HTMLSelectElement is iterable over its options; select[0] (indexed
    properties on an element) is not supported.
  - MutationObserver: observe() counts registrations in the node's
    document, and adoption did not move the count, so a node observed
    while in a template's contents document (svelte clones templates) got
    no records after moving into the page. adopt() now moves it.
  - Scripts: a classic inline script made by script (createElement,
    cloneNode, importNode; not the parser) runs when it becomes connected,
    as in Vitest's jsdom (runScripts: 'dangerously'); document.currentScript;
    errors go to the window's error event. Parser-made scripts never run but
    their clones do; src scripts load nothing; module scripts do not run.
    jsdom 30 runs a fragment's scripts after all its children are in, runs
    a connected script when text is inserted into it, and runs scripts in
    shadow trees; earlier profiles do neither. Vitest (both pools) and Jest
    run them in the test realm (window[S].runScript); a standalone window
    uses `with (window)` and a direct eval, so top-level var declarations
    stay local. Insertion pays only in documents that had such a script
    (scriptCount, like frameCount).
  - HTMLMediaElement: muted and volume changes fire volumechange
    (synchronously before jsdom 30, a task from 30). HTMLElement.draggable.
  - Pre-insertion validity errors carry jsdom's messages (svelte's
    hydration tests compare DOMExceptions), and a childless shadow host or
    template can no longer be inserted into its own shadow tree or contents.
  Left: hydration/whitespace-at-block-start. In Vitest's default pool,
  jsdom's DOMException comes from jsdom's script context, so it is not
  `instanceof Error` of the test realm and svelte does not append its
  component stack to the message; warpdom's DOMException is Node's (an
  Error). Matching it would mean a DOMException outside the test realm's
  Error hierarchy only in the non-VM pools; not done (broad effect).
  WPT (--jobs 1; the-select-element, the-option-element, dom/nodes):
  7,339 -> 7,350 subtests (insertion-removing-steps 8 -> 19; the runner
  now runs inserted scripts with vm.runInThisContext). Performance (Node
  22.17.1, 5 alternating runs): cold load 18.2 -> 18.5 ms (scripts.js),
  first window 1.85 -> 1.84 ms, bench:hot appendChild 86.5 -> 87.4,
  insertBefore 122.8 -> 123.3, removeChild 171.4 -> 169.6, setAttribute
  45.4 -> 45.6 ns (noise).

## 2026-10-12: `warpdom compare`, milestone 4: monorepos (branch feat/compare-monorepo)

Compare now runs on monorepos (docs/compare.md, "Monorepos"); it exited 2
on Vitest workspaces before. Vitest 2 to 5: `test.projects` and
`test.workspace` (inline objects, functions, promises, `extends: true`,
Vitest 5's inherit-by-default, `extends: '<file>'`) and workspace files
(Vitest 2 and 3, also without a root config). Jest: inline projects and
project paths/globs (`<rootDir>/packages/*`); a self-referencing project
now runs through the wrapper instead of being dropped (the harness dropped
the root project when other projects were listed). Project strings are
resolved as the runners do (own glob, no dependency); each config found
gets its own wrapper. Running from a package inside a monorepo uses the
hoisted runner binary. A small temporary reporter records which project
ran each file (neither runner's JSON has it): test keys carry the project,
node and browser-mode projects are not compared (this fixes the open
"Jest Node projects counted in the totals"), a DOM project left unswitched
is reported, and report.md details have counts per project.
Tests: unit tests for globbing, resolution, the wrappers, per-project
results; end-to-end fixtures for Vitest projects (jsdom, node, a happy-dom
project in its own config, a directory without one, a file in two
projects), running from a package directory, a Vitest workspace file
(opt-in, WARPDOM_COMPARE_VITEST_LEGACY; passed with Vitest 2.1.9 and
3.0.9) and Jest projects (opt-in, WARPDOM_COMPARE_JEST; passed with Jest
30). The projects fixture also passed on Vitest 4.1.7.
Smoke tests (--correctness, 2 workers, git status unchanged after each):
react-hook-form (Jest 30, Web + Server projects) 1,515 tests same, Server
(9 tests, node) not compared; radix-primitives (Vitest 4.1.7, unit + rsc)
982 same, rsc (64, node) not compared; floating-ui packages/react-dom
(Vitest 3.0.9, run from the package, binary hoisted) 15 same; vuetify
packages/vuetify `src/util` (Vitest 4.1.11, unit + browser) 127 same, the
browser project (3 tests, chromium) not compared.
Open: projects only defined in other files are known after the first
baseline run (baseline name guessed from installed packages until then);
nested project strings in Vitest 5 project configs are not resolved.

- **2026-10-12: EventModifierInit's other modifier keys.** Found by the
  three-way GitHub run once ariakit's `shims.jsdom.test.ts` (pinned to
  jsdom with a comment) ran on warpdom: `new KeyboardEvent('keydown',
  { modifierCapsLock: true }).getModifierState('CapsLock')` must be true.
  Black-box facts (jsdom 25, 26 and 30 agree): the ten `modifier*` init
  members (AltGraph, CapsLock, Fn, FnLock, Hyper, NumLock, ScrollLock,
  Super, Symbol, SymbolLock) are read by `getModifierState` on MouseEvent,
  PointerEvent, WheelEvent and KeyboardEvent; they are not attributes;
  keys are case-sensitive; TouchEvent has no `getModifierState` (warpdom
  had one; removed). The event keeps its init dictionary and reads the key
  when asked: reading ten absent keys at construction cost 12-20% of
  `new MouseEvent`/`new KeyboardEvent`; now construction is unchanged.

- **2026-10-12 (night): GitHub results and open decisions.** Details in
  docs/research/README.md 3.6.
  - Three-way: warpdom faster than jsdom on all 14 suites; median 1.32x
    (13 suites) or 1.43x (with handsontable's 8.84x from the two-way run).
    happy-dom 1.30x but changes results in 12 of 13 suites; warpdom 0-2
    per suite (ariakit 11: 9 jsdom-fail plus 2 fixed in c9a06c4).
  - Fast mode median 1.64x over 11 Vitest suites (MUI 8.14x, Vuetify
    6.56x, Radix 6.03x); 0-2 differences except ariakit.
  - WPT: score per file 72.5% vs jsdom 71.1%, subtests 85.1% vs 80.5%.
  - **To do:** handsontable three-way rerun (its jsdom core exceeded the
    old 20-minute harness limit; now 45 minutes, and a failed package
    makes the round NA).
  - **Decision pending: fast frames.** exp/fast-frames makes ariakit
    1.61x faster than warpdom default (2.31x vs jsdom), no change
    elsewhere, but changes 3 test results in ariakit and about 3 in ark-ui.
    Only as an opt-in; build properly (environment option, frame
    timestamps advancing 16.7 ms, tests) or drop.
  - **Decision pending: feat/dom-gaps** (innerText/outerText, namespaced
    attributes keyed by namespace, XPath 1.0 lazily loaded; worktree
    ../warpdom-gaps). Not merged: bench:hot shows getAttribute 17.4 ->
    19.5 ns and setAttribute 44.8 -> 50.6 ns (medians of 5). About 3 ns of
    it is the new attrName (keeping attribute case for HTML elements in XML
    documents); with main's attrName getAttribute is level and setAttribute
    +3.5% (the namespace lookup). Also open: jsdom has no innerText at
    all, so adding it can change results for code that checks for it.
    XPath and the slot-inheritance test are independent of both issues.

## 2026-10-12: innerText, namespaced attributes, XPath (branch feat/dom-gaps)

WPT 87b5d13099, --jobs 1, warpdom subtests before -> after (jsdom 30.1.2
for reference): the-innertext-and-outertext-properties 13 -> 1,401 of
1,404, score 3.2% -> 99.9% (jsdom 13, 3.2%); domxpath 2 -> 109 of 113,
score 3.6% -> 94.0% (jsdom 55, 56.3%; xml_xpath_runner needs
XMLHttpRequest in the runner, both engines; run directly, its 1,024 cases
pass on warpdom and jsdom); dom/nodes 7,103 -> 7,148 of 9,735, score
89.1% -> 91.3% (attributes.html 56 -> 67 of 67, namespaced-attribute-
mutations 2 -> 24 of 24, getElementById-namespaced-id, Element-
setAttribute/removeAttribute/setAttributeNodeNS now all pass, as in
jsdom); html/dom/elements/global-attributes 231 -> 235 of 250
(custom-attrs, dir tests that set innerText); domparsing unchanged. No
file lost a subtest.

- **innerText / outerText** (src/layout.js). jsdom 25, 26 and 30 have
  neither (black box: `'innerText' in HTMLElement.prototype` is false; an
  assignment is an expando), so there is no version to key on; warpdom
  implements them as browsers do, for code and tests written against
  browsers (WPT, happy-dom suites, libraries that read innerText). The
  getter runs the HTML standard's rendered text collection steps without
  layout: rendered = connected, in a document with a browsing context, no
  display: none on it or a flat-tree ancestor, not inside replaced
  content, a closed details (except its summary), unslotted host children
  or SVG outside text; display, visibility, white-space and text-transform
  come from the computed style (a UA white-space for pre, listing, xmp,
  plaintext, textarea, nobr); block-level boxes, p (2 line breaks), table
  cells (tabs), rows (newlines), atomic inlines (inline-block, replaced
  elements, select), floats and absolute positioning are approximated by
  display and position; CSS white-space collapsing (across element
  boundaries, at line starts and ends, around atomic inlines, pre-line
  segment breaks) runs in one pass. Not being rendered gives textContent.
  Setters: the rendered text fragment (br for each line break), one
  mutation record; outerText replaces the element and merges adjacent
  text. Left: ::first-line/::first-letter styles (3 WPT subtests).
  Risk to watch in the corpus: code that feature-detects innerText now
  reads the rendered text instead of textContent.
- **Namespaced attributes** (src/attributes.js): attributes are keyed by
  namespace and local name (no namespace: the local name, the hot case;
  namespaced: "\0ns\0local", with prefix and qualified name in attrNS), so
  attributes with one qualified name in different namespaces coexist,
  getAttribute/setAttribute/removeAttribute/toggleAttribute/
  getAttributeNode/NamedNodeMap find the first with the name, *NS lookups
  are O(1) (were a scan), setAttributeNode(NS) replaces in place, and the
  change steps of HTML attributes (id, style, class, slot, event
  handlers, form controls) see attributes in no namespace only.
  Attribute names keep their case on HTML elements in XML documents (the
  document is looked at only for a name with uppercase letters).
  Serialization uses the qualified name, as jsdom does (the standard
  writes xlink: for any XLink prefix). Black-box jsdom facts: parse5
  gives xlink:href/xml:lang namespaces on SVG, xmlns:foo and foo:bar stay
  in no namespace; jsdom 25/26 still find a replaced attribute by its old
  qualified name (not matched); see "Deliberate deviations".
- **XPath** (src/xpath.js, interfaces in src/dom-parsing.js): XPath 1.0
  (lexer with the lexical disambiguation rules, recursive descent parser,
  tree-walking evaluator over the linked tree, document order by one tree
  walk), XPathResult (all ten types; iterators invalidated by tree and
  attribute changes in the jsdom 30 profile, as jsdom 30 does; jsdom 25/26
  never invalidate), XPathExpression, XPathEvaluator,
  Document.evaluate/createExpression/createNSResolver, callable and
  object resolvers (exceptions reported, prefix then unresolved), HTML
  rules for attribute name tests. The engine imports nothing and is
  loaded on first use through setXPathLoader (the Node entry requires it,
  like parse5), with the core's internals passed in. jsdom facts and
  deviations: see "Deliberate deviations"; jsdom 30 vs 25/26 differ only
  in invalidation and in TypeError vs XPathException(52).
  `//p` in a 3-node document: 0.63 us per evaluate (jsdom 20.95 us);
  first use (load + compile) 1.15 ms (jsdom 1.56 ms).
- **CSS inheritance through slots: not changed.** Black box: jsdom 25, 26
  and 30 compute a slotted element's inherited properties (color,
  font-size, visibility, cursor) from its host, not from the slot; warpdom
  already does the same, so flat-tree inheritance would change results
  tests see. Locked in with a parity test (test/slots.test.js).

Performance (Node 22.23.3, 5 alternating runs against main, medians):
cold load 16.2 -> 16.2 ms (innerText and the XPath interfaces live in
existing modules: as separate files they cost +0.3 ms), first window
1.55 -> 1.56 ms, next windows 0.18 -> 0.18 ms; create-bench 182.9 ->
185.5 ns (noise range 178-194), insert-bench 59.1 -> 58.9 ns; bench:hot
within +-3% except setAttribute 45.7 -> 49.0 ns (+7%; focused bench
22.1 -> 25.0 ns) and closest("[data-index]") 166.4 -> 156.3 (-6%).
Reason for setAttribute: it must change the first attribute with the
qualified name in any namespace (DOM; WPT and jsdom agree), which costs
a check for namespaced attributes per call, and attribute name
lowercasing now looks at the document for names with uppercase letters
(XML documents). Variants that moved the check into the write path or
gated it on a module flag measured the same (V8 inlining of the write
path decides most of it). getAttribute 17.2 -> 16.7 ns.
Left: `[ns|name]` needs @namespace (not in the DOM API); element type
selectors with namespaces (`*|tag`, ParentNode-querySelector-namespace-
tagname-attribute 3 subtests); HTML attribute selectors matching
uppercase names set with setAttributeNS case-insensitively (jsdom does;
needs a scan on misses); XPath namespace axis (empty, as in browsers);
declarative shadow DOM (xpath-shadow-dom 1 subtest).

- **2026-10-12: Attribute hot paths after namespaced attributes
  (feat/dom-gaps, before merging).** bench:hot medians of 5-7 alternating
  runs, main vs branch, Node 22.23.3:
  - The agent's version: getAttribute 17.4 -> 19.5 ns, setAttribute
    44.8 -> 50.6 ns.
  - Fixes:
    - attrName is small again: the document is consulted only for a name
      with uppercase letters, in a separate function (about 3 ns of
      getAttribute).
    - setAttribute is main's one-liner again; the first-by-qualified-name
      lookup moved into writeAttributeValue, behind `es.attrNS != null`.
  - Now: getAttribute 17.1 vs 17.0, appendChild/insertBefore/removeChild
    level, closest -7%, setAttribute 45.5 -> 48.8 (+2-3 ns).
  - Bisecting the branch's commits puts about 1.5 ns of that at the
    innerText commit, which does not touch the setAttribute path (layout or
    JIT noise between checkouts). About 1 ns is the namespace handling the
    spec requires.
  - Tried and rejected:
    - A per-element `lc` flag set at creation: getAttribute -0.6 ns, but
      appendChild +12%, insertBefore +8%, removeChild +7% (a larger
      element state shape).
    - `attrNS: null` in the initial shape: no gain.
  - Merged on Sonu's instruction ("optimize the attribute part, then
    merge").

- **2026-10-12: Fast frames as an opt-in** (decided by Sonu: build it, off
  by default). Option `fastFrames` (createWindow; Vitest
  `environmentOptions.warpdom.fastFrames`; Jest
  `testEnvironmentOptions.fastFrames`; inherited by iframes): a frame
  starts as soon as the event loop gets to it instead of after 16.7 ms.
  Frame semantics are kept (batching, order, cancellation, one real
  timestamp per frame). Timestamps stay real, so duration-based animations
  are not shortened. `warpdom compare --fast-frames` shows a suite's speedup
  and every test it changes. docs/fast-frames.md. The experiment branch
  exp/fast-frames (an environment variable read in the core) is replaced
  by this and deleted.


- **2026-10-12: Configuring warpdom in Vitest.** Found while writing the
  README: Vitest takes a package named `vitest-environment-<name>` or a path
  as `test.environment`, so `environment: 'warpdom'` (as docs/fast-mode.md
  showed) and `'warpdom/vitest'` both fail to resolve. Jest's
  `testEnvironment: 'warpdom/jest'` works. Now:
  `import { environment } from 'warpdom/vitest/environment'` gives the path
  (a tiny module, so the config does not load the DOM), and `withFastMode`
  turns `'warpdom'` into it. Release decision: also publish a
  `vitest-environment-warpdom` package (name free on npm) so plain
  `environment: 'warpdom'` works.

## 2026-10-12: WPT gaps against jsdom in dom/, dom/events, dom/ranges, dom/nodes (branch feat/wpt-dom)

WPT 87b5d13099, run locally per directory with --jobs 1, Node 22.23.3,
jsdom 30.1.2 as reference. Scores are per file against the union of
subtest names (as `wpt/summary.mjs` side by side); "before" is main
1258109 (newer than the CI run's d7546a7: XPath and namespaced
attributes were already merged, so top-level dom/ started at 90.8%, not
80.3%). No subtest that passed before fails now in any of the four.

| Area | warpdom before | warpdom after | jsdom | subtests warpdom before -> after (jsdom) |
| --- | --- | --- | --- | --- |
| dom/ (10 files) | 90.8% | **95.9%** | 93.2% | 1,819 -> 2,001 of 2,102 (1,337) |
| dom/events | 77.8% | **79.75%** | 79.78% | 594 -> 604 of 715 (481) |
| dom/ranges | 87.6% | **89.2%** | 88.6% | 38,990 -> 40,318 of 44,494 (40,317) |
| dom/nodes | 72.7% | **74.0%** | 69.1% | 7,175 -> 7,211 of 9,922 (7,137) |

Subtests jsdom passes and warpdom fails: dom/ 10 -> 2, events 32 -> 27,
ranges 3 -> 0, nodes 36 -> 1.

Fixes, by cause:
- **WebIDL details** (idlharness): operations called with too few
  arguments throw a TypeError (getAttribute(), setAttribute('a'),
  addEventListener('x'), createElement(), contains(), initEvent(),
  Range.setStart(node), ...; the last required argument is tested for
  undefined first, so the common path never reads arguments.length);
  constructor lengths (Event and subclasses 1, MutationObserver,
  StaticRange); add/removeEventListener and createElement(NS) lengths;
  @@iterator not enumerable; brand checks (contains(null), isSameNode,
  hasFeature, cancelBubble setter, documentURI, DOMTokenList
  stringifier, add/removeEventListener).
- **isTrusted** is an own, non-configurable accessor of every event with
  one shared getter, as in jsdom (Object.keys(event) is ['isTrusted']).
- **Globals**: the Vitest/Jest global's addEventListener,
  removeEventListener and dispatchEvent act on the window, or on another
  this (window.addEventListener.call(el, ...)).
- **Events**: listeners on targets whose window is a removed iframe's do
  not run (DOM inner invoke; checked only once an iframe has been removed
  in the process); TransitionEvent for the jsdom 27+ profiles (jsdom has
  it from 27.0.0; React then listens for transitionend, not
  webkitTransitionEnd); UIEventInit view rejects primitives;
  javascript: URLs of followed links run as scripts in a later task (as
  jsdom with runScripts 'dangerously'; main printed "Not implemented:
  navigation to another Document" for href="javascript:void(0)").
- **Ranges**: live ranges move with an adopted subtree;
  compareBoundaryPoints converts how as unsigned short; StaticRange
  requires both offsets.
- **Selectors**: *|type, |type, ns| invalid; forgiving :is()/:where();
  CSS input preprocessing (CR LF, NUL); :host / :host(...) from a shadow
  root's top-level elements.
- **Nodes**: createElement('f:oo') keeps the colon name as local name
  (also clones and the HTML parser's <x:y>); tagName uppercases ASCII
  only; createElementNS(HTML, 'SPAN') is HTMLUnknownElement; <frame>
  gets a nested window like <iframe>; live NodeList/HTMLCollection
  iterators; DocumentFragment.getElementById(''), quirks-mode
  getElementsByClassName, insertAdjacentElement type check.

Performance (5 alternating runs against main 1258109, medians; Node
22.23.3):

| | main | branch | |
| --- | --- | --- | --- |
| new Event | 42 ns | 96 ns | +54 ns: the isTrusted own accessor (defineProperty, ~55 ns, no cheaper way found) |
| new CustomEvent | 55 ns | 122 ns | same |
| new MouseEvent | 308 ns | 225 ns | -27%: event state from a per-interface template |
| new KeyboardEvent | 273 ns | 205 ns | -25% |
| dispatchEvent (hot, MouseEvent per call) | 1,538 ns | 1,487 ns | -3% |
| dispatch-bench (new Event per call) | 1,407 ns | 1,470 ns | +4.5% (event creation) |
| create-bench (includes new Event per node) | 184 ns | 237 ns | +29% (event creation) |
| insert-bench | 60.1 | 59.5 | level |
| appendChild / insertBefore / removeChild | 86.5 / 122.3 / 169.6 | 86.4 / 118.7 / 164.2 | level or faster |
| setAttribute (bench:hot) | 47.3 | 49.1 | +3.8%; focused bench level (26.6 vs 26.3 ns) |
| matches / closest (bench:hot) | 23.6 / 153.6 | 20.8 / 113.3 | one-compound selectors match directly |
| cold load | 16.3 ms | 16.6 ms | +0.3 ms (more code) |
| first window (25 fresh processes) | 1.59 ms | 1.63 ms | |

Tried and dropped: renaming helper-built accessors to "get x" when
interfaces are built (+0.3 ms first window) and naming handler accessors
with computed keys (+0.2 ms first window); timestamps coarsened to 5 us
(passes Event-timestamp-safe-resolution but breaks the high-resolution
test, since performance.now() is the host's); Array.prototype.values as
NodeList's iterator (every item would go through the list proxy).

Decision for Sonu: isTrusted as an own accessor costs about 55 ns per
event (plain Event 42 -> 96 ns); UIEvent subclasses are still faster than
main because of the template. Revert 428744b (pre-consolidation hash; see [COMMIT-MAP.md](docs/research/data/COMMIT-MAP.md)) if that is not worth jsdom's
shape (WPT: dom/events then 78.6% vs 79.8%).

Left, and why:
- dom/events (0.03 points behind): XMLHttpRequest as an event target
  (relatedTarget, event-global; jsdom has XHR, warpdom does not: adding it
  changes which adapter axios and similar libraries pick, a product
  decision); window.performance is Node's in the Vitest/Jest globals, so
  dispatching warpdom events on it fails (as in Vitest's jsdom
  environment; the runner runs jsdom as a plain window); event timeStamp
  per frame time origin plus `eval` in frames (cross-realm getter); 5 us
  resolution (see above); passive-by-default names its subtests after
  window.constructor.name, which is Object for a Vitest-style global, so
  20 subtests count as missing for each engine.
- dom/: window.addEventListener === EventTarget.prototype.addEventListener
  (the global has bound functions, like Vitest's jsdom environment);
  NodeList entries/keys/values/forEach being Array.prototype's (cost).
- Iframe-based range tests (Range-cloneContents, -deleteContents,
  -extractContents, -insertNode, -surroundContents: ~4,200 subtests) fail
  in both engines: frames load no documents and run no scripts.
- Nested forms (Event-dispatch-single-activation-behavior, 8 subtests):
  the outer form's onsubmit sees the bubbling submit event; unclear how
  browsers avoid that.
- Observed, not changed: jsdom matches `*|H` against a no-namespace `h`
  element; jsdom accepts an unclosed `:is(b`.

- **2026-10-12: Merging feat/wpt-dom.** Kept everything except the own
  `isTrusted` accessor (moved to Event.prototype, see deviations). One-field
  event interfaces (CustomEvent) use the state literal plus one property
  instead of the template copy. Main vs merged branch (medians): new Event
  41.4 -> 41.2 ns, CustomEvent 40.3 -> 45.5 ns (+5 ns, not found),
  MouseEvent 312 -> 173 ns, KeyboardEvent 278 -> 156 ns; bench:hot
  dispatchEvent -8.5%, closest -26%, matches -12%, appendChild/insertBefore/
  removeChild -3% to -5%; setAttribute level in the focused benchmark
  (27.1 vs 27.7 ns; bench:hot shows +6% as for dom-gaps, noise between
  builds); create-bench and insert-bench level; dispatch-bench +2%.

- **2026-10-12: XMLHttpRequest stays out, for now (decided by Sonu, on the
  recommendation below).** The WPT work found that jsdom's
  `XMLHttpRequest` passes some dom/events subtests warpdom cannot. Data:
  the tracer recorded no XMLHttpRequest member use (open, send, ...) in
  4,151 test files of 20 projects (dom-api-tracer .corpus/report/usage.json),
  and none of the held-out set's 58 differences involves it. Without it,
  HTTP libraries that feature-detect it (axios) use Node's HTTP client,
  which request mocking (nock, msw's Node interceptors) intercepts too, so
  requests in tests still work; only tests of XHR itself would differ.
  A faithful implementation (jsdom's does real requests through Node) is
  large. Revisit when a real suite needs it (compare or a user report).
  Listed in the README's "Not implemented, unlike jsdom". Reversed
  2026-10-19 (Decisions): XHR comes on by default.

- **2026-10-12: Release prep.** (1) CI: `.github/workflows/ci.yml` runs
  `npm test` on every push to main and every pull request, on Node 22.12
  (the minimum) and 24. (2) `npm pack --dry-run`: 73 files, 281 kB packed,
  1.0 MB unpacked: src/, bin/warpdom.js, README, LICENSE, package.json; no
  tests, fixtures, docs or research data. Runtime imports are Node built-ins,
  the dependencies (parse5, @rgrove/parse-xml) and `vitest` (now an
  optional peer dependency). package.json has repository, homepage, bugs
  and keywords; `"private": true` stays until the release. (3)
  `packages/vitest-environment-warpdom`: re-exports `warpdom/vitest` so
  `environment: 'warpdom'` works (checked with Vitest 5 in a project with
  both installed). To publish both at release: npm names `warpdom` and
  `vitest-environment-warpdom` were free on 2026-10-12.

- **2026-10-12: Candidate: cheaper query cache hits and NodeList access**
  (from the three-DOM benchmark, docs/research/README.md 3.5). happy-dom
  beats warpdom on two hot operations: repeated `querySelectorAll` on an
  unchanged tree (56-61 ns vs 107-108 ns) and `childNodes[i]` loops (79
  vs 108 ns). warpdom already caches query results per root and selector
  until the tree or an attribute changes (selectors.js `querySelectorAll`,
  `treeRev`); the gap is the cost of a hit. Likely parts (to profile
  first):
  - `compile(text)` (a Map lookup) runs before the result cache is
    checked;
  - the cache validity checks;
  - creating the static NodeList, a Proxy for indexed access, on every
    call (the same Proxy cost would explain `childNodes[i]`).

  Constraints:
  - each call returns a new NodeList, as in jsdom (identity is
    observable);
  - invalidation must stay free for insertion and attribute writes
    (lesson: a field on every node cost insertion 8-12%);
  - no change in results.

  Testing Library queries the same tree constantly, so this is the most
  common pattern in component tests. Measure with bench/hot.js against
  happy-dom and on MUI or Radix with fast mode.


- **2026-10-12: Cheaper query cache hits and NodeList access (branch
  perf/query-hits).** Profiled first (focused micro-benchmarks with an
  inner loop, so the timer is out of the numbers; Node 22.23.3, laptop).
  What a `root.querySelectorAll('*').length` cache hit cost on main, ~85
  ns in parts:
  - method wrapper (`state`, argument check, window protos): ~14 ns;
  - `selectors.querySelectorAll` hit: 12 ns (`String()` 4, `compile` Map
    lookup ~3, cache checks and the result Map lookup ~5);
  - the NodeList: 15.6 ns (target, closure, state, symbol property, Proxy);
  - `.length`: 44 ns, two Proxy traps (`length`, then `list[S]` inside the
    getter) plus `Reflect.get` to the getter.

  `childNodes[i]` loop, 108 ns per step: `length` (as above) plus an
  indexed read, 62 ns. A V8 floor: any integer-keyed read of a Proxy goes
  to the runtime, 56 ns with a trap that returns a constant and 59 ns with
  no get trap at all, against 10 ns for a named key (`p.foo`); the CPU
  profile puts 70% of the loop in that machinery, 17% in our trap.

  Changes (src/collections.js, src/selectors.js, the querySelectorAll
  caller):
  - a list's state is its Proxy handler (a class with the traps on its
    prototype): no state read from the target in any trap, no symbol
    property on the target; static NodeLists keep their array
    (`staticList`), no closure;
  - list members (`length`, `item`, `forEach`, iterators) take the state of
    the list whose get trap ran last when it is the same list (identity
    check, so a stale value is harmless; it keeps one list reachable)
    instead of a second trap for `list[S]`;
  - `querySelectorAll` looks the result cache up before compiling the
    selector (only non-dynamic selectors are cached, so a hit needs no
    compile);
  - `querySelector`'s first-match results are keyed by the compiled entry
    instead of `\0` + selector: no string built per call, and fixes a
    collision (`querySelectorAll('\0div')` after `querySelector('div')`
    returned the cached first `div`; parity test added).
  No change on mutation paths, no new node fields; each call still
  returns a new NodeList.

  After: hit parts 13 / 6 / 13.5 / 27 ns; indexed read unchanged (the
  floor). bench/hot.js, ns per op, median of 5 alternating runs:

  | | main | branch | happy-dom | jsdom |
  |---|---:|---:|---:|---:|
  | querySelectorAll `[data-index="999"]` | 108.0 | 80.9 | 62.5 | 365,261 |
  | querySelectorAll `*` | 109.0 | 81.8 | 57.2 | 41,188 |
  | childNodes[i] loop | 107.4 | 97.9 | 80.1 | 204.8 |
  | querySelector `#id` | 51.5 | 33.4 | 52.0 | 1,183 |

  Other hot members level (8 extra alternating runs for the ones that
  looked off in the first 5: appendChild 91.2 / 90.7, setAttribute 53.0 /
  53.4, matches 21.6 / 22.1, dispatchEvent 1506 / 1479); create, insert
  and dispatch benches and load (18 ms, window 0.2 ms) level.
  npm test green on 22.23.3 and 22.12; WPT dom/collections and dom/nodes
  identical subtest by subtest; Radix 976/982 on warpdom and jsdom.

  Why happy-dom is still ahead (black-box observation): its
  querySelectorAll returns the same object for the same query (`a === b`),
  and its lists have ordinary own index properties (`delete list[0]`
  succeeds); jsdom returns a new list, and `delete` fails, as in warpdom.
  Closing the rest of the gap needs a non-Proxy NodeList, which changes
  observable behavior (delete, defineProperty, preventExtensions and
  out-of-range index writes on lists) and was not done; Sonu to decide.

## 2026-10-12: Held-out fixes (branch fix/held-out)

The causes of the held-out set's 58 differences (docs/research/README.md
3.7), fixed against jsdom as a black box (jsdom 20.0.3, 22.1.0, 23.2.0,
24.1.3, 25.0.1, 26.1, 27.4 from naive-ui's install, 30.1.2; Vitest and Jest
probes through the held-out projects' own installs). New reference
aliases: jsdom20 and jsdom22 (devDependencies; parity() takes 20 and 22,
loaded lazily: their URL parser makes Node 22.12 print a punycode
deprecation); jsdom23 and jsdom24 were installed with --no-save only for
the research.

- **Internal state invisible to deep equality.** Every non-node object
  (events, FormData, AbortSignal, style declarations, ranges, history,
  DOMRect, ...) kept its state in an own enumerable symbol property, which
  Jest's and Vitest's toEqual and pretty-format walk (react-router: loader
  arguments holding an AbortSignal with listeners; FormData snapshots).
  Now a private field stamped onto the object (internal.js hiddenSlot;
  Object.defineProperty with enumerable: false cost 65 ns per object, more
  than a whole new Event), with an accessor for S on the interface's
  prototype so `obj[S]` keeps working; events and style declarations read
  the field directly (an accessor read cost 2-4 ns, and `state()`'s
  megamorphic load is slower than the private field's: event getters
  15.5 -> 4.7 ns for three reads). Not on nodes (the plain property is the
  fastest for the hottest objects; test frameworks compare and print nodes
  as DOM nodes; clones already hide it) and not on proxied lists, storage
  and dataset (their traps hide it).
- **History traversal.** back()/forward()/go() were no-ops. Black box, jsdom
  20 to 30: the target is index + delta when called, out of range nothing,
  the move in a task on the global's timers (Vitest and Jest fake timers
  hold it back; it fires on advancing 1 ms, not 0), skipped if the target
  is current by then or a pushState/fragment navigation/location.replace
  came in between (replaceState keeps it); sets URL and history.state (the
  same object), fires popstate, then hashchange when the fragment differs.
  go(0) reports a reload as not implemented. pushState/replaceState keep
  the state object as given (jsdom: `history.state === obj`, no
  DataCloneError for functions or nodes; warpdom cloned). Fragment
  navigations and followed links now also use the global's timers, as
  jsdom's do under fake timers.
- **Assigning document.** In jest-environment-jsdom (jsdom 20 and 26) the
  global is the window: document, window and top are getters without
  setters (assignment ignored, also in strict code), location navigates.
  The Jest environment and Vitest's VM pools now do the same; Vitest's
  other pools keep setters, as its jsdom environment has them (assignment
  replaces the global's value there, for jsdom too). window.location = url
  navigates ([PutForwards=href]).
- **jsdom 20 to 23 profiles.** CSS modes 'jsdom20' (cssstyle 2) and
  'jsdom22' (cssstyle 3; jsdom 21 assumed), defaults by version when no
  cssstyle is given; 'jsdom27' for 27 to 29 (30's validation, 26's border
  and clip). Found on the way, for all profiles: border and its sides
  (order, 0 as 0px, none dropped by 20 to 27 and `medium` in 30, sides
  cleared by none), clip (rect with spaces dropped before 30, rect(0px)
  in 30), outline as written in 30, aspect-ratio 1 as 1 / 1 in 30; per
  version the properties cssstyle does not know (217 to 369 of warpdom's)
  and the CSS-wide keywords, auto and var() old cssstyle drops. On 420
  common component-library declarations warpdom now differs from jsdom
  20/22/25/26/30 in 1/1/1/2/2 (calc() folding in 26+, flex: 1 as written
  before 26; were 41/30/28/18/14). jsdom 20 also: no SubmitEvent (submit
  is an Event), image buttons do not submit, FormData ignores the
  submitter, MouseEvent without pageX/x/offsetX; style sheets of 20 to 26
  have no ownerNode, href, title or type.
- **"Not implemented" reports.** getComputedStyle with a pseudo-element is
  reported (20 to 23 "window.computedStyle(elt, pseudoElt)", 24 to 26
  "window.getComputedStyle(...)", 27+ "Window's getComputedStyle() method:
  with pseudo-elements"); all reports use jsdom 20 to 26's words
  (window.alert, HTMLFormElement.prototype.submit) in those profiles, and
  go where each environment sends them: Jest, the test's console as Error
  objects (dom-testing-library spies on console.error); Vitest, the console
  of the environment's setup, which a test's spy does not see.
- **CloseEvent** (wasClean, code as unsigned short, reason as USVString).
- **Event.timeStamp** is Date.now() at creation (jsdom 20 to 30), Date
  looked up in warpdom's realm: Vitest's default pools follow fake timers'
  Date, Jest and VM pools stay real, as jsdom. new Event 41 -> 37 ns
  (Date.now is cheaper than performance.now).
- **Image buttons**: the activating click's clientX/clientY become the
  selected coordinate (name.x/name.y), as jsdom 22 to 30; MouseEvent
  offsetX/offsetY are clientX/clientY (warpdom had 0).
- **CSSStyleSheet.ownerNode**: see "Deliberate deviations" (jsdom 27.0 has
  none, 27.1-27.2 null, 27.3-28.1 an internal object; 29 and later the
  element, as warpdom).
- **Unexplained ones, found:** (1) solid-primitives: animation frames ran on
  Node's setTimeout captured at window creation; jsdom's run on the global's
  timers, so Vitest 2's fake timers (which leave requestAnimationFrame
  alone) still run them. (2) tanstack-query lit-query: event paths ignored
  slots (a slottable's parent in the path is its assigned slot; composedPath
  lacked slot and shadow root), and jsdom 20 to 30 keep a node's last
  assigned slot after it leaves the host (its events still go through the
  old slot and host, not its new parents); the test that moves a context
  consumer to another provider relies on the stale path. Both done (the
  stale slot is recorded when a slottable is assigned). (3) vueuse
  useCssVar: jsdom 22 to 30 compute a disconnected element's style once
  and keep it until the document's connected tree or style sheets change
  (Vue Test Utils mounts detached); warpdom keeps the element's cascade
  cache, with its style attribute's declarations, until then.
- **compare**: node flags from the package.json test script into
  NODE_OPTIONS (and a hint when a run does not start); paths in messages
  relative only inside cwd; Vitest browser-mode projects left out of both
  runs and reported as not run.

Held-out set after the fixes (dom-api-tracer survey-warpdom.sh with the
original jsdom baselines, 2 workers, one run each; differing tests
before -> after): dom-testing-library 1 -> 0, tanstack-query 2 -> 1,
react-router 17 -> 0, naive-ui 0 -> 0, taiga-ui 0 -> 0, melt-ui 0 -> 0
(one run showed a ContextMenu test failing once; it passed in 3 direct
runs and the survey re-run), solid-primitives 4 -> 0, vueuse 10 -> 0,
downshift 24 -> 0: 58 -> 1 of about 13,500. Kept: tanstack-query
query-devtools PiPContext "#_goober" test (the ownerNode deviation).

Performance (Node 22.23.3, 5 alternating rounds against main 441fda1,
medians; ev = a focused events benchmark): new Event 41.4 -> 36.9 ns,
MouseEvent 200 -> 179, dispatch + one listener 326 -> 314, three event
getter reads 15.5 -> 4.7; style writes 95.5 -> 89.9; create-bench 180 ->
172; insert-bench, dispatch-bench, cold load (17.5 ms), next windows
level; bench:hot within +-3% (setAttribute -5%). cascade-bench read pass
0.53 -> 0.55 ms (+3-4%, from getComputedStyle stamping the private field
on each declaration it creates; mutate+read level). Tried and dropped: a
connectivity check on every computed read (+10%), checking slots at
every step of an event path (dispatchEvent depth 20 +6.6%), a document
field read on every tree change (removeChild +3.9%).

Left: calc() folding (jsdom 26+ give calc(3px) for calc(1px + 2px)) and
flex: 1 as written before 26; other internal tasks still on Node's
timers (postMessage, FileReader, details toggle, iframe load,
selectionchange; jsdom's may follow fake timers, unchecked); Jest and VM
globals' navigator, history, localStorage still have setters (jsdom's
ignore assignment); jsdom 21 assumed like 22 where unmeasured.

- **2026-10-12: Merging fix/held-out: the cost of hidden state, accepted
  (Sonu's decision).** State in private fields (instead of an own
  enumerable symbol property) makes `getComputedStyle` slower while code is
  cold. bench/cascade-bench.mjs read pass (20 passes, mostly unoptimized
  code): main 0.51 ms, branch 0.55 ms (+8%); with 200 passes (warm) 0.32 vs
  0.33 ms, level. A warm microbenchmark of create and read is level (create
  even faster). That is about 80 ns per call while cold: for handsontable
  (about 940 calls per test file) about 75 us per file, about 40 ms on a 90 s
  suite (0.04%). Tried and dropped: creating style declarations with the
  field from the start (Reflect.construct with a per-prototype new.target):
  slower, 0.61 ms. Benefit: Jest/Vitest deep equality and snapshots no longer
  see warpdom's internals on events, FormData, AbortSignal and others, and
  event getters are about 3x faster.

- **2026-10-12: compare switches Jest files pinned to jsdom.** Same
  mechanism as the corpus harness (dom-api-tracer ec4545f): a temporary
  `jest-environment-jest-environment-jsdom` package, the first name Jest's
  resolveTestEnvironment tries for `@jest-environment jsdom`, present only
  during warpdom runs (on a jsdom baseline). The Jest end-to-end test checks
  that the pinned fixture file is switched and compared and the package is
  removed.


- **2026-10-12: Corpus timing moves here, on `compare()` (branch
  feat/corpus-timing; milestone 6 of docs/compare.md).** `bench/corpus/`:
  the corpus files and pins (copied from dom-api-tracer d790997, same
  format), `checkout.mjs` (clone at the pin, install, build), `time.mjs`
  (per package `compare()` with the corpus's config, args and env; jsdom,
  warpdom and happy-dom rotating in every round, 2 workers; the same CSV
  columns as before, compare's full results and an environment record),
  `report.mjs` (a port of timing-report.cjs: identical output on all 18
  CSVs in docs/research/data/timing), `write-pins.mjs`, README with the
  commands per published table; `.github/workflows/corpus-timing.yml`.
  `compare()` gained API-only options: `env`, `alsoEnvironments`
  (happy-dom as a third DOM, results in `result.also`), `domPackages`
  (DOM packages a project lacks, linked for the run), `warmup`,
  `requireDom: false`; the CLI is unchanged. `@happy-dom/jest-environment`
  is a new devDependency (happy-dom column of Jest projects).
  - Local check against dom-api-tracer's harness (1 round, three DOMs):
    react-hook-form 1,515 tests, floating-ui 340 in 4 packages, the same
    in both; differences warpdom 0/0 in both, happy-dom the same tests
    (react-hook-form 7 vs 8 from one flaky happy-dom test, floating-ui
    14/14); times within 0.4 s (react-hook-form 6.0/5.1/8.5 s vs
    6.1/5.1/8.5 s; floating-ui 9.8/6.5/8.2 vs 9.7/6.5/7.6).
  - Differences by design (bench/corpus/README.md): the jsdom side keeps
    the project's own environment (react-hook-form's jest-fixed-jsdom;
    the old harness used plain jsdom), configurations rotate, a warm-up
    group with 2+ rounds, compare's coverage-off and node-flag handling,
    a failed run ends that package's comparison.
  - One GitHub run (react-hook-form, 1 round, run 38287056740, through a
    temporary push trigger, since workflow_dispatch needs the workflow on
    the default branch): jsdom 23.1 s, warpdom 16.8 s, happy-dom 20.7 s;
    1.38x / 1.12x / 1.23x; differ 0 / 8 (3.6 had 1.32x / 1.04x, 0 / 7).
  - Next: merge, then run the full corpus once from here and compare with
    3.6 (about 9 runner-hours; warpdom's Actions minutes are limited while
    private, so plan it); port fast mode, the vm pool, per-file timings and
    profiles; then switch dom-api-tracer back to tracing only.

## 2026-10-12: Style surface per jsdom profile (branch fix/legacy-style-accessors)

A GitHub run of react-spectrum (jsdom 26.1.0, cssstyle 4.6.0, Jest) had 4
tests passing on jsdom and failing on warpdom (usePress/useMove "user-select:
none"): they set `document.documentElement.style.webkitUserSelect =
'contain'` and read it back. jsdom 26 with cssstyle 4.6 has no such accessor
(`'webkitUserSelect' in style` is false, the write makes an own data
property); warpdom had jsdom 30's accessor, and since af612a2 (pre-consolidation hash; see [COMMIT-MAP.md](docs/research/data/COMMIT-MAP.md)) ("jsdom 20 to
23 profiles", UNKNOWN_TO) the jsdom26 profile's setProperty dropped
-webkit-user-select, so the read gave ''. UNKNOWN_TO's premise (each older
cssstyle knows a subset of the next one) was wrong: cssstyle 2 to 4.3 have
webkitUserSelect and write it as `webkit-user-select` (no leading dash),
only 4.4 to 4.6 lack it, and jsdom 27 to 30.0 also lack properties.

- **Measured, black box** (scripts/gen-style-surface.mjs, not run at
  runtime: installs each jsdom/cssstyle combination with npm and runs it):
  the accessor names on the style prototype chain, which CSS names in
  warpdom's data setProperty keeps, and the name each accessor writes.
  40 combinations, grouped into 12 profile keys whose combinations measure
  identically (the script fails otherwise): cssstyle2 (jsdom 20), cssstyle3
  (3.0.0 with jsdom 21 to 23, and 4.0.1 with 24), cssstyle4.1 (4.1 to
  4.3.1), cssstyle4.4 (4.4 to 4.6), cssstyle5.0 (5.0 to 5.2.1, e.g.
  naive-ui's pnpm install of jsdom 27.4), cssstyle5 (5.3.x: jsdom 27 to
  28.0), cssstyle6.0, cssstyle6.1 (6.1+, jsdom 28.1), jsdom29.0,
  jsdom29.1, jsdom30.0.0, jsdom30.0.1; jsdom 30.1.x is STYLE_ACCESSORS.
  Next to jsdom 30.1 (accessors missing / CSS names dropped / accessors
  writing another name): cssstyle2 734/369/113, cssstyle3 615/307/113,
  cssstyle4.1 573/286/113, cssstyle4.4 479/217/0, cssstyle5.0 479/217/0,
  cssstyle5 412/183/0, cssstyle6.0 and 6.1 63/32/0, jsdom29.0 49/25/0,
  jsdom29.1 47/24/0, jsdom30.0.0 11/6/0, jsdom30.0.1 7/4/0. A profile lacks
  exactly the accessors of the names it drops, except those that write
  another name (cssstyle 2 to 4.3: webkitX and webkit-x write webkit-x,
  css-float writes float, webkitTextFillColor keeps a value although
  setProperty('-webkit-text-fill-color') drops it). No profile keeps a
  name jsdom 30 drops. Checked against the local installs of downshift,
  hono, carton-case-management, react-spectrum, vuetify, naive-ui and
  radix-primitives (`--check`): all the same.
- **Data**: src/style-surface.js (13.5 KB, replaces UNKNOWN_TO), each
  profile as differences from the next newer one. The key comes from
  setupWindow (styleSurfaceKey: the cssstyle version before jsdom 29, given
  or the one jsdom's version installs, else jsdom's version); compat keeps
  the cssstyle option for jsdom 27 and 28 now. CSSStyleProperties'
  descriptors are built per surface (descriptorsOf takes a variant, cached
  per key), so a legacy window does no per-window deletes; setProperty and
  parsing drop the profile's unknown names (also jsdom 27 to 30.0, which
  dropped none before); names written only by legacy accessors (webkit-x)
  are kept as written.
- **Grammar** (generate-css-data.mjs): -webkit-user-select without
  `contain`, -webkit-box-align/-orient/-pack with their keywords, as jsdom
  28.1 to 30 (27 and 28.0 do not know them).
- **Tests**: css-profiles.test.js checks 44 accessor writes (in, typeof,
  read-back, cssText, own property) and 19 names through setProperty and
  cssText on every profile of test/parity.js (20, 22, 25, 26, 30), and the
  accessors of 10 names for jsdom 27 to 30.0. The same sample also matched
  jsdom on all 40 measured combinations except the known differences below.
- **react-spectrum** (local, Jest 30, jsdom 26.1.0 + cssstyle 4.6.0,
  usePress and useMove, plain and STRICT_MODE=1 VIRT_ON=1): jsdom 102 pass /
  11 fail (local failures, the same tests in every run), main 98/15 (the 4
  user-select tests), branch 102/11 with the same result per test as jsdom.

Known differences (not reproduced):
- Accessors for properties warpdom's CSS data does not have: 30 to 385 per
  profile (azimuth, speech properties, text-line-through-*, -webkit-marquee,
  -webkit-border-after-color, column-rule-edge-inset, ...). They stay
  undefined; an assignment makes an expando.
- cssstyle 2 to 4.3: parsing `css-float: none` (cssText, style attribute)
  writes float; values of the webkit-x names are kept as written (checked on
  the test sample only).
- cssstyle 5.0 to 5.1: cssText and style attribute parsing keep, unvalidated,
  names setProperty drops (aspect-ratio, container-type,
  animation-composition, transition-behavior, size; seen with `none`).
  cssstyle 5.2.0 does not load at all (a module path with a backslash).
- cssstyle 5.3.4 drops user-select: contain (5.3.0 to 5.3.3 and 5.3.5 to
  5.3.7 keep it).
- jsdom 28.1 to 30: -webkit-box-flex and -webkit-box-ordinal-group take no
  plain number (only calc()).
- jsdom 30 (and 28.1+): setProperty('-webkit-background-clip' / -origin /
  -size) writes the unprefixed name; warpdom keeps the prefixed one.

## 2026-10-12: Web application suites (branch fix/app-gaps)

Two applications (dom-api-tracer corpus/apps.json, pinned in
corpus/apps-pins.json) differed from jsdom locally: Excalidraw (Vitest
3.0.6, jsdom 22.1) 1 test, wire-webapp (Jest 30, jsdom 26.1.0 with
cssstyle 4.6.0 through jest-environment-jsdom) 2 tests and 2 test files
that did not run (139 tests). All three causes measured black box; both
apps now give every test jsdom's status (Excalidraw 2508/2556, wire-webapp
4926/4945, 0 tests and 0 files differ).

- **Jest teardown** (wire-webapp's conversations.test.tsx and
  ConversationRepository.test.ts): warpdom/jest's teardown deleted every
  window member from the test's global, so Dexie's promise chain, still
  running after the file, hit `queueMicrotask is not defined` outside any
  test and the Jest worker crashed (4 times, then both files failed).
  jest-environment-jsdom closes the window instead: the global keeps its
  members (interfaces, queueMicrotask, which still runs), timers return 0
  and do nothing, document, location, history, localStorage and
  sessionStorage read undefined, the window's listeners are gone. The
  teardown now does that. Not modeled: animation frames still run after
  jsdom's close (warpdom's frame waits for a timer, which no longer runs).
- **var() in computed styles** (wire-webapp's meetingNotificationCard,
  `toHaveStyle({ color: 'var(--accent-color)' })` on an Emotion class):
  warpdom substituted var() in getComputedStyle; jsdom 20 to 30 never
  does: a value with var() computes to itself and inherits so. Also from
  the same measurement: custom properties are inherited from jsdom 29 on
  only (before, '' unless declared on the element), and from jsdom 29 on
  currentcolor is transparent when the color is a var() value.
- **cssstyle's font shorthand before 4.4** (Excalidraw's text editor
  snapshot, jsdom 22): style.font = '20px Excalifont, Xiaolai, sans-serif,
  Segoe UI Emoji' reads "Emoji 20px 20px". cssstyle 2.3 to 4.3.1 give each
  word to every font longhand that accepts it alone and write font as those
  longhands (family, size, style, variant, weight, line-height); setting
  font removes the longhands set before and moves font to the end; inherit
  removes them all (shorthands.js legacyFont, compat.legacyFont).
  Measured on cssstyle 2.3.0, 3.0.0, 4.1.0, 4.2.0, 4.2.1, 4.3.0, 4.3.1 with
  ~200 words and sequences: 4.2.0 to 4.3.1 differ from earlier ones in
  numbers (exponents), length units and var(). Not modeled: unbalanced
  quotes; removing font or a longhand it set (cssstyle keeps implicit
  longhands readable); getComputedStyle re-parses the serialized font in
  jsdom 22 and 25 (family "bold" from "Arial 12px bold 12px").

Found while measuring, not fixed (none seen in a suite yet):
- A shorthand with var() (margin, padding, background, flex, font,
  border): jsdom 26 and later drop the longhands declared before it from
  the declaration block, and the longhands compute to their initial
  values; warpdom keeps the earlier longhands. jsdom 22 and 25 drop the
  shorthand; warpdom then composes margin from empty longhands ('5px  ').
- cssstyle 4.4 to 4.6 (jsdom 26): setting font writes its longhands into
  cssText too ("font-style: normal; ... font: 20px Arial"); warpdom writes
  font alone.
- Computed values: jsdom 20 to 28 keep font-weight: bold as bold (warpdom
  700); jsdom 20 to 25 keep a declared currentcolor as written; jsdom 29
  and 30 give outline-color rgba(0, 0, 0, 0) (warpdom auto), font-family
  "depends on user agent" and gap '' when undeclared; jsdom 29 gives
  medium for undeclared font-size and border widths and normal for
  font-weight; jsdom 27 and 28 give inline for an undeclared display
  where warpdom gives ''.
- `VAR(--a)` (upper case) is not var() for cssstyle: the declaration is
  dropped; warpdom keeps it.
- In the Jest environment `String(window)` is "[object Object]" (jsdom:
  "[object Window]").

## Release v0.1.0: public repository, Zenodo DOIs, npm (branch release/v0.1.0)

Prepared on release/v0.1.0 (nothing published; it merges
docs/readme-numbers, release/prep and the research data): `CITATION.cff` and
`.zenodo.json` here and in dom-api-tracer (its own release/v0.1.0 branch),
version 0.1.0 in package.json, package-lock.json and
packages/vitest-environment-warpdom, `files: ["src", "bin"]`, a Citing
section and third-party data notes in the README, and the research record
pointing at the public dom-api-tracer repository. `npm pack --dry-run`:
77 files, 318.5 kB packed, 1.2 MB unpacked (src/, bin/warpdom.js, README,
LICENSE, package.json). Audit before the flip: no credentials in any
commit of either repository; local paths `/Users/sonukapoor/...` appear in
research data (acceptable); no copied third-party code. Size: with
docs/research/data (1,742 files, 64 MB, the largest a 4.1 MB
`pertest.tar.xz`) the tree is about 66 MB and the history packs to about
48 MB, so docs/research/data stays in the repository and is archived with
each Zenodo software release;
a separate Zenodo dataset deposit only for raw data too large for git
(e.g. dom-api-tracer's per-file traces, if they are published).

Steps for the author, in this order:

1. **Merge** release/v0.1.0 into main in both repositories (`npm test`
   green) and push. Affiliation (Independent Researcher) and ORCID are
   filled in `CITATION.cff` and `.zenodo.json` in both.
2. **Flip visibility** of sonukapoor/warpdom to public (Settings, General,
   Danger Zone). Before: `git status --ignored` shows the local-only notes
   untracked (they are excluded in .git/info/exclude, never committed). Only branches that are pushed
   become public; the research data are on main, and the paper's drafts
   stay private until submission.
3. **Enable the Zenodo GitHub integration**: sign in to zenodo.org with
   GitHub, Account, GitHub, Sync now, and switch on both
   sonukapoor/dom-api-tracer and sonukapoor/warpdom. This must happen
   before step 4: Zenodo archives only releases created after it is
   switched on (a release made before needs to be deleted and re-created).
4. **Create the GitHub release v0.1.0 of dom-api-tracer first** (tag
   `v0.1.0` on main, title `v0.1.0`). Zenodo archives it within minutes and
   reads `.zenodo.json`.
5. **Get its DOIs** from the Zenodo record: the version DOI (this exact
   release) and the concept DOI (all versions, resolves to the latest).
   Put the dom-api-tracer DOI into warpdom's `.zenodo.json`
   (`related_identifiers`: identifier `10.5281/zenodo.N`, scheme `doi`,
   relation `isSupplementedBy`) and `CITATION.cff` (`references`, `doi`);
   commit and push to warpdom main.
6. **Create the GitHub release v0.1.0 of warpdom** (tag `v0.1.0`) and get
   its version and concept DOIs from Zenodo in the same way.
7. **Record the DOIs**: `doi` and `date-released` in both `CITATION.cff`
   files, and a DOI badge in both READMEs (concept DOI); commit to main
   (no new release needed; the next release picks them up). Optionally add
   the warpdom DOI to dom-api-tracer's `.zenodo.json` as `isSupplementTo`
   for its next release.
8. **Paste the DOIs into the accompanying paper** (kept private until
   submission): the version DOIs, so readers get the exact code and data
   the paper measured. When the article is published, add
   `preferred-citation` to `CITATION.cff` (title, journal, volume, issue,
   pages, DOI).
9. **Retire the deploy key**: with warpdom public, dom-api-tracer's
   `timing.yml` can check warpdom out without `ssh-key`; remove that line,
   delete the `WARPDOM_DEPLOY_KEY` secret in dom-api-tracer and the deploy
   key in warpdom's settings.
10. **npm publish when ready** (independent of the DOIs; can be later):
    remove `"private": true` from package.json and from
    packages/vitest-environment-warpdom/package.json, check the names are
    still free (`npm view warpdom`, `npm view vitest-environment-warpdom`
    should 404), `npm pack --dry-run`, then `npm publish` in the root and
    `npm publish` in packages/vitest-environment-warpdom (warpdom first: the
    second has it as a peer dependency). Use 2FA; optionally publish from
    GitHub Actions with `--provenance`. dom-api-tracer: `npm publish` from
    its root if it should be on npm too.

## 2026-10-17: `warpdom migrate` (branch feat/migrate)

`npx warpdom migrate` automates the six hand-made adoption branches
(docs/migrate.md, `src/migrate/`, exported as `warpdom/migrate`): dry run
by default (plan printed and written to `.warpdom-migrate/plan.md`),
`--apply`, `--json`, `--offline`, `--keep-jsdom-version`. It reads
configs as text with a small scanner (`src/migrate/js.js`: tokens, object
properties with key paths, where each string literal sits), edits exactly
the literal (`'jsdom'` -> `'warpdom'`) and lists everything it cannot edit
exactly as manual. Detection reuses compare's `findConfig`,
`findVitestWorkspace`, `packageVersion`, `packageDir` and `glob`. No new
dependency. Versions come from node_modules, else the lockfile
(`src/migrate/lockfile.js`: pnpm v5-v9, npm v2/v3, yarn classic and
berry), else package.json (pnpm catalogs resolved).

`npm test` now names its files (`test/*.test.js test/parity.js`): Node's
default pattern also runs every .js under test/, which would execute the
fixture projects' configs in test/fixtures/migrate/.

Acceptance against the hand-made branches (migrate --apply at the parent
commit, lockfiles ignored; handsontable and element-plus dry run):
- radix-ui/primitives, floating-ui, material-ui: config and package.json
  changes identical; only comments the hand change reworded differ (listed
  under "To review").
- vuetify: identical except where the catalog entries go (where jsdom was,
  rather than after the testing group).
- downshift: misses the root jest.config.js, which inherits jsdom from
  kcd-scripts/jest (`Object.assign(require('kcd-scripts/jest'), ...)`);
  listed as manual, by design (it does not read other packages' code).
- handsontable: the 4 Jest configs and 4 package.json files match; the root
  keeps jsdom and global-jsdom because scripts/verify-bundles.mjs imports
  them (the hand change rewrote that script).
- element-plus (jsdom 16.4.0, no hand branch): the config and two
  `@vitest-environment happy-dom` comments switch, and jsdom 16.4.0 is pinned
  (warpdom would otherwise follow jsdom 30.1.2).


Decision (2026-10-17): migrate pins the removed jsdom version by default
whenever it gives a different profile than warpdom's default for the
runner (Vitest: below 30.1.2; Jest: other than 26), in the most local
place (`environmentOptions.warpdom.jsdom` next to the environment;
`testEnvironmentOptions.jsdom` for Jest; inside an existing options object
when there is one), with a one-line why in the plan; nothing is written
when the version matches the default. `--no-keep-jsdom-version` opts out.
Reason: every migrated project keeps exactly its current jsdom behavior,
warpdom's core promise. New pnpm catalog entries go at the end of a
`# Testing` group when there is one, else where jsdom was.

## 2026-10-17: crypto, performance, Blob/File, TextEncoder/TextDecoder (branch feat/parity-apis)

GitHub issues #1 to #4: APIs jsdom's window has and warpdom's did not.
Measured black box on jsdom 20.0.0, 20.0.3, 21.0.0, 21.1.0, 21.1.2, 22.0.0,
22.1.0, 23.2.0, 24.1.3, 25.0.1, 26.1.0, 27.0.0, 27.0.1, 27.1.0, 27.2.0,
27.3.0, 27.4.0, 28.0.0, 28.1.0, 29.1.1, 30.0.1 and 30.1.3, and through
Vitest 5 (forks and vmThreads, jsdom 20/26/27/30) and Jest 29/30
(jest-environment-jsdom with jsdom 20.0.3 / 26.1.0):

| API | jsdom | Version boundary | warpdom |
|---|---|---|---|
| `window.crypto`, `Crypto` | getRandomValues (all), randomUUID, no `subtle` | randomUUID from 22.1.0 | own interface; bytes from the platform's `crypto.getRandomValues` |
| `window.performance`, `Performance` | now, timeOrigin, toJSON (EventTarget); no mark/measure/getEntries | none (20 to 30) | own interface; window clock (origin = window creation), animation frame times on it (as jsdom's) |
| `Blob`, `File` | size, type, slice; File name, lastModified; no stream() | text/arrayBuffer/bytes from 28.1.0 | own implementation (bytes in a Uint8Array, slices share it) |
| `TextEncoder`, `TextDecoder` | encode, encodeInto, decode (fatal, ignoreBOM, stream) | from 27.4.0 | own interfaces; UTF-8 via the platform, UTF-16 / single-byte / x-user-defined own, CJK platform |
| `URL.createObjectURL` | absent in every version | | absent (warpdom's window has no `URL`; the environments' is Node's) |

Environments (black box): in Vitest's default pools jsdom's global
`crypto`, `performance`, `TextEncoder` and `TextDecoder` are Node's and
`Crypto`, `Performance`, `Blob`, `File` jsdom's (`VITEST_NODE_KEYS`); in
the VM pools all are the window's (TextEncoder exists before 27.4 too,
Node's here). Under Jest all are the window's; TextEncoder is absent
before 27.4 (the familiar "TextEncoder is not defined"). warpdom now
matches each case; before, its Jest and VM globals had Node's crypto (with
subtle), performance (with mark) and Blob.

Decisions:
- Blob/File are warpdom's own, not node:buffer's Blob: per-window
  prototypes (`instanceof window.Blob`), version-gated members, and
  synchronous bytes for FormData, FileReader and `new Blob([blob])`, which
  the platform Blob cannot give. Cost: ~150 lines.
- Crypto, TextEncoder and UTF-8 decoding delegate to the platform's web
  standard globals (not Node built-ins; the core imports nothing from
  Node), read on first use from the global object as it was when warpdom
  loaded (`platformGlobal` in internal.js): a runner that installs the
  window on the real global (the WPT runner) must not make warpdom call
  itself, and reading Node's `performance` getter costs ~0.5 ms.
- Legacy single-byte decoding is warpdom's own, from the Encoding
  standard's indexes (`scripts/generate-encoding-data.mjs` writes them into
  src/encoding.js): Node 22.17 decodes windows-1252 0x80 to 0x9F wrongly
  (drops them), and koi8-u, windows-874 and windows-1253 follow ICU's
  tables. FileReader.readAsText uses the same decoders.
- Results are made in the window's realm (`realmOf`: the VM context's
  global under Jest and Vitest's VM pools), as jsdom 28.1+ does:
  `encode() instanceof Uint8Array`, `await blob.arrayBuffer() instanceof
  ArrayBuffer` hold in a Jest test.
- FormData makes Files in the blob's window (jsdom 30, black box); a
  platform Blob becomes the string "[object Blob]", as in jsdom; a
  filename with a non-Blob value throws.
- Assigning a window member that has only a getter through the global
  (Jest's and Vitest's fake timers assign `performance`) no longer throws
  in strict code: `installWindow`'s setter uses `Reflect.set`.
- The Vitest reset (no isolation, fast mode) clears Node's performance
  marks and measures between files.
- Module layout for load time: Blob and File live in file-reader.js (File
  API), Crypto and Performance in window-features.js, encoding data inline
  in encoding.js; as separate modules cold load was +1.2 ms.

Measured (Node 22.17.1, interleaved with main, medians): cold load 20.3 ->
20.9 ms (5 runs each of 7 processes), first window 1.70 -> 1.75 ms, next
windows 0.196 -> 0.200 ms; heap after load +0.18 MB, +1.8 KB per window
(six more lazy interfaces). bench:hot: no change beyond noise (all within
+-6%, none of the hot paths touched).

WPT (local checkout 87b5d13099, runner with jsdom 30.1.2, warpdom latest
profile):

| Directory | Subtests | warpdom passed | warpdom score | jsdom passed | jsdom score |
|---|---:|---:|---:|---:|---:|
| encoding/ (top level) | 12,040 | 11,614 | 75.0% | 7,819 | 59.6% |
| FileAPI/ (all; blob/ 74.9% vs 74.5%) | 851 | 633 | - | 574 | - |
| WebCryptoAPI getRandomValues, randomUUID, historical | 45 | 42 | 76.9% | 44 | 99.1% |
| hr-time/ | 48 | 36 | 25.4% | 32 | 24.3% |
| user-timing/ | 177 | 39 | 15.9% | 14 | 10.2% |

jsdom passes and warpdom fails: 13 encoding subtests (CJK decoders, see
deviations), 26 that need XMLHttpRequest, 2 WebCryptoAPI/historical (Node's
SubtleCrypto and CryptoKey globals visible in the runner's global), 1 Blob
constructor test with a platform object whose `length` is overwritten.

Open: `window.URL` (jsdom's window has `URL` and `URLSearchParams`;
warpdom's environments use Node's), `Headers` and `WebSocket` on the window,
the legacy CJK decoders.


## 2026-10-18: computed shorthands, var() and CSS-wide keywords for jsdom 27 to 30.1.3 (branch fix/jsdom30-var-shorthands, #36)

Ant Design (Vitest, jsdom 30.1.3): three ConfigProvider cssVar tests
compare `getComputedStyle(button)['border-radius']` with
`var(--ant-border-radius)` (jest-dom toHaveStyle). jsdom keeps a shorthand
it does not expand as declared; warpdom expanded it and composed `0`.

Measured black box on jsdom 27.0.0, 27.4.0, 28.0.0, 28.1.0, 29.0.0,
29.0.1, 29.0.2, 29.1.0, 29.1.1, 30.0.0, 30.0.1, 30.1.0, 30.1.1, 30.1.2 and
30.1.3 (fresh installs: cssstyle 5.3.7 for 27 and 28.0, 6.2.0 for 28.1),
inline style (attribute, accessor, setProperty, cssText) and
getComputedStyle (style attribute and a rule), 18 shorthands with var(),
plain values and inherit/initial/unset/revert, their longhands, and
longhands with keywords (scratch scripts; 9722 differing reads before,
2187 after, none in 30.0 to 30.1.3 outside font).

| Read (rule) | 27.0-28.0 | 28.1-29.0.1 | 29.0.2-29.1.0 | 29.1.1-30.1.2 | 30.1.3 |
|---|---|---|---|---|---|
| border-radius: var(--r) -> border-radius | var(--r) | var(--r) | '' | var(--r) | var(--r) |
| border-radius: 6px -> border-top-left-radius | '' | '' | 0 | 0 | 0 |
| border-radius: inherit -> border-radius | inherit | inherit | '' | see individual properties | '' |
| border-radius: unset -> border-radius | '' | unset | '' | see individual properties | '' |
| padding: 0px var(--r) -> padding | 0px var(--r) | 0px var(--r) | 0 | 0 | 0 |
| padding-top: inherit / unset | inherit / '' | inherit / unset | 0 / 0 | 0 / 0 | 0 / 0 |
| padding-top: revert | revert | revert | revert | revert | revert |
| display: initial, unset | inline | inline | inline | inline | inline |
| gap: 4px 8px -> row-gap; overflow: hidden -> overflow-x | '' | '' | normal; visible | normal; visible | normal; visible |
| gap: initial -> gap | initial | initial | see individual properties | see individual properties | '' |
| flex: var(--r) -> flex | var(--r) | var(--r) | var(--r) | var(--r) | 0 1 auto |
| background: red -> background (accessor) | red (rgb(255, 0, 0)) | same | same | same | rgb(255, 0, 0) none repeat scroll 0% 0% / auto padding-box border-box |
| inset undeclared | '' | '' | '' | '' | auto |
| border: 1px solid red -> border | '' | '' | 1px solid rgb(255, 0, 0) | same | same |
| border-top: thin solid -> border-top-width | (legacy) | (legacy) | thin | thin (30.0: medium is 16px) | 1px from 30.1.0 |

The model (src/cascade.js, compat flags in window-features.js):
- Only margin, padding, flex, background(-position), font, border and its
  sides, width, style and color set their longhands, in every jsdom
  profile (cascadeExpand). gap, overflow, border-radius, inset, outline,
  flex-flow, place-*, ... leave them unset: flex-flow is no longer a
  deliberate deviation.
- `legacyComputedStyle` is before 29.0.2 (29.0.0 and 29.0.1 still compute
  undeclared properties to ''), with CSS-wide keywords as declared;
  `unsetUndeclared` (unset as if undeclared) from 21 to 28.0; border and
  its sides compute to '' from 27 to 29.0.1.
- From 29.0.2 (observedShorthand): a shorthand jsdom does not expand
  computes to its declared value, inherit/initial/unset to its keyword
  value (SHORTHAND_INITIALS: inset auto, overflow visible, flex 0 1 auto,
  else 'see individual properties'), undeclared to ''; its border ones
  (border-radius, border-block, border-image) to '' until 29.1.1
  (`blankBorderShorthands`). From 30.1.3 (`shorthandInitials`) the keyword
  value is also the undeclared one and 'see individual properties' is '';
  flex and background compose their computed longhands (background in
  jsdom's full form, position keywords as percentages).
- revert and revert-layer compute to themselves (27 and later); display:
  initial and unset to inline; outline-color's initial value is
  rgba(0, 0, 0, 0).
- 29.0.2 to 30.0.x (`rawComputedValues`) keep border widths, outline-width,
  font-size and font-weight keywords, and border widths whatever the
  style; 30.0 computes medium to 16px.
- The computed `background` accessor composes the longhands from 27 to
  30.1.2 too (as cssstyle 4.4 to 4.6 for jsdom 26), from 29.0.2 a keyword
  gives the computed color.
- Inline (27 and later): border-width, -style, -color and the border
  sides read from their longhands, set by border too; background: inherit
  gives background-position inherit; url() in a value with var() stays as
  written.
- The parity tests compare with the jsdom 30 release installed (its exact
  version as the profile), since 30.1.2 and 30.1.3 differ;
  NEWEST_MODELED_JSDOM is 30.1.3.

Not reproduced (measured, left): font (30.1.3 composes it, from font-family
'depends on user agent', and drops some font declarations; 30.0+
resolves font-size em/% and keywords); the inline border parsing of jsdom
27 to 29 (border: none, CSS-wide keywords and var() in border are accepted
there by the setter, by the style attribute from 29.0.1/29.0.2; the
'jsdom27' mode keeps jsdom 26's rules); 27 to 29.0.0 inline
`background: inherit` as five or seven keywords; inset: 0 as 0 before
28.1; border-color in 27 to 29.0.1. Also seen, outside this issue: jsdom
30's style attribute parser drops a longhand declared after its shorthand
(`padding: 1px; padding-top: 3px` gives cssText `padding: 1px;`), and its
computed style objects are snapshots (warpdom's stay live).

Tests: test/computed-shorthands.test.js (per-release literals at the
boundaries, parity with the installed jsdom, Ant Design's case).
Bench: bench:hot unchanged (no CSS path); computed reads ~10% faster
(longhand fast path), cascade-bench within noise.


## 2026-10-18: URL, URLSearchParams, Headers, console, WebAssembly (branch feat/parity-group1)

GitHub issues #25, #27, #28, #23, #32: members jsdom's window has and
warpdom's did not. Measured black box on jsdom 20.0.0, 20.0.3, 21.0.0,
21.1.2, 22.0.0, 22.1.0, 23.0.0, 23.2.0, 24.0.0, 24.1.0 to 24.1.3, 25.0.0,
25.0.1, 26.0.0, 26.1.0, 27.0.0 to 27.4.0, 28.0.0, 28.1.0, 29.0.0, 29.1.1,
30.0.0, 30.0.1, 30.1.0 and 30.1.3 (a window with runScripts), through
Vitest 5 (forks and vmThreads; jsdom 20.0.3, 23.2.0, 24.1.3, 26.1.0,
27.4.0, 30.1.3) and Jest 29/30 (jest-environment-jsdom: jsdom 20.0.3 /
26.1.0):

| API | jsdom's window | Version boundary | warpdom |
|---|---|---|---|
| `URL` | own interface (whatwg-url); no `createObjectURL`/`revokeObjectURL` in any version; errors "Invalid URL: x" / "Invalid base URL: x" | `parse`, `canParse` from 23.0.0 | own interface per window holding a platform URL (parsing is the platform's); `webkitURL` is the window's `URL` |
| `URLSearchParams` | own interface; WebIDL init conversion (sequence, record, string) | `size`, value argument of `has()`/`delete()` from 23.0.0 | own interface wrapping the platform's (a URL's searchParams wrap the platform URL's, kept in sync by the platform); jsdom's conversion errors |
| `Headers` | own interface (no guard, "name is invalid", "value is invalid", "init is invalid") | `getSetCookie()` and separate `Set-Cookie` entries from 24.1.0 | own implementation (the platform's loads Node's fetch on first use, ~8 ms, and has other errors) |
| `console` | own data property, plain object, 19 methods without names that send their arguments to the virtual console (default: Node's console) | enumerable before 27.0.0 | own property made on first read; methods send to `window[S].consoleTarget` (set by the environments), else the platform's console |
| `WebAssembly` | own data property: the window realm's | none | own data property: the window realm's (`realmOf`, the top-level window's for frames) |
| init with a non-callable `@@iterator` | "tmp is not iterable" before 30; WebIDL from 30.0.0 | 30.0.0 | same |

Environments (black box): jest-environment-jsdom exposes the window's
`URL`, `URLSearchParams` and `Headers` (no `createObjectURL`), Jest's
console, and the test realm's `WebAssembly`; warpdom's Jest global had
Node's `URL` (with `createObjectURL`, "Invalid URL" without the input),
`URLSearchParams` and `Headers` and now has the window's. Vitest's jsdom
environment, in every pool: `URL` is Vitest's own subclass of Node's URL
whose `createObjectURL()` also takes jsdom's Blobs and Files (a Node Blob
of their bytes); `URLSearchParams` and `Headers` are Node's; `webkitURL`
is jsdom's own URL; console is Vitest's (a non-enumerable property in the
VM pools) and `WebAssembly` the test realm's. warpdom now matches: its
Vitest `URL` is the same kind of subclass (`vitestURL`; before,
`URL.createObjectURL(new Blob(...))` threw because Node's takes only Node
Blobs), one per window, and the per-file reset puts back its own
properties and the global's `URL`. `installWindow` never installs
`console` and `WebAssembly` (GLOBAL_OWN_KEYS): they stay the global's.

Decisions:
- URL and URLSearchParams delegate parsing to the platform (a web standard
  global, so the core still imports nothing from Node), but are warpdom's
  own interfaces: per-window constructors (a test's
  `URL.createObjectURL = jest.fn()` stays in its file's window, where with
  Node's URL it changed every later file of the worker), jsdom's members
  per version and jsdom's errors. The platform's are taken when warpdom
  loads (a runner may put the window's on the global); warpdom's own URL
  uses (location, links, base URLs) import `PlatformURL` from internal.js
  for the same reason.
- Headers is warpdom's own (~190 lines): jsdom has its own semantics and
  messages per version, and Node's Headers costs ~8 ms on first use.
- Realms: errors are warpdom's realm's TypeErrors and entry arrays plain
  arrays, as jsdom's are its outer realm's (under Jest, `new URL('x')`
  throws a TypeError that is not the test realm's, with jsdom too).
  Iterators of URLSearchParams are the platform's.
- `structuredClone(new URL(...))` gives `{}` as with jsdom (Node's URL
  throws DataCloneError): 2 WPT url/historical subtests that warpdom
  passed with Node's URL now fail, as on jsdom.
- The interfaces live in window-features.js: as a separate module, the
  first window took ~0.15 ms more (a scavenge moved into it).

Measured (Node 22.17.1, interleaved with main, medians): cold load 21.1 ->
21.3 ms (5 runs of 7 processes); first window 2.09 -> 2.22 ms (5 runs;
120 interleaved processes: 2.09 -> 2.24), which is GC timing: with
`gc()` before the window, 1.73 -> 1.76 ms; next windows 0.199 -> 0.197 ms.
bench:hot within noise (3 runs each, all cases within +-7%, none
touched); bench/url-bench.mjs (a.href) 48.8 -> 48.5 ns (mean of 4 runs).

WPT (checkout 0f26972422, runner with jsdom 30.1.2, warpdom latest
profile):

| Directory | Subtests | warpdom passed | warpdom score | main (Node's URL, Headers) | jsdom passed | jsdom score |
|---|---:|---:|---:|---:|---:|---:|
| url/ | 8,784 | 7,136 | 91.8% | 7,138 | 6,394 | 82.5% |
| fetch/api/headers/ | 268 | 116 | 62.8% | 116 | 95 | 61.3% |

jsdom passes and warpdom fails: in url/, IDNA and `xn--` hosts (Ada,
IdnaTestV2 840, toascii 126, url-origin 7), opaque paths with trailing
spaces (url-constructor, url-setters, a-element), 190 failure.html
subtests and 4 Headers ones that use XMLHttpRequest, and idlharness'
`webkitURL` descriptor (an accessor of Window.prototype in warpdom).

Tests: test/web-apis.test.js (parity with jsdom 20, 22, 25, 26, 30 for
URL, URLSearchParams, Headers, console and the window's own properties;
the version boundaries; per-window URL; console targets; WebAssembly
realms; the reset), test/jest-environment.test.js and
test/vitest-adapter.test.js (the environments' globals, Vitest's
createObjectURL, the reset of Vitest's URL).

Open: idlharness wants `webkitURL` as the window's own data property;
Node's Ada IDNA differences would need an own host parser (tr46 data).

## 2026-10-18: the select event, setRangeText() and setSelectionRange() arguments (branch fix/select-event, #40, #45)

No text selection API fired `select`. Measured black box on jsdom 20.0.3,
21.0.0, 21.1.0, 21.1.1, 21.1.2, 22.1.0, 25.0.1, 26.1.0, 27.4.0, 28.1.0,
29.1.1 and 30.1.2 (scratch scripts):

- select(), setSelectionRange(), the selectionStart/End/Direction setters
  and setRangeText() (every mode) fire one `select` (an Event, bubbles,
  isTrusted) per call, in every version: also when the selection does not
  change, when one is already queued (no coalescing: two calls, two
  events) and for elements not in a document, removed before the task
  runs, or in a document without a browsing context. The value setter
  and calls that throw fire none. select() also fires on email, number,
  date, month, week, time, datetime-local, color and file inputs (no
  selection there); not on checkbox, radio, hidden, button, submit, reset,
  image or range. The standard skips unchanged selections and coalesces
  (select-event.html "a second time" and "twice": the 108 subtests jsdom
  fails too); warpdom follows jsdom.
- Before 21.1.2: dispatched synchronously and cancelable
  (`compat.syncSelectEvent`); from 21.1.2 in a task, not cancelable.
  jsdom 22 to 29 queue it like a timer (after setTimeout(0) calls made
  before it); jsdom 30 like its toggle and volumechange tasks, before
  them. warpdom queues it on the window's internal timer, as toggle and
  volumechange (a select task can run later than in jsdom 30 relative to
  timers set before the call).
- Before 21.1.2 setRangeText() takes the new value's length as the end of
  the replaced text (`compat.legacyRangeTextEnd`: 'end' and 'select'
  modes, and preserve for a selection end inside the range). In every
  version it resets selectionDirection to none (warpdom kept it).
- Arguments (WebIDL, every version): setRangeText() with none throws
  "1 argument required", with two "only 2 arguments present" (no overload
  takes two), an invalid SelectionMode a TypeError, all before the
  InvalidStateError of an input type without selection; with three or
  four arguments, undefined start/end are 0 (`setRangeText('x',
  undefined, undefined)` inserts at 0; warpdom took it as the
  one-argument form). setSelectionRange() with fewer than two throws.
  The IndexSizeError message is jsdom's.

Seen, left: cloneNode does not copy an input's or textarea's value (#41);
the remaining jsdom-only subtest in textfieldselection
(selection-start-end-extra.html, type changed to color and back).

WPT html/semantics/forms/textfieldselection (local, jsdom 30.1.2):
warpdom 459 to 671 of 783 subtests (jsdom 672); select-event.html 0 to
162 of 270 (jsdom 162), setRangeText 57 to 88, selection-start-end 27 to
45, setSelectionRange 48 to 49.
Tests: test/forms.test.js (select event parity on jsdom 30, 25, 22, 20;
21.1.1/21.1.2 literals; setRangeText selection on 30 and 20; arguments).
Bench: bench:hot unchanged (no hot path touched).

## 2026-10-19: SVG interfaces as jsdom has them (branch fix/svg-parity, #21, #24, #29, #55, #60, #61, #62, #63, #64)

DOMParity listed SVG interfaces and members jsdom's window has and
warpdom's lacked. Its idl.json (2026-10-19) also lists SVGDefsElement,
SVGDescElement, SVGGElement, SVGMetadataElement, SVGNumber and
SVGSwitchElement without issues; jsdom also has SVGRect (webref has no
such interface). All added (src/svg.js). Measured black box on jsdom
20.0.3, 21.1.2, 22.1.0, 23.2.0, 24.1.3, 25.0.1, 26.0.0, 26.1.0, 27.0.0,
27.4.0, 28.0.0, 28.1.0, 29.1.1, 30.0.0, 30.0.1, 30.1.0, 30.1.1, 30.1.2 and
30.1.3 (scratch scripts; 1,700 probe results compared per profile):

- Every version: SVGElement's className is an SVGAnimatedString
  (getter only; baseVal writes class, animVal reads it), nonce,
  ownerSVGElement and viewportElement (the nearest svg ancestor, through
  SVG elements only: an svg in a div in a foreignObject has none);
  SVGGraphicsElement's requiredExtensions and systemLanguage
  (SVGStringList); SVGSVGElement's createSVGNumber(), getElementById()
  (the svg itself or a descendant, in tree order), suspendRedraw()
  (returns 1), unsuspendRedraw(), unsuspendRedrawAll(), forceRedraw()
  (no effect) and the window event handlers.
- From 26.1.0 (`compat.svgTypes`): g, defs, desc, metadata, switch and
  symbol create SVGGElement, SVGDefsElement, SVGDescElement,
  SVGMetadataElement, SVGSwitchElement and SVGSymbolElement (before:
  SVGElement, and only svg is an SVGGraphicsElement); SVGRect,
  SVGAnimatedRect, SVGPreserveAspectRatio and
  SVGAnimatedPreserveAspectRatio; viewBox, preserveAspectRatio (svg and
  symbol) and createSVGRect().
- From 26.1.0 to 30.0.x (`compat.svgSymbolViewport`) a symbol is the
  viewportElement of its descendants; 30.1.0 dropped that.
- Before 28.1.0 (`compat.svgWindowHandlers`) an svg element's window
  event handlers (onafterprint ... onunload) and onblur, onerror,
  onfocus, onload, onresize and onscroll are the window's, as body's are
  (IDL and content attributes; null without a browsing context). From
  28.1.0 the window handlers only keep what is assigned: undefined until
  set, content attributes ignored, never called; the six others are the
  element's own.
- nonce reflects the content attribute on HTML and SVG elements in every
  version (the standard keeps it in an internal slot; warpdom's
  HTMLElement did, now as jsdom).

jsdom where SVG 2 says otherwise (followed): viewBox accepts four numbers
separated by spaces or a comma with spaces around it, spaces at the ends,
no tabs or newlines, `1.` and `1e` invalid, `1e400` is Infinity; a
negative width or height, an invalid or a missing value read as 0 0 0 0
(never null). Writes to baseVal serialize all four ("x y w h") and store
single-precision values (WebIDL float: "not a finite floating-point
value", "outside the range of a single-precision floating-point value");
animVal throws a DOMException named NO_MODIFICATION_ALLOWED_ERR (code 0).
preserveAspectRatio accepts only `<align>` or `<align> meet|slice`
(case-sensitive, spaces only, no "defer", nothing around), else
xMidYMid meet; its animVal is writable like baseVal; align outside 1-10
throws TypeError "Invalid alignment", meetOrSlice outside 1-2 "Invalid
meet-or-slice value"; writes serialize both parts. systemLanguage splits
on commas (HTML), written back joined by ", "; requiredExtensions on
whitespace, joined by " ". A list keeps its items between its own writes
and parses again after any other change to its attribute (also to the
same value); every write sets the attribute (clear() on an empty list
too); initialize() returns undefined; the indexed setter replaces an item
(IndexSizeError past the end).

Left as everywhere in warpdom: brand-check errors say "Illegal
invocation" (jsdom: "'get x' called on an object that is not a valid
instance of SVGRect."); window properties are accessors until first read.

Tests: test/svg.test.js (parity on jsdom 20, 22, 25, 26, 30; version
boundaries 26.0.0/26.1.0, 28.0.0/28.1.0, 30.0.1/30.1.0 on the profiles).
Bench: cold load, first and next windows and bench:hot within noise
(25 alternating fresh processes: next window 0.191 vs 0.193 ms).

## 2026-10-19: ElementInternals, events, the plugin API, media tracks, CSSOM members (branch fix/misc-parity)

GitHub issues #20, #59, #65, #66, #56, #57, #58, #31, #33, #34, #54, #52,
#53, and PageTransitionEvent (in every jsdom, missing in warpdom).
Measured black box on jsdom 20.0.0, 20.0.3, 21.0.0, 21.1.2, 22.0.0,
22.1.0, 23.0.0, 23.0.1, 23.1.0, 23.2.0, 24.0.0, 24.1.0, 24.1.3, 25.0.0,
25.0.1, 26.0.0, 26.1.0, 27.0.0 to 27.4.0, 28.0.0, 28.1.0, 29.0.0, 29.0.2,
29.1.0, 29.1.1, 30.0.0, 30.0.1 and 30.1.0 to 30.1.3 (a window with
runScripts; a script compared each probe on jsdom and on warpdom with that
jsdom's profile):

| API | jsdom | Version boundary | warpdom |
|---|---|---|---|
| `ElementInternals`, `HTMLElement.attachInternals()` | shadowRoot, role, 41 ARIA attributes (not reflected to the element); no setFormValue, form, validity, states or CustomStateSet in any version | from 23.1.0; `labels` from 26.0.0; role/ARIA accessors throw "Cannot read properties of undefined (reading 'get'/'set'/'delete')" until 27.0.0 | same |
| attachInternals() errors | NotSupportedError: customized built-in (is value, also `createElement('x-a', { is })`), non-custom (no definition, also template contents and viewless documents), disabled by disabledFeatures, already attached, before the constructor ran; a failed upgrade's element can attach | 23.1.0 | same, in that order |
| form-associated custom elements | `formAssociated` read at define() from 26.0.0; labelable (label.control, internals.labels a live NodeList) from 26.0.0; `:disabled`/`:enabled` from 27.0.0; form callbacks never read or called; not in form.elements or FormData | 26.0.0, 27.0.0 | same |
| `disabledFeatures` | read at define() in every version ("Invalid Sequence" when not iterable); 'shadow' makes attachShadow() throw "Shadow root cannot be create on a custom element with disabled shadow" (looked up, so also before an upgrade) | every version | same (warpdom did not read it) |
| `PromiseRejectionEvent` | length 2, promise required (any object), reason any; never fired (no unhandledrejection/rejectionhandled) | 27.0.0 | same |
| `BlobEvent` | length 2, data a required Blob (of any window), timecode finite double | 27.0.0; timecode without one 0 before 30.1.0, NaN from it | same |
| `PageTransitionEvent` | persisted; not made by createEvent | every version | same |
| `DeviceMotionEvent`, `DeviceOrientationEvent` | exist (and createEvent makes them) only from 27.0.0; members converted (finite doubles, objects) with jsdom's errors; acceleration/rotationRate are objects of a class "DeviceMotionEventAccelerationImpl"/"...RotationRateImpl" with own data properties, not instances of the interfaces | 27.0.0 | same (before: in every profile, values unconverted) |
| `DeviceMotionEventAcceleration`, `...RotationRate` | illegal constructors, never instantiated | 27.0.0 | same |
| `navigator.plugins`, `mimeTypes`; `Plugin`, `MimeType`, `PluginArray`, `MimeTypeArray` | empty legacy platform objects, same object each read, item()/namedItem() null, iterator Array.prototype.values; no pdfViewerEnabled | every version | same (staticList) |
| `audioTracks`, `videoTracks` | an empty array per element (like textTracks); no AudioTrackList/VideoTrackList | every version | same |
| `CSSMediaRule.matches` | true when the media list is empty or has "all" or "screen" (no feature evaluated; "only screen", "not print" false) | 29.0.0 | same (the cascade's test) |
| `CSSNestedDeclarations` | interface; made for declarations after nested rules from 29.0.0 | 27.2.0 | interface only (deviations above) |

Also fixed: documents without a browsing context (DOMParser's,
DOMImplementation's) used the window's custom element registry, so
`createElement('x-z')` there ran the constructor (which failed and
reported an error) and parsed elements were upgraded; now none is
created there, as in jsdom.

Seen, left: `CSSSupportsRule.matches` (jsdom 29 and later evaluate the
condition; `selector()` is false) is not in the DOMParity issues and not
done. jsdom 23.2.0's `:disabled` and `:enabled` both match custom
elements (any, inside a disabled fieldset) and inputs: not modeled.
jsdom's Navigator has no `maxTouchPoints` or `webdriver`, warpdom's has.

Decisions:
- DeviceMotionEvent's member objects copy jsdom's (own properties, a
  class of warpdom's realm named as jsdom's): `toEqual({ x: 1, y: null,
  z: null })` passes on jsdom; the standard's objects have no own
  properties.
- jsdom 23.1 to 26's throwing role and ARIA accessors are reproduced: a
  test written for those versions sees the same TypeError.
- No unhandledrejection: jsdom leaves unhandled rejections to Node.

Measured (Node 22.17.1, interleaved with main): cold load 21.6 -> 21.9 ms
(medians of 4 x 7 processes; 40 processes each: 23.0 -> 23.4 ms), first
window 2.21 -> 2.36 ms (40 processes: 2.25 -> 2.34 ms; after `gc()` 1.81 ->
1.87 ms: 11 more lazy interface accessors), next windows 0.201 -> 0.203
ms. bench:hot within noise (3 interleaved runs each, medians within +-5%,
mixed signs).

Tests: test/events.test.js (parity on jsdom 20, 26, 30; 27.0.0 and
30.1.0 literals), test/window-features.test.js (plugins, jsdom 20, 26,
30), test/html.test.js (media tracks, 20 and 30), test/cssom.test.js
(matches on 26 and 30; 27.1/27.2/29.0 literals),
test/custom-elements.test.js (ElementInternals on 20, 22, 25, 26, 30;
23.0.1/23.1.0/26.0.0/27.0.0 literals; disabledFeatures; viewless
documents), test/hidden-state.test.js.

## 2026-10-19: html/semantics forms parity (branch fix/forms-parity, #41 to #51)

Gaps from the WPT html/semantics comparison (warpdom-notes,
wpt-html-semantics-2026-10-18). Each measured black box on jsdom 20.0.3,
22.1.0, 25.0.1, 26.1.0, 27.4.0, 28.1.0, 29.1.1 and 30.1.2 (and the
releases around a boundary), against the HTML standard. On by default
in the profiles of the jsdom versions that have them.

- **Cloning steps (#41).** cloneNode() and importNode() of an input copy
  its value, dirty value flag, checkedness and dirty checkedness flag; of
  a textarea its raw value and dirty value flag (every version). The
  indeterminate state from jsdom 30.1.0 (30.0.1 and earlier: not copied;
  `compat.cloneIndeterminate`). Not copied in any version: the selection,
  an option's selectedness (a select's selectedIndex is the default
  again in the clone).
- **Input type change (#42).** The type attribute's change steps, as the
  standard and every measured version: value mode to default or
  default/on writes a non-empty value to the value attribute (its
  mutation record after the type attribute's: attribute steps can now
  return a function that runs after the change is reported); any other
  mode into value mode takes the value attribute again and clears the
  dirty flag (text, file, text: ""); value mode to value mode keeps the
  value, sanitized for the old and the new type (text "hello", color,
  text gives "#000000"; a range's default "50" stays "50" as a number).
  warpdom kept the non-dirty value lazily as the attribute's; a value
  kept by a type change is now stored without the dirty flag, and a
  value attribute change drops it. A type without selection to one with
  it puts the selection at 0, 0, none. No events.
- **type=week (#49).** valueAsNumber is midnight UTC on the Monday of the
  ISO week, valueAsDate that date; the setters take the week containing
  the time; stepUp/stepDown by one week from the step base 1970-W01
  (-259,200,000); min, max and step validity. Every version. jsdom
  parses a week string's year with four or five digits only
  ("100000-W01" is sanitized to ""; the standard allows more); warpdom
  follows. Not reproduced, jsdom's results at extremes: the
  valueAsNumber setter for years below 100 (year 1 gives "1901-W01")
  and out of the Date range ("0NaN-WNaN", "-29719-W14" are stored
  unsanitized; warpdom stores "").
- **pattern (#43).** The compiled pattern is null when the pattern does
  not compile on its own ("a)(b", "a)|(b": no mismatch), as the standard
  and every version. The flag: v from jsdom 27.0.0 ("[(]" is invalid
  and ignored, "[\p{L}--[a-z]]" is a set difference), u before (26.1.0
  and 27.0.0-beta.0; `compat.patternFlag`). warpdom tried v, then u.
- **stepUp()/stepDown() and valueAsNumber (#44).** As jsdom in every
  measured version: nothing happens when min > max, or when the result
  would move against the method (stepDown() from below min, stepUp()
  from above max, stepUp(-2)); a value off the step goes to the next one
  on it in the method's direction (n unused); a result past min or max
  is clamped to the nearest value on the step inside them (range 3..14
  step 3, 9, stepUp(2): 12; warpdom clamped to 14). jsdom deviation,
  followed: nothing happens when max - min is less than the step (min 0
  max 4 step 5: stepUp() leaves "" alone; the standard returns only when
  no value between min and max is on the step, which with min as the
  step base never happens). Steps and step mismatch use exact decimal
  arithmetic on the numbers' shortest decimal forms, as jsdom: step
  3e-15 does not divide 17 (mismatch), 1/3 does not divide 1, 0.1 + 0.2
  is 0.3, 17 + 3e-15 is 17.000000000000004 (warpdom used a 1e-9
  tolerance and rounded to 15 digits). valueAsNumber: Infinity throws
  TypeError "Failed to set infinite value as Number" before the type
  check, NaN too before 23.1.0 (`compat.nanValueAsNumberThrows`; 23.0.1
  throws, 23.1.0 sets ""); out of the Date range no RangeError
  (datetime-local ""). Before 30.1.0 a time's fraction is whole
  milliseconds (".5" is 5 ms) and a time with seconds serializes with
  three fraction digits ("00:00:01.500", "10:00:05.000"), for time and
  datetime-local (`compat.legacyTimeStrings`; 30.0.1 old, 30.1.0 new).
  Error messages are jsdom's. Not reproduced: jsdom's valueAsNumber
  setter stores its string without sanitization (range 1e21 stays
  "1e+21", out-of-range dates become "0NaN-NaN-NaN"; warpdom sanitizes),
  and jsdom sanitizes a range's value only when it is set, not when min
  or max change later (`<input type=range value=50 max=40>` is "50" in
  jsdom, "40" in warpdom, as the standard).
- **Disconnected trees (#46).** The form attribute's id, a label's for
  and the list attribute are looked up in the element's tree with its
  root included; warpdom left the root out, so a form or label at the
  root of a tree not in a document was never found (form.elements of a
  lone form with a form=id control: 0; jsdom 1). jsdom deviation,
  followed (every version): a control that is not connected uses its
  form attribute too (by id in its tree; `form=""` and an unknown id
  give null), where the standard ignores the attribute and takes the
  ancestor form. The WPT subtests pass either way (the id names the
  ancestor).
- **Radio button groups (#47).** A checked radio button unchecks the
  rest of its group, in every version, when its name attribute changes
  (also not connected), when its type becomes radio, and when its form
  owner changes on insertion: inserted into a form (connected or not;
  also by the parser and by cloneNode, one node at a time, so the last
  checked wins). From jsdom 30.1.0 (`compat.radioConnected`; 30.0.1 not)
  also when it becomes connected (in tree order of the inserted subtree,
  so in a subtree inserted at once the first checked wins; a fragment's
  children one by one, so the last wins) and when its form attribute is
  set or removed. No events. warpdom did it only when checkedness was
  set. Insertions pay for it only in documents that have had a checked
  input (`checkedRadios`, set by setCheckedness, the parser and
  adoption); attribute steps can now be chained (addAttributeStep: the
  name attribute has the document's named properties and radio groups).
- **option.text (#48).** Strips and collapses ASCII whitespace only (an
  NBSP or U+3000 stays; warpdom trimmed with String.prototype.trim), and
  leaves out HTML and SVG script elements only (MathML and no-namespace
  script are text), as the standard and every version. Also option.label
  and value without a value attribute.
- **form[i] and select[i] (#50).** select[i] is select.options[i] with the
  indexed setter (`select[3] = option` pads with empty options, `= null`
  removes, a non-option throws TypeError) in every measured version;
  form[i] is form.elements[i] from jsdom 26.1.0 (26.0.0 and earlier have
  none: `form[0] = 'x'` is an expando there; `compat.formIndexed`).
  Legacy platform object semantics as jsdom: own enumerable properties
  "0".."n-1" first in ownKeys, form indices read-only (assignment,
  defineProperty and delete of a present index fail: TypeError in strict
  code), deleting an absent index succeeds. No named properties on forms
  (jsdom has none: `form.a` is undefined). The form and select objects
  are Proxies over the element (collections.js indexedElement, like the
  live collections), made in createElementNS; other keys go straight to
  the element. Not covered: customized built-in forms/selects (is=) and
  custom element classes extending them stay plain.
- **Smaller gaps (#51), five of six.** Every measured version unless
  noted. (1) A time input with min > max has a reversed range: a value
  between max and min underflows and overflows, others neither. jsdom
  deviation, followed: min with no valid max counts as reversed too
  (min 14:00, value 13:00: both flags; the standard: underflow only).
  (2) The textarea wrapping transformation in the form data set:
  wrap="hard" (exactly; "HARD" is not hard in jsdom, the standard is
  case-insensitive) breaks each line every cols UTF-16 code units (cols
  20 without the attribute). jsdom 24.0.0 to 30.0.1 do something else
  when the cols attribute is set (one break at cols, then at 313 for
  cols 3, a trailing line feed when a later line is long); not
  reproduced, warpdom does not transform then (`compat.hardWrap`).
  (3) menuitem creates HTMLUnknownElement (the generator leaves it out
  of the HTMLElement tags; @webref still lists it), and
  window.HTMLDocument is the Document interface object. (4) form.action
  resolves against the document's base URL. (5) input.files is
  settable: it keeps the FileList itself, ignores null/undefined, throws
  jsdom's TypeError for anything else, does nothing on other types.
  Left: (6) dialog's UA colors (background white/Canvas, color
  black/CanvasText; jsdom 20 serializes "white"/"black", 26
  rgb(255, 255, 255)/rgb(0, 0, 0); an open dialog's display is "" before
  30, "block" in 30): style profile work, a separate change.
  Seen, left: jsdom has no formAction IDL attribute (warpdom has).

WPT html/semantics/forms (local, WPT 87b5d13099, jsdom 30.1.2: 3851 of
4687): warpdom 3733 to 3974 subtests; jsdom passes and warpdom fails 244
to 0, the reverse 126 to 123. Given up to follow jsdom (jsdom fails them
too): input-type-change-value.html (2, color dirty flag on type change),
input-stepdown-02.html (1, stepDown with no value and min > 0: max - min
rule). button-submit-remove-children(-jssubmit).html time out now and
then on both engines (navigation timing; pass when rerun alone).
After #41 to #44: 3945, jsdom-only 28. Tests: test/forms.test.js (parity
on jsdom 30, 26, 25, 22, 20 as each issue needs; literals at 23.0.1/23.1.0,
26.0.0/26.1.0, 26.1.0/27.0.0, 23.2.0, 30.0.1/30.1.0). Bench: bench:hot
unchanged (two runs each, alternating order).

## 2026-10-19: window.WebSocket, the host's (branch fix/websocket-window, #26)

DOMParity counted `window.WebSocket` as missing: under Vitest the global
`WebSocket` was already Node's, and the Jest environment copied Node's
onto the global (HOST_GLOBALS), but the window had none. Decided by Sonu
(Decisions, 2026-10-19): the window's is the host's.

Measured black box on jsdom 20.0.0, 20.0.3, 21.0.0, 21.1.0, 21.1.2,
22.0.0, 22.1.0, 23.2.0, 24.1.3, 25.0.1, 26.1.0, 27.0.0, 27.0.1, 27.1.0,
27.2.0, 27.3.0, 27.4.0, 28.0.0, 28.1.0, 29.1.1, 30.0.1 and 30.1.3, with
and without runScripts: every version has `WebSocket` as an own data
property of the window, writable, not enumerable, configurable (an
assignment replaces it, delete removes it), its own interface (length 1,
the four constants, binaryType, bufferedAmount, extensions, protocol,
readyState, url, send, close, the on* handlers); CloseEvent and
MessageEvent exist too (warpdom had both already). Environments (Vitest
5 with jsdom 30.1.2, forks, threads, vmThreads, vmForks; Jest 29 and 30
with jest-environment-jsdom, jsdom 20.0.3 and 26.1.0): the global's `WebSocket` and the window's
are one object, jsdom's (an accessor of Node's global in forks and
threads, a data property in the VM pools and under Jest), and
`window.WebSocket = Mock` replaces both.

warpdom:
- `window.WebSocket` is the platform's `WebSocket` (`PLATFORM_GLOBAL`,
  Node's from 22), with jsdom's descriptor once read, in frames too; none
  when the platform has none (checked with `in` at load). Node's global
  `WebSocket` is a lazy property: reading it, or its descriptor, loads
  Node's WebSocket client (~10 ms, Node 22.17), so the window reads it on
  first use, as interface objects are made (an accessor until then); the
  per-file reset puts it back.
- Vitest, forks and threads: the global keeps its own `WebSocket`
  (Node's, the object the window reads; `VITEST_PLATFORM_KEYS`). Copying
  the window's onto the global would read the global's descriptor (the
  10 ms load in every file) and make the window's getter read itself.
  A test's assignment there changes Node's global, as for fetch or
  AbortController; `vi.unstubAllGlobals` (warpdom/vitest/reset in fast
  mode) undoes `vi.stubGlobal`.
- Vitest VM pools and Jest: the global reads the window's (installWindow),
  so the context no longer loads Node's WebSocket when it is set up;
  Jest's HOST_GLOBALS copy remains for a window without one.
- Differences (README): sockets and their events and errors are Node's
  (`event instanceof window.MessageEvent` is false); the global's
  descriptor is a data property in forks/threads and an accessor in the
  VM pools and Jest (jsdom: the reverse), as for other window members.

Tests: test/web-apis.test.js (parity with jsdom 20, 22, 25, 26, 30:
existence, descriptor, constants, replace and delete; the platform's,
frames, lazy; the reset), test/jest-environment.test.js (global and window
identity, assignment, the next file), test/vitest-adapter.test.js
(fixtures/vitest-websocket on warpdom and jsdom in forks and vmThreads:
identity, `vi.stubGlobal`, `window.WebSocket = Mock`; setupVM and setup).
`npm test` on Node 22.12.0 and 22.23.3: 929 passed, 4 skipped;
`npm run test:types` passes.

Measured (Node 22.17.1, interleaved with main, medians of 5 runs): cold
load 20.9 -> 21.0 ms, first window 2.22 -> 2.28 ms, next windows 0.189 ->
0.190 ms; bench:hot (warpdom only, 5 runs each) all cases within +-4%
except firstElementChild + nextElementSibling (8.6 -> 9.5 ns, bimodal
between 8 and 10 ns on both builds; 6 more interleaved runs each: 9.45
vs 9.35), no hot path touched.

## 2026-10-19: warpdom's API set includes jsdom's, per version (branch test/jsdom-api-superset, #18)

`test/jsdom-api-superset.test.js` (part of `npm test`, ~2-3 s) walks jsdom's
window and warpdom's window with that version's profile black box
(`test/api-surface.js`): the window's members, every interface on it (statics,
prototype members, parent), the objects it exposes (document, navigator,
location, history, screen, storage, performance, crypto, customElements,
console, CSS, ...) with their interfaces, objects reached through them (style,
selection, ranges, collections, shadow root), and the interface of an element
per HTML tag in html-elements.js and 39 SVG tags. A jsdom path warpdom lacks,
has as another kind (method, accessor, data), only through a parent or a
subclass, or with another parent or element interface fails, unless a KNOWN
entry (pattern, jsdom majors, issue, reason) explains it; a KNOWN entry that
matches nothing fails too. jsdom 20.0.3, 21.1.2, 22.1.0, 23.2.0, 24.1.3, 25.0.1,
26.1.0, 27.4.0, 28.1.0, 29.1.1 and 30.1.3 (NEWEST_MODELED_JSDOM), aliases in
devDependencies, plus the installed jsdom. WARPDOM_API_REPORT=1 prints what
warpdom has that jsdom lacks per version (opt-in candidates, #5).

Rebased on main after fix/svg-parity, fix/misc-parity, fix/forms-parity and
fix/websocket-window merged (#73, #74, #75, #78): their 19 KNOWN entries went
stale and are removed, with no new difference. XMLHttpRequest (#22, #30) stays
until its branch.

Node 22.12: jsdom 30.1.3 (the jsdom30 alias) needs undici ^8.12.1, and npm
replaced the hoisted undici 8.11.2 that the installed jsdom 30.1.2 used with
8.12.3, whose lib/interceptor/decompress.js calls
zlib.createZstdDecompress.bind() at load; Node has createZstdDecompress from
22.15, so every test that loads jsdom failed on 22.12 ("reading 'bind'").
package.json overrides keep the installed jsdom on undici 8.11.2 (as main had
it; npm nests it under node_modules/jsdom), and the test skips a jsdom whose
own engines exclude the running Node (on 22.12: 29.1.1, 30.1.2, 30.1.3; and
the stale-entry check then). CI on Node 24 runs every version. undici 8.11.2
and jsdom 30 also declare Node >= 22.19 / ^22.22.2, so the installed jsdom
running on 22.12 at all is luck, not support. Differences without an issue (KNOWN, "No
issue yet"): XPathException; HTMLIFrameElement.getSVGDocument; onloadend
(jsdom 20-21); window.onautocomplete/onautocompleteerror/onsort (20-26);
Window.prototype inherits EventTarget directly before jsdom 24; kinds of
window.document/self/window/name/webkitURL, and of the viewport members
(data properties before jsdom 27); `<search>` and `<selectedcontent>` are
HTMLUnknownElement in jsdom; own autofocus/inputMode on form controls and own
@@iterator on collections in jsdom; HTMLFormElement @@iterator (26+, not fixed
by #50); CSSKeyframesRule @@iterator and CSSSupportsRule.matches (29+); the
cssom/rrweb-cssom shape of jsdom 28 and earlier (rule constants, own members
per rule, CSSStyleRule extends CSSRule, parse()); style accessors on
CSSStyleDeclaration in jsdom 28 and earlier (warpdom: CSSStyleProperties), and
cssstyle 2-4.1's getPropertyCSSValue, getPropertyShorthand, isPropertyImplicit
and azimuth (both fixed by #72, 2026-10-21; entries removed).

## 2026-10-20: the user agent style sheet (branch fix/mantine-floating-ui, #80)

Mantine 9.7.3 (Jest 30, jsdom 26.1.0): 40 tests in @mantine/schedule's
MoreEvents.test.tsx failed on warpdom 0.1.6 (13/53 in the file alone,
53/53 on jsdom). Root cause, black box: floating-ui's viewport clipping
rect subtracts body's computed inline margins (getViewportRect:
html.clientWidth - body.clientWidth - marginLeft - marginRight). jsdom 26
computes body's margins to 8px (its user agent style sheet), so the
clipping width was -16, flip and hide ran more iterations and more
microtask hops, and the position update resolved after the test's
cleanup unmounted the popover (no setState). warpdom computed '' (no user
agent sheet beyond display): width 0, fewer hops, the flushSync setState
landed after the test outside act(), and Mantine's jsdom.mocks.ts turned
React's act() warning into a failure of the following test. Found by
instrumenting floating-ui's platform calls in a scratch moduleNameMapper
copy (getClippingRect: jsdom {width: -16}, warpdom {width: 0}).

The gap was wider than body: jsdom applies a full user agent sheet in
getComputedStyle in every release, warpdom only display. Measured black
box (every tag with @webref/elements x every longhand plus 17 shorthands;
~100 variants: input types, nested lists, :link, dir, details/summary,
dialog[open], popover, sectioned headings, ruby, disabled buttons; author
rules against it) on jsdom 20.0.3, 21.1.2, 22.1.0, 23.2.0, 24.1.3, 25.0.1,
26.1.0, 27.0.0, 27.1.0, 27.3.0, 27.4.0, 28.0.0, 28.1.0, 29.0.0, 29.0.1,
29.0.2, 29.1.1, 30.1.0, 30.1.3:

| | jsdom 20 to 26 | jsdom 27 to 30.1.3 |
|---|---|---|
| sheet | an older browser's: body margin 8px, h1-h6 sizes and bold, sectioned h1 1.5em/1.17em, hr/iframe/fieldset borders, form controls (button 2px outset, padding 2px 6px 3px; input 2px inset, padding 1px; checkbox margin 3px 0.5ex; type=color 44x23px; ...), ul ul circle, ruby > rt 50%, html no display, dialog:not([open]) none | the HTML standard's rendering section as jsdom applies it: no body margin (margin-block/-inline not applied), unicode-bidi: isolate, padding-inline-start: 40px on lists, counter-reset, :link color/underline/pointer, abbr[title], details > summary list-item, popover, input/select/button/textarea initial text properties and appearance: auto, td/th padding 1px, embed[hidden] inline |
| undeclared display | '' | inline |
| !important in the sheet | (none) | win over the page's from 28.1.0 (input overflow: clip, input[type=hidden] display: none; 27.0 to 28.0 the page's win) |
| values | through the profile's parser: named colors and .83em kept in 20-22 | computed as the profile computes authors' values |

warpdom (src/ua-sheet.js): the two sheets as CSS text written from the
measurements (the newer from the rendering section's rules), cascaded
under the page's style sheets and style attribute (cascade.js cascade());
`compat.uaImportant` from 28.1.0. Each sheet is split once per CSS mode and
style surface; a property's declarations are parsed with the profile's
parser and indexed when it is first read: single type selectors in a map
by tag, other rules by the tag they require (or a short list for [dir],
:link, [popover]) in specificity order. DEFAULT_DISPLAY is gone: display
comes from the sheet (initial inline; legacy undeclared '' before 27,
inline from 27, which fixes span/img display '' in the 27 to 29.0.1
profiles). The hidden attribute keeps winning over display rules, except
on embed from 27 (embed[hidden] is inline there). From 27 the legacy
computed path applies the dir/bdi/input[type=tel] direction too.
Also fixed (seen through the sheet, author values too): before 29.0.2
font-weight, font-size and border width keywords stay as declared (bold,
thin), as jsdom keeps them (warpdom computed 700 and 1px).

Left (measured, outside the sheet; existing value-model gaps, author values
alike): system colors (jsdom 20-22 as written, 23-26 lowercased keywords,
27+ its own values, ButtonFace and ThreeDFace rgb(204, 204, 204), GrayText
rgb(102, 102, 102); warpdom resolves them to other rgb() values) and
ThreeDFace rejected by warpdom's 20-26 parser (fieldset border color);
text-indent: 0 stays 0 before 29.0.1; padding 2px 6px 3px 6px serialized as
written before 27; border: solid and background: white leave longhands ''
in jsdom 20-26; 30.0+ resolves em, % and bolder/smaller (h1 32px, b 700)
and font-family's 'depends on user agent' from 29.0.2 (known, see font);
vertical-align: inherit inherits as a longhand in 29.0.2+; logical border
colors, caret-color and other properties warpdom has but jsdom computes
differently (global, not the sheet); svg a[href] matches :link in jsdom;
27.4.0's parser drops dialog's Canvas, fit-content.

Tests: test/computed-style.test.js: parity of a 40-element scenario
(display, margins, paddings, borders, fonts, lists, white-space,
text-align, cursor, position, overflow, unicode-bidi, direction, ...) on
jsdom 20, 22, 25, 26, 27.4, 28.1, 29.1.1 and 30 (parity.js now loads the
jsdom27-29 aliases), body margins per generation (#80), the !important
boundary (28.0.0 / 28.1.0). npm test 1056/1056 (Node 22.23.3),
test:types clean.

Mantine (jest.config.ts, TZ=UTC, 2 workers, Node 22.23.3): MoreEvents
13/53 -> 53/53 (twice); whole suite jsdom 18014 passed / 16 skipped in
110 s, warpdom (this branch) 18014 / 16 in 81 s, 0 differing tests.

Bench (Node 22.23.3, medians of 5 interleaved runs, main vs branch):
cascade-bench read pass 0.64 -> 0.50 ms, mutate+read 1.76 -> 1.81 ms
(noise); bench:load cold load and windows unchanged (22-24 ms, sheet text
only). A cache-miss-only micro-benchmark (2000 elements of 10 tags,
display, visibility, margin-left and cursor read after each tree change,
no style sheets): 1.9 -> 2.3 ms per pass (jsdom 26 profile), 2.4 -> 3.0 ms
(jsdom 30); jsdom: 129 and 247 ms. The extra is the sheet lookup on
undeclared properties (a map get per property, a tag map, a few rules per
tag), the price of jsdom's values; first computed read per process +1.7 ms
(26) / +3.5 ms (30) for parsing display's declarations (lazy per property;
an eager whole-sheet index cost ~8 ms).
Next: corpus re-run on the branch (getComputedStyle results change for
every profile: suites reading button/heading/body styles move to jsdom's
values); offload to GitHub Actions. Open issues for the left items (system
colors per generation first).

## 2026-10-20: small parity fixes (branch fix/small-parity, #67, #68, #69, #77)

All measured black box on every jsdom release from 20.0.0 to 30.1.3 (42
releases installed as aliases in a scratch directory; scripts not kept),
the environment cases with Vitest 5's jsdom environment (forks and
vmThreads) on jsdom 20.0.3, 26.1.0 and 30.1.3 (a scratch project with its
own copy of vitest, so that it loads the chosen jsdom).

- **#77, event handlers per version.** jsdom's handler sets change at two
  releases, not per minor: before 22.1.0 HTMLElement, SVGElement and
  Document lack 19 GlobalEventHandlers (onbeforeinput, onbeforematch,
  onbeforetoggle, oncontextlost, oncontextrestored, oncopy, oncut,
  onformdata, onpaste, onscrollend, onslotchange, the four touch handlers
  and the four onwebkit* ones), the window also onauxclick; before 27.0.0
  no pointer handlers. Counts as in jsdom: element 61/79/90, Document
  63/81/92, window 78/98/106 (before 22.1.0 / to 26.1.0 / from 27.0.0).
  Content attributes of absent handlers do nothing (the profiles compiled
  `<div onpointerdown>` before 27 too). Before 22.1.0 the elements' and
  Document's onauxclick is inert: it keeps what is assigned (a function or
  object, else null; undefined until set), is never called, and its
  content attribute is ignored (svg's window handlers from 28.1.0 behave
  the same; one inertHandler for both).
- **Handler sets as variants.** The profiles before 27 deleted the
  pointer handlers from five prototypes per window, and #77 added 19 more
  deletes: deleting from those prototypes made the jsdom 20 profile's next
  window 320 -> 500 us. HTMLElement, SVGElement, Document and Window now
  take their handlers from a variant of their descriptors (iface.variant
  and iface.adjust in window.js, built once per module load), which needs
  the compat object before the Window interface is made: profileCompat(),
  split out of setupWindow(). Next window, median of 5 alternating
  processes x 300 windows, Node 22.23.3, main -> branch: jsdom 20.0.3
  profile 325 -> 196 us, 23.2.0 307 -> 177 us, 26.1.0 307 -> 173 us,
  30.1.3 174 -> 175 us.
- **#67.** `window.XPathException` in every version: an own data property
  (writable, enumerable, configurable) holding a plain function (length 2,
  INVALID_EXPRESSION_ERR 51 and TYPE_ERR 52 as writable, enumerable,
  configurable statics) that, with or without new, returns an Error named
  XPathException with the code and message (own stack, message, name,
  code; not an instance of XPathException). jsdom's evaluate() never throws
  one; warpdom's XPath errors stay as they were. One per window.
  `HTMLIFrameElement.prototype.getSVGDocument` (iframe only, not frame,
  embed or object): jsdom's throws "....getSVGDocument is not a function"
  from inside jsdom on every call, so warpdom follows the standard and
  returns null (deviation listed above). onloadend on HTMLElement,
  SVGElement and Document before 22.1.0: inert, as onauxclick. The window's
  onautocomplete, onautocompleteerror and onsort before 27.0.0: working
  handlers (null at first, called for their events), IDL only (body has
  none; body's content attribute does nothing).
- **#69.** `<search>`, `<selectedcontent>` (and `<menuitem>`) are
  HTMLUnknownElement in every jsdom release, from createElement and the
  parser, and no jsdom has HTMLSelectedContentElement: the generator leaves
  them out of html-elements.js (UNKNOWN_IN_JSDOM, NOT_IN_JSDOM); the
  superset test walks the three tags explicitly. jsdom computes
  `<search>`'s display as '' before 27.0.0 and block from it (cascade.js).
- **#68, Window members.** jsdom's window has them all as own properties:
  document, window and self accessors whose getters give the window's
  whatever this is (20.x: configurable, self getter only; from 21.0.0
  document and window not configurable, self [Replaceable]); name a data
  property ('' and any value kept as given) in every version; webkitURL a
  data property, not enumerable (warpdom: an accessor until first read,
  as the interface objects); status and the 13 viewport members data
  properties (writable, enumerable, configurable) before 27.0.0 and
  accessors from 27.0.0, the viewport ones [Replaceable] (an assignment
  makes a data property) and returning their value whatever this is,
  status converting to a string. warpdom now defines them as own
  properties of the window in the same shape (setupWindowData,
  defineSelfMembers); the per-file reset restores them from the snapshot
  (status's state is cleared too, which it was not). Before 24.1.2 (not
  24.0: 24.1.0 and 24.1.1 still lack it) jsdom has no WindowProperties
  object: Window.prototype inherits from EventTarget.prototype, and named
  access is through own properties of the window, so a named element
  hides EventTarget's members (window.addEventListener is the element with
  `<div id="addEventListener">`) but not the window's or
  Object.prototype's. For those profiles Window.prototype itself is a
  proxy that looks the named objects up (named-access.js
  namedAccessPrototype); reading a Window.prototype member there costs
  ~20 ns more (window.location 12 -> 34 ns, addEventListener 22 -> 38
  ns; jsdom 24.1.2 and later unchanged). window.document, an accessor now,
  reads in 8 ns instead of 5.
- **Environments.** Vitest's forks and threads pools copy the window's
  members to Node's global as accessors, for jsdom too, so there
  vi.spyOn(window, 'innerWidth', 'get'), assignments and
  Object.defineProperty already behaved as with jsdom; only window, self,
  top and parent were not enumerable (jsdom: writable, enumerable data
  properties), fixed. Where the global is the window (Jest, Vitest's VM
  pools), jsdom's global has the window's own kinds: the window's data
  members that are not functions (name; status and the viewport members
  before 27) are now the global's own data properties, the global's
  accessors are enumerable as the window's members, an assignment the
  window turns into a data property ([Replaceable] members, methods,
  interface objects) does the same on the global, and one it keeps as an
  accessor (status from 27) is read back from the window; self and parent
  are [Replaceable] accessors from jsdom 21 (getters only in 20, where
  assigning them is ignored, as a VM context's global ignores assignments
  to getter-only properties in strict code too). vi.spyOn(window,
  'innerWidth', 'get') works on data properties too (Vitest's spyOn
  handles both), in every pool and version. Window constructors found as
  data properties (webkitURL after its first read) are no longer bound.
  Tests: fixtures/vitest-viewport (forks and vmThreads, jsdom and warpdom,
  profiles 30.1.2, 26.1.0 and 20.0.3 with the measured results), a Jest
  environment test for 20.0.3, 26.1.0 and 30.1.3.

- **Copilot review on #87.** (1) The per-file reset now clears the inert
  handlers (onauxclick, onloadend before 22.1.0) of the document and the
  kept html, head and body. (2) Under Jest and Vitest's VM pools the
  global's data members (name; viewport and status before 27) and the
  [Replaceable] members it took over after an assignment are the global's
  own, so the window behind it went stale, and inline event handlers read
  that window (`window.innerWidth = 640`, then `onclick` read 1024; from 27
  a second assignment was missed; `window.x = 1` in a handler went to the
  hidden window). jsdom (black box: Vitest vmThreads and
  jest-environment-jsdom on 20.0.3, 26.1.0 and 30.1.3) runs inline handlers
  in the context, seeing every assignment and Object.defineProperty. warpdom
  now compiles them in the VM context (runScript) when the environment has
  one, so their global scope is the global; the exposed descriptors are
  unchanged. Vitest's forks pool is unchanged (there jsdom's handlers run on
  jsdom's own window, not Node's global). (3) restoreOwnProperties()
  compares writable, enumerable and configurable too, so a flag-only
  change (`Object.defineProperty(window, 'innerWidth', { writable: false
  })`) does not survive the reset. Tests: reset.test.js (inert handlers on
  20.0.3; flags on 26.1.0 and 30.1.3), fixtures/vitest-viewport (inline
  handler test in the VM pools, warpdom profiles and real jsdom), a Jest
  environment test on 20.0.3, 26.1.0, 30.1.3.
- **Copilot re-review on #87: named elements in VM-pool handlers.**
  Compiling in the VM context dropped the named-element lookup that
  `with (window)` gave: `onclick="result.textContent = 'ok'"` with a
  sibling `<div id="result">` threw ReferenceError (the VM global does no
  named access). jsdom there (black box, same setups) resolves named
  objects live (a later id resolves, a removed one is gone, two of one id
  give an HTMLCollection, a form's name), after the global's own and
  inherited members (`window.x = 'g'` beats `<div id="x">`, `setTimeout`
  stays the function), and an assignment to such a name goes to the global.
  warpdom now puts a named scope (namedScope in named-access.js) between the
  document and the global: it answers only names the global lacks, and
  forwards writes to the global. Tests: fixtures/vitest-viewport (every
  pool; the global-first cases in the VM pools), a Jest environment test
  and plain-window parity tests on 20.0.3, 26.1.0, 30.1.3. Still open, not
  handler-specific: `window.<named>` on the VM global (decision 2026-10-11)
  and window named access for `<a name>`/`<area name>` (jsdom 20.0.3 and
  26.1.0 have it, 30.1.3 does not; warpdom never).
- **Copilot review on #87, third round.** Measured black box with Vitest
  5's jsdom environment (forks, threads, vmThreads) on jsdom 20.0.3,
  26.1.0, 30.1.3 and jest-environment-jsdom (jsdom 20.0.3, 26.1.0).
  (1) Global let/const of classic scripts in a handler: the comment asked
  for them to win over named elements, but jsdom does not do that in any
  pool: with a script's `let counter = 42` and `<div id="counter">`, an
  inline handler reads the element, its `counter = ...` (and `kc = 8` for
  a `const kc`) assigns a global property that later handler runs read,
  while the scripts' bindings stay 42 and 7; a binding without a colliding
  name or global property is read and assigned (`solo`). Its handler
  scope is the global as an object (with), so the global's functions get
  the global as this. warpdom's VM-pool handlers did the first run right
  and then let the binding win (namedScope answered only names the global
  lacked, and the global was reached as the global scope, behind the
  bindings), and called the global's functions with undefined as this.
  They are now compiled as `with (named) with (global)`: the global's
  properties, then the named objects, then the bindings, as in jsdom;
  namedScope no longer checks the global (one `in` fewer per name).
  (2) frames, and a frame's parent and top, returned the window behind the
  VM global: `window.name = 'updated'` then `frames.name` read '', and
  innerWidth assignments were missed. In jsdom's VM pools and Jest they
  are the global (`frames === window`, `iframe.contentWindow.parent ===
  window`), and window[0] is the frame. warpdom's getters now return the
  exposed global (events.js exposed()), and the index properties are kept
  on the global too. In forks and threads jsdom's frames/parent are its
  own window (not the test's global) with the same values, as warpdom's.
  (3) In forks and threads installWindow made every replaced global
  non-enumerable, dropping Node's navigator from Object.keys(globalThis);
  as with jsdom, a replaced global keeps its enumerability and a new one
  is not enumerable. Tests: jest-environment.test.js (frames and handler
  scope on 20.0.3, 26.1.0, 30.1.3), fixtures/vitest-viewport (frame
  aliases in every pool, identity in the VM pools; Object.keys(globalThis);
  handler scope before script bindings in the VM pools; also run with
  real jsdom), vitest-adapter.test.js (enumerability on a stand-in
  global). Bench (Node 22.23.3, alternating runs vs 1723448): bench:load
  unchanged (next window 0.211 -> 0.208 ms, first window 2.53 -> 2.47 ms),
  bench:hot within noise, inline handler in a VM pool: compile ~21 us and
  call ~4.1 us on both. Left open: in forks and threads warpdom runs classic scripts as
  an indirect eval on Node's global, so a script's let/const do not
  outlive it and its var lands on the test's global (jsdom: its own
  window, behind the test's global); in Vitest's VM pools Node's host
  globals (setTimeout, fetch, atob, queueMicrotask, ...) are not
  enumerable on warpdom's global, enumerable on jsdom's.
- **Copilot re-review on #87 (ae1314d): scope names.** The handler
  compiler reached its scope objects through parameters (__window,
  __document, __form, __element), and each was looked up inside the with
  scopes already entered, so a named object of that name replaced the
  scope: `<div id="__element">` made a bare `id` read "__element",
  `<div id="__document">` hid the document's members (`getElementById`
  undefined), `<form name="__form">` replaced the form owner, and in the
  VM pools `<div id="__window">` replaced the global. This held in every
  pool and on plain windows, since inline handlers got their scopes.
  jsdom (Vitest forks and vmThreads on 20.0.3 and 30.1.3, black box)
  treats them as ordinary named objects. The scopes are now reached as
  this[i] of the compiled function, which nothing shadows. Tests:
  event-handlers.test.js (parity with jsdom 20, 26, 30 on a plain window),
  jest-environment.test.js (20.0.3, 26.1.0, 30.1.3). Handler compile
  (median of 5 alternating runs, 3000 handlers, vs 1723448): plain
  window 6.06 -> 5.44 us, VM pool 20.6 -> 19.9 us; calls unchanged (2.2
  and 3.9 us).
- **Copilot re-review on #87 (d1c1f09): event.view; reset of -0.** In
  jsdom's VM pools and Jest (Vitest vmThreads on 20.0.3, 26.1.0, 30.1.3;
  jest-environment-jsdom on 20.0.3 and 26.1.0), the view of the events
  jsdom fires (focus, focusin, blur, click(), a label's click) is the
  global, so `event.view.name` / `.innerWidth` read the test's
  assignments; warpdom's was the backing window ('' and 1024 after
  `window.name = 'updated'; window.innerWidth = 800`). UIEvent's view getter
  now returns exposed() of the view, as target and currentTarget do, which
  covers every event warpdom fires with the window as view. Checked the
  other references in the same probe: composedPath() already ends with the
  global, postMessage's MessageEvent has source null and the global as
  target, as in jsdom. In forks and threads jsdom's view is its own window
  (not the test's global) with the same values, as warpdom's; there jsdom
  throws for `new MouseEvent('x', { view: window })` (the global is not its
  Window) and warpdom accepts it (unchanged). reset.js compares values with
  Object.is, so `scrollY = -0` (a data property before jsdom 27; jsdom 26
  keeps -0) is undone by the reset. Tests: jest-environment.test.js
  (event.view on 20.0.3, 26.1.0, 30.1.3), fixtures/vitest-viewport
  (event.view in every pool, also with real jsdom), reset.test.js (-0 on
  20.0.3, 26.1.0, 30.1.3).

Left as they are (measured, not in these issues):
- ShadowRoot.prototype.onslotchange: warpdom has it, no jsdom does.
- The window's event handlers and other Window members are on
  Window.prototype in warpdom, own properties of the window in jsdom (the
  superset test does not distinguish; Object.hasOwn(window, 'onclick')
  differs).
- Attributes of other window members: jsdom 21+ has setters
  ([Replaceable]) on length, frames, parent, external (20: none), the six
  bars and screen, and location, top and window are not configurable;
  warpdom's length, frames, parent, bars and screen are getters only.
- In Jest and Vitest's VM pools: the global's document, window and top
  stay configurable (teardown redefines them), its interface objects and
  webkitURL are accessors, and assigning a getter-only member
  (performance) still sets the global's value (jsdom 20 to 26 ignore it,
  27+ throw).
- jsdom 24.1.2 to 26.1.0 have both the WindowProperties object and the
  window's own named properties; warpdom has the former only.
- Assigning window.document or window.window in strict code throws a
  TypeError on warpdom's window outside an environment, as on jsdom 27+;
  jsdom 20 to 26 windows made with runScripts ignore it (a VM context's
  global).

Tests: event-handlers.test.js (handler sets and content attributes on
jsdom 20, 22, 26, 30; counts at 20.0.0, 22.0.0, 22.1.0, 26.1.0, 27.0.0,
30.1.3; inert onauxclick/onloadend; the window's onautocomplete,
onautocompleteerror, onsort), xpath.test.js (XPathException on 20, 25,
30), frames.test.js (getSVGDocument shape on 20, 25, 30; null on
profiles), reflect.test.js (`<search>`, `<selectedcontent>`, `<menuitem>`
on 20, 26, 30; display at 26.1.0/27.0.0), window-features.test.js (member
kinds, assignments, prototype chain and named access on 20, 22, 25, 26,
30; boundaries 20.0.3, 21.0.0, 24.1.1, 24.1.2, 26.1.0, 27.0.0, 30.1.3;
reset), vitest-adapter.test.js and jest-environment.test.js (above). The
superset test's KNOWN entries for these issues are removed (8).

Bench (Node 22.23.3, 5 alternating runs, medians, main -> branch):
bench:load cold load 20.4 -> 20.4 ms, first window 2.39 -> 2.47 ms
(spread 2.2 to 2.5 on both), next window 0.206 -> 0.208 ms; bench:hot
within noise (two rounds of 3 and 5 alternating runs; nothing here
touches tree operations): the largest median differences have
overlapping ranges, setAttribute -1.7% then +3.6%, appendChild +8.2% then
-1.2%, insertBefore +4.5% then +3.4% (main 117.7 to 124.3 ns, branch
116.5 to 130.0 ns). Window creation per profile and member reads as
above.

## 2026-10-20: XMLHttpRequest (branch feat/xhr, #22, #30)

XMLHttpRequest, XMLHttpRequestEventTarget and XMLHttpRequestUpload, as
decided 2026-10-19: written from the XHR standard (src/xhr.js) on top of
the host's fetch, read from the platform's global object when a request
starts (so msw and nock, which replace fetch, see the requests); the core
imports no Node built-ins. On by default in every profile (every jsdom
from 20.0.3 to 30.1.3 has the three interfaces; the API superset test's
XMLHttpRequest entry is gone and the test passes for every version);
`xhr: false` (createWindow, environmentOptions.warpdom.xhr,
testEnvironmentOptions.xhr; frames inherit it) leaves them out, as
before. Lazy like the other interfaces; the upload object is made on first
use. Requests still running stop without events when a test environment
tears down or resets the window, or a frame is discarded, as closing
jsdom's window does. Timers are the host's, taken at load, so a test's
fake timers do not stop requests or their timeouts.

Measured black box (local server, real requests; scratch probes, then
test/xhr.test.js), jsdom 20.0.3 to 30.1.3 and 27.0.0, 27.0.1, 27.1 to 27.3,
28.0.0:
- Two generations: jsdom 20 to 27 make requests with Node's http module,
  28.0.0 and later with undici (compat.xhrUndici). From 28: upload
  progress/load/loadend fire before HEADERS_RECEIVED (before: after it);
  an empty body gets one progress event in HEADERS_RECEIVED; `X-HTTP-Method`
  and the other method-override headers are forbidden with CONNECT, TRACE
  or TRACK; setRequestHeader's errors have their own messages ("Invalid
  header name", "setRequestHeader() can only be called in the OPENED
  state."); buffers and type-less blobs get no Content-Type (before:
  text/plain;charset=UTF-8); repeated response headers are separate lines
  (before: combined); `Access-Control-Expose-Headers: *` exposes all;
  cross-origin and data: uploads report their lengths (before: 0/0, and no
  upload completion for data:); open() after a response resets status
  (before: kept); a cross-origin request redirected to another origin is
  not checked as origin null (before: it is). Before 27.0.0 network and
  CORS errors are reported on the virtual console (warpdom: through the
  environments' "Not implemented" channel, in jsdom's words for CORS).
  Multipart bodies: hex boundaries and no line-break normalization before
  26; filenames never normalized. jsdom 20 sends URL credentials as Basic
  authorization. A view on a SharedArrayBuffer throws from 27.0.1; a
  response charset naming the replacement encoding gives U+FFFD from
  27.4.0.
- Events: readystatechange (1) in open(); loadstart synchronously in
  send(), then upload loadstart (0/total) when upload listeners were ever
  added (a removed listener counts) and the body is not empty;
  readystatechange and progress per received chunk (lengthComputable with
  a Content-Length); readystatechange (4), load and loadend in one task.
  Timeouts: progress (0/0) at the upload if it is incomplete, else at the
  request, then readystatechange (4), upload timeout/loadend, progress,
  timeout, loadend; afterwards readyState is 0 and the headers and body
  are gone but status, statusText and responseURL stay. Abort: as the
  standard, with responseURL kept. A timeout changed during a request is
  measured from its start; 0 cancels it; a request started without one
  never gets one.
- CORS as jsdom checks it: Origin on cross-origin requests; a preflight
  (Origin, Access-Control-Request-Method, -Headers: the author's names as
  written, joined by ", ") only for methods other than GET, HEAD and POST,
  author headers other than Accept, Accept-Language, Content-Language and
  Content-Type (any value), or upload listeners; it needs a 2xx status,
  the allowed origin and the headers in Access-Control-Allow-Headers (or
  *); allowed methods are not checked. Cross-origin responses expose the
  safelisted headers and Access-Control-Expose-Headers.
- Bodies and responses: Content-Type defaults and the charset rewrite to
  UTF-8 for strings and documents (URLSearchParams are sent as strings,
  text/plain, as jsdom does), the document serialization with its doctype,
  response types (arraybuffer and blob give the bytes so far before DONE,
  as jsdom; json decodes UTF-8 only; documents: text/html only for
  responseType document, XML for XML types and no Content-Type, null on a
  parse error, contentType application/xml, characterSet from the
  charset), getAllResponseHeaders() without a trailing CRLF, Set-Cookie
  and Set-Cookie2 hidden, the URL's fragment kept in responseURL without
  a redirect, data: URLs.
- Synchronous XHR: jsdom runs it in a child process (it works when the
  server is in another process; with the server in the same process it
  deadlocks until "Sync XHR worker timed out"). warpdom throws a
  NotSupportedError at send() that says to make the request asynchronous;
  open()'s own checks (InvalidAccessError with a timeout or responseType)
  are jsdom's. open(m, u, undefined) is synchronous, as in jsdom.
- Cookies: jsdom stores a response's Set-Cookie in the jar document.cookie
  reads and sends the document's cookies with same-origin requests (and
  credentialed cross-origin ones); warpdom does neither (decided).

Differences are listed in "Deliberate deviations" above and in the
README. Mock compatibility (test/xhr-mocks.test.js, fixtures/vitest-xhr-
mocks, same specs on warpdom in forks and vmThreads and on jsdom in forks;
jsdom's VM context cannot load msw or nock, no web streams): axios takes
its XHR adapter (as with jsdom; with xhr: false Node's http client, nock
intercepts it); msw answers the request the XHR makes through fetch, so
its CORS checks apply (a cross-origin mocked response needs
Access-Control-Allow-Origin, on jsdom too); nock 14 answers XHR itself
through @mswjs/interceptors' XMLHttpRequest interceptor (no CORS). Not
run under Jest (the Jest CLI is not a devDependency): there msw and nock
replace the test global's XMLHttpRequest, which is the window's, as with
jsdom. devDependencies: msw 3, nock 14 (15 needs Node 22.20), axios 1.

Tests: test/xhr.test.js (parity scenarios on jsdom 20.0.3, 27.4.0, 28.1.0,
30.1.3, some on 22, 25 and 26; each engine against its own server,
several at a time, ~11 s; plus the option, laziness, sync, reset and
teardown, fake timers, realms, profile boundaries and the documented
differences), test/xhr-mocks.test.js, the type tests.

WPT (checkout 87b5d13099, runner fixed: the host's WebSocket stays on the
global, else every warpdom file failed since fix/websocket-window; data:
and blob: URLs through the host's fetch): xhr/ 531 of 1,438 subtests,
score 29.1% (jsdom 30.1.2: 486, 30.1%). Most of xhr/ needs wptserve
(.py handlers, other origins): neither engine reaches it here (jsdom's
requests fail DNS, which passes tests that expect an error), so the
area's number says little until the runner has a server: wptserve with
its Python handlers and the www1/www2 hosts resolving to it (Node's
lookup or /etc/hosts), https. Of jsdom's 55 subtests warpdom fails: 19
synchronous XHR, ~25 server-dependent, 4 FormData iteration and its
idlharness line (forms.js, not XHR), 1 ProgressEvent conversion, 2
responseXML importNode/adoptNode of XHTML scripts, 3 timeout files that
stop at postMessage with one argument. The subtests in other areas that
needed XMLHttpRequest now pass (main vs branch, warpdom, FileAPI, url,
fetch/api/headers, domxpath, dom/events, hr-time, user-timing,
WebCryptoAPI, encoding without the legacy CJK and streams directories:
+1,410 subtests, 0 lost): domxpath/xml_xpath_runner 1,024 (jsdom 0),
url/failure.html 190, encoding/single-byte-decoder?XMLHttpRequest 168,
unsupported-encodings 14, replacement-encodings 6, fetch/api/headers 4,
dom/events 4 (relatedTarget, event-global). xhr added to the WPT
workflow's default areas.

Measured (Node 22.17.1, interleaved with main 74f6b34, medians of 5):
cold load 21.9 -> 23.1 ms (+1.2 ms: the xhr.js module, ~0.9 ms to load
alone; minifying it does not help), first window 2.52 -> 1.93 ms, next
windows 0.203 -> 0.200 ms. bench:hot (warpdom only) every case within
-3% to +4%, none of the hot paths touched. `npm test` on Node 22.23.3 and
22.12.0 and `npm run test:types` pass.

### Copilot review on #89 (2026-10-20)

Eight comments on src/xhr.js, each checked black box on jsdom 20.0.3,
27.4.0, 28.1.0 and 30.1.3 (local server; 21 to 26 where the answer moved)
and against the XHR and Fetch standards. Seven held; fixed with parity
scenarios or tests (test/xhr.test.js):
- overrideMimeType() without a charset kept no charset: the response's
  charset now stays (XHR "get a final encoding"; every jsdom), for text and
  for documents' characterSet.
- Timeouts measured elapsed time with the global Date.now(), so a faked or
  frozen Date (fake timers) moved them; now the host's Date.now taken at
  load, as the timers are.
- Redirects: fetch's own following checks no CORS on the way and sends its
  own Origin and Referer. warpdom now follows redirects itself (redirect:
  'manual', at most 20, 301/302 POST and 303 to GET without the body
  headers, Authorization dropped across origins as fetch does) with
  jsdom's checks per hop, which differ by generation (black box, three
  origins): jsdom 28+ checks a redirect from another origin when the
  request started cross-origin or goes on to another origin, taints the
  origin (Origin: null, final check against null) when such a redirect
  goes to yet another origin, sends Origin once a hop was cross-origin, and
  keeps the request's fragment when the Location has none; jsdom before 28
  checks every response once a hop was cross-origin, taints as the
  standard, sends Origin on every redirected hop and the previous URL as
  Referer, and keeps no fragment. Decided: a failed redirect check is a
  network error in every profile (jsdom before 28 fires error and then
  follows the redirect to load: a bug not worth copying; README). Not
  done: a preflight for a redirected request that needs one (the
  standard's, Copilot's suggestion): no jsdom sends it (a PUT redirected by
  307 to another origin goes without preflight), and preflighting would
  fail requests to servers and mocks that pass on jsdom.
- An about:blank iframe had the origin "null": it now has its creator's
  (window.origin, XHR's origin checks and Origin header; location.origin
  stays "null", as jsdom), and its creator's base URL as fallback base URL
  (relative URLs, baseURI, a.href), followed live before jsdom 26 and kept
  from the first use from 26. A frame reports "Not implemented" and jsdom
  20-26's XHR errors where its parent does (jsdom: one virtual console).
- After a network error or a CORS failure the arraybuffer and blob
  responses were an empty buffer or blob: now null, as jsdom.
- getResponseHeader() with a name that is not a header name ('' or
  'bad name') threw fetch's TypeError: now null; a name that is not a
  ByteString throws jsdom's TypeError.
- Requests of iframes (nested ones too) survived the parent's reset,
  teardown and the removal of an outer frame: abortWindowRequests() now
  goes through the frames.
Did not hold for parity: an XML response's XML declaration encoding (and
an HTML document's meta charset) is not used by any jsdom (UTF-8, U+FFFD
for other bytes); the standard uses them. warpdom stays with jsdom; the
responseTypes scenario now covers both, so a jsdom change shows.
Also: the timeouts scenario's body-timeout cases got a wider margin
(jsdom took more than 150 ms to the headers on CI), and the Vitest output
in test/xhr-mocks.test.js is matched without ANSI colors (CI colors it).

### Copilot's re-review of 6620899 on #89 (2026-10-20)

Six more on src/xhr.js, checked black box on jsdom 20.0.3, 27.4.0, 28.1.0
and 30.1.3 (local server) and against the standards. All six held in
some form; fixed with tests (test/xhr.test.js):
- Referer with credentials (window at http://user:secret@host/page#frag):
  every jsdom sends the document's URL with credentials and fragment
  (warpdom already dropped the fragment). Before 28 a redirected hop
  sends the previous request URL as requested (fragment, credentials).
  Referrer Policy strips both: warpdom now does, in every profile
  (deviation; README, differences test). The redirectHops scenario
  compares Referers without their fragment and loads without lengths.
- A request stopped (abort(), open(), teardown) between fetchFollowing()'s
  check and run() resuming went on: readystatechange 2 after the abort, or
  the old response over the reopened request. run() now checks again and
  cancels the stale body (test with a fetch whose promise gets a
  continuation after XHR's).
- Bodyless documents: every jsdom gives no document (response and
  responseXML null) for HEAD, 204, 304 and also an empty 200 body (one
  byte, even a space, makes one). The standard returns null only for a
  null body and parses an empty one; warpdom follows jsdom: no bytes, no
  document. Parity cases in responseTypes.
- XML parse failure was detected by a parsererror root in Firefox's
  namespace, so a well-formed document with that root was null; jsdom
  returns it. xml.js has parseXMLInto() (returns whether the text was
  well-formed; parseXMLDocument() keeps its shape); parity cases for the
  valid parsererror document and a document without a root.
- A header named `__proto__` went through `{}` (lost). jsdom loses it as
  well (no header; jsdom 28+ lists it in the preflight, 20-27 do not
  preflight for it). Now a null-prototype record, and fetch gets the
  headers as name/value pairs (fetch's record conversion drops
  `__proto__` too). Node's fetch (22 and 24) still leaves it off the
  wire, so on the wire nothing changes; a fetch mock (msw) sees it.

### Copilot's re-review of 338c646 on #89 (2026-10-20)

No open issues; three "previously missed" items in unchanged code, all
fixed (probe: scratchpad p10.mjs, jsdom 20.0.3, 27.4.0, 28.1.0, 30.1.3
agree on everything):
- Document cloneNode() lost the encoding: every jsdom keeps it, shallow and
  deep (windows-1252 and UTF-16LE XHR documents; other documents UTF-8).
  cloneNode copies the charset for every document (interfaces.js). Parity
  cases in responseTypes. Seen on the way, not changed: jsdom's clone of
  an XML response document and its DOMParser documents are XMLDocument
  objects (warpdom: Document, as the standard and browsers).
- send(xmlDocument) threw InvalidStateError for markup that is not
  well-formed (a comment with "--", PI data with "?>", U+0001 in text or an
  attribute, a doctype public id with both quotes): every jsdom sends the
  serialization as is (XHR's "serialize" has no well-formed flag; a
  document without an element: empty body). XML documents now go through
  serializeXML(); parity cases in bodies.
- Browsers' fetch gives an opaqueredirect (status 0, no Location) for
  redirect: 'manual', so the browser entry reported an empty status-0
  load. Such a response marks that fetch function (a WeakSet) as one that
  follows redirects itself: the request is sent again with redirect:
  'follow', and later ones go straight to it. The hops are then the
  host's, with its CORS checks; responseURL is the response's URL (the
  request's fragment kept from 28 on), and the final response is checked
  when it or the request is cross-origin. Documented (README, docs/api.md);
  test with a fetch stub.

### Copilot's re-review of 8bc5d15 on #89 (2026-10-20)

No open issues; three "previously missed" items in unchanged code
(decided by the coordinator for Sonu):
- The timers and clock were taken from the global of the context that
  evaluates warpdom: the CommonJS bundle evaluated in a Jest test file's
  VM context after fake timers were installed got the fake ones (a timeout
  never fired). Now from PLATFORM_GLOBAL (Node's main global in the
  bundle). Test in test/cjs.test.js (bundle in a VM context with
  never-firing timers and a frozen Date: the timeout fires).
- Every fetch (request, preflight, redirect retry) passes credentials:
  'omit': warpdom has no cookies, and a browser host's must not go with
  its requests (no-op on Node). Test with a fetch stub.
- Not done: browser fetch filters cross-origin responses (CORS headers
  hidden), so warpdom's own CORS checks reject allowed responses on a
  browser host. Documented as a limitation (README, docs/api.md); issue
  #91, for the SSR/edge milestone.

### Copilot's re-review of e9b57a1 on #89 (2026-10-20)

No open issues; three "previously missed" items in unchanged code, all
done:
- A frame's uncaught listener exceptions (an XHR onload too) went to the
  frame's own onUnhandledError (console.error; under Vitest nothing was
  printed). Black box, jsdom under Vitest 5 (jsdom 30) and Jest 30
  (jest-environment-jsdom 30.5.2): such an exception does not fail the
  test (only the top window's 'error' event is watched); jsdom's virtual
  console reports it (jsdomError "Uncaught [Error: x]", type "unhandled
  exception" with detail before 27, "unhandled-exception" with cause
  from 27), which Vitest prints on the setup console and Jest's
  environment sends to the test's console. Copilot asked for the test to
  fail; warpdom matches jsdom instead (a suite that passes on jsdom must
  not fail): frames hand them to the top window's new reportError hook
  (window internals; jsdom's virtual console errors), which the Vitest
  environment sends to the setup console and the Jest environment to the
  test's console in jsdom's shape. The top window's errors still fail the
  test. Tests: fixtures/vitest-frame-errors (warpdom and jsdom),
  test/jest-environment.test.js (profiles 20.0.3 and 30.1.3).
- jsdom 20's Basic authorization from URL credentials is UTF-8 (é:p is
  w6k6cA==, €:p 4oKsOnA=); undecodable ones (%FF) are a network error
  reported as "URIError: URI malformed". warpdom used btoa on the decoded
  string (Latin-1; € threw from send()). Now UTF-8, and the network
  error. Parity cases in urls.
- The AbortController for a request's fetch came from the evaluating
  context: the CommonJS bundle in a VM context without one had no
  controller, so a preflighted request threw at req.controller.signal.
  Now PLATFORM_GLOBAL's (the signal goes to its fetch). Test in
  test/cjs.test.js.

### Copilot's re-review of d6305eb on #89 (2026-10-20)

Four "previously missed" items. Fixed: the jsdom 20 profile's Basic
authorization used the evaluating global's btoa (the CommonJS bundle in a
VM context without one failed with a ReferenceError); now PLATFORM_GLOBAL's
(test in test/cjs.test.js). Deferred to #92 (to verify against jsdom per
generation first): an unknown override charset label falling back to the
response's charset; cancelling an in-flight preflight body on abort; jsdom
28+ upload events seeing the final response, and cancelling the body when
an upload handler aborts or reopens.

### XHR follow-ups (#92, 2026-10-21, branch fix/xhr-followups)

The three items deferred from the d6305eb review and four added later on
#92, each checked black box on jsdom 20.0.3, 27.4.0, 28.1.0 and 30.1.3
(local server; 21 to 26 where the answer moved) and against the standards:
- overrideMimeType() with a charset that names no encoding ('unknown',
  'utf-9'): every jsdom keeps the response's charset (UTF-8 without one),
  for text and documents' characterSet. Held; the override's label must
  name an encoding to win. Seen on the way: documents' characterSet was
  warpdom's lowercase name (iso-8859-2, shift_jis); every jsdom gives the
  Encoding standard's (ISO-8859-2, Shift_JIS, Big5, GBK, IBM866). Fixed.
  Not done: jsdom before 27 gives UTF-8 for iso-8859-8-i, x-mac-cyrillic
  and iso-2022-jp, and before 23 for x-user-defined (its decoder lacks
  them); warpdom decodes them in every profile.
- Abort during a pending preflight: jsdom's events (readystatechange 4,
  abort, loadend, nothing after) and open()'s (nothing) were warpdom's
  already. Held for the body: the preflight's body is now cancelled when
  the request was stopped meanwhile. Parity cases in aborts (the test
  server answers OPTIONS after pfwait ms), test with a fetch stub.
- Upload handlers in jsdom 28+ run in OPENED with status 0, no
  responseURL and no headers (20 and 27 run them in HEADERS_RECEIVED with
  the response). Held: warpdom stored the response before them; now after.
  abort() or open() in such a handler left the fetched body uncancelled:
  now cancelled. jsdom goes on after such a stop (the upload's load and
  loadend; from 28 also readystatechange with readyState 2, stuck there);
  warpdom stops, as the standard (deviation, README). Parity scenario
  uploadHandlers, test with a fetch stub (27.4.0 and 30.1.3 profiles).
- A pending reader.read() on a stream that ignores the abort signal: the
  request keeps its reader and stop() cancels it (abort, open, timeout,
  teardown). Test with a fetch stub.
- open()'s argument conversions: every jsdom converts the method
  (ByteString), URL, user name and password before any check, so a
  toString() exception propagates (warpdom: SyntaxError), a symbol throws
  jsdom's TypeError (warpdom used 'Symbol(url)'), and a method outside
  Latin-1 throws "not a valid ByteString" (warpdom: SyntaxError). Fixed;
  parity cases in conversions.
- about:blank#section frames: no jsdom gives them the creator's origin or
  base URL (origin null, own URL as base URL, relative XHR URLs throw,
  Origin: null), nor for about:blank?q or about:blank#. warpdom already
  matched; not changed (the standard would inherit). Parity cases in
  aboutBlankFrames.
- window.atob/btoa and FileReader.readAsDataURL used the evaluating
  context's atob/btoa: the CommonJS bundle in a VM context without them
  threw. Now PLATFORM_GLOBAL's; test in test/cjs.test.js.


## 2026-10-21: benchmark comparison on pull requests (branch ci/bench-workflow, #95)

Every pull request to main gets before/after numbers from a GitHub-hosted
runner (`.github/workflows/bench.yml`), so a PR no longer needs local
benchmarks on a busy laptop to be judged.
- The workflow checks out the PR head and its base commit, `npm ci` in both
  (Node 22.22), and runs `bench/ci-compare.mjs` from the workflow's own
  revision (the PR head; for manual runs the commit the run starts from,
  so an older ref can be measured too): 7
  rounds of `bench/load.js` and `bench/hot.js --only warpdom` on each side,
  alternating (the side that goes first alternates too), medians per
  measure, head/base change, flagged beyond +-5%. Both sides run the same
  bench scripts, so the measured checkouts need no `--json` support and a changed case
  measures the same code path on both sides (a case the base cannot run
  shows n/a).
- Output: the run's summary page, an artifact (report.md, results.json),
  and one PR comment (marker `<!-- warpdom-bench -->`) edited on every
  push. Fork and Dependabot PRs have a read-only token: summary page only.
  Manual runs (workflow_dispatch, optional ref) compare against main's tip.
- Report only: never fails on a regression; not a required check.
- `bench/load.js` and `bench/hot.js` take a warpdom checkout as an optional
  argument (as the `*-bench.mjs` scripts do) and `--json`; default output
  unchanged. `hot.js` loads only the environments it measures. The JSON
  records the measured checkout and ci-compare checks it (Copilot on #95:
  `hot.js <dir>` without `--only` ignored the directory).
- First run (#95, same source on both sides, so an A/A test): all 21
  measures within +-2.4%; single-round outliers up to 2.7x (querySelectorAll
  after a change) that the median absorbs. The job takes about 2 minutes
  (1.5 of them benchmarking); 4-CPU runner. Numbers are higher than on the
  laptop (cold load 34 ms vs ~24 ms), so compare within a run only. The
  second A/A run flagged 1 of 21 measures beyond +5%: single flags are
  often noise.

## 2026-10-21: style objects as jsdom has them per version (branch fix/style-declaration-accessors, #72)

Phase 1 (black box, jsdom 20.0.0 to 30.1.3 with cssstyle 2.3.0 to 6.2.0):
warpdom's accessor name sets already matched every cssstyle/jsdom group
except azimuth for cssstyle 4.3 and earlier; the gap was the interface.
jsdom 20 to 28 (cssstyle) make el.style and getComputedStyle()
CSSStyleDeclarations whose one prototype has the accessors and the
methods (no CSSStyleProperties global, no @@iterator or @@toStringTag), so
`vi.spyOn(CSSStyleDeclaration.prototype, 'width', 'get')` intercepts
el.style and computed reads there; on warpdom it threw (the accessors were
CSSStyleProperties' in every profile).

- **Design.** Before jsdom 29, CSSStyleProperties is an alias of
  CSSStyleDeclaration (interface definition `alias`; materialize returns
  the other interface and points protos.CSSStyleProperties at its
  prototype, so the style code keeps one entry point; applyCompat deletes
  the global). CSSStyleDeclaration's members are a variant per style
  surface (as #87's event handler sets): `adjust` returns the accessors'
  descriptor map with the members added (copying 1,600 accessors into the
  members' map cost ~0.3 ms at first use), built once per module load;
  each window still gets its own prototype. `untagged` leaves out
  @@toStringTag. Members per cssstyle group: 2 to 4.3 enumerable, item/1,
  setProperty/3, the three legacy stubs (length 0, return undefined); 4.4
  and later non-enumerable (cssFloat too), item/0, setProperty/2 (3 in
  5.3); a missing argument is no error except item() and setProperty()
  from 4.4; setProperty with no value does nothing.
- **azimuth**: cssstyle 2 to 4.3 convert to an angle in degrees (CSS 2
  aural positions, `behind` mirrors, grad and rad converted, then into
  [0, 360] as jsdom does: 720deg is 360deg), keywords case-insensitive,
  '' and null ignored by the accessor; 4.2 and 4.3 write NaNdeg for every
  angle (a cssstyle bug; FINDINGS said "A-C convert", measured on 4.1);
  4.4 to 5.2 keep any value (already so); 5.3 only CSS-wide keywords.
- jsdom 29+: unchanged, except CSSStyleProperties' own @@iterator (jsdom's
  is CSSStyleDeclaration's, Array.prototype.values); KNOWN entry narrowed.
- **Tests**: test/style-declaration.test.js, parity with jsdom 20, 22, 25,
  26, 27.4, 28.1, 29.1.1 and 30 (chains, member owners/kinds/lengths,
  tags, stubs, missing arguments, a spied width accessor seeing el.style
  and computed reads and writes, azimuth); cssstyle 4.2/4.3 NaNdeg;
  per-window prototypes. fixtures/vitest-style-spy (vi.spyOn, profiles
  20.0.3, 26.1.0, 28.1.0, 30.1.3, and Vitest's jsdom environment) and a
  Jest environment test with jest-mock's spyOn. The superset test's two
  CSSStyleDeclaration KNOWN entries are gone.
- **Bench** (Node 22.23.3, medians, base c2fb3d4 vs branch, interleaved):
  bench:load cold load 21.7 vs 21.6 ms, first window 2.73 vs 2.72 ms (30
  fresh processes each), next windows 0.206 vs 0.209 ms; bench:hot within
  noise (-2.5% to +4.2%, no style members there). Style micro-bench
  (1,000 elements; ns per op; profiles 20.0.3 / 26.1.0 / 28.1.0 / 30.1.3):
  write 131.5/136.1/145.9/138.0 vs 132.9/140.8/141.0/130.8, read
  42.4/54.8/42.5/42.5 vs 41.0/55.0/42.6/55.6 (bimodal 41/55 on both
  sides; 10 more 30.1.3 runs show the same spread for both),
  getComputedStyle 645/793/805/783 vs 639/790/795/782; first style
  access per process 2.30/1.39 vs 2.33/1.42 ms (20.0.3/28.1.0).
- **Not done**: (4) with cssstyle 5.3 and earlier jsdom's setProperty(),
  cssText, the style attribute and getComputedStyle() call the (spied)
  setters; doing so needs a descriptor lookup per declaration written on
  the hot path, skipped. (5) Getter names `get width` for jsdom 29+:
  renaming the 3,200 functions cost +1 ms at first style access
  (defineProperty) or +1.4 ms and +0.3 ms per window (computed-key
  literals); skipped. Also not modeled: cssstyle's length setter (leaves
  its state inconsistent) and underscore members, jsdom 29.0.0's internal
  computed classes, CSSStyleRule.style without accessors before 27.1.0,
  computed azimuth with cssstyle 4.2/4.3 (NaNdeg vs ''), and cssText
  `azimuth: inherit !important` with cssstyle 5.3 (jsdom drops the
  priority). README "Differences from jsdom" lists them.


## 2026-10-21: computed values per jsdom version (branch fix/computed-values, #84, #76)

Black box on every jsdom release from 20.0.0 to 30.1.3 (jsdoms-misc,
jsdoms-36 clean installs) and cssstyle 2.3.0 to 6.2.0 (colors, ~170 length
properties with 0 and em, box shorthands, font sizes and weights,
font-family, vertical-align, :link, the dialog's user agent styles).

| | measured | warpdom before |
|---|---|---|
| colors before 22.1.0 | as declared, computed too (`Red`, `transparent`, `GrayText`); undeclared background and border colors '' | rgb() |
| colors 22.1 to 26 | named/hex/rgb() resolved, system colors (and currentColor before cssstyle 4.4) as declared, a border side's hsl()/RGB() as written | system colors to rgb() |
| colors 27+ | all system colors to jsdom's values (ButtonFace/ThreeDFace rgb(204, 204, 204), GrayText rgb(102, 102, 102), Highlight rgb(0, 153, 255), LinkText rgb(0, 0, 255), Mark rgb(255, 255, 0), ButtonBorder rgb(51, 51, 51), ...) | 10 known, other values |
| cssstyle < 4.4 | keywords as written, only CSS 2's 28 system colors (ThreeDFace yes, Canvas no); border-color lowercased and border on the full border before 4.3.1; border widths and border-spacing 0 as written | lowercased, ThreeDFace rejected |
| cssstyle 4.4, 4.5 | system colors keep their case, SelectedItem(Text) unknown | lowercased |
| cssstyle < 4.2 | older color parser: hex alpha to 3 decimals (0.502; #f00f rgba(..., 1)), alpha as written, lowercase comma-syntax functions only, integers or percentages (floored); cssstyle 2/3 read hsl()'s hue in turns (hsl(120, 50%, 50%) rgb(64, 64, 64)) | current parser |
| cssstyle 5 (27.0-28.0) | system colors dropped in border sides and a lone one in background/text-decoration | kept |
| alpha | a number to 3 decimals (0.1234 -> 0.123) in every version from cssstyle 4.2; rgb() mixing numbers and % in the comma syntax invalid; hsl() hues in grad, rad and turn from cssstyle 4.2 | byte-quantized (0.12); accepted |
| a declared 0 | 0 before 28.1.0 where cssstyle does not parse the property (text-indent, min-width, letter-spacing; cssstyle 5 parses margins, paddings, widths, heights, offsets, border widths, border-spacing, flex-basis, font-size, background-size); 0px from 28.1.0, vertical-align too | 0px |
| margin/padding/border-width before 27 | as declared (2px 6px 3px 6px), all four sides once a longhand changed them, '' with a side ''; from cssstyle 4.4 the margin/padding accessors read the shortest form ('' with a side '', a declared var() or CSS-wide keyword as getPropertyValue), getPropertyValue/cssText as written | shortest |
| font-family 29.0.2+ | 'depends on user agent' when undeclared/initial | '' |
| vertical-align: inherit 29.0.2+ | inherits (td/tr middle from tbody), baseline from a parent without one | baseline |
| lengths 30.0+ | one length or math function to px, 6 significant digits: em/ex(0.5)/ch(0.5)/cap/ic/lh(1.2em) from the element's font size (font-size from its parent's), rem/rex/rlh from the root's, vw/vh/vi/vb/vmin/vmax at 1024 x 768, cm/mm/q/in/pt/pc at 96 dpi, calc/min/max/clamp; font-size keywords (9/10/13/16/18/24/32/48px), larger/smaller (x1.2), %; other % and lists as declared | as declared |
| bolder/lighter 30.1.0+ | CSS Fonts 4 table from the parent's weight (b 700, h1 b 900, bolder keeps 900 to 1000) | bolder |
| :link | an SVG a with href matches :link/:any-link (xlink:href does not), every version | HTML only |
| default cssstyle | 2.3 to 21.0.x, 3.0 21.1-23.0.x, 4.x from 23.1.0 (dependency ranges) | 3.0 for 21-23 |

#76 (dialog): jsdom 20-22.0 white/black (named colors as declared), an open
dialog's display '' before 27 (already so), inset-inline-start 0 in 27.0 to
28.0 (the zero rule). The earlier note that 27.4.0's parser drops the
dialog's Canvas and fit-content was a measurement artifact: jsdom 27.1+
parses style sheets with the cssstyle `@acemir/cssom` resolves, and the
jsdoms install had a hoisted cssstyle 2.3.0 next to it (sheets then drop
CSS 4 system colors, fit-content, uppercase units, use the old hsl() and
hex alpha). Clean installs (jsdoms-36) keep them; warpdom follows the clean
install. The repository's jsdom27/28 aliases resolved the root cssstyle
4.6.0 there too, so parity scenarios for 27/28 avoided sheet values where
4.6 and 5.3 differ (fixed by #138: each alias now loads its own). Projects with jest-environment-jsdom 29 beside jsdom
27+ can hit the artifact for real; not modeled.

Implementation: colors.js (jsdom's system color table, the CSS 2 set,
legacy/'cssstyle3'/'floor' parsers, numeric alpha), css.js (surface color
dialect colorKeywords per cssstyle, rejectsColor, zeroAsWritten for
cssstyle 5, box shorthands as written, margin/padding accessors), cascade.js
(computeColors per compat.computedColors, zeroLengths, box shorthands,
vertical-align inheritance, font-family initial), lengths.js (jsdom 30's
absolute lengths; a small calc evaluator), selectors.js (:link), compat
flags colorKeywords, computedColors, zeroLengths, absoluteLengths,
relativeWeights. Tests: test/computed-values.test.js (parity with jsdom 20,
22, 25, 26, 27, 28, 29, 30 per item, boundaries as plain tests).

Bench (Node 22.17.1, machine shared with another agent, medians of 5
interleaved runs, main 3c0cf9f vs branch): cascade-bench read pass 0.50 ->
0.52 ms, mutate+read 1.84 -> 1.85 ms; bench:hot within noise (no style
cases); bench:load within noise (loaded machine). Cache-miss pass, 2,000
elements x 8 properties (colors, em lengths, font size and weight), ms per
jsdom 20.0.3 / 26.1.0 / 28.1.0 / 30.1.3 profile: 7.3/7.4/7.2/9.2 -> 6.0/7.8/
7.7/11.0. The 30.1.3 extra is resolving em through the ancestors' font
sizes (kept with each element's cascaded values; 12.9 ms without).

Left (measured, not modeled): the font shorthand composed from its
longhands (computed `font`: 30.1.3 `16px depends on user agent`, 30.1.0
`400 16px ...`, 29.0.2 `medium ...`; el.style.font from longhands in every
version); a shorthand followed by a longhand in a declaration block (jsdom
expands to longhands: `margin: 1px 2px; margin-top: 3px` reads `3px 2px
1px`; warpdom keeps both declarations and a stale shorthand) - every
version, worth an issue; `!important` in style sheets ignored by jsdom
before 29 (and lost for a longhand after its shorthand in 29) - worth an
issue; jsdom 30.1's calc(100% - 1em) as calc(100% - 0px); declared values
in jsdom 29/30 (uppercase units lowercased, calc() simplified, min()/max()
dropped in 29); cssText as written vs accessor for 4.4+ (done) but sheet
cssText as written in 27.0; color: initial '' with cssstyle 4.3.1; a
border shorthand's hex alpha rounded down in 22.1-26; author lowercase
`currentcolor` in a full border with cssstyle 2/3 (computed '').

## 2026-10-22: a pending longhand meets a declared one by order (branch fix/antd-descriptions-padding)

Corpus regression from #103: 8 Ant Design tests (Descriptions, nested
descriptions preserve inner styles, inner bordered) failed on warpdom and
passed on jsdom 26.1.0. The bordered cell rule declares `padding:
var(--p) var(--q)` (more specific), a later rule `padding-bottom: var(--b)`
(and `padding-bottom: 0` for the last row). #103 made the shorthand's
longhands pending, and the pending padding-bottom won by specificity:
computed padding-bottom '' where jsdom gives `var(--b)`.

Black box (jsdom 26.1.0 with cssstyle 4.3.1, 4.4.0, 4.6.0; 27.4.0, 28.1.0,
29.0.2, 29.1.0, 29.1.1, 30.0.0, 30.1.0 to 30.1.3): a pending longhand and a
longhand declared as itself meet by document order, whatever their
specificity and importance (an !important shorthand with var() loses to a
later plain longhand, an !important longhand to a later var() shorthand),
across style elements too; from 30.1.3 the cascade decides, but two
!important ones still meet by order. cssstyle before 4.4 declares no
pending longhands (unchanged). Before 28 the latest matching pending and
declared ones meet (jsdom applies rules in document order: `.d.d td {
padding: var(--a) } td { padding-bottom: 7px } td { padding: var(--a) }`
leaves padding-bottom pending), from 28 each declared property's winner
by specificity (7px there). Implemented as compat.pendingByOrder
('latest' before 28, 'all' to 30.1.2, 'important' from 30.1.3) and
cascade.js cascadeByOrder (one scan; it stops at a first match from a
shorthand without var(), and is skipped for a normal inline declaration
with no !important rules: 400 cache-miss reads with 5,000 unrelated
var() rules 55.7 -> 40.7 ms on the 26.1.0 profile, 53.5 -> 39.4 ms on
30.1.2, Node 22.23.3); a
longhand from a shorthand without var() still meets the pending one by
the cascade.

Left (measured, not modeled): jsdom 20 to 27.4 cascade author rules by
document order without specificity (`.a.b > td { color: red } td { color:
blue }` computes blue; 28.1 and later by specificity); a shorthand with
var() against a later shorthand without it (26/27 by order, 29 to 30.1.2
the one without var() wins).

## 2026-10-21: window setters and their receiver (branch fix/setter-receivers, #90)

#90 (from Copilot's review of #87): the window's self setter, and self and
parent on the VM pools' global, write to the window they close over, so
`Object.create(window).self = 7` replaces window.self instead of giving
the derived object its own property.

Measured black box (jsdom 20.0.3, 21.1.2, 22.1.0, 26.1.0, 27.4.0, 28.1.0,
29.1.1, 30.1.3; new JSDOM() with and without runScripts, and the window as
a VM context's global, getInternalVMContext(), as jest-environment-jsdom
uses it; Vitest 5 forks and vmThreads with its jsdom environment on
30.1.2):
- jsdom's own window accessors (self and parent from 21; frames, length,
  external, origin, event, the bars, screen; status and the viewport
  members from 27) act on their own window whatever this is: called on
  another object or another window, the setter replaces this window's
  member (status: its string), and status's getter reads it. So the
  issue's premise holds only for some windows:
- Up to 26 a window made with runScripts (as the test environments make
  it) is a VM context's global, and an assignment through an object that
  inherits from it gives that object its own data property and keeps the
  window's, for every member (also jsdom 20's getter-only self). Without
  runScripts it replaces the window's (21 to 26).
- From 27 (with or without runScripts; getInternalVMContext() is the
  window itself from 27) such an assignment replaces the window's member
  and the derived object gets nothing, for self, parent, status and the
  viewport members.
- Data properties (name; status and the viewport members before 27;
  interface objects, Image, Option, Audio, console, webkitURL,
  HTMLDocument, WebSocket) give the derived object its own property in
  every version.

warpdom before: self replaced the window's member in every profile (jsdom
21 to 26 with runScripts give the derived object its own); on 27+ the
viewport setters gave the derived object its own (jsdom replaces the
window's) and status's setter and getter threw on another object; the
members warpdom makes on first read (interface objects, Image, Option,
Audio, console, webkitURL, HTMLDocument, WebSocket) replaced the window's
member where jsdom's data properties give the derived object its own. Now:
- self's setter: unchanged, it replaces the window's self whatever this
  is (window.js defineSelfMembers). The first version of this branch had
  it define the receiver's own property, before 27, when the receiver
  inherits from the window; Copilot's review on #96 noted that jsdom's
  setter called that way (`Object.getOwnPropertyDescriptor(window,
  'self').set.call(Object.create(window), 7)`) replaces the window's self.
  Measured on 21.1.2 and 26.1.0, with and without runScripts: explicit
  calls (on a derived object, on an object further down the chain)
  replace the window's self in both; `Object.create(window).self = 7` and
  `Reflect.set(window, 'self', 9, {})` give the receiver its own data
  property with runScripts (the VM context's global, not the setter) and
  replace the window's self without. A setter cannot tell such an
  assignment from a call, so warpdom's window (not a VM global) matches
  jsdom's window made without runScripts; warpdom's global in Jest and
  Vitest's VM pools is a VM global and matches it with runScripts.
- From 27 the viewport setters and status's getter and setter are made per
  window and act on it whatever this is (window-features.js
  defineWindowAccessors).
- The lazy members' setters give an object that inherits from the window
  its own property (writable, enumerable, configurable) and leave the
  window's (internal.js lazyDataSetter, assignThrough). Copilot's review
  of 4cc1bc8 on #96: they defined that property whatever the receiver
  already had. Now they follow OrdinarySet's receiver step, as the data
  property does (`super.Image = 7` from a method of an object inheriting
  from the window, called on the receiver; black box, jsdom 20.0.3,
  26.1.0, 30.1.3, matched cold and materialized): an own writable data
  property gets the value and keeps its flags (also non-configurable), a
  read-only or accessor own property or a new property on a
  non-extensible receiver throws a TypeError, without calling the own
  setter.
- The viewport loops (window-features.js setupWindowData,
  defineWindowAccessors) iterate the table's own keys: with an enumerable
  Object.prototype key (`Object.prototype.extra = 1`) for...in made 27+
  window creation throw ("Getter must be a function: 1") and gave earlier
  windows an own extra member (Copilot's review of 4cc1bc8 on #96).
- Jest and Vitest's VM pools: no code change. The global's setters already
  replace the global's member whatever this is, as jsdom's; an assignment
  through an object that inherits from the global never reaches them, as
  warpdom's global is a contextified VM global (V8 gives the derived
  object its own property), which matches jsdom up to 26. Vitest's forks
  and threads pools match jsdom too (Node's global with Vitest-style
  copies).

Left as they are:
- jsdom 21 to 26 windows made with runScripts, outside a test environment
  (warpdom's createWindow): `Object.create(window).self = 7` gives the
  derived object its own self in jsdom, and replaces the window's self in
  warpdom (see above; matching both it and the setter's explicit calls
  needs a window that is a VM context's global).
- From jsdom 27, in Jest and Vitest's VM pools, `Object.create(window).self
  = 7` (also parent, status, the viewport members) replaces jsdom's global
  member; warpdom's contextified global gives the derived object its own.
  Matching it needs a global that is not contextified (node:vm
  DONT_CONTEXTIFY; jsdom 27's VM context is the window itself), which may
  also cover the getter-only assignment difference listed under #87
  (performance: 27+ throw). A follow-up, not small.
- Lazy members, a failed assignment through a receiver (read-only or
  accessor own property, non-extensible receiver) while the member is
  still made on first read: a setter cannot return false, so it throws a
  TypeError, as strict code does with the data property; sloppy code
  silently ignores it and Reflect.set returns false once the member is
  materialized (and in jsdom), and both get the TypeError while it is
  cold. Matching that needs the members to be data properties from the
  start. Test files are ES modules (strict), and the case needs a
  read-only or accessor own property on an object inheriting from the
  window, reached through super or Reflect.set.
- jsdom 20 windows with runScripts let a derived object have its own self
  (getter only); warpdom's 20 profile throws in strict code, as a jsdom 20
  window without runScripts does.
- parent, frames, length, external, origin, event, the bars and screen are
  Window.prototype members in warpdom (see #87's notes): an assignment
  through a derived object gives it its own property where warpdom has a
  setter (external, origin, event; jsdom 27+ replaces the window's) and
  throws in strict code where it has none (jsdom 21 to 26 with runScripts
  give the derived object its own).

Tests: window-features.test.js (receiver cases for Image,
MutationObserver, console and webkitURL, cold and materialized, parity on
jsdom 20, 26, 30; window creation on 26.1.0 and 30.1.3 with
Object.prototype.extra; parity on jsdom 20, 22, 26, 27, 30:
assignments through a derived object for self, name, status, the viewport
members and the lazy members, assigned while still made on first read,
the setters called on another object and on a derived object, status's
getter on another object; self's derived assignment on 22 and 26 against
windows made without runScripts; per-profile results at 20.0.3, 21.0.0,
26.1.0, 27.0.0, 30.1.3), jest-environment.test.js (20.0.3, 26.1.0,
30.1.3: derived assignments to self, parent, innerWidth, status, name,
Image, MutationObserver, and the global's setters called on another
object; expectations measured on jsdom's VM context), fixtures/vitest-viewport
(derived assignments in every pool, with warpdom and real jsdom).

Bench (Node 22.17.1, bench:load, two runs each, main -> branch): cold load
23.1/23.0 -> 22.8/23.1 ms, first window 1.96/1.98 -> 2.00/2.00 ms, next
windows 0.193/0.197 -> 0.197/0.199 ms (the 13 viewport setters and
status's accessor are made per window on 27+ profiles); within noise.

## 2026-10-21: road to 1.0, stability and security policy (branch docs/road-to-1.0)

Two maintainers declined adoption PRs because warpdom is pre-1.0 and has
little traction yet, so 1.0 gets a public, checkable definition:

- [docs/road-to-1.0.md](docs/road-to-1.0.md): what 1.0 promises (jsdom's
  results, no breaking upgrades within 1.x, compare and migrate to check
  and switch back), the public API the promise covers, and 7 criteria with
  how each is checked and its status. Mapping to the milestones: criteria
  1-4 are M1's exit (API superset test with KNOWN limited to documented
  differences, parity issues closed or documented, the corpus check on 25+
  suites, WPT gaps with issues); 5-7 are M6's release and security parts
  (public API frozen and typed, 3 minor releases and 6 weeks without a
  breaking change, docs complete). Adoption outside the corpus (M4) is a
  goal after 1.0, not a criterion (decided by Sonu 2026-10-21: maintainers
  wait for 1.0, so 1.0 must not wait for them). M2, M3 and M5 do not block 1.0; after 1.0, M3
  (modern APIs on by default) is a major release unless it stays opt-in or
  limited to new jsdom profiles.
- [docs/stability.md](docs/stability.md): 0.x vs semver from 1.0, what is
  and is not breaking (fixes toward jsdom's results are not; they are
  listed in the release notes with the corpus check), jsdom 20.0.3 to
  NEWEST_MODELED_JSDOM with the warning and upstream watch, Node 22.12+
  (CI 22.22 and 24), Vitest 2+ and Jest 27+, the deprecation process.
- [SECURITY.md](SECURITY.md): private reports through GitHub security
  advisories; fixes for the latest minor only. Private vulnerability
  reporting is enabled in the repository settings (since 2026-10-21).
- README: the status line links both docs; "warpdom models jsdom 20.0.3
  to 30.1.2" corrected to 30.1.3 (NEWEST_MODELED_JSDOM).

Status on 2026-10-21: met 3 (corpus check for 0.1.7); 5 and 7 nearly
(typed except the Vitest `url` option, missing from WarpdomVitestOptions;
setXPathLoader only in its type); not met 1 and 2 (KNOWN had 5 entries
under #70 and #71, none after fix/parity-70-71; open parity issues #51, #70, #71, #76, #84, #90, #97,
#98 and the audit #17), 4 (WPT run of 2026-10-19: html/semantics behind,
#51; domparsing 341 vs 342 subtests, no issue yet) and 6 (0.1.7 changed a
default). Proposed numbers to confirm on the PR: 25 suites, 3 releases
and 6 weeks, 4 weeks to model a new jsdom, deprecations kept 2 minor
releases and 3 months, security answer within 7 days.

## 2026-10-22: form and CSS rule shapes per jsdom version (branch fix/parity-70-71, #70, #71)

Black box (property descriptors, prototype chains, behavior) on jsdom
20.0.3, 21.1.2, 22.0.0, 22.1.0, 23.2.0, 24.0.0, 24.1.0, 24.1.3, 25.0.1,
26.0.0, 26.1.0, 27.0.0, 27.1.0, 27.2.0, 27.4.0, 28.0.0, 28.1.0, 29.1.1 and
30.1.3. The API superset test's KNOWN list is now empty: every walked
path jsdom has, warpdom has with the same kind, place and parent.

- **#70, forms.** HTMLFormControlsCollection, HTMLOptionsCollection and
  RadioNodeList have their own @@iterator in every version (jsdom: each
  Array.prototype.values; warpdom: the same function as HTMLCollection's
  and NodeList's). A form is iterable from 26.1.0, with form[i]
  (compat.formIndexed; 26.0.0 has neither); the form's descriptors are a
  variant. autofocus is an own member of HTMLButtonElement,
  HTMLInputElement, HTMLSelectElement and HTMLTextAreaElement, inputMode of
  HTMLInputElement and HTMLTextAreaElement, in every version; jsdom has
  neither on HTMLElement (warpdom keeps HTMLElement's for other elements)
  and reflects inputMode as written (input.inputMode is 'NUMERIC' for
  inputmode="NUMERIC"), so the own inputMode does too.
- **#70, CSS (29+).** CSSSupportsRule.matches: jsdom's evaluation,
  measured on 24 conditions: selector() false, custom properties false,
  !important accepted, a bare declaration false (CSS.supports differs on
  those; css.js supportsRuleMatches). CSSKeyframesRule's @@iterator is
  Array.prototype.values (keyframes are indexed properties).
  CSSStyleProperties already had its own @@iterator.
- **#71, CSS rules before 29 (compat.cssomShape).** The shape follows the
  CSSOM library each jsdom installs: before 27.1.0 cssom 0.5 and
  rrweb-cssom 0.6 (to 24.0.x), 0.7 (24.1.0 to 25.x), 0.8 (26.0.0 to
  27.0.x); 27.1.0 to 28.x @acemir/cssom. Before 27.1.0: CSSStyleRule
  extends CSSRule (no cssRules, insertRule); each rule interface's
  prototype has parentRule and parentStyleSheet (null), type and, for
  @media, @supports, @container and @layer blocks, cssRules ([]) as
  writable data properties, cssText an accessor; CSSConditionRule's
  conditionText and cssText are data (''); each rule has its own
  parentRule, parentStyleSheet, cssRules and (@supports) conditionText,
  as jsdom's do (set when the rule is made: only in those profiles, a
  WeakSet lookup per rule otherwise); deleting a rule resets its
  parentRule but keeps its parentStyleSheet; a style sheet has its own
  parentStyleSheet and CSSStyleSheet.prototype a data one and toString()
  (each rule's text and a line break). CSSStyleRule.parse(text) and the
  style rule cssText setter take the selector before the last complete
  block and every block's declarations (parse('garbage') has the empty
  selector and cssText ''); @import's cssText setter and @media's and
  @container's conditionText setters reparse. 27.1.0 to 28: type a
  read-only data property and cssText a getter on each rule interface
  (types: @container 17, @layer block 18, statements and @scope 0),
  CSSRule's constants and cssRule ('') on its prototype,
  CSSImportRule.prototype.parse (a function named value that reparses the
  rule), CSSKeyframesRule's own @@iterator and CSSStyleSheet toString().
  CSSRule's constants: UNKNOWN_RULE, DOCUMENT_RULE, VIEWPORT_RULE and
  REGION_STYLE_RULE before 29, CONTAINER_RULE and STARTING_STYLE_RULE from
  24.1.0, LAYER_BLOCK_RULE from 26.0.0 (as warpdom's other constants:
  read-only; jsdom's statics are writable). Descriptors per variant
  (window.js iface.variant/adjust), the parent per profile
  (iface.parentFor) and statics as a function of the compat object.
  Not modeled: jsdom before 29 serializes rules differently and cannot
  parse @container or @layer before 24.1/26.0; parse() on
  CSSNamespaceRule and CSSCounterStyleRule (27.1.0 to 28, not on jsdom's
  window); 26's CSSLayerBlockRule.layerNameText; old jsdom's rule.style
  being cssom's declaration object (color null when not set).
- Cost: none per node; sheet parsing 2,000 rules and window creation the
  same as main within noise (Node 22.23.3).

## 2026-10-24: style rules in document order before jsdom 28.1 (branch fix/document-order-cascade, #121)

Black box, on clean installs (one jsdom release per directory; see #138
for why the shared installs are not reliable for 27.1 to 28.1), 20.0.0 to
30.1.3:
- Before 28.1.0 (20.0.0 to 28.0.0) getComputedStyle applies the page's
  style rules in document order: specificity counts for nothing (`.a.b >
  td { color: red } td { color: blue }` gives blue; from 28.1.0 red), and
  so does !important in a rule (`td { color: blue !important } .a.b > td {
  color: red }` gives red; the style attribute's color wins over a rule's
  !important one). The boundary is 28.0.0/28.1.0, not 27.4/28.0.
- The style attribute wins over all rules, its own !important or not.
- The user agent sheet is under every rule: `* { display: inline }` makes
  a div inline, and any display rule shows an element with the hidden
  attribute (`div { display: block }`). From 28.1.0 the user agent rules
  cascade with the page's by specificity (#136, not modeled).
- Rules in `@media screen` apply at their place in the order; `@media all`
  and an empty list do not apply before 29.0.0 (warpdom applied them from
  27); @supports and @layer never.
- Shorthands and longhands, and the pending longhands of a var()
  shorthand (#118), meet by order like everything else: the later
  declaration wins (`.a.b > td { padding: 1px } td { padding-top: 2px }`
  gives 2px, the reverse 1px; `.a.b > td { padding-bottom: 7px } td {
  padding: var(--p) }` leaves padding-bottom pending, '').
- Ties: same as in later releases (the later rule).
- The sheets in document.styleSheets order, which before 30.1.2 (20.0.0
  to 30.0.1) is the order the sheets were created in, not tree order: a
  `<style>` inserted before another, or one whose text changes (even to the
  same text, or a text node appended), comes last; moving one (remove and
  insert) too; insertRule and the media attribute do not. That also
  decides ties in 28.1 to 30.0.1. `<link rel=stylesheet>` sheets (with
  resources: 'usable') come in when loaded, after the style elements, before
  30.1.2; warpdom loads none. No release has adoptedStyleSheets.

Implemented as compat.documentOrder (before 28.1.0: the rule index is
sorted by order alone and every rule declaration is normal; the hidden
attribute's display: none comes with the user agent sheet, under the
rules) and compat.sheetsByCreation (before 30.1.2: internal.js stamps a
style element when it is inserted into a document and when a text child
is inserted, removed or its data set, to the same data too, but not for a
comment or an element child; documentStyleSheets sorts by that). In every
release those make a new sheet from the element's text, without the old
sheet's CSSOM edits (a moved style element too, which warpdom kept
before; review on #139). The 'latest'
mode of compat.pendingByOrder is gone (document order covers it), and
mediaApplies applies all/empty lists from 29. The newer profiles' hot path
is unchanged: one tag test per inserted element and per child change of a
parent.

Measurement matrix (145 cases x 18 releases, scratchpad m121): 579
case-release differences fixed, none added; differences left are #136,
#137, #113's in-order block model and older pre-existing ones.

## 2026-10-24: each jsdom alias loads its own cssstyle (branch fix/jsdom-alias-cssstyle, #138)

- Problem: jsdom 27.1.0 to 28.1.0 parse style sheets with @acemir/cssom,
  which requires cssstyle without declaring it. In the devDependency tree
  one @acemir/cssom was hoisted to the root and resolved the root cssstyle
  (4.6.0, for jsdom23/24/26), so jsdom27 (27.4.0) and jsdom28 (28.1.0)
  loaded two cssstyles: their own for the style attribute and 4.6.0 for
  sheets. A single-jsdom install loads one: 5.3.7 for 27.1.x to 28.0.x,
  6.2.0 for 28.1.0 (checked through require.cache after a window parses a
  sheet, scratchpad/jsdoms-clean). The shared scratch install (jsdoms,
  cssstyle 2.3.0 at the root) was worse: sheets dropped var() and CSS-wide
  keyword declarations for 27.1 to 28.1.
- Fix: a root devDependency "@acemir/cssom":
  "file:test/fixtures/acemir-cssom-slot" (an empty private package) holds
  the root slot, so npm nests the real @acemir/cssom under jsdom27 and
  jsdom28, where it resolves that jsdom's cssstyle exactly as jsdom does.
  Chosen over npm overrides (an override replaces a version on an existing
  edge; @acemir/cssom has no cssstyle edge to override, and one shared copy
  serves both aliases), nested per-version installs (an extra install step
  and cache in CI, imports by path in the tests) and a resolution shim (one
  module instance is shared by both aliases, so a shim cannot give each its
  own cssstyle). No CI change: npm ci installs the link. The guard test
  (jsdom-api-superset.test.js) checks in a process per alias that only the
  alias's own cssstyle is loaded once a sheet is parsed.
- Re-run: one parity test changed result, "shorthands with var(), per
  version (jsdom 28)": jsdom 28.1.0 with its own cssstyle gives padding 1px
  for .i { padding: 1px !important } .j { padding: var(--p) !important }.
  Black box (clean installs of 26.1.0 to 30.1.3): from 27.1.0 to 29.1.1 a
  declaration with var() in a style rule loses its !important (rule
  cssText "padding: var(--p);", priority ''), custom properties keep it;
  the cascade shows it from 28.1.0 (before, rules apply in document order,
  #139). warpdom: compat.varDropsImportant (28.1.0 to 29.1.1) makes such
  declarations normal in the rule index; it replaces the two jsdom 29
  special cases ("an !important shorthand with var() does not override
  another !important one"). Checked on 12 cascade cases on 27.4.0, 28.0.0,
  28.1.0, 29.0.0, 29.1.1 and 30.1.3.
- The parity scenarios for 27 and 28 were also run against clean installs
  of 27.0.1, 27.1.0, 27.2.0, 27.3.0, 27.4.0, 28.0.0 and 28.1.0 with each
  release's own profile: 28.0.0 still lets tests write to computed styles
  (28.1.0 throws); compat.mutableComputedStyle is now before 28.1.0 (was
  before 28). The document-order boundary of #139 (28.1.0) and the
  parity scenarios of #116, #118 and #132 pass on those clean installs.
- Not modeled (#141): the rule cssText and getPropertyPriority()
  of var() declarations from 27.1.0 to 29.1.1, and the style attribute's
  (from 27.0.0 a var() declaration loses !important there too; border:
  var(--b) !important is dropped to 28.1.0).


## 2026-10-26: lazy window members and receivers that are not the window (branch fix/98-lazy-setters, #98)

The setters of the members made on first read (interface objects, Image,
Option, Audio, console, webkitURL, HTMLDocument, WebSocket) handled only
the window and objects inheriting from it (isPrototypeOf): any other
receiver replaced the window's member while it was cold and got its own
property once materialized (`super.Image = 7` called on `{}`,
`Reflect.set(window, 'Image', 7, {})`), and isPrototypeOf called a
proxy's getPrototypeOf trap (a throwing trap failed cold, not
materialized).

Black box (jsdom 20.0.3, 21.1.2, 22.1.0, 23.2.0, 24.1.3, 25.0.1, 26.1.0,
27.4.0, 28.1.0, 29.1.1, 30.1.3 with runScripts; the same cold and
materialized in every version, console enumerable before 27): a plain
object, or a proxy over an object derived from the window with a throwing
getPrototypeOf trap, gets its own data property (writable, enumerable,
configurable) and the window keeps its member; a primitive or frozen
receiver fails (TypeError in strict code, Reflect.set false); a proxy over
the window is an alias: assigning through it (or Reflect.set with it as
receiver) replaces the window's member with a data property with the
member's flags, and the trap is not called.

Now the setter, with a receiver other than the window, makes the window's
member first (as a read does; only while the window's property is still
that accessor) and then does OrdinarySet's receiver step without looking
at the receiver's prototypes (internal.js lazyDataSetter, assignThrough).
A proxy over the window then shows the data property, so it gets the value
through its defineProperty trap with `{ value }` as in jsdom. The first
version of this branch instead gave a receiver whose own property was the
window's lazy accessor (matched by setter) a data property with the
accessor's flags; Copilot's review on #153 noted two differences between
cold and materialized there: a proxy whose getOwnPropertyDescriptor trap
takes the descriptor and then reads target[name] (making the member)
returned the accessor while the window's was already a data property, a
TypeError cold (jsdom 20.0.3 to 30.1.3 and warpdom materialized: the
window's member replaced, traps getOwnPropertyDescriptor then
defineProperty with { value }); and a copy of the cold accessor on another
object passed the check, so `super.Image = 7` called on it replaced the
copy cold but failed (TypeError) once the window's member was made, where
the engine finds the copy's accessor and does not call the setter. Now
both are the same cold and materialized: the trap case matches jsdom, and
a copy of a member's descriptor taken before its first read (an accessor;
jsdom's copy is a writable data property and gets the value) fails
assignment (TypeError, the copy kept) through super, Reflect.set or the
copy itself. The setter cannot tell an assignment to the copy from one
through the window, and the latter fails once the member is made, so this
is the only behavior the same before and after the read. Making the
member costs nothing at window creation: interface setters are inlined in
window.js (bench:load: next windows 0.211 to 0.215 ms base, 0.211 to 0.215
ms head, alternating rounds). Tests: window-features.test.js "from other
receivers" (with the reentrant trap; jsdom 20, 26, 30; also run on 22, 25,
27, 28, 29) and "a copy of a member made on first read", cold and
materialized.

Left as they are (setters cannot return false): Reflect.set with a
primitive, frozen or other failing receiver throws a TypeError where jsdom
returns false (as before for derived receivers, #96).
