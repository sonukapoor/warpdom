# What changes with the jsdom version

warpdom follows the observable behavior of the jsdom version your project
installs (and, for jsdom 26 and earlier, the cssstyle version it loads),
or the one you set with the `jsdom` option; how it is chosen is in the
README, [Which jsdom warpdom behaves like](../README.md#which-jsdom-warpdom-behaves-like).
This page lists what differs between versions, as measured on jsdom's
releases. warpdom models jsdom 20.0.3 to 31.0.1; the changes below
marked 31.0.0 were measured on 31.0.1
([#269](https://github.com/sonukapoor/warpdom/issues/269)). Not yet
modeled for jsdom 31: relative colors (`rgb(from red r g b)`, which
jsdom 31 computes as `color(srgb 1 0 0)`); a math result clamped to the
property's range (`width: calc(-1px)` computes as `0px` in jsdom 31);
trigonometric functions and `hypot()` simplified in declared values
(`sin(0)` is `calc(0)`, `hypot(3px, 4px)` is `calc(5px)` in jsdom 31;
warpdom keeps them as written); `abs()` and `sign()` of a relative
length kept as written (`abs(-1em)` in jsdom 31, where warpdom gives
`calc(1em)`); and math in a number property computed (`opacity:
abs(-0.5)` computes as `0.5` in jsdom 31, `calc(0.5)` in warpdom).

Deliberate differences from jsdom are in
[differences.md](differences.md).

## APIs that appear in a later jsdom

Interfaces and members jsdom added along the way exist from that version
on.

| API | From jsdom |
| --- | --- |
| `crypto.randomUUID()` | 22.1.0 |
| `URL.parse()`, `URL.canParse()` | 23.0.0 |
| `URLSearchParams.size`, the value argument of its `has()` and `delete()` | 23.0.0 |
| `ElementInternals` and `attachInternals()` (its role and ARIA accessors throw jsdom's TypeError until 27.0.0) | 23.1.0 |
| `ElementInternals`' `labels` and form-associated custom elements | 26.0.0 |
| Element's `role` and ARIA attributes (`ariaLabel`, ...) | 23.1.0 |
| `Headers`' `getSetCookie()` (separate `Set-Cookie` values) | 24.1.0 |
| The SVG element interfaces of `g`, `defs`, `desc`, `metadata`, `switch` and `symbol`; `SVGRect`, `viewBox`, `preserveAspectRatio` and `createSVGRect()` | 26.1.0 |
| `PromiseRejectionEvent`, `BlobEvent`, `DeviceMotionEvent`, `DeviceOrientationEvent` and their member interfaces | 27.0.0 |
| `CSSNestedDeclarations` | 27.2.0 |
| `TextEncoder` and `TextDecoder` | 27.4.0 |
| Blob's `text()`, `arrayBuffer()` and `bytes()` | 28.1.0 |
| `CSSMediaRule.matches` and `CSSSupportsRule.matches` | 29.0.0 |
| `ariaBrailleLabel` and `ariaBrailleRoleDescription` on `Element` and `ElementInternals` | 31.0.0 |

## Globals that appear in a later jsdom

Some interfaces exist in warpdom before the jsdom it follows makes them
globals. The window has the globals of that jsdom version: the others are
left out, as below. Their objects still exist and work, as in jsdom, whose
classes exist without a global: a sheet's `@keyframes` rule is still a
`CSSKeyframesRule` (its `constructor`, `instanceof rule.constructor`), and
a details element's `toggle` event is still a `ToggleEvent`. The option
`beyondJsdom: true` keeps them all, in every profile
([api.md](api.md)).

| Global | From jsdom |
| --- | --- |
| `DOMRect`, `DOMRectReadOnly` | 22.0.0 |
| `BeforeUnloadEvent` | 27.0.0 |
| `CSSConditionRule`, `CSSContainerRule`, `CSSGroupingRule`, `CSSLayerBlockRule`, `CSSLayerStatementRule`, `CSSScopeRule`, `CSSSupportsRule` | 27.2.0 |
| `CSSCounterStyleRule`, `CSSFontFaceRule`, `CSSKeyframeRule`, `CSSKeyframesRule`, `CSSNamespaceRule`, `CSSPageRule` | 29.0.0 |
| `QuotaExceededError` | 30.1.0 |
| `CSSMarginRule`, `CSSPageDescriptors` | 31.0.0 |
| `FormDataEvent`, `TimeRanges`, `ToggleEvent` | none yet (31.0.1) |

## APIs in every version

These exist in every modeled version:

- `window.crypto`, `window.performance`, `console`, `WebAssembly`
- `Blob`, `File`, `URL`, `URLSearchParams`, `Headers`
- `WebSocket`, `XMLHttpRequest`
- `SVGNumber`, `SVGStringList`, `SVGAnimatedString`
- `PageTransitionEvent`
- the empty `navigator.plugins` and `navigator.mimeTypes`
- media elements' `audioTracks` and `videoTracks`

As in jsdom, the window's `URL` has no `createObjectURL()`; under Vitest
the global `URL` is Vitest's (Node's, with a `createObjectURL()` that
takes the window's Blobs), as with jsdom.

## Event handlers

| Event handlers | Versions |
| --- | --- |
| `oncopy`, `oncut`, `onpaste`, `onbeforeinput`, the touch handlers and 11 others | From 22.1.0. Before, `onauxclick` and `onloadend` keep what is assigned but never run, and their content attributes do nothing |
| The pointer event handlers | From 27.0.0 |
| The window's `onautocomplete`, `onautocompleteerror` and `onsort` | Until 26.1.0 |
| An `svg` element's window event handlers (`onunload`, `onmessage`, ...) | Before 28.1.0 they are the window's, as `body`'s are |

## Window shape and accessors

| Member | Versions |
| --- | --- |
| The viewport members (`innerWidth`, `scrollY`, `devicePixelRatio`, ...) and `status` | Plain data properties until 26.1.0; accessors from 27.0.0 (whose viewport setters replace them). As in jsdom, also on the global of Jest and Vitest's VM pools |
| `name` | A data property in every version |
| `document`, `window` and `self` | Accessors in every version |
| `Window.prototype` | Inherits from `EventTarget` directly before 24.1.2 |

## Style objects and cssstyle members

| Behavior | Versions |
| --- | --- |
| `el.style` and `getComputedStyle()` give `CSSStyleDeclaration` objects whose prototype has the property accessors (`width`, ...) and the methods, and there is no `CSSStyleProperties`, so `vi.spyOn(CSSStyleDeclaration.prototype, 'width', 'get')` (or `jest.spyOn`) sees `el.style.width` and computed reads as with jsdom | Before 29.0.0. From 29.0.0 the accessors are `CSSStyleProperties.prototype`'s |
| cssstyle's `getPropertyCSSValue()`, `getPropertyShorthand()` and `isPropertyImplicit()` (returning `undefined`) exist, as they do in jsdom | With cssstyle 4.3 and earlier |
| `azimuth` exists, as it does in jsdom: as an angle until cssstyle 4.3, CSS-wide keywords only in 5.3 | With cssstyle 5.3 and earlier |
| In a `style` attribute or `cssText`, a name given again as written takes the earlier declaration's place, and then each declaration is set in turn, an invalid one setting nothing: `color: blue; color: foo` declares nothing (with an older cssstyle neither do fallbacks such as `height: 100vh; height: 100dvh`), `color: blue; Color: red; color: foo` is `color: red`, `color: foo; width: 1px; color: blue` keeps `color` first, and a name without a value at the end (`width: 1px; color:`) leaves the block empty | Before 27.0.0 |
| The properties cssstyle reads as lengths (`width`, `height`, `top`, `margin`, `padding`, `font-size`, `flex-basis`, `border-width`, ...) take px, cm, mm, in, pt, pc, em, ex, ch, rem, vh and vw only (`100dvh`, `10vmin` and `1lh` are invalid there, also in a style sheet's computed style), and `background` no gradients | Before cssstyle 4.2 (jsdom 20 to 22, and 25 with cssstyle 4.1) |
| `min-content`, `max-content` and `fit-content` are invalid in `width`, `height`, `flex-basis` and `flex` (`fit-content` in `flex-basis` with every cssstyle) | Before cssstyle 4.4 |
| A gradient whose name is not in lowercase (`LINEAR-GRADIENT(...)`, `Linear-Gradient(...)`) is invalid in `background-image`, and so is a list with one (`url(a.png), LINEAR-GRADIENT(...)`). With cssstyle (jsdom 20 to 26) it is invalid in `background` too, and from cssstyle 4.2 so is a `-webkit-` gradient there | Every version |
| In a `style` attribute, `cssText` or a rule's `cssText`, a property name not in lowercase declares nothing (`COLOR: blue`, `-WEBKIT-animation: none`, and `width: 1px; Color: blue` is `width: 1px`); a style sheet lowercases it. A custom property's name keeps its case (`--X: 1` is declared). jsdom 31 lowercases it again | 28.1.0 to 30 |
| In a `style` attribute, `cssText` or a rule's `cssText`, a normal `background` (its name in lowercase, its value without `var()`) followed by a declaration of another property leaves the block empty: `background: red; color: blue` and `background: red; display: none` declare nothing. Names given again are merged first (`color: red; background: red; color: blue` is kept), and these may follow it: the `background`, `margin` and `padding` properties, `border` and its sides, widths, styles and colors, `border-image`, `flex` and `font`. A style sheet keeps the block | 27 and 28 |
| In `background`, a gradient whose name is not in lowercase, a `-webkit-`, `-moz-` or `-o-` gradient and `NONE` are read as no image: `red LINEAR-GRADIENT(...)` is `background: red`, a layer with nothing else is empty (`url(a.png), LINEAR-GRADIENT(...)` is `url("a.png"), `, its image `none`), and a value with nothing else sets each longhand to its initial value, which `cssText` then lists (`background-image: none; background-position: 0% 0%; ...`, with `background-position-x` and `-y` from 30 when set with `setProperty()` or in a style sheet). In a `style` attribute or `cssText`, a declaration of another property after it leaves the block empty (27 and 28) or drops it (from 29). Several layers are written each as it would be alone, initial values left out | From 27.0.0 |
| `display` takes any value and keeps it as written. From 27.0.0 it is validated, but keeps the legacy keywords `-webkit-box`, `-webkit-inline-box`, `-webkit-flex`, `-webkit-inline-flex`, `-moz-box`, `-moz-inline-box`, `-moz-inline-stack`, `-ms-inline-flexbox`, `-ms-grid` and `-ms-inline-grid` (in lowercase), inline and computed; others such as `-ms-flexbox` and `-webkit-grid` are dropped | Before 27.0.0 |
| A style rule's `style` (`sheet.cssRules[i].style`) is cssom's own declaration object, not a `CSSStyleDeclaration`: values stay as written (`#34363a`, `var(--x)`, invalid values), names keep their case, shorthands are not expanded, there is no `item()` and no camelCase accessors, and the rule serializes as `.a {color: red;}`. `getComputedStyle()` still parses the values, as jsdom's cascade does | Before 27.1.0 (27.0.1 is the last). From 27.1.0 the window's `CSSStyleDeclaration`, values parsed as in inline style |

## Computed values

| Computed value | Versions |
| --- | --- |
| Colors stay as declared (`red`, `transparent`, `GrayText`) | Before 22.1.0 |
| Only `visibility` is inherited where not declared, from 21.1.0 `pointer-events` too: `color` and `caret-color` are `''` (a span in `<div style="color: red">` too) | Before 22.1.0 |
| Named and hex colors resolve | From 22.1.0 |
| System colors stay keywords | Until 26 |
| System colors are jsdom's (`ButtonFace` is `rgb(204, 204, 204)`, under `color-scheme: dark` `rgb(51, 51, 51)`) | From 27.0.0 |
| `color`, `background-color`, the border colors, `display`, `pointer-events` and `visibility` resolve `inherit`, `initial` and `unset` (`color: initial` is `CanvasText`: `rgb(0, 0, 0)` under a light scheme); a root under `color-scheme: dark` (the html element, or a disconnected tree's top) is white, and its descendants inherit that | From 27.0.0 to 29.0.1 |
| An element under `color-scheme: dark` that sets no color, and inherits none set above it, is white, and its border colors (`currentcolor`) its parent's color | From 29.0.2 |
| Color keywords keep their case and only CSS 2's system colors exist (`ThreeDFace`, not `Canvas`) | Before cssstyle 4.4 |
| A declared `0` stays `0` where cssstyle does not parse the property (`text-indent`, `min-width`) | Before 28.1.0 |
| `margin`, `padding` and `border-width` keep their declared form (`2px 6px 3px 6px`) | Before 27.0.0 |
| `font-family` is `depends on user agent` when not declared, and `vertical-align: inherit` inherits | From 29.0.2 |
| Lengths are px (`h1` 32px, `calc(1em + 2px)`, `10vw` 102.4px), and font size keywords too | From 30.0.0 |
| `bolder` and `lighter` are weights | From 30.1.0 |
| `<search>` is `display: block` | From 27.0.0 |

## Other

- Before 30.1.1 a disabled button, input, select or textarea with a
  `tabindex` attribute (also one in a disabled fieldset) can be focused.
- An SVG `a` with an `href` matches `:link`, and from 31.0.0 one with an
  `xlink:href` too.
- From 31.0.0 an attribute selector without a namespace (`[class]`)
  matches only an attribute in no namespace, and `:empty` matches an
  element whose text children are all empty, a CDATA section with data
  counting as content.
- WebIDL conversion errors: from 31.0.0 a dictionary member is named as
  `parameter 2's 'data' member is not of type 'Blob'.` and an enumeration
  lists its values (`parameter 2 must be one of: "text/html", ...
  Received: "text/plain".`); before, `parameter 2 has member 'data' that
  is not of type 'Blob'.` and `parameter 2 'text/plain' is not a valid
  enumeration value for SupportedType`.
- The canvas "Not implemented" reports name the `@napi-rs/canvas` package
  from 31.0.0, `canvas` before.
- From 31.0.0 `document.hasFocus()` is `true` for the top-level document
  from the start; a frame's or a created document's only once something
  in it is focused.
- From 31.0.0 an iframe fires `load` for each insertion, also when it is
  removed before the load: an iframe removed at once fires one, a moved
  one two. Before, a removal cancels it.
- From 31.0.0 scripts the HTML parser made are already started, so a
  clone of one from `innerHTML` does not run (a template's contents' still
  do), and `createContextualFragment()`'s scripts run once inserted.
  Before, those clones run and those scripts never do.
- From 31.0.0 a style declaration block holds longhands only (CSSOM): a
  shorthand sets each of its longhands (`margin: 1px` is four items),
  `cssText` writes a shorthand only when all its longhands are there with
  the same priority, a declaration given again in a style attribute
  replaces the earlier one at the end unless that one is `!important`,
  and a write changes a declaration in place. A shorthand with `var()`
  leaves its longhands empty until one is written (`margin-right: ;`).
  Before, shorthands are kept as declared next to their longhands.
- From 31.0.0 computed values substitute `var()`: `width: var(--w)` with
  `--w: 5px` computes to `5px`, a custom property's computed value is
  substituted too, and one in a cycle, or a `var()` with no value and no
  fallback, makes the property `unset` (a custom property empty). A
  shorthand with `var()` computes its longhands from the substituted
  value. Before, a value with `var()` computes to itself. Also from 31.0.0:
  an initial 0 length computes to `0px` (`margin-top`, `padding-left`,
  `text-indent`; before `0`), the small, large and dynamic viewport units
  and the container units compute to px (`10svw` is `102.4px`; a
  container unit is the small viewport's), a `line-height` number computes
  to px from the element's own font size and is inherited as the number,
  `lh` and `rlh` are the line-height in px (`normal` 1.15 times the font
  size; before 1.2), `cap` is 0.905 em, `font-size: math` is the parent's
  size, and the initial `font-family` is `monospace` (before `depends on
  user agent`).
- Before 31.0.0 an event path goes through a slottable's last assigned
  slot after it leaves its host, until it is assigned again; from 31.0.0
  only through its assigned slot.
- Before 24.0.0 `getComputedStyle(element, pseudoElt)` reports the
  pseudo-element as not implemented only when called on the window
  (`window.getComputedStyle(...)`): a bare `getComputedStyle(...)` in Jest,
  whose global is the window, or a destructured one, reports nothing.
