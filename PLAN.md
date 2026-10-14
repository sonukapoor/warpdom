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

## Decisions

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
  Listed in the README's "Not implemented, unlike jsdom".

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
