# "jsdom-compatible" is not one target: your tests encode a jsdom version

<!--
DRAFT OUTLINE, not published. Author: Sonu Kapoor.
Bullet points plus the key table; to be written out after article 1.
Sources: PLAN.md (Decisions 2026-10-11 "Behave like the jsdom generation
the tests were written for", "CSS value validation", "CSSOM conformance",
"Global attributes, directionality", "Document tree accessors",
"Deliberate deviations from jsdom"), docs/research/README.md finding F1,
docs/research/data/css/sweep*.json, src/window-features.js (the profile),
src/vitest.js and src/jest.js (version detection).
-->

## The claim

- A test suite does not test against "the DOM" or even "jsdom". It tests
  against the jsdom version that was installed when its assertions were
  written, and the assertions quietly encode that version's behavior.
- So "jsdom-compatible" is several targets. One corpus of 14 projects
  needed at least two jsdom generations at once.
- Why it happens: Jest 30's `jest-environment-jsdom` still bundles jsdom
  26, while Vitest projects use whatever jsdom they install (the harness
  provides jsdom 30 when a project has none). element-plus pins jsdom 16,
  and some of its tests rely on behavior jsdom 30 dropped.
  <!-- source: PLAN.md 2026-10-11 decision; docs/research/README.md 2.2; PLAN.md Next steps 3 (element-plus) -->

## The story that found it

- Two real suites, opposite expectations of the same API:
  `getComputedStyle` on a property nobody declared.
  - jsdom before 29: an empty string for most of them. react-aria's
    tests (react-spectrum, Jest, so jsdom 26) rely on that.
  - jsdom 29 and later: the initial value. MUI's tests (Vitest, newer
    jsdom) rely on `opacity` being `1`.
  - No single behavior passes both suites. A DOM that is "like jsdom"
    has to ask "like which jsdom?".
- Second example: react-aria fakes a layout by writing `position:
  relative` onto the object `getComputedStyle` returns. jsdom before 28
  accepts writes to computed styles; 28 and later throw where the
  standard says so (writing `''` throws).
- Third example, a patch release: jsdom 30.1.2 (2026-10-04) made
  `focus()` respect `display: none` and `[hidden]`. ark-ui's signature
  pad test focuses a `[hidden]` input. A patch version changes whether a
  test passes, so major versions are not enough.
  <!-- source: PLAN.md 2026-10-11 decision; docs/research/README.md F1 -->

## Key table: version-specific behaviors tests can observe

"In profile" means warpdom follows the installed jsdom version for this
behavior. "Project" is a corpus project whose tests depended on it, where
we recorded one.

