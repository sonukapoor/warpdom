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
| `new TouchEvent(type, { touches })` ([#208](https://github.com/sonukapoor/warpdom/issues/208)) | Takes a string as the touch list (one touch per character); for an array-like without an iterator, throws a TypeError with its own message | Throws a TypeError for a string |
| `document.createEvent('BeforeUnloadEvent')`, jsdom 20 to 26 ([#208](https://github.com/sonukapoor/warpdom/issues/208)) | Creates the event | Throws a `NotSupportedError` |

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
- `TimeRanges` on media elements
- element interfaces and reflected attributes from the current HTML
  standard (but `<search>`, `<selectedcontent>` and `<menuitem>` are
  `HTMLUnknownElement`, as in jsdom)

The globals of interfaces jsdom does not expose (`ToggleEvent`,
`TimeRanges`, `FormDataEvent`, `CSSMarginRule`, `CSSPageDescriptors`, and
in earlier profiles the CSS rule interfaces, `DOMRect`, `BeforeUnloadEvent`
and `QuotaExceededError`) are left out by default, so code that
feature-detects them takes jsdom's path; their objects exist. The option
`beyondJsdom: true` adds the globals
([jsdom-versions.md](jsdom-versions.md#globals-that-appear-in-a-later-jsdom)).

### Styles

Kept the same in every jsdom profile: `MediaList` normalization (jsdom
30's) and writable style indexed properties (jsdom 26's).

Style declarations: with cssstyle 5.3 and earlier (jsdom 20 to 28.0),
jsdom's `setProperty()`, `cssText` and the `style` attribute (and its
`getComputedStyle()`) also call the property setters, so a spied setter
sees them; warpdom's call it for assignments only (`style.width = ...`).

Not modeled:

- cssstyle's `length` setter and underscore members
- in a style rule's `style` (jsdom 27.1 and later), margin and padding as
  jsdom keeps them: a longhand after its shorthand stays beside it
  (`margin: 1px 2px; margin-top: 3px`, jsdom `margin: 3px 2px 1px`), and
  `padding: 2px` has `length` 1 (jsdom 5). Inline styles have jsdom's
  model in every profile
- `setProperty()` with a value the property rejects: jsdom 20 to 29 still
  set the priority given (`setProperty('color', 'bogus', 'important')`
  after `color: red` gives `color: red !important`; without a priority it
  drops the `!important`). jsdom 20 to 26 also write the style attribute
  before `setProperty()` sets the priority, so the attribute shows
  `color: red;` where `cssText` has `color: red !important;`
- the accessor functions' names (`get width` from jsdom 29, `get` in
  warpdom)
- jsdom 29.0.0's internal classes behind `getComputedStyle()`
- before 27.1.0, of a `CSSStyleRule`'s cssom `style` object (modeled
  otherwise, see jsdom-versions.md): `style` and `selectorText` are
  prototype accessors (jsdom: the rule's own data properties, so
  `rule.style = 'x'` there replaces the object with the string), its
  `__starts` member, `expression()` values, and the rules cssom parses from
  text after a `}` in its `cssText` setter (only the `Unexpected }` error
  is), an empty value (`setProperty('color', '')`) removing the
  property as earlier matching rules declare it too (jsdom's cascade
  keeps one cssstyle declaration for all of them; warpdom's rule only
  stops declaring it;
  [#252](https://github.com/sonukapoor/warpdom/issues/252)), and a
  declaration named `length`, after which jsdom loses the rule's other
  declarations (`.a { length: bogus; color: red }` computes no color;
  [#253](https://github.com/sonukapoor/warpdom/issues/253)). Grouping
  rules, `@font-face` and keyframe rules keep warpdom's serialization and
  style objects (cssom: `@media screen {.a {color:
  red;}}`)
- CSS Nesting: warpdom's style sheets keep only the declarations before a
  nested rule and drop the rule (`.a { color: red; & .b {} margin: 0 }`),
  so no `CSSNestedDeclarations` is made. jsdom 27.2 and 28 keep the nested
  rule and drop the later declarations; from 29 they also become a
  `CSSNestedDeclarations`
- `getComputedStyle().azimuth` with cssstyle 4.2 and 4.3 (`NaNdeg` for an
  angle, jsdom's is empty)
- a shorthand followed by one of its longhands in a declaration
  ([#104](https://github.com/sonukapoor/warpdom/issues/104)): jsdom
  merges the longhand into the shorthand, and warpdom keeps both
  declarations. After `style.margin = '0'; style.marginTop = '4px'`,
  jsdom's `cssText` is `margin: 4px 0px 0px 0px;` before 27 and
  `margin: 4px 0px 0px;` from 27, and warpdom's is
  `margin: 0px; margin-top: 4px;`; computed values match. In the `style`
  attribute and `cssText`, jsdom 20 to 26 merge the same way, and jsdom 27
  and later drop the longhand (`margin: 0; margin-top: 4px` gives
  `margin: 0px;`, and `margin-top` computes to `0px`, where warpdom's is
  `4px`)
- writes to the `getComputedStyle()` object
  ([#97](https://github.com/sonukapoor/warpdom/issues/97)): before jsdom
  28.1.0 it takes them like `el.style`, as warpdom does; from 28.1.0,
  jsdom throws a `NoModificationAllowedError` for a longhand write such as
  `cs.marginTop = '3px'`, where warpdom stores it. In jsdom 20 to 30 a
  shorthand written there (`cs.font = '20px Arial'`, `cs.margin`) is
  taken and sets its longhands (`cs.fontSize`); warpdom stores the
  shorthand only. The object's `cssText` and `length` are `''` and 0 in
  warpdom; jsdom lists the resolved values (`cssText` only before 28.1.0)
- uppercase units ([#97](https://github.com/sonukapoor/warpdom/issues/97)):
  jsdom 20 to 25 (cssstyle 4.1 and earlier) drop `width: 5PX`, and from 26
  jsdom lowercases it to `5px`; warpdom keeps `5PX`
- the case of keywords
  ([#187](https://github.com/sonukapoor/warpdom/issues/187)): jsdom 27
  to 30 lowercase keyword values such as `display: BLOCK` (`block`),
  `position` and `visibility`, and jsdom 27 to 28.0.0 `color-scheme`
  too, in `el.style` and computed values; warpdom keeps the case as
  written, as jsdom 20 to 26 do, and jsdom 28.1.0 and later for
  `color-scheme`
- functions in box shorthands
  ([#112](https://github.com/sonukapoor/warpdom/issues/112)): from jsdom
  27, jsdom writes repeated sides once
  (`padding: calc(100% - 2px) calc(100% - 2px)` reads
  `calc(100% - 2px)`); jsdom 20 to 25 (cssstyle 4.1 and earlier) and 27 to
  29 drop `padding: min(10%, 2px) min(10%, 2px) min(10%, 2px)`, which
  jsdom 30 shortens to `min(10%, 2px)`; and jsdom 26 with cssstyle 4.3.1
  drops `padding: calc(10% + var(--a)) calc(10% + var(--a))`. warpdom
  keeps them as written
- the order of declarations within one style rule, jsdom 27.1.0 and
  later
  ([#113](https://github.com/sonukapoor/warpdom/issues/113),
  [#147](https://github.com/sonukapoor/warpdom/issues/147)): jsdom applies
  them in order, as in the `style` attribute, so
  `color: red !important; color: blue` computes to blue, and in
  `padding-top: 1px; padding: var(--p); padding-top: 4px` the last
  `padding-top` gives `4px`. warpdom gives red, and not `4px` (its 27.0
  profile matches jsdom 27.0.1: blue, and `''`)
- `!important !important`
  ([#147](https://github.com/sonukapoor/warpdom/issues/147)): jsdom 20 to
  26 keep the declaration as `!important`; warpdom drops it, as jsdom 27
  and later do
- `color: red !important; color: var(--c) !important` in the `style`
  attribute ([#147](https://github.com/sonukapoor/warpdom/issues/147)):
  jsdom 27 and later keep `color: red !important`, where warpdom keeps
  `color: var(--c)` (with `!important` only in the jsdom 30 profile);
  jsdom 20 to 25 drop both, where warpdom keeps the first
- an `!important` `border-color` rule against an inline
  `border-top-color`, jsdom 28.1.0 to 30.1.0
  ([#147](https://github.com/sonukapoor/warpdom/issues/147)):
  `div { border-color: blue !important }` with
  `style="border-top-color: red"` computes red in jsdom and blue in
  warpdom (as in jsdom 30.1.1 and later). jsdom 28.0.0 and earlier give
  red, as warpdom does
- color functions, from jsdom 26
  ([#224](https://github.com/sonukapoor/warpdom/issues/224)): jsdom
  rejects `rgb(foo)` and a `color-mix()` with an invalid or system color
  (`color-mix(in srgb, foo, red)`, `color-mix(in srgb, CanvasText, red)`);
  warpdom keeps them. jsdom normalizes `color()` and `color-mix()` values
  when they are set: `color(srgb 1 0 0/0.5)` gives
  `color(srgb 1 0 0 / 0.5)`, percentages become numbers, an alpha above 1
  is dropped, `xyz` becomes `xyz-d65`, `calc()` is evaluated, color names
  are lowercased, and a `50%` weight is dropped (jsdom 30.1.3 adds `50%`
  to the other color instead); warpdom keeps them as written. Setting a
  `color-mix()` nested 3 deep throws a TypeError in jsdom 26 to 30.0,
  where warpdom computes it, and jsdom 30.1.2 rounds a mix nested 7 deep
  differently (`0.99219`, warpdom's `0.992188`, as in 30.1.3)
- `url()` edge cases
  ([#234](https://github.com/sonukapoor/warpdom/issues/234)): with
  cssstyle 4.1 and earlier (jsdom 20 to 25), jsdom drops
  `background-image: url(a\(x\).png)` (two escaped parentheses); jsdom
  30.1's `setProperty` turns a trailing backslash after `var()` into
  U+FFFD (`var(--a) url(a\`); and jsdom 26 with cssstyle 4.4.0 drops every
  `background-image` with `var()`. warpdom keeps all three
- backslash escapes outside strings in style sheets
  ([#148](https://github.com/sonukapoor/warpdom/issues/148)): after
  `.a\{`, `.a\(b` or `content: \}`, warpdom misparses the sheet: a
  rule can end early or swallow the rules that follow.
  jsdom 27 and later keep the rules that follow; jsdom 20 to 26 keep them
  or leave out the whole sheet ("Could not parse CSS stylesheet")
- an unclosed parenthesis in a custom property value in a style sheet
  ([#253](https://github.com/sonukapoor/warpdom/issues/253)): with
  `.a { --x: foo( } .b { color: red }`, jsdom 20 to 28 keep no rules, and
  jsdom 29 and later read the rest of the sheet into `--x`; warpdom ends
  the value at the `}` and keeps both rules
- `@supports` ([#148](https://github.com/sonukapoor/warpdom/issues/148)):
  jsdom 29 and later keep comments in `conditionText`, and jsdom 27 and 28
  rewrite the spaces around `and` (`(a)and (b)` becomes `(a) and (b)`);
  warpdom keeps the text as written, without comments. jsdom 30's
  `CSS.supports()` gives false for every `selector(...)` and true for
  values with comments or escaped quotes; warpdom evaluates selectors and
  gives false for those values
- before jsdom 29 ([#148](https://github.com/sonukapoor/warpdom/issues/148),
  [#208](https://github.com/sonukapoor/warpdom/issues/208)):
  `sheet.cssRules` is an array (`Array.isArray` is true, and `push()`
  works), and rule objects stringify as `[object Object]`. An `@import`
  rule's sheet has no `ownerRule` (`undefined` before 27, `null` in 27 and
  28) and a `media` list of its own. jsdom 22 to 26 give `undefined` for
  the `ownerRule`, `media` and `disabled` of the sheet made for a rule
  inserted into a grouping rule (warpdom: `null`, `null` and `false`), and
  jsdom 20 throws there
- keyframes rules before jsdom 29
  ([#208](https://github.com/sonukapoor/warpdom/issues/208)): `keyText`
  keeps `from` and `to` as written (`FROM`; warpdom: `0%` and `100%`), and
  `cssText` spans several lines. In jsdom 20 to 26, `@page` is a
  `CSSStyleRule`, and `CSSKeyframesRule` has no `length`, indices,
  `findRule` or `appendRule`. In jsdom 27 and 28, `appendRule('bogus')`
  throws a `SyntaxError` (warpdom ignores it), and `findRule()` also finds
  plain objects assigned to `cssRules`. From 27, `deleteRule()` removes the
  first of duplicate keyframes; warpdom removes the last
- jsdom 29 and 30 ([#148](https://github.com/sonukapoor/warpdom/issues/148)):
  a style rule's `cssText` has only a getter, so assigning it throws in
  strict mode; warpdom ignores the assignment. In jsdom 29.1.1, the rules
  in an `@media` rule inserted into another grouping rule get another
  `parentStyleSheet`

Computed values not modeled:

- the `font` shorthand composed from its longhands (jsdom's
  `getComputedStyle().font` and `el.style.font`)
- jsdom 30.1's `calc()` mixing percentages and em
  (`calc(100% - 1em)` computes to `calc(100% - 16px)`; warpdom keeps
  `1em`)
- math functions with number arguments
  ([#111](https://github.com/sonukapoor/warpdom/issues/111)): jsdom
  simplifies them in declared values (in `el.style` and the `style`
  attribute from 26, in style rules from 27: `calc(1em * min(2, 3))` gives
  `calc(2em)`, and `min(2, 3)` gives `calc(2)`), and jsdom 20 to 25
  (cssstyle 4.1 and earlier) drop them from `el.style` and computed
  values. Computed, jsdom 26 to 29 give the
  simplified value, and jsdom 30.1 resolves a unitless `min(2, 3)` width
  to `2px` (30.1.2) or `2` (30.1.3). warpdom keeps `min(2, 3)` as written
- `var()` in box shorthands
  ([#106](https://github.com/sonukapoor/warpdom/issues/106)): jsdom 30.1.3
  computes `margin` to `''` when `margin-top` is `var(--p)` (warpdom gives
  `var(--p) 0 0`, as jsdom 29.1.1, 30.0 and 30.1.2 do), and jsdom 26 with
  cssstyle 4.3.1 computes `padding: 1px var(--p)` to `''` (warpdom gives
  `1px var(--p)`, as with cssstyle 4.4.0 and 4.6.0)
- `calc()` in color channels, jsdom 26 and later
  ([#112](https://github.com/sonukapoor/warpdom/issues/112)):
  `hsl(calc(120 + 0), 100%, 50%)` computes to `rgb(0, 255, 0)`; warpdom
  keeps it as written
- jsdom 29.1.1: a `<dialog>`'s top, right and bottom border colors are
  `rgb(0, 0, 0)` whatever its `color`
  ([#187](https://github.com/sonukapoor/warpdom/issues/187))
- jsdom 29.0.2 to 29.1.1: a `border` or `border-color` shorthand in a
  style sheet that gives the color as `currentcolor`, by omitting it or
  through `initial`, computes to the parent's color instead of the
  element's own when the element's own `color` comes from its `style`
  attribute (or `el.style`), and children that inherit the border color
  get that color ([#199](https://github.com/sonukapoor/warpdom/issues/199)).
  With `<div style="color: blue"><p style="color: red">` and
  `p { border: 1px solid }`, the `p`'s `border-top-color` is
  `rgb(0, 0, 255)`; warpdom gives the element's own color, as jsdom 30
  does. When the element's `color` comes from a style sheet
  (`p { color: red; border: 1px solid }`), or the shorthand is in the
  `style` attribute too, jsdom gives the element's own color, as warpdom
  does

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
| Window members made on first read, such as `Image` and `Option` ([#229](https://github.com/sonukapoor/warpdom/issues/229)) | Accessors, also after `Object.defineProperty(window, name, { configurable: false })` before the first read. `{ writable: false }` before the first read leaves the value undefined. On a frozen window, a sloppy-mode assignment throws | Data properties. From 27, `{ writable: false }` keeps the value. On a frozen window (27 and later), a sloppy-mode assignment fails silently |
| Such a member once locked, written through a proxy or another object ([#229](https://github.com/sonukapoor/warpdom/issues/229)) | A copy of its accessor on another object writes the window's member, and a proxy whose `defineProperty` trap rejects `{ value }` but accepts the empty descriptor warpdom then defines doesn't stop the write (`Reflect.set` gives true); a trap that rejects both makes the write throw a TypeError | Neither changes the window's member; `Reflect.set` through that proxy gives false |
| `Reflect.set(window, name, value, receiver)` for such a member, with a receiver that can't take the property (a primitive, a frozen object) ([#146](https://github.com/sonukapoor/warpdom/issues/146)) | Throws a TypeError | Returns false |
| `Object.seal`, `Object.freeze` and `Object.preventExtensions` of the window, jsdom 20 to 26 ([#229](https://github.com/sonukapoor/warpdom/issues/229)) | Allowed | Throw a TypeError |
| `WebSocket` | The platform's (Node's, from Node 22), as `URL` is Node's under Vitest. Its sockets and events are Node's, not the window's: `event instanceof window.MessageEvent` and `socket instanceof window.EventTarget` are false, and its errors are Node's. Without a platform `WebSocket` the window has none | Its own |

The window's `WebSocket` and the global's are the same object in Vitest
and Jest, and tests replace it as on jsdom (`window.WebSocket = Mock`,
`vi.stubGlobal`).

<!-- source: PLAN.md "Deliberate deviations from jsdom" -->

## Not implemented

jsdom lacks these too: layout (sizes and positions are 0, as in jsdom),
`inert`, navigation to other documents.

warpdom only: loading external style sheets, scripts or pages. jsdom loads
them when configured to (`resources: 'usable'`, and `runScripts` for
scripts); warpdom loads none.

## Results that change for other reasons

In the measured suites, these tests change result for reasons other than
a deliberate difference:

| Project | Tests | Result | Cause |
| --- | --- | --- | --- |
| ariakit | 7 | Fail on jsdom and pass on warpdom, in every round | They fail on jsdom. They count as differences because the goal is jsdom's results |
| ark-ui | Toast and NumberInput `largeStep` tests | Fail on jsdom and pass on warpdom, in some rounds | As ariakit |
| melt-ui | A Context Menu test | Fails on warpdom in some rounds (7 of 17) | Speed-sensitive, demonstrated: it stubs `requestAnimationFrame` with a 16 ms timer, and whether it passes depends on where that timer's first tick lands relative to two key presses; warpdom reaches the toggling key press sooner. Slowing only warpdom's key dispatches removes the failures (11 of 20 runs to 0 of 20); jsdom fails when the stub's delay changes or under heavy load. A Dropdown Menu (forceVisible) test with the same steps failed in 2 of 5 jsdom-learned rounds on CI. Details: `docs/research/data/investigations/melt-ui-timing/README.md` |
| Grafana (candidate application, shard 1/8) | PanelDataTransformationsTab "can filter transformations in the drawer", CallToAction "closes the modal after successfully submitting" | Fail on warpdom, pass on jsdom 20 | Speed-sensitive, demonstrated: floating-ui's `FloatingFocusManager` (Grafana's Drawer and Modal) moves the initial focus to the Close button one `requestAnimationFrame` (about 16.7 ms, the same delay on jsdom and warpdom) after opening. On jsdom the frame fires before `userEvent.type` starts; on warpdom, which is faster, it fires during typing, so keystrokes go to Close. With only the frame delayed by 50 ms, jsdom 20 fails the same way (0 of 5). Passing `fastFrames: true`, or waiting for the initial focus before typing, makes both pass (10 of 10, 15 of 15). Details: #245, #248 |
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
| The method `patch` in lowercase | Before the jsdom 28 profile: sent as `PATCH`. From 28: sent as is, and Node prints a warning once | Before 28: `PATCH` (Node's HTTP client). From 28: sent as is |
| `Referer` from an `about:blank` iframe | None | `about:blank` |
| `Referer` and the page URL's credentials or fragment | Never carried, as Referrer Policy says | Sends the document's URL with both, and before 28 sends a redirected request's previous URL as requested |
| Redirects, where the host's `fetch` hides them (in a browser, `redirect: 'manual'` gives an opaque redirect) | The host follows them with its own checks and only the final response gets jsdom's; the first redirected request is sent a second time to find this out. Node, Deno and Bun expose redirects | — |
| Cross-origin requests on browser hosts | Not supported yet: a browser's `fetch` hides the CORS headers warpdom checks, so allowed cross-origin responses fail ([#91](https://github.com/sonukapoor/warpdom/issues/91)). Requests never carry the host's own cookies (`credentials: 'omit'`) | — |
| A redirect that fails its CORS check | A network error | Before 28, fires `error` and then goes on to follow the redirect and fire `load` |
| A request stopped (`abort()`, `open()`) in an upload `progress` or `load` handler | Fires nothing more | Goes on with the upload's remaining `load` and `loadend`, and from 28 fires `readystatechange` (readyState 2) at the stopped or reopened request |
| Network errors | warpdom's test environments report them where they report "Not implemented" messages, in jsdom's words for CORS failures and with fetch's for others | jsdom 20 to 26 report them on the virtual console |
