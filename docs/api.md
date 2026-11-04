# API

Most suites use warpdom only as a test environment (README, "Setup"). This
page is for code that creates windows itself: test helpers, scripts, and
tests that called `new JSDOM()`.

## Loading warpdom

```js
// ES modules
import { createWindow } from 'warpdom';

// CommonJS, also inside Jest test files
const { createWindow } = require('warpdom');
```

What `warpdom` resolves to:

| Loaded by | Gets | Why |
|---|---|---|
| Node, `import` or `require()` | `src/node.js` (ES modules) | Node 22.12 and later can `require()` ES modules (the `module-sync` condition): one copy of warpdom for both |
| Jest's module system (test files, setup files), before Node 24.9 | `dist/warpdom.cjs` | Jest runs test files' `require()` itself and cannot load ES modules synchronously there; this CommonJS build bundles the core with its parsers |
| Jest 27 (ignores `exports`) | `dist/warpdom.cjs` (`main`) | |
| Other runtimes, browser bundlers | `src/index.js` | No parser is loaded for them: call `setParserLoader(() => parse5)` (and `setXmlParserLoader` for XML, `setXPathLoader` for XPath) before parsing; see "Loaders for other runtimes" below |

Inside Jest test files the CommonJS build is a second copy of warpdom, next
to the one the test environment (`warpdom/jest`) runs on. Windows of the two
copies are independent, which is what tests that create their own window
want; do not move nodes from one copy's window into the other's
(`adoptNode`, `appendChild` across them). The CommonJS build reads
platform objects (`TextEncoder`, `crypto`, `performance`) from Node, as the
ES modules do, not from the test environment's global object; timers and
`console` are the test file's, so Jest's fake timers and console capture
apply to them.

### Loaders for other runtimes

warpdom loads its HTML parser, XML parser and XPath engine the first time
each is needed, through a loader function. The Node entry point
(`src/node.js`) registers all three with `require()`; on other runtimes
(`src/index.js`), register the ones the code uses before it needs them.
Each takes a function that returns the module synchronously. warpdom
calls it once, at the first use, and keeps what it returns; setting a new
loader drops that module, and the next use calls the new one:

| Function | The loader returns | Needed for |
|---|---|---|
| `setParserLoader(loader: () => unknown): void` | parse5's API (`parse`, `parseFragment`, ...) | Parsing HTML: `innerHTML`, `DOMParser` with `text/html`, `document.write`, ... |
| `setXmlParserLoader(loader: () => unknown): void` | `@rgrove/parse-xml`'s API | Parsing XML: `DOMParser` with an XML type, `innerHTML` in XML documents |
| `setXPathLoader(loader: () => unknown): void` | warpdom's XPath 1.0 engine, `src/xpath.cjs` in the package (its `createXPath` export) | XPath: `document.evaluate`, `createExpression`, `XPathEvaluator` |

Without a loader, the first use throws an `Error` naming the function to
call (`warpdom: no XPath engine available. Import warpdom from Node, or
call setXPathLoader().`). Until then, the XPath interfaces exist and cost
a few small functions; the engine loads the first time an expression is
compiled. `src/xpath.cjs` is not one of the package's `exports`, so a
bundler imports it by its file path:

```js
import * as parse5 from 'parse5';
import * as parseXml from '@rgrove/parse-xml';
import * as xpath from './node_modules/warpdom/src/xpath.cjs';
import { createWindow, setParserLoader, setXmlParserLoader, setXPathLoader } from 'warpdom';

setParserLoader(() => parse5);
setXmlParserLoader(() => parseXml);
setXPathLoader(() => xpath);

const window = createWindow();
```

## `createWindow(options?)`

Returns a new window: its own document (an empty HTML document with a
doctype, `html`, `head` and `body`) and its own prototypes and constructors
for every interface, so patches made in one window do not leak into
another.

