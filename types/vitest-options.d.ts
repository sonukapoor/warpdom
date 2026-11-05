// Vitest's environmentOptions.warpdom (src/vitest.js), and its type in
// Vitest's own config types: imported by the types of every warpdom/vitest
// entry point, so a vitest.config.ts that imports one of them checks
// test.environmentOptions.warpdom.
import type { JsdomVersion } from './index.js';

/** `test.environmentOptions.warpdom` in a Vitest config. */
export interface WarpdomVitestOptions {
  /**
   * The document's URL. Default `'http://localhost:3000'`, as Vitest's jsdom
   * environment's (`environmentOptions.jsdom.url`).
   */
  url?: string;
  /**
   * The jsdom version to behave like. Default: the jsdom the project
   * installs (or Vitest resolves), else the newest warpdom models.
   */
  jsdom?: JsdomVersion;
  /** For jsdom 26 and earlier: the cssstyle version it loads. Default: the installed one. */
  cssstyle?: string;
  /** Run animation frames without the real-time wait (docs/fast-frames.md). Default `false`. */
  fastFrames?: boolean;
  /**
   * `false` leaves out XMLHttpRequest (and XMLHttpRequestEventTarget and
   * XMLHttpRequestUpload), so HTTP libraries that look for it (axios) use
   * the host's HTTP client instead. Default `true`, as jsdom has it.
   */
  xhr?: boolean;
  /**
   * `true` keeps the interfaces warpdom has before the jsdom it follows
   * exposes them as globals (`ToggleEvent`, `FormDataEvent`, `TimeRanges`,
   * `CSSKeyframesRule` before jsdom 29, ...; docs/jsdom-versions.md).
   * Default `false`: the window has the globals that jsdom version has.
   */
  beyondJsdom?: boolean;
}

/** Vitest's `test.environmentOptions`, as warpdom's environment reads it. */
export interface WarpdomVitestEnvironmentOptions {
  warpdom?: WarpdomVitestOptions;
  [key: string]: unknown;
}

declare module 'vitest/node' {
  interface EnvironmentOptions {
    /** warpdom's options (warpdom/vitest). */
    warpdom?: WarpdomVitestOptions;
  }
}
