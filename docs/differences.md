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
| Style-sheet parse errors | Not reported to the console | jsdom 16 cannot parse CSS nesting, drops such a sheet and reports "Could not parse CSS stylesheet". jsdom 29 and later also report it for some sheets whose values they still read (`p { --x: url(a b) }`, `p { --x: {} }`, `p { : red }`, a stray `}`; [#264](https://github.com/sonukapoor/warpdom/issues/264)) | 3 handsontable tests of its filter for that message (`jsdomThemeCssFilter.unit.js`) |

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
- `getComputedStyle()` of an element that is neither HTML nor SVG (in no
  namespace, MathML's, another namespace's), and of its descendants:
  computed, its style attribute declaring nothing, as in jsdom 30.1.2 and
  later (jsdom 20.0 to 30.1.1 throw a TypeError from inside jsdom)
- `getComputedStyle()` of an element whose document has no document
  element (a template's content, `new Document()`, a document whose root
  was removed): computed (jsdom 30.0.0 to 30.1.2 throw a TypeError from
  inside jsdom; 30.1.3 computes it)
- `getComputedStyle()` of an element that a style sheet rule gives
  `border: initial` or `border: inherit` (from jsdom 28.1 `border: unset`
  too): computed (jsdom 27.0.1 to 29.0.0 throw a TypeError from inside
  jsdom; with the same declaration in the style attribute they compute it)

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
  `color: red;` where `cssText` has `color: red !important;`. jsdom 20 to
  26 do the same in a `style` attribute or `cssText`: `color: red; Color:
  foo !important` gives `color: red !important`, and `color: red
  !important; Color: foo` gives `color: red` ([#264](https://github.com/sonukapoor/warpdom/issues/264))
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
- with cssstyle 2.3 to 4.6 (jsdom 20 to 26), `cssText` ending in a
  name without a value (`color: blue; color:`) setting no `style`
  attribute, and a style rule ending that way (`.a{width: 1px; color:}`)
  left out of the sheet ([#264](https://github.com/sonukapoor/warpdom/issues/264)); and gradients in `background` with cssstyle 4.2 (jsdom
  rejects them before 4.3, warpdom before 4.2), and in `background-image`
  before a `url()` with cssstyle 4.2 and 4.3 (`linear-gradient(red, blue),
  url(a.png)` is invalid there)
- in jsdom 27 and later, a `background` of initial values once its image is
  left out (`background: LINEAR-GRADIENT(...)`, see jsdom-versions.md):
  the entries jsdom keeps without writing them (`length` counts
  `background-position-x` and `-y` set from `cssText` in jsdom 30, and the
  longhands when `background: red` follows it), a longhand declared after it in the same block
  (jsdom writes the shorthand again: `background: LINEAR-GRADIENT(...);
  background-image: url(a.png)` is `background: url("a.png")`), jsdom 27
  and 28's computed style when a style sheet rule declares it (the
  earlier rules' longhands partly stay), and the arguments of a legacy
  radial gradient or `-webkit-gradient()` (warpdom does not check them;
  a legacy linear one is checked as `linear-gradient()`)
- in jsdom 27 and later, math functions in `background` outside the
  arguments of an image left out (jsdom 27 to 29 set the initial values
  for `LINEAR-GRADIENT(red, blue) calc(10px + 5%) 0` and reject a `url()`
  beside a math function, even in its string, and jsdom 30 writes
  `calc(5% + 10px) 0px`), and in jsdom 27 to 29 a lowercase gradient
  with one (`linear-gradient(red, blue calc(100% - 1px))` is read as
  none there)
- the computed value of a gradient whose default direction or position
  was left out from among other tokens (`to bottom right` is written
  `right`, `at center top` is written `top`): jsdom 27 to 30.1.2 compute
  it from what is left, which is no gradient (`''` in 27 and 28, `none`
  in 29 to 30.1.2; the `background` shorthand gives its color alone), and
  jsdom 30.1.3 computes the gradient as written. warpdom computes it from
  what is left after a style write (`setProperty()`, `style.background`),
  and as written for a style attribute or a rule
- `clip` with a comment after a space-separated `rect()` (`rect(0 0 0 0)
  /*c*/`): jsdom 27 and later throw a SyntaxError from `setProperty()`,
  and jsdom 29 and later from the style attribute and a style sheet too
  (jsdom 27 and 28 declare nothing for the attribute); warpdom declares
  `rect(0px)`. The same for a math function in a space-separated
  `rect()` with an unbalanced bracket or a curly brace (`rect(0 calc([) 0
  0)`): jsdom 27 to 30.1.2 throw a SyntaxError from `setProperty()`;
  warpdom, like jsdom 30.1.3, leaves the value set before. And `clip: initial` with cssstyle 4.1 (jsdom 25), which
  jsdom drops and warpdom keeps
- `getComputedStyle().azimuth` with cssstyle 4.2 and 4.3 (`NaNdeg` for an
  angle, jsdom's is empty)
- comments in declared values that some properties read otherwise:
  from jsdom 27, `font-family: a/*x*/b` is `ab` (warpdom `a b`), the
  style attribute and `setProperty()` keep `transition: opacity/*x*/1s` as
  written (warpdom
  `opacity 1s`), and in jsdom 27 `content: "a" /*x*/` too (warpdom
  `"a"`). From jsdom 27, in the style attribute and `setProperty()`, a
  comment in a value of many properties with a color or a border in it
  depends on the property and on where the comment is: `color: rgb(1, 2,
  3) /**/`, `color: rgb(1, /**/ 2, 3)` and `border-top: 1px solid red
  /**/` declare nothing (`border-top: 1px /**/ solid red` does, and so
  does `background: rgb(1, 2, 3) /**/`), `outline`, `column-rule` and
  `box-shadow` keep the comment as written, and jsdom 30.1.3 reads
  `border-top: calc(1px) solid red /**/` as `calc(1px solid red`;
  warpdom reads all of them without the comment. Comments are otherwise
  read as jsdom reads them: removed before
  27 and in 27 and 28's style sheets, a space elsewhere, and kept as
  written in a custom property's value outside style sheets and in a
  value with `var()` from 27 (29 in style sheets)

- writes to the `getComputedStyle()` object
  ([#97](https://github.com/sonukapoor/warpdom/issues/97)): before jsdom
  28.1.0 it takes them like `el.style`, as warpdom does; from 28.1.0,
  jsdom throws a `NoModificationAllowedError` for a longhand write such as
  `cs.marginTop = '3px'`, where warpdom stores it. In jsdom 20 to 30 a
  shorthand written there (`cs.font = '20px Arial'`, `cs.margin`) is
  taken and sets its longhands (`cs.fontSize`); warpdom stores the
  shorthand only. The object's `cssText` and `length` are `''` and 0 in
  warpdom; jsdom lists the resolved values (`cssText` only before 28.1.0)
- uppercase units and `AUTO` ([#97](https://github.com/sonukapoor/warpdom/issues/97)):
  jsdom 27 to 30 write `width: 5PX` as `5px`; warpdom keeps `5PX` (the
  jsdom 20 to 26 profiles follow jsdom: 20 to 25 drop it, 26 writes
  `5px`). With cssstyle 4.1 and earlier (jsdom 20 to 25), jsdom lowercases
  `width: AUTO` and `margin: AUTO`; warpdom keeps them
- the case of keywords
  ([#187](https://github.com/sonukapoor/warpdom/issues/187)): warpdom
  writes a value of one identifier in lowercase as jsdom 27 and later do
  (`display: BLOCK` is `block`; from 28.1.0 not in a property that takes
  names or strings of its own, such as `animation-name` or `text-align`),
  and jsdom 26's lowercasing of some keywords in `el.style`. Left: with
  cssstyle 4.3.1 (`{ jsdom: '26.1.0', cssstyle: '4.3.1' }`), jsdom
  lowercases `width: AUTO` and `margin: AUTO` and rejects `CALC(1px)` and
  `border: 1px SOLID RED`; warpdom keeps them as written ([#264](https://github.com/sonukapoor/warpdom/issues/264))
- functions in box shorthands
  ([#112](https://github.com/sonukapoor/warpdom/issues/112)): from jsdom
  27, jsdom writes repeated sides once
  (`padding: calc(100% - 2px) calc(100% - 2px)` reads
  `calc(100% - 2px)`); jsdom 20 to 25 (cssstyle 4.1 and earlier) and 27 to
  29 drop `padding: min(10%, 2px) min(10%, 2px) min(10%, 2px)`, which
  jsdom 30 shortens to `min(10%, 2px)`; and jsdom 26 with cssstyle 4.3.1
  drops `padding: calc(10% + var(--a)) calc(10% + var(--a))`. jsdom 27 to
  29 also reject most such lists with different sides: `margin: 1px
  calc(100% - 2px)`, `margin: calc(100% - 2px) 1px calc(100% - 2px) 1px`
  (29.1.1 computes it to `0`; jsdom 30 writes `calc(100% - 2px) 1px`) and
  `padding: calc(10%) 1px 2px 3px` (jsdom 30 computes `10% 1px 2px 3px`);
  a later longhand then stands alone, and in a style attribute with
  longhands after it jsdom keeps theirs (`margin-right: 2px` where warpdom
  gives `calc(100% - 2px)`) ([#265](https://github.com/sonukapoor/warpdom/issues/265)). warpdom keeps them as written.
  jsdom 25 (cssstyle 4.1) writes a unitless zero beside a function as
  `0px` (`margin: 0 calc(50% - 10px)` is `0px calc(50% - 10px)`);
  warpdom keeps `0` there (jsdom 26 and 30 are matched since
  [#310](https://github.com/sonukapoor/warpdom/pull/310), and jsdom 20 to
  22 reject the value, as warpdom does)
- the order of declarations within one style rule, jsdom 27.1.0 and
  later
  ([#113](https://github.com/sonukapoor/warpdom/issues/113),
  [#147](https://github.com/sonukapoor/warpdom/issues/147)): jsdom applies
  them in order, so in
  `padding-top: 1px; padding: var(--p); padding-top: 4px` the last
  `padding-top` gives `4px`. warpdom gives `''` (`0` in the jsdom 30
  profile), as jsdom 27.0.1 does
- `!important !important`
  ([#147](https://github.com/sonukapoor/warpdom/issues/147)): jsdom 20 to
  26 keep the declaration as `!important`; warpdom drops it, as jsdom 27
  and later do
- `color: red !important; color: var(--c) !important` in the `style`
  attribute, jsdom 20 to 25
  ([#147](https://github.com/sonukapoor/warpdom/issues/147)): jsdom drops
  both, where warpdom keeps one of them (jsdom 27 and later keep
  `color: red !important`, as warpdom does)
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
  or with both weights 0% (`color-mix(in srgb, foo, red)`,
  `color-mix(in srgb, CanvasText, red)`, `color-mix(in srgb, blue 0%, red
  0%)`); warpdom keeps them. A system color in a nested mix
  (`color-mix(in srgb, color-mix(in srgb, CanvasText, red), blue)`) is
  rejected by jsdom 29, and jsdom 30 computes the inner mix as transparent
  (`color(srgb 0 0 1 / 0.5)`); warpdom computes it with light-scheme
  values. An invalid mix nested in another (weights both 0%, a wrong
  argument count) leaves warpdom's whole value as declared. jsdom normalizes `color()` and `color-mix()` values
  when they are set: `color(srgb 1 0 0/0.5)` gives
  `color(srgb 1 0 0 / 0.5)`, percentages become numbers, an alpha above 1
  is dropped, `xyz` becomes `xyz-d65`, `calc()` is evaluated (and `none` and `calc()` components inside `color-mix()` are computed), color names
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
  or leave out the whole sheet ("Could not parse CSS stylesheet"). In the
  jsdom 27 and 28 profiles, an escaped quote outside a string
  (`font-family: a\"b`, `color: \" var(--c)`) also starts a string in
  warpdom, which then loses the rest of the rule; jsdom keeps it
  (warpdom matches from 29) ([#264](https://github.com/sonukapoor/warpdom/issues/264))
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
  jsdom 20 throws there. In jsdom 27.1 to 28, a rule inserted into a
  grouping rule already deleted from its sheet gets an extra, empty sheet
  as its `parentStyleSheet` (warpdom: `null`)
- keyframes rules before jsdom 29
  ([#208](https://github.com/sonukapoor/warpdom/issues/208)): `keyText`
  keeps `from` and `to` as written (`FROM`; warpdom: `0%` and `100%`), and
  `cssText` spans several lines. In jsdom 20 to 27.0.1, `@page` is a
  `CSSStyleRule`, and `CSSKeyframesRule` has no `length`, indices,
  `findRule`, `appendRule` or `deleteRule` (calling `appendRule()` throws
  a `TypeError`). In jsdom 27.1 to 28, `appendRule('bogus')`
  throws a `SyntaxError` (warpdom ignores it), `findRule()` finds and
  `deleteRule()` removes plain objects assigned to `cssRules`
  (`[{ keyText: '10%' }]`), and the rule's internal members
  (`__parentRule`, `_vendorPrefix`) and its `cssText` after `cssRules` is
  replaced are not modeled. From 27.1, `deleteRule()` removes the
  first of duplicate keyframes; warpdom removes the last
- jsdom 29 and 30 ([#148](https://github.com/sonukapoor/warpdom/issues/148)):
  a style rule's or `@import` rule's `cssText` has only a getter, so assigning it throws in
  strict mode; warpdom ignores the assignment. In jsdom 29.1.1, the rules
  in an `@media` rule inserted into another grouping rule get another
  `parentStyleSheet`

- shorthands that jsdom keeps as their longhands ([#264](https://github.com/sonukapoor/warpdom/issues/264)),
  ([#265](https://github.com/sonukapoor/warpdom/issues/265)): `background`, `border` and its side, color, style and
  width shorthands, `flex` and `font` from jsdom 27 (`font` from 26).
  A longhand written after the shorthand changes the shorthand in the
  style attribute: after `border = '1px solid red'`, `borderColor = 'blue'`
  gives `border: 1px blue;`, and `flex = '1 1 0%'` then `flexGrow = '2'`
  gives `flex: 2 1 0%;` (jsdom 27 to 30). `background` is different:
  `background = 'red'` then `backgroundColor = 'blue'` leaves the
  attribute and `cssText` at `background: red;`, while `style.background`
  and `style.backgroundColor` read `blue`. `font` is different too:
  after `font = '12px Times'` and `fontFamily = 'Arial'`, the attribute
  and `cssText` keep `font: 12px Times;` and drop the longhand (jsdom 27
  to 30; jsdom 26 keeps `font: 12px Times;` after the longhands it lists,
  as below), while `style.font` reads `12px Arial`. warpdom keeps the
  shorthand and adds the longhand beside it. In jsdom 26 the accessor recomposes `background`
  while `getPropertyValue()` keeps it as written: after `background =
  'red'` and `backgroundColor = 'blue'`, `style.background` is `blue` and
  `getPropertyValue('background')` `red`; warpdom reads `red` through
  both. It models this for `flex`, `font` and the borders, except a
  `font` written after one of its longhands: after `fontSize = '10px'`,
  `font = '12px Arial'` and `fontSize = '14px'`, jsdom 26's `style.font`
  reads `14px Arial` and warpdom's `12px Arial`. jsdom 20 to 26
  also compose `style.font` from its longhands when no `font` is declared
  (`fontSize = '10px'`, `fontStyle = 'italic'`, `fontWeight = 'bold'`
  reads `10px italic bold` in 20 to 25 and `italic bold 10px` in 26), and
  after a system font (`font = 'menu'` then `fontWeight = 'bold'` reads
  `bold`; in 26 `font = 'caption'` then `fontSize = '20px'` reads `20px`);
  warpdom reads `''` and the system font. jsdom lists the longhands in
  `style.length` and `item()` (`border` then `borderTopColor` has 19 in
  jsdom 27), and jsdom 26 lists `font`'s longhands in `cssText` too
  (`font: 12px serif` is `font-style: normal; …; font-family: serif; font:
  12px serif;`). jsdom 27 and 28 compose `style.background` from the
  longhands (`backgroundColor = 'blue'` then `backgroundRepeat =
  'no-repeat'` reads `no-repeat blue`), and jsdom 27 and later rebuild
  `background` once every longhand is set. An `!important` shorthand gives
  its longhands the priority (`getPropertyPriority('background-color')`,
  and `margin-top` under `margin: 1px !important` in a style rule; inline
  `margin` matches). In jsdom 26, `font` replaces an earlier
  `font-family`, and a `font` without a family clears it. A longhand
  accessor's write under an `!important` `background` or `border` is
  ignored or changes the shorthand in jsdom 27 to 30 (`border: 1px blue
  !important`). jsdom 30 does the same for `background-position`:
  `backgroundPosition = '1px 2px'` then `backgroundPositionX = '3px'`
  reads `3px 2px`, with the shorthand and both axes in `style.length`
  and `item()` (warpdom: `1px 2px`, and the axis beside the shorthand)
- a border part given twice, jsdom 20 to 25 ([#264](https://github.com/sonukapoor/warpdom/issues/264)): `border-top: 0 0`
  is `border-top: 0`, `none none` clears the side, `blue none solid` is
  `solid blue`, and `border: 0 0` is `border: 0px` (`none none`:
  `border: none`); warpdom rejects these and keeps what was there
- the style attribute's box longhands, other orders and versions
  ([#265](https://github.com/sonukapoor/warpdom/issues/265)): jsdom 27 to 30 compute `margin-left: 4px;
  margin-bottom: 3px; margin-right: 2px; margin-top: 1px` as `4px 3px 2px
  1px` (warpdom `1px 2px 3px 4px`; through `cssText` they match; padding
  the same). jsdom 20 to 26 compute `margin: 1px !important; margin-top:
  4px` as `4px 1px 1px 1px` and `margin-top: 5px !important; margin: 1px
  2px` as `1px 2px 1px 2px` (warpdom `1px 1px 1px 1px` and `5px 2px 1px
  2px`). jsdom 20 to 22 rewrite the attribute when a box setter changes
  nothing (`style.marginRight = '1px'` after `margin-top: inherit;
  margin-right: 1px; …` drops `margin-top`); warpdom keeps the text.
  jsdom 26 to 29 queue one MutationObserver attribute record per internal
  setter call (`style.marginTop = '1px'` after `margin: 1px` queues 4 in
  27 to 29, 2 to 3 in 26); warpdom queues one. jsdom 26 writes four
  `!important` padding longhands set after an `!important` `padding` with
  `padding-left` normal; warpdom keeps all four `!important`
- a name repeated in another case in a `style` attribute or `cssText`,
  jsdom 27 to 30 ([#264](https://github.com/sonukapoor/warpdom/issues/264)): jsdom 27.4 reads `color: blue; Color:
  red; color: green` as red, and jsdom 30 reads `color: blue; Color: red`
  as blue; warpdom gives the last declaration
- custom property names that are not one identifier ([#264](https://github.com/sonukapoor/warpdom/issues/264)):
  from jsdom 27, `--a*b: 1` and `--a\\/b: 1` are invalid in the style
  attribute and `cssText`, and from 29 in style sheets (27 and 28 sheets
  keep them); warpdom keeps them everywhere, and reads `--\61/**/b: 1`
  (two tokens) as `--\61 b`
- custom properties in jsdom 26 to 28's style sheets ([#264](https://github.com/sonukapoor/warpdom/issues/264)):
  jsdom 26 to 28 drop one with a `{}` block (`{ a }`). jsdom 27 and 28
  read `--x: / *` as `/*` and `\61  b` with one space, keep `!IMPORTANT`
  as written, write `a !important b` as `a  b !important`, give `a
  !/**/important` no priority, make a nested rule from a block (`p { --x:
  a {b} c }`), and lose the rule after an unclosed `(` and the rest of the
  sheet after `url("\\")`. warpdom keeps the values as written and writes
  `!important` in lowercase
- strings, comments and escapes in style sheets ([#264](https://github.com/sonukapoor/warpdom/issues/264)): jsdom 27
  and 28 throw from `insertRule()` for a rule with an unclosed string (`a
  { content: "abc }`); warpdom takes the string to the rule's end, as 29
  and later do. jsdom 28 reads `/*` in an unquoted `url(a/*b.png)` as a
  comment that runs to the end of the sheet, and collapses the double
  space after a hex escape (`container-name: \61  b` is `\61 b`). In a
  rule added with `insertRule()`, jsdom 27 to 30 take the rule's `}` into
  a string value with a raw line break before `var()` (`content:
  'a⏎var(--x)'`). warpdom reads all of these as written
- line breaks and NUL in strings ([#264](https://github.com/sonukapoor/warpdom/issues/264)): jsdom 27 to 30 write a
  raw CR LF in a lone `font-family` string as a space (`"a b"`) and
  reject it in a list; jsdom 26 does the same for a raw LF (`"A⏎B"` is
  `"A B"`, also in `font`) and drops it when another family follows. In
  a custom property's value a line break ends a string in jsdom 27 and
  later, so `--v: "a⏎b !important; color: red` declares `color` and makes
  `--v` important (also `(a 'b⏎c)` in the style attribute and `url("a⏎b)`
  in a sheet). jsdom 30's accessors (`style.content = …`) read a NUL, an
  escaped NUL and a trailing backslash as 29 does, where warpdom gives
  U+FFFD on every path, and jsdom 27 and 28 declare nothing for a `style`
  attribute that contains U+0000. warpdom keeps the text as written
- numbers by version ([#264](https://github.com/sonukapoor/warpdom/issues/264)): with cssstyle 4.2 and 4.3, jsdom
  keeps `flex: 1e1px` as written (warpdom `1 1 10px`), leaves out the
  longhands `flex` omits (`flex: 10`; warpdom `10 1 0%`), rejects `0.0`,
  `.0`, `0.`, `-0`, `+0` and `0e1` in lengths, `background-position: 0`, a
  unitless `flex-basis` and `flex: 1 1 0e1`, and accepts `flex: -1e1`,
  `border: 0 0` and `border-top: 0 0`, the other way round from warpdom.
  cssstyle 4.3.1 keeps `width: 1e1px`, `1.px`, `1e-1px`, `font-weight: 01`
  and `line-height: 01` as written; warpdom writes them canonically. jsdom
  25 rejects exponents (`0e0px`, `1e0px`) and `border: 0.0 solid`. jsdom
  27 rejects `rotate: 0.0` and keeps `z-index: 00`. jsdom 29's style
  attribute and `cssText` throw a TypeError for `border: 0e0 solid`;
  warpdom drops it, as `setProperty()` does
- `calc()` simplified in declared values ([#264](https://github.com/sonukapoor/warpdom/issues/264)), ([#265](https://github.com/sonukapoor/warpdom/issues/265)):
  jsdom 26 and later sort and add a `calc()`'s terms (`calc(1px + 2%)` is
  `calc(2% + 1px)`, `calc(1px + 1px)` is `calc(2px)`, `calc(100% - (2 *
  8px))` is `calc(100% - (16px))`) and remove the spaces inside
  (`calc(  1px)` is `calc(1px)`), in longhands and box shorthands, and
  jsdom 23 serializes them that way too. jsdom 26 also does it in the
  border widths and shorthands, `line-height`, `flex`, `background` and
  `font` (`opacity: calc(1px + 2px)` reads `NaN`), rejects a line height
  `calc()` with spaces in `font`, and in `flex-grow` and `flex-shrink`
  evaluates `abs()`, `round()` and the other math functions, reduces
  units, and folds every function in the value into one (`calc(1) calc(2)`
  is `calc(1 2)`); `setProperty('flex-shrink', 'calc(1 + 1px) x')` throws
  there. jsdom 27 and later evaluate it in `font` and `font-size`
  (`calc(12px + 2px) Arial` is `calc(14px) Arial`) and read `width:
  calc(1px/**/+/**/2px)` as `calc(3px)`. jsdom 30 also simplifies in
  `border-spacing` and `background-size`, and jsdom 26 in
  `border-spacing` (`calc(1px  +  2px)  3px` is `calc(3px) 3px`); jsdom
  27 to 29 reject that value in both. jsdom 26 and later write
  `min(1px, 2px)` as `calc(1px)` in `width` and `margin`, and jsdom 27 to
  29 reject a `min()` there that mixes a percentage and a length
  (`min(10%, 2px)`; jsdom 26 and 30 keep it).
  warpdom models the sorting, adding and space removal in longhand
  lengths and `font-size` for jsdom 23 to 26 (`calc(1px + 2%)`,
  `calc(1px + 1px)`, `calc(  1px)` above) and the math of numbers alone
  in jsdom 26's `flex-grow` and `flex-shrink`
  ([#307](https://github.com/sonukapoor/warpdom/pull/307)); it keeps the
  rest as written, including every simplification in jsdom 27 and later
  and nested terms such as `calc(100% - (2 * 8px))`
- `font` ([#264](https://github.com/sonukapoor/warpdom/issues/264)): jsdom 26 takes a number before the size as the
  weight, line height and variant (`0 12PX Arial` is `0 12px Arial`, `0
  / 1EM Arial` is `0 0px / 1em Arial`, `0/1.5 Arial` is `0 0px / 1.5
  Arial`), a
  size keyword after a zero and a family as the size (`.0 Arial Large` is
  `0 large`), writes `0 Large, Arial` as `0 large , Arial`, keeps an empty
  family (`12px ab,,cd` is `12px ab, , cd`), reads `12px Arial,` with the
  family `Arial, `, and lowercases `SERIF,var(--f)` to `serif, var(--f)`.
  jsdom 26 to 30 set `font-variant: normal` from `font`, and jsdom 26
  keeps `small-caps` while 27 and later reject a `font` with it. warpdom
  drops `small-caps` and keeps the rest as written or rejects it
- `background` values ([#264](https://github.com/sonukapoor/warpdom/issues/264)): jsdom 26 rejects a
  `background-position` of several layers (`1px 2px, 3px 4px`), which
  warpdom keeps. warpdom accepts `image-set()` in
  `background` and `background-image`, which jsdom 20 to 30 reject. For
  `background: url("var(--a).png") red`, warpdom's longhands read `''`.
  jsdom 27 and later accept two or three boxes (`text border-area`).
  jsdom 27 and 28 write `background: inherit` as several keywords (and
  `INITIAL` as five or seven `initial`s), jsdom 29 and 30 keep
  `background: INITIAL` in capitals (warpdom writes `initial`), and 27 and 28 keep
  the size after a two-value position they drop (`url(a.png) center top
  / 10px`), and read `lab()`, `oklch()` and `color()` (`fixed lab(50% 0
  0)` is `lab(50 0 0)`, where warpdom's longhands read `''`). jsdom 27 to
  29 read `-0` and `00` as the initial values. jsdom 29 and 30 report
  another color for several layers (30: `padding-box, red` reads
  `padding-box, transparent`). jsdom 27.4 declares nothing for a style
  attribute with an escaped `url()` in `background` and another
  declaration (`background: red url("q\'b.png"); color: blue`), and jsdom
  27 throws a SyntaxError for `background` set through the accessor with
  `!important` and a `calc()`. In a gradient jsdom leaves out, it accepts
  `calc(1px + )`, which warpdom rejects. In style sheets from jsdom 27, a
  later normal `background` declaration or background longhand replaces
  an earlier `!important` one (`div { background: url(a.png) !important;
  background: red }` is `background: red`); warpdom keeps the `!important`
  one (inline styles match). After a `background` of initial values,
  jsdom 30 leaves out a `background-position-x` or `-y` declared before
  it, jsdom 27 and 28 keep the block for a later `background: var(--a)`,
  jsdom 29 and 30 drop a later `background: none`, jsdom 30 drops a later
  `background-color: var(--a)` (jsdom 29's `cssText` setter throws on
  it), and jsdom 27 to 29's `background-position-x` and `-y` getters read
  `''` for an axis not declared (warpdom `0%`)
- gradients ([#264](https://github.com/sonukapoor/warpdom/issues/264)): jsdom 26 declares nothing for an uppercase
  direction (`linear-gradient(TO BOTTOM, red, blue)`). jsdom 27 and later
  read `border-image: linear-gradient(...) 30` as `none`, and reject
  gradients in `cursor` and a number as the first argument
  (`linear-gradient(0, red, blue)`). jsdom 27 keeps
  `-webkit-linear-gradient(TOP, RED, blue)` in `mask-image` and
  `-webkit-radial-gradient(...)` in `list-style-image` as written (warpdom
  rejects them) and rejects every gradient in
  `-webkit-mask-box-image-source`. jsdom 29 and 30.1.2 lowercase a
  gradient with `var()` in the computed `background`. Apart from the two
  `-webkit-` gradients it rejects, warpdom keeps these values as written
- `border-image`, jsdom 27.0.1 and later ([#264](https://github.com/sonukapoor/warpdom/issues/264)): in a `style`
  attribute or `cssText`, every valid value but `none` reads as
  `border-image: none` with no priority, after the other declarations
  (`var()` is kept from 29), `border-image: none` declares nothing and
  removes an earlier one, and from 28.1.0 `stretch !important` reads
  `none`. `border-image` has no longhands in `style`, and with `border`
  declared, `cssText` folds it into `border`. warpdom keeps
  `border-image` as written and separate
- values jsdom rejects ([#264](https://github.com/sonukapoor/warpdom/issues/264)): jsdom 27 and later reject a string
  in `cursor`, `d`, the `nav-*` properties, `animation-range` and its
  longhands, `voice-pitch`, `voice-range`, `voice-volume` and a few others
  (`path-length` in 30, `shape-subtract` and the `rule-*-inset`
  properties in 28 and 29); from 28 two strings in `voice-family`. jsdom
  28 and 30 reject a `content` of a lone `counter(a)`, `counters(a, ".")`
  or `attr(x)`. warpdom keeps all of these
- `@page` ([#265](https://github.com/sonukapoor/warpdom/issues/265)): jsdom 27.1 and later drop `page-orientation` and
  `size`, and leave `margin-top` empty under a `margin` shorthand (27.0.1
  keeps them, in a `CSSStyleRule`). jsdom 26.1.0 to 27.0.1 keep each
  descriptor under its name as written (`margin-top: 1px !important;
  MARGIN-TOP: 2px !important` serializes both, and `margin-top` is 1px),
  and from 28.1.0 setting the rule's `style.cssText` to `Margin-Top: 1px
  !important; MARGIN-TOP: 2px !important` leaves it empty (28.1.0,
  29.1.1, 30.1.3; 27.4.0 keeps 2px). warpdom keeps the descriptors,
  lowercases their names and gives 2px
- `!important` on a `var()` value of a property other than a custom
  property in jsdom 30.0.0 and 30.1.0
  ([#265](https://github.com/sonukapoor/warpdom/issues/265)): through `setProperty()` or `cssText`, those releases drop
  it (`color: var(--a) !important` reads `color: var(--a);`), as 27 to 29
  do; warpdom's 30.0 and 30.1 profiles keep it. A custom property keeps
  it in every version (`--x: var(--a) !important`)
- before jsdom 27.1.0, more of a style rule's cssom object
  ([#253](https://github.com/sonukapoor/warpdom/issues/253)): after `background: red; background-color: blue`,
  setting `background-color` to `''` removes the color in jsdom (warpdom
  computes the shorthand's red again); cssstyle's setter takes
  `setProperty('width', 'var(--a) foo(')` (jsdom 26 and 27.0), which
  warpdom's computed style drops; a name with a no-break space inside
  (`w idth`) stays an unknown name in jsdom (warpdom reads `width`); with
  several blocks in the `cssText` setter (`a{color:red;} b{top:1px;}`),
  warpdom reads the second block's first name as `;top`; and an object
  with a throwing `toString()` assigned to `style.width` throws when the
  value is first read in jsdom 26 and 27.0, at the assignment in warpdom.
  With cssstyle 2.3 to 4.1 (jsdom 20 to 25), style sheets keep some
  `var()` declarations that warpdom drops ([#147](https://github.com/sonukapoor/warpdom/issues/147)), and in jsdom
  27 and 28 some `var()` `border` shorthands in a rule compute otherwise or
  throw a TypeError ([#113](https://github.com/sonukapoor/warpdom/issues/113))
- comments, more ([#264](https://github.com/sonukapoor/warpdom/issues/264)): jsdom 27 keeps a leading or trailing
  comment through `setProperty()` and the accessor (`border-radius:
  /**/1px`) and drops the priority when a comment is next to or inside
  `!important` in a value it keeps as written. `background`,
  `background-position` and `background-size` reject `1px/**/2px`
  (`background` from 30.1.2), which warpdom reads as `1px 2px`. From
  jsdom 28, `voice-family` and `animation-range-center` drop a leading or
  trailing comment, and jsdom 30 keeps a hex escape's space before a
  comment (`container-name: \62 /**/` is `\62 `)

Computed values not modeled:

- the `font` shorthand composed from its longhands (jsdom's
  `getComputedStyle().font` and `el.style.font`)
- a shorthand followed by one of its longhands in a style sheet: from
  jsdom 27.1, `background: red; background-color: blue` serializes as
  `background: red` and computes `rgb(255, 0, 0)` to 30.1.2 and blue from 30.1.3, where a value read
  before the rule's `background-color` is edited or removed stays until
  the document's tree changes. warpdom keeps both declarations: it
  computes blue, and red once `background-color` is removed
- a `font` shorthand declared `!important` in a style sheet, with
  cssstyle 4.6 (jsdom 23.1 to 26) and in jsdom 27.0 to 28.0: jsdom keeps
  its longhands against later normal declarations of them, in later rules
  or the style attribute (`div { font: 20px serif !important }` with
  `style="font-size: 10px"` computes 20px), and with cssstyle 4.6 against
  a later normal `font` too. warpdom applies them in document order, as
  every other declaration before 28.1, so 10px. `margin`, `border`,
  `background`, `flex` and `list-style` do not do this, nor does `font`
  with cssstyle 2.3, 3.0 and 4.1 (4.2 to 4.5 not measured)
- jsdom 30's `calc()` mixing percentages and em (`calc(100% - 0px)`)
- the uppercase units and `calc()` simplification of declared values in
  jsdom 29 and 30

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
- jsdom 28.1.0 to 30.1.2 apply the matching rules' `border`, `font`,
  `background` and `flex` declarations in document order, as they do
  `margin` and `padding`; warpdom still orders these families by
  specificity, so competing rules of different specificity can compute
  differently there ([#147](https://github.com/sonukapoor/warpdom/issues/147)). From jsdom 29, a normal longhand left
  pending by a shorthand in the `style` attribute meets `!important` rules
  differently; cssstyle 4.2 to 4.5 were not measured for dropping
  `!important` from custom properties (warpdom puts the change at 4.6)
- jsdom 29.1.1: computed box values depend on what was read before
  ([#106](https://github.com/sonukapoor/warpdom/issues/106)): with `padding-left: 2px`, a fresh window gives `0 0 0
  2px` for `padding`, and after `getPropertyValue('border-width')` is read
  on an element with `border-width: 1px 1px`, `0px 0px 0px 2px`
  (`padding: var(--p)` changes from `0` to `0px`). warpdom always gives
  the fresh-window values
- a length and a number mixed in a math function ([#111](https://github.com/sonukapoor/warpdom/issues/111)): for
  `width: calc(1em * min(2px, 3))`, jsdom 30.1.3 computes `calc(16px*min(2px,
  3))`, jsdom 29.1.1 `calc(1em*min(2px,3))`, and jsdom 26 to 28 `calc(1em
  * min(6px * ,))`; warpdom keeps the value as written
- `<shorthand>: inherit` when the parent declares nothing ([#224](https://github.com/sonukapoor/warpdom/issues/224)):
  jsdom 29.1.1 gives `''` for `border-radius`, `outline`,
  `text-decoration`, `columns`, `list-style`, `gap`, `place-items` and
  `background` (warpdom `see individual properties`) and `0px` for
  `margin` (warpdom `0`), and jsdom 30.1.3 gives `16px depends on user
  agent` for `font: inherit` (warpdom `''`)
- jsdom 26 computes `unset` as written (`marginTop = 'unset'` after
  `margin: 1px`; warpdom `''`), jsdom 20 to 25 compute `margin` as `''`
  for `margin: inherit; margin-right: 0px` (warpdom `inherit`), jsdom 29
  computes `margin-top: inherit` from a style attribute as `0px` (warpdom
  `0`), and jsdom 30 computes `margin-right` as 0 after `style.margin =
  '1px'; style.removeProperty('margin-right')` (jsdom 27 to 29 and warpdom
  1px; padding the same) ([#265](https://github.com/sonukapoor/warpdom/issues/265))
- jsdom 28, once a computed custom property has been read: computed
  colors come back as written (`red`, not `rgb(255, 0, 0)`), and the
  computed style's `setProperty()` stops throwing ([#264](https://github.com/sonukapoor/warpdom/issues/264))
- writes to the computed style object in the jsdom 20 and 22 profiles
  ([#97](https://github.com/sonukapoor/warpdom/issues/97)): after `cs.font = '20px Arial'; cs.font = 'inherit'`,
  warpdom reads `font` as `Arial 20px 20px`; jsdom gives `''` for `font`,
  `fontSize` and `fontFamily`
- `calc()` in color channels, jsdom 26 and later
  ([#112](https://github.com/sonukapoor/warpdom/issues/112)):
  `hsl(calc(120 + 0), 100%, 50%)` computes to `rgb(0, 255, 0)`; warpdom
  keeps it as written
- jsdom 29.1.1: a `<dialog>`'s top, right and bottom border colors are
  `rgb(0, 0, 0)` whatever its `color`
  ([#187](https://github.com/sonukapoor/warpdom/issues/187))
- jsdom 29.0.2 to 29.1.1: a `border` or `border-color` shorthand in a
  style sheet that gives the color as `currentcolor`, by omitting it or
  through `initial` or `inherit`, computes to the parent's color instead of the
  element's own when the element's own `color` comes from its `style`
  attribute (or `el.style`), and children that inherit the border color
  get that color ([#199](https://github.com/sonukapoor/warpdom/issues/199)).
  With `<div style="color: blue"><p style="color: red">` and
  `p { border: 1px solid }`, the `p`'s `border-top-color` is
  `rgb(0, 0, 255)`; warpdom gives the element's own color, as jsdom 30
  does. When the element's `color` comes from a style sheet
  (`p { color: red; border: 1px solid }`), or the shorthand is in the
  `style` attribute too, jsdom gives the element's own color, as warpdom
  does. In the `style` attribute, `border: inherit`, `border: initial` and
  `border-color: inherit` resolve to the element's own color in jsdom
  29.1.1, and children that inherit the border color get that fixed color;
  warpdom keeps `currentcolor`, so each child gets its own. Some longer
  `inherit` chains through style sheet rules differ as well (a rule that
  matches both the parent and the child, or a parent whose `currentcolor`
  comes from a style sheet)

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
| Window members made on first read, such as `Image` and `Option` ([#229](https://github.com/sonukapoor/warpdom/issues/229)) | Accessors, also after `Object.defineProperty(window, name, { configurable: false })` before the first read. `{ writable: false }` before the first read leaves the value undefined. On a frozen window, a sloppy-mode assignment or `Reflect.set` throws. In fast mode, the per-file reset does not clear a value stored for such a member once locked | Data properties. From 27, `{ writable: false }` keeps the value. On a frozen window (27 and later), a sloppy-mode assignment fails silently and `Reflect.set` returns false |
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