| Option | Default | Meaning |
|---|---|---|
| `url` | `'about:blank'` | The document's URL (`location`, `document.URL`, the base URL). A `TypeError` when it is not an absolute URL |
| `jsdom` | the newest jsdom warpdom models | The jsdom version to behave like (`'26.1.0'`, or a major version, `26`): see README, "Which jsdom warpdom behaves like" |
| `cssstyle` | the one that jsdom brings | For jsdom 26 and earlier, the cssstyle version it loads |
| `fastFrames` | `false` | Animation frames without the real-time wait ([fast-frames.md](fast-frames.md)) |
| `beyondJsdom` | `false` | `true` keeps the globals of interfaces warpdom has before the jsdom it follows exposes them (`ToggleEvent`, `FormDataEvent`, `TimeRanges`, `CSSKeyframesRule` before jsdom 29, ...: [jsdom-versions.md](jsdom-versions.md#globals-that-appear-in-a-later-jsdom)). By default the window has the globals that jsdom version has; the objects of the others exist either way. Frames inherit it |
| `xhr` | `true` | `false` leaves out `XMLHttpRequest`, `XMLHttpRequestEventTarget` and `XMLHttpRequestUpload` (see README, "XMLHttpRequest and request mocking"); frames inherit it. Where the host's `fetch` hides redirects (browsers), the host follows them with its own checks, and the request that finds this out is sent twice. On browser hosts, cross-origin requests fail: the browser's `fetch` hides the CORS headers warpdom checks ([#91](https://github.com/sonukapoor/warpdom/issues/91)) |

Scripts in parsed HTML do not run, as with jsdom's default (`runScripts`
not set). The test environments set `url` (`http://localhost/` for Jest,
`http://localhost:3000` for Vitest) and `jsdom` (the installed jsdom) for
their windows; `createWindow` uses neither unless given. The environments
take `url` as `environmentOptions.warpdom.url` (Vitest) and
`testEnvironmentOptions.url` (Jest), and `beyondJsdom` as
`environmentOptions.warpdom.beyondJsdom` and
`testEnvironmentOptions.beyondJsdom`, as they take `xhr`.

## From jsdom

| jsdom | warpdom |
|---|---|
| `const dom = new JSDOM()` | `const window = createWindow()` |
| `new JSDOM(html, { url })` | `const window = createWindow({ url })`, then the HTML, as below |
| a whole document: `new JSDOM('<!doctype html><html>...')` | `window.document.open(); window.document.write(html); window.document.close();` |
| a fragment: `new JSDOM('<div id="app"></div>')` | `window.document.body.innerHTML = html` |
| `dom.window` | the window itself |
| `dom.window.document` | `window.document` |
| `dom.serialize()` | `'<!DOCTYPE html>' + window.document.documentElement.outerHTML` (with the document's doctype) |
| `JSDOM.fragment(html)` | `const t = window.document.createElement('template'); t.innerHTML = html; t.content` |
| `contentType: 'application/xml'` (an XML document) | `new window.DOMParser().parseFromString(xml, 'application/xml')` |
| `dom.reconfigure({ url })`, same origin | `window.history.replaceState(null, '', url)` |
| `pretendToBeVisual: true` | not needed: `requestAnimationFrame` always exists |
| `dom.window.close()` | not needed: drop the window (clear timers it started) |
| `runScripts`, `resources`, `virtualConsole`, `cookieJar`, `beforeParse`, `includeNodeLocations`, `storageQuota`, `referrer` | not supported |

"Not implemented" reports (navigation, `window.alert`) go to `console.error`,
where jsdom's default virtual console sends them.

For example, a Jest test that built a page with jsdom:

```js
// before
const { JSDOM } = require('jsdom');
const dom = new JSDOM('<!doctype html><body><div id="root"></div></body>', { url: 'https://example.com/' });
const { window } = dom;

// after
const { createWindow } = require('warpdom');
const window = createWindow({ url: 'https://example.com/' });
window.document.body.innerHTML = '<div id="root"></div>';
```

## TypeScript

warpdom ships its types (`types/`, and `dist/warpdom.d.cts` for
`require()`); nothing to install. `createWindow` returns a `WarpdomWindow`,
the DOM library's `Window & typeof globalThis` (as TypeScript types a
browser's `window`); the types reference the DOM library, so a project
without `"lib": ["dom"]` gets it with them.

```ts
import { createWindow, type CreateWindowOptions, type WarpdomWindow } from 'warpdom';
import type { WarpdomJestEnvironmentOptions } from 'warpdom/jest';
import type { WarpdomVitestOptions } from 'warpdom/vitest';
```

A `vitest.config.ts` that imports `warpdom/vitest/environment` (or
`warpdom/vitest/fast`) has `test.environmentOptions.warpdom` checked: the
types add it to Vitest's `EnvironmentOptions`. Jest types
`testEnvironmentOptions` as a plain record; annotate it with
`WarpdomJestEnvironmentOptions`.

`warpdom/compare` and `warpdom/migrate` are typed too:
`compare(options): Promise<CompareResult>` ([compare.md](compare.md)) and
`migrate(options): Promise<MigrateResult>` ([migrate.md](migrate.md)).
