// warpdom's Vitest environment (src/vitest.js): `test.environment` set to
// its path (warpdom/vitest/environment) or `'warpdom'` with the
// vitest-environment-warpdom package.
import type { JsdomVersion } from './index.js';
import type { WarpdomVitestEnvironmentOptions } from './vitest-options.js';

export type { WarpdomVitestOptions, WarpdomVitestEnvironmentOptions } from './vitest-options.js';

/** The environment object Vitest loads (its `Environment` interface). */
export interface WarpdomVitestEnvironment {
  name: 'warpdom';
  viteEnvironment: 'client';
  /** Given to Vitest 3 and earlier only. */
  transformMode?: 'web';
  /** Vitest's VM pools (vmThreads, vmForks): a VM context whose global object is the window. */
  setupVM(options: WarpdomVitestEnvironmentOptions): Promise<{
    getVmContext(): { [key: string]: any };
    teardown(): void;
  }>;
  /** The other pools: the window's members installed on the test file's global object. */
  setup(global: any, options: WarpdomVitestEnvironmentOptions): { teardown(): void };
}

declare const environment: WarpdomVitestEnvironment;
export default environment;

/** The jsdom profile the environment uses: `environmentOptions.warpdom`, else the installed jsdom (and its cssstyle). */
export function jsdomProfile(
  options?: WarpdomVitestEnvironmentOptions,
  root?: string,
): {
  jsdom: JsdomVersion | undefined;
  cssstyle: string | undefined;
};

/** The jsdom version of jsdomProfile(). */
export function jsdomVersion(options?: WarpdomVitestEnvironmentOptions, root?: string): JsdomVersion | undefined;
