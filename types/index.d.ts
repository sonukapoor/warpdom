// Types of warpdom's core: `import { createWindow } from 'warpdom'` and
// `const { createWindow } = require('warpdom')` (dist/warpdom.d.cts is a copy
// of this file, made by scripts/build-cjs.mjs). Hand-written; kept in step
// with src/node.js and src/window.js by test/types (npm run test:types).
/// <reference lib="dom" />

/**
 * A warpdom window: the DOM's `Window`, with every interface constructor
 * (`window.HTMLElement`, `window.Event`, ...) as a property, as on a
 * browser's global object.
 *
 * Typed as the DOM library's `Window & typeof globalThis`, as TypeScript
 * types a browser's `window`. With `@types/node` in the program,
 * `typeof globalThis` also lists Node's globals (`process`, `Buffer`),
 * which a warpdom window does not have.
 */
export type WarpdomWindow = Window & typeof globalThis;

/** A jsdom version, as `'30.1.2'` or a major version (`26`, `'26'`). */
export type JsdomVersion = string | number;

export interface CreateWindowOptions {
  /**
   * The document's URL (`location.href`, `document.URL`, the base URL of
   * relative links). Default `'about:blank'`, as jsdom's. The Jest
   * environment uses `'http://localhost/'` and the Vitest environment
   * `'http://localhost:3000'`, as jsdom's environments do.
   */
  url?: string;
  /**
   * The jsdom version whose observable behavior to follow (computed style
   * values, which interfaces exist, error wording). Default: the newest
   * jsdom warpdom models. The test environments pass the jsdom the project
   * installs.
   */
  jsdom?: JsdomVersion;
  /**
   * For jsdom 26 and earlier: the cssstyle version that jsdom loads, whose
   * behavior changed between minor releases (e.g. `'4.6.0'`). Default: the
   * one that jsdom version brings.
   */
  cssstyle?: string;
  /**
   * Run `requestAnimationFrame` callbacks as soon as the event loop gets to
   * them instead of every 16.7 ms of real time. Default `false`
   * (docs/fast-frames.md).
   */
  fastFrames?: boolean;
}

/**
 * Creates a new window with its own document (an empty HTML document:
 * doctype, `html`, `head` and `body`) and its own prototypes and
 * constructors for every interface. Scripts in parsed HTML do not run, as
 * with jsdom's default `runScripts`.
 *
 * Throws a `TypeError` when `url` is not a valid absolute URL.
 */
export function createWindow(options?: CreateWindowOptions): WarpdomWindow;

/**
 * Sets the function that returns the HTML parser (parse5's API) the first
 * time HTML is parsed. The Node entry point sets it to `require('parse5')`;
 * other runtimes (the package's `default` export condition) call it before
 * parsing HTML.
 */
export function setParserLoader(loader: () => unknown): void;

/**
 * Sets the function that returns the XML parser (`@rgrove/parse-xml`'s
 * API) the first time XML is parsed. Set by the Node entry point.
 */
export function setXmlParserLoader(loader: () => unknown): void;

/**
 * Sets the function that returns warpdom's XPath engine (src/xpath.cjs)
 * the first time XPath is used. Set by the Node entry point.
 */
export function setXPathLoader(loader: () => unknown): void;
