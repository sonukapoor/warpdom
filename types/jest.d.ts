// warpdom's Jest environment (src/jest.js): `testEnvironment: 'warpdom/jest'`,
// or `'warpdom'` with the jest-environment-warpdom package.
import type { JsdomVersion, WarpdomWindow } from './index.js';

/** `testEnvironmentOptions` in a Jest config (or a `@jest-environment-options` comment). */
export interface WarpdomJestEnvironmentOptions {
  /** The document's URL. Default `'http://localhost/'`, as jest-environment-jsdom's. */
  url?: string;
  /**
   * The jsdom version to behave like. Default: the jsdom that the project's
   * jest-environment-jsdom brings, else 26 (Jest 30's).
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
  /** Export conditions for resolving packages. Default `['browser']`, as jest-environment-jsdom's. */
  customExportConditions?: string[];
  [key: string]: unknown;
}

/** The parts of Jest's project config the environment reads. */
export interface WarpdomJestProjectConfig {
  rootDir?: string;
  testEnvironmentOptions?: WarpdomJestEnvironmentOptions;
  globals?: Record<string, unknown>;
  [key: string]: unknown;
}

/** A Jest test environment (Jest 27 to 30) whose global object is a warpdom window. */
export default class WarpdomEnvironment {
  /** Jest 28 and later pass `{ globalConfig, projectConfig }`; Jest 27 the project config. */
  constructor(
    config: { projectConfig: WarpdomJestProjectConfig; globalConfig?: unknown } | WarpdomJestProjectConfig,
    context?: unknown,
  );
  /** The test file's global object (the VM context's), null after teardown. */
  global: WarpdomWindow;
  /** The warpdom window behind the global object, null after teardown. */
  window: WarpdomWindow | null;
  /** The VM context, null after teardown. */
  context: object | null;
  /** Jest's legacy fake timers (@jest/fake-timers). */
  fakeTimers: unknown;
  /** Jest's modern fake timers (@jest/fake-timers). */
  fakeTimersModern: unknown;
  /** Jest's module mocker (jest-mock). */
  moduleMocker: unknown;
  customExportConditions: string[];
  setup(): Promise<void>;
  teardown(): Promise<void>;
  exportConditions(): string[];
  getVmContext(): object | null;
}
