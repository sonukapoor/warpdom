# What changes with the jsdom version

warpdom follows the observable behavior of the jsdom version your project
installs (and, for jsdom 26 and earlier, the cssstyle version it loads),
or the one you set with the `jsdom` option; how it is chosen is in the
README, [Which jsdom warpdom behaves like](../README.md#which-jsdom-warpdom-behaves-like).
This page lists what differs between versions, as measured on jsdom's
releases. warpdom models jsdom 20.0.3 to 30.1.3.

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
| `CSSMarginRule`, `CSSPageDescriptors`, `FormDataEvent`, `TimeRanges`, `ToggleEvent` | none yet (30.1.3) |

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
| In `background`, a gradient whose name is not in lowercase, a `-webkit-`, `-moz-` or `-o-` gradient and `NONE` are read as no image: `red LINEAR-GRADIENT(...)` is `background: red`, a layer with nothing else is empty (`url(a.png), LINEAR-GRADIENT(...)` is `url("a.png"), `, its image `none`), and a value with nothing else sets each longhand to its initial value, which `cssText` then lists (`background-image: none; background-position: 0% 0%; ...`, with `background-position-x` and `-y` from 30 when set with `setProperty()` or in a style sheet). In a `style` attribute or `cssText`, a declaration of another property after it leaves the block empty (27 and 28) or drops it (from 29). Several layers are written each as it would be alone, initial values left out | From 27.0.0 |
| `display` takes any value and keeps it as written. From 27.0.0 it is validated, but keeps the legacy keywords `-webkit-box`, `-webkit-inline-box`, `-webkit-flex`, `-webkit-inline-flex`, `-moz-box`, `-moz-inline-box`, `-moz-inline-stack`, `-ms-inline-flexbox`, `-ms-grid` and `-ms-inline-grid` (in lowercase), inline and computed; others such as `-ms-flexbox` and `-webkit-grid` are dropped | Before 27.0.0 |
| A style rule's `style` (`sheet.cssRules[i].style`) is cssom's own declaration object, not a `CSSStyleDeclaration`: values stay as written (`#34363a`, `var(--x)`, invalid values), names keep their case, shorthands are not expanded, there is no `item()` and no camelCase accessors, and the rule serializes as `.a {color: red;}`. `getComputedStyle()` still parses the values, as jsdom's cascade does | Before 27.1.0 (27.0.1 is the last). From 27.1.0 the window's `CSSStyleDeclaration`, values parsed as in inline style |

## Computed values

| Computed value | Versions |
| --- | --- |
| Colors stay as declared (`red`, `transparent`, `GrayText`) | Before 22.1.0 |
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
- An SVG `a` with an `href` matches `:link`.
- Before 24.0.0 `getComputedStyle(element, pseudoElt)` reports the
  pseudo-element as not implemented only when called on the window
  (`window.getComputedStyle(...)`): a bare `getComputedStyle(...)` in Jest,
  whose global is the window, or a destructured one, reports nothing.
