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
| `CSSMediaRule.matches` | 29.0.0 |

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

## Computed values

| Computed value | Versions |
| --- | --- |
| Colors stay as declared (`red`, `transparent`, `GrayText`) | Before 22.1.0 |
| Named and hex colors resolve | From 22.1.0 |
| System colors stay keywords | Until 26 |
| System colors are jsdom's (`ButtonFace` is `rgb(204, 204, 204)`) | From 27.0.0 |
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
