// The learned state of fast mode (./vitest-fast.js, ./vitest-fast-cli.js),
// without Vitest: the CLI reads it before it decides whether to load
// Vitest in its own process.
//
// .warpdom/fast-mode.json, version 2:
//   mode       'split' | 'isolated'
//   isolate    files run isolated in split mode (relative to the project):
//              those whose results differed without isolation, failed
//              without isolation, or had an unhandled error there
//   leaky      the part of isolate that passed isolated (they leak)
//   learned    { isolated, fast, split, splits, files }: the learning's
//              run times (s; splits: every split run of the learning, the
//              last decides) and its number of test files
//   reason     why the mode is what it is
//   differing  (isolated after a split that kept differing) the files
//              whose results still differed in the last split run
//   runs       the last split runs' times (s), newest last
//   slowStreak split runs in a row slower than learned.isolated plus the
//              margin (SLOW_RUNS of them make the mode isolated)
//   relearnIn  (isolated by slow split runs) plain runs left before the
//              CLI learns again
//   relearn    (the suite changed) why the next run learns again
//   decisions  the last mode decisions: { at, mode, reason, times }
// The fields after differing are optional (older version 2 files lack
// them).
// A version 1 file (learned before version 2's checks) counts as nothing
// learned, so the CLI learns again.
//
// Node only.
import { readFileSync } from 'node:fs';

export const CACHE_FILE = '.warpdom/fast-mode.json';
export const CACHE_VERSION = 2;
export const isolatedName = (name) => `${name} (isolated)`;

export function readCache(file = CACHE_FILE) {
  try {
    const data = JSON.parse(readFileSync(file, 'utf8'));
    return data && data.version === CACHE_VERSION && Array.isArray(data.isolate) ? data : null;
  } catch {
    return null;
  }
}
