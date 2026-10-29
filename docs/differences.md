# Differences from jsdom

warpdom matches jsdom's observable behavior where tests depend on it, and
otherwise follows the standards. This page lists where it differs. The
summary is in the README,
[Differences from jsdom](../README.md#differences-from-jsdom); what
changes between jsdom versions (and is followed, not a difference) is in
[jsdom-versions.md](jsdom-versions.md).

API by API, how warpdom, jsdom, happy-dom and linkedom each support the
web platform (behavior checks for commonly used APIs, existence of every
Web IDL interface and member) is on [DOMParity](https://domparity.github.io),
a separate reference site with the same method for every engine (maintained
by warpdom's author).

## Deliberate differences

Each has a test. The full list, with the reasons, is in
[PLAN.md](../PLAN.md), "Deliberate deviations from jsdom".

### That changed a test in the measured suites

Those that changed a test in the 25 measured suites:

| Area | warpdom | jsdom | Seen in |
| --- | --- | --- | --- |
| `DOMException` | An `Error` in the test's realm, as the standard says | In Vitest's default pools, not an `Error` in the test's realm | 1 svelte test |
| `CSSStyleSheet.ownerNode` | The owning element in the jsdom 27 and 28 profiles, as in jsdom 29 and later; the jsdom 20 to 26 profiles have no `ownerNode`, as those versions | Measured on each release: 27.0 has no `ownerNode`, 27.1 and 27.2 give `null`, and 27.3 to 28.1 an internal object that is not a Node | 1 tanstack-query test (jsdom 27.4) |
| Style-sheet parse errors | Not reported to the console | jsdom 16 cannot parse CSS nesting, drops such a sheet and reports "Could not parse CSS stylesheet" | 3 handsontable tests of its filter for that message (`jsdomThemeCssFilter.unit.js`) |

<!-- source: PLAN.md "Deliberate deviations from jsdom" (DOMException, svelte whitespace-at-block-start; ownerNode measured per release, tanstack-query PiPContext.test.tsx; handsontable jsdomThemeCssFilter.unit.js); docs/research/data/ci-2026-10-13-208ad49-RESULTS.md 7 (svelte 27 of 27 rounds, tanstack-query 17 of 17, handsontable 22 of 22) -->

### Events and focus

| Area | warpdom | jsdom |
| --- | --- | --- |
| `isTrusted` | An accessor on `Event.prototype` (much faster to create events) | An own property of every event |
| `tabindex="abc"` | The element's default tab index | 0 |
| A disabled `fieldset`, `optgroup` or `option` | Not focusable, also with a `tabindex` | Focuses one in every version |

Only interface-shape checks can tell the `isTrusted` difference.

### Standard behavior where jsdom deviates

warpdom follows the standard for:

- `FormData` and disabled options
- `formnovalidate`
- `Selection.containsNode`
- event handler re-registration order
- failed custom elements and `:defined`
- XPath functions jsdom's engine gets wrong
- namespaced attributes in selectors and `dataset`
- MutationObserver's transient observers and notification order
- directionality in shadow trees
- `document.write` across several calls
- `visibilityState` and cookies of documents without a browsing context
- CSSOM rule-list and `@page` rules
- XML serialization details
- `getElementsByName` (HTML elements only)
- a removed iframe's `contentWindow` (null)
- an iframe's `getSVGDocument()` (null; jsdom's throws a TypeError from
  inside jsdom)

### Additions jsdom lacks

- `innerText`/`outerText`
- `Selection.direction`
- Range `getClientRects()`/`getBoundingClientRect()` (empty)
- `ToggleEvent`
- `TouchList`
- `TimeRanges` on media elements
- element interfaces and reflected attributes from the current HTML
  standard (but `<search>`, `<selectedcontent>` and `<menuitem>` are
  `HTMLUnknownElement`, as in jsdom)

### Styles

Kept the same in every jsdom profile: `MediaList` normalization (jsdom
30's) and writable style indexed properties (jsdom 26's).

Style declarations: with cssstyle 5.3 and earlier (jsdom 20 to 28.0),
jsdom's `setProperty()`, `cssText` and the `style` attribute (and its
`getComputedStyle()`) also call the property setters, so a spied setter
sees them; warpdom's call it for assignments only (`style.width = ...`).

Not modeled:

- cssstyle's `length` setter and underscore members
- the accessor functions' names (`get width` from jsdom 29, `get` in
  warpdom)
