// warpdom/vitest/fast (src/vitest-fast.js): fast mode (docs/fast-mode.md).
import './vitest-options.js';

export interface WithFastModeOptions {
  /** The file with what was learned. Default `CACHE_FILE`. */
  cache?: string;
  /** With `test.projects`: the name of the project to split. */
  project?: string;
}

/**
 * Returns the Vitest config with the fast project (no isolation, warpdom's
 * per-file reset) and the isolated project (files known to leak state), or
 * the config unchanged when isolated runs were measured to be faster or
 * nothing has been learned yet. Config functions and promises are wrapped.
 */
export function withFastMode<T = {}>(config?: T, options?: WithFastModeOptions): T;

/** `'.warpdom/fast-mode.json'`, where `warpdom vitest run` keeps what it learned. */
export const CACHE_FILE: string;

/** The name of a project's isolated twin: `'<name> (isolated)'`. */
export function isolatedName(name: string): string;

/** What fast mode learned (the cache file), or null when there is none or it is from another version. */
export function readCache(file?: string): FastModeCache | null;

export interface FastModeCache {
  version: number;
  /** Test files that run isolated. */
  isolate: string[];
  [key: string]: unknown;
}

/** The path of the reporter `warpdom vitest run` adds. */
export const REPORTER: string;
