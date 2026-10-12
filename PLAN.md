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
  import; medians of 7 alternating runs against main 6c3e472, Node
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
- **2026-10-11: First full WPT run** (wpt/, WPT 87b5d13099, warpdom fc9d262;
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