- jsdom 29.0.0's internal classes behind `getComputedStyle()`
- a `CSSStyleRule`'s `style` without accessors before 27.1.0
- CSS Nesting: warpdom's style sheets keep only the declarations before a
  nested rule and drop the rule (`.a { color: red; & .b {} margin: 0 }`),
  so no `CSSNestedDeclarations` is made. jsdom 27.2 and 28 keep the nested
  rule and drop the later declarations; from 29 they also become a
  `CSSNestedDeclarations`
- `getComputedStyle().azimuth` with cssstyle 4.2 and 4.3 (`NaNdeg` for an
  angle, jsdom's is empty)

Computed values not modeled:

- the `font` shorthand composed from its longhands (jsdom's
  `getComputedStyle().font` and `el.style.font`)
- a shorthand followed by one of its longhands in a declaration block
  (jsdom stores the longhands: `margin: 1px 2px; margin-top: 3px` reads
  `3px 2px 1px`)
- `!important` in style sheets before jsdom 29 (jsdom ignores it there)
- jsdom 30's `calc()` mixing percentages and em (`calc(100% - 0px)`)
- the uppercase units and `calc()` simplification of declared values in
  jsdom 29 and 30

jsdom 27.1 and later parse style sheets with the cssstyle that
`@acemir/cssom` finds, so with an older cssstyle installed beside it
(such as Jest 29's 2.3.0) its sheets drop `Canvas` and `fit-content`;
warpdom follows the cssstyle jsdom itself installs.

### Platform objects

| Area | warpdom | jsdom |
| --- | --- | --- |
| `FileReader` | Also reads the platform's `Blob` (one from Node's `fetch` in Vitest) | Throws a TypeError |
| `TextDecoder` labels | Trims only ASCII whitespace from labels, as the Encoding standard says | Accepts labels with other whitespace or NUL around them |
| `TextDecoder` encodings | Decodes Big5, EUC-JP, EUC-KR, GBK, gb18030, ISO-2022-JP and Shift_JIS with the platform's decoders | Differs from the platform's decoders for a few byte sequences |
| `URL` | Parses with the platform's parser (Ada in Node), as `URL` does in Vitest's jsdom environment (WPT url/: warpdom 7,136 of 8,784 subtests) | whatwg-url; differs for some internationalized host names (IDNA) and opaque paths with trailing spaces (WPT url/: jsdom 6,394) |
| An iframe's `WebAssembly` | Its parent's (warpdom's frames share one realm) | The iframe's own when scripts run in the window (`runScripts`, as in Jest's and Vitest's jsdom environments); without, both are Node's |
| `WebSocket` | The platform's (Node's, from Node 22), as `URL` is Node's under Vitest. Its sockets and events are Node's, not the window's: `event instanceof window.MessageEvent` and `socket instanceof window.EventTarget` are false, and its errors are Node's. Without a platform `WebSocket` the window has none | Its own |

The window's `WebSocket` and the global's are the same object in Vitest
and Jest, and tests replace it as on jsdom (`window.WebSocket = Mock`,
`vi.stubGlobal`).

<!-- source: PLAN.md "Deliberate deviations from jsdom" -->

## Not implemented

jsdom lacks these too: layout (sizes and positions are 0, as in jsdom),
`inert`, loading external style sheets, scripts or pages, navigation to
other documents.

## Results that change for other reasons

In the measured suites, these tests change result for reasons other than
a deliberate difference:

| Project | Tests | Result | Cause |
| --- | --- | --- | --- |
| ariakit | 7 | Fail on jsdom and pass on warpdom, in every round | They fail on jsdom. They count as differences because the goal is jsdom's results |
| ark-ui | Toast and NumberInput `largeStep` tests | Fail on jsdom and pass on warpdom, in some rounds | As ariakit |
| melt-ui | A Context Menu test | Fails on warpdom in some rounds (7 of 17) | Speed-sensitive. It stubs `requestAnimationFrame` with a 16 ms timer, and warpdom finishes a Svelte transition sooner. A Dropdown Menu test of the same kind fails on jsdom too now and then; for the Context Menu test the cause is inferred from that one, not shown |
| solid | Its transition test | On CI, failed on warpdom in 24 of 27 rounds and never on jsdom | Order dependence. solid's suite shares module state between files (`isolate: false`). The test fails whenever `suspense.spec` ran before it in the same worker without `external-source.spec` in between, on jsdom and on warpdom: in all 32 such runs, and it passed in all 98 others. On CI the harness gave solid's files with an `@vitest-environment` comment another environment name than the config on warpdom only, which put them in a separate group (see [Setup](../README.md#setup)) |
| solid-primitives | 4 timer tests | Time out in 4 of 17 rounds | Order dependence. One of its files leaves fake timers on; the timer tests that run after it in the same worker time out, on jsdom too when forced into that order. On CI that order occurred only under warpdom |

<!-- source: docs/research/data/ci-2026-10-13-208ad49-RESULTS.md 7 (ariakit 23 of 23 rounds; ark-ui largeStep 10 of 27, Toast 25 of 27; melt-ui Context Menu 7 of 17, speed-sensitive by analogy; solid-primitives 4 of 17, forced order fails on jsdom too, held-out/local-2026-10-12-solid-primitives-order/; slow order warpdom-only on CI); ci-2026-10-13-208ad49-correctness-jsdom-learned.tsv (melt-ui Dropdown Menu 2 of 5 rounds on jsdom); docs/research/data/investigations/solid-transition/README.md (solid: 24 of 27 rounds; 130 runs, 32 failed, 98 passed; environment groups) -->

## XMLHttpRequest

`XMLHttpRequest` makes its requests with the host's `fetch`, which decides
these differences from jsdom:

| Behavior | warpdom | jsdom |
| --- | --- | --- |
| `getAllResponseHeaders()` | The headers sorted by name, with repeated headers combined into one line. `getResponseHeader()` is the same | In the order received, and from jsdom 28 each repeated header on its own line |
| Upload progress | Not measured: the upload's `progress`, `load` and `loadend` events report the whole body when the response's headers arrive | The same |
| Synchronous requests (`open(method, url, false)`) | Throw a `NotSupportedError` at `send()` | Runs them in a child process |
| Cookies | Neither sent nor stored | Shares its cookie jar with `document.cookie`: a response's `Set-Cookie` shows up in `document.cookie`, and requests send the document's cookies |
| `file:` URLs | Fail with a network error | Reads the file |
| `Sec-Fetch-Mode` header | Requests carry fetch's | Not sent |
| A `DataView` body | Sent | jsdom 28 and later send none |
| The method `patch` in lowercase | Sent as is, and makes Node print a warning once | Sent as is |
| `Referer` from an `about:blank` iframe | None | `about:blank` |
| `Referer` and the page URL's credentials or fragment | Never carried, as Referrer Policy says | Sends the document's URL with both, and before 28 sends a redirected request's previous URL as requested |
| Redirects, where the host's `fetch` hides them (in a browser, `redirect: 'manual'` gives an opaque redirect) | The host follows them with its own checks and only the final response gets jsdom's; the first redirected request is sent a second time to find this out. Node, Deno and Bun expose redirects | — |
| Cross-origin requests on browser hosts | Not supported yet: a browser's `fetch` hides the CORS headers warpdom checks, so allowed cross-origin responses fail ([#91](https://github.com/sonukapoor/warpdom/issues/91)). Requests never carry the host's own cookies (`credentials: 'omit'`) | — |
| A redirect that fails its CORS check | A network error | Before 28, fires `error` and then goes on to follow the redirect and fire `load` |
| A request stopped (`abort()`, `open()`) in an upload `progress` or `load` handler | Fires nothing more | Goes on with the upload's remaining `load` and `loadend`, and from 28 fires `readystatechange` (readyState 2) at the stopped or reopened request |
| Network errors | warpdom's test environments report them where they report "Not implemented" messages, in jsdom's words for CORS failures and with fetch's for others | jsdom 20 to 26 report them on the virtual console |