| Behavior | jsdom versions | Project whose tests depended on it | In warpdom's profile |
| --- | --- | --- | --- |
| `getComputedStyle`: undeclared properties | before 29: mostly `''`; 29+: initial values | react-spectrum (react-aria) needs `''`; MUI needs `opacity: 1` | yes |
| Computed `color` with nothing declared | before 27: `canvastext`; 27+: `rgb(0, 0, 0)` | [TODO: which project, if any] | yes (src/cascade.js) |
| Writes to a computed style object | before 28: accepted; 28+: change that object and the element's computed value until the document changes, methods throw, writing `''` throws | react-spectrum (react-aria fakes `position: relative`) | yes |
| `PointerEvent` and `onpointer*` handlers | absent before 27 | [TODO: which project] | yes |
| `element.click()` event type | before 27: `MouseEvent`; 27+: `PointerEvent` | [TODO: which project] | yes |
| `focus()` on `display: none` / `[hidden]` elements | before 30.1.2 (a patch release): focuses them; 30.1.2+: does not | ark-ui (signature pad focuses a `[hidden]` input) | yes, by full version |
| CSS value validation (invalid values dropped) | 26: 57 of 595 known properties checked; 27: all 637; 30: all 814 | react-spectrum (`width: undefined%`); handsontable (most of its 16 differences on 2026-10-11) | yes (26 vs 27+) |
| `CSS` namespace (`CSS.supports`, `CSS.escape`) | only 30+ | handsontable (validates sizes with `CSS.supports` when present, else its own parser) | yes |
| Document named properties (`document.myForm`) | only 30+ (checked black-box: none in 26.1, 27.2, 29.1.1; present in 30.1.2) | none recorded (found through WPT) | yes |
| Top-level `@media` rules applied by `getComputedStyle` | 26: only a `screen` query (case-sensitive); 27+: empty, `all` or `screen` | [TODO: which project] | yes |
| `insertRule` with text after the rule | 26: extra text ignored; later versions follow CSSOM (exactly one rule) [TODO: confirm the jsdom version boundary] | none recorded (found through WPT css/cssom) | yes |
| Reading `style.background` | 26: the `background-color` set alone | [TODO] | yes |
| `url()` quoted when serialized | 26: background properties only; 27+: also `content`, `list-style-image`, `mask-image`, `filter` | [TODO] | yes |
| Serialization details: `, ` inside `min()`/`max()`/`clamp()`/gradients; `background-position` split into -x/-y; `background-repeat` shortest form; `color: red !important; color: blue` keeps red | 27+ | [TODO] | yes, per PLAN's CSSOM entry |
| Shorthand merging on serialization | 26: margin, padding (as written: `1px 2px 1px 2px`); newer (warpdom's model): also flex, background-position [TODO: confirm which versions]; 30: expands padding into longhands, merges border/overflow/outline/list-style | [TODO] | partly: warpdom keeps the 26 and 27-29 models, not jsdom 30's |
| Box shorthands shortened (`margin: 0 0` -> `0px`) | 26 does not shorten (`0px 0px` stays) | [TODO] | PLAN: not in the profile yet [TODO: check, src/css.js has a jsdom 26 merge mode since] |
| A lone `0` for properties jsdom's CSS layer did not know (`inset: 0`) | before 28: kept as written | [TODO] | not yet |
| Computed lengths made absolute (`em`, `rem`, `vh`, `calc()`) | 30 only (26-29 do not; checked with 27.2, 27.4, 29.1) | none yet ("best checked on a jsdom 30 corpus suite") | not done |
| Computed `direction` | 26: `''` | none recorded (WPT) | yes (26 keeps `''`) |
| `MediaList` normalization (lowercase, `not all` for invalid) | 26: kept as written; 30: normalized | none recorded | no: jsdom 30's in every profile (a deliberate deviation) |
| Style indexed properties (`style[0]`) writable | 26: writable; 30: read-only | none recorded | no: writable in every profile (read-only made every style write ~15% slower) |
<!-- sources per row: PLAN.md 2026-10-11 jsdom-generation decision (rows 1, 3-6, 8, 16-17), CSS value validation decision and data/css/sweep26/27/30.json (row 7: verified counts 57/595, 637/637, 814/814), CSSOM conformance decision (rows 10-14, 15 jsdom 30 part, 18, 20-21), Global attributes decision (row 19), Document tree accessors (row 9), PLAN Corpus + docs/research/README.md 3.1-3.2 (handsontable 16 -> 3); src/cascade.js (row 2), src/css.js MERGED (row 15). -->

## How warpdom picks the behavior

- `createWindow({ jsdom })` takes a jsdom version: a full version
  (`'30.1.1'`) or a bare major (meaning that major's latest release).
  Default: the current jsdom.
- The adapters pass the installed version, read from `jsdom/package.json`:
  - **Vitest:** `environmentOptions.warpdom.jsdom` if set; else the
    project's own jsdom; else the jsdom Vitest itself would resolve; else
    the default.
  - **Jest:** `testEnvironmentOptions.jsdom` if set; else the jsdom that
    the project's `jest-environment-jsdom` brings (26 with Jest 30); else
    26.
  - Windows created for iframes inherit their parent's version.
  <!-- source: src/vitest.js jsdomVersion(), src/jest.js jsdomVersion(), src/window-features.js setupWindow(), src/window.js createNestedWindow; PLAN.md 2026-10-11 decision -->
- Rule for what goes into the profile: only behaviors that changed
  between versions in ways tests observe. Everything else follows the
  current standard (and where jsdom departs from the standard in ways no
  realistic test relies on, warpdom follows the standard: see the
  deviations list in PLAN.md).
- Related rule: members jsdom lacks that libraries feature-detect are
  only added together with their behavior. Example: `inert`. react-aria
  uses the inert attribute instead of `aria-hidden` when it detects it,
  and warpdom does not implement inertness, so `inert` is left out, as in
  jsdom.
  <!-- source: PLAN.md "Deliberate deviations" (inert), 2026-10-11 decision -->

## How we found the boundaries (method)

- Black-box sweeps against several installed jsdom versions (26, 27, 30;
  spot checks of 26.1, 27.2, 27.4, 29.1, 29.1.1, 30.1.2), never reading
  jsdom's source. Scripts: `dom-api-tracer/scripts/research/css-parity/`
  (value validation, shorthands, zero lengths).
- CSS value validation parity against jsdom 30: 35,420 property/value
  pairs; 0 values jsdom accepts are rejected by warpdom; 1,101 values
  jsdom rejects are accepted (warpdom fails open where a grammar is not
  machine-readable).
- Per-test status comparison on the corpus pointed at each behavior
  (react-spectrum 304 -> 0 differences, handsontable 16 -> 3).
  <!-- source: docs/research/README.md F1, F2, 3.1; data/css/val-parity-jsdom30.json (wdRejects 0, wdAccepts 1,101: verified) -->

## Side effect worth a paragraph

- Following jsdom 26's code paths changed speed too: handsontable (Jest,
  jsdom 26) went from 2.59x to 3.04x faster than jsdom after the profile
  landed, more than cheaper startup explains. Likely cause: without a
  `CSS` namespace it uses its own size parser, and invalid declarations
  are dropped. Not profiled yet. [TODO: profile handsontable core before
  claiming the cause]
  <!-- source: PLAN.md 2026-10-11 "Suite timings before and after validation and lazy interfaces"; docs/research/README.md 3.2 -->

## Takeaways for readers (draft)

- Upgrading jsdom (or Jest) can change test results without any change in
  your code; pin and read the changelog for CSSOM and focus changes.
- If you evaluate a jsdom alternative, compare against the jsdom version
  your tests were written on, not the latest.
- Tests that assert on unspecified or legacy DOM details (empty computed
  values, writable computed styles) are coupled to one jsdom generation.

## Open points for the full article

- Name which corpus projects use which jsdom version [TODO: list installed
  jsdom per Vitest project from the corpus checkouts].
- Fill the [TODO] project cells above, or drop the column for those rows.
- Decide whether to report this upstream to jsdom (a "behavior changes
  observable by tests" note in its changelog would help everyone).
