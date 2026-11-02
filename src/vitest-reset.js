// Setup file for running test files without isolation (Vitest
// --no-isolate or isolate: false): list it first in setupFiles, with
// sequence.setupFiles 'list' (Vitest 2-4 default to 'parallel'). Before each
// test file it makes the file start as an isolated one would: the warpdom
// window reset in place (see reset.js), the global's properties a previous
// file's tests added or redefined put back (#175: outside the VM pools the
// window is the worker's global), and Vitest's per-file runtime state
// undone (fake timers a previous file left on, its spies, stubbed globals
// and environment variables). Each is a no-op when there is nothing to undo.
import { beforeAll, vi } from 'vitest';

vi.useRealTimers();
vi.restoreAllMocks();
vi.unstubAllGlobals();
vi.unstubAllEnvs();
// What a global was before the setup mocked it, where Vitest's cleanup puts
// it back: a module loaded once may have changed it before (#201). The
// wrappers follow each key of the global from its first mock to the
// cleanup that ends its last (vi.unstubAllGlobals, vi.restoreAllMocks, a
// spy's mockRestore): its original is the member before that first mock,
// kept while any of them is in place, as Vitest's stubs and spies keep
// theirs, whatever the member's descriptors are in between (#230). They
// report each mock with the key's original, and the end of the key's
// mocks, after the cleanup, with null. Tracked per worker, as vi is; vi is
// wrapped once.
const WRAPPED = Symbol.for('warpdom.vitest.wrapped');
if (!vi[WRAPPED]) {
  const { stubGlobal, unstubAllGlobals, spyOn, restoreAllMocks } = vi;
  const report = (key, mock) => globalThis[Symbol.for('warpdom.vitest.mocking')]?.(key, mock);
  // The keys with a mock in place: their original, whether a stub is
  // among the mocks, and the spies.
  const mocks = new Map();
  const mocked = (key, call) => {
    const before = Object.getOwnPropertyDescriptor(globalThis, key);
    const result = call();
    let mock = mocks.get(key);
    if (!mock) mocks.set(key, (mock = { original: before, stubbed: false, spies: new Set() }));
    return [mock, result];
  };
  // Runs a cleanup after end(mock) for each mock it undoes, and reports
  // the keys left with none.
  const cleanup = (end, call) => {
    const ended = [];
    for (const [key, mock] of mocks) {
      end(mock);
      if (mock.stubbed || mock.spies.size) continue;
      mocks.delete(key);
      ended.push(key);
    }
    const result = call();
    for (const key of ended) report(key, null);
    return result;
  };
  vi.stubGlobal = (name, value) => {
    const [mock, result] = mocked(name, () => stubGlobal(name, value));
    mock.stubbed = true;
    report(name, mock);
    return result;
  };
  vi.unstubAllGlobals = () => cleanup((mock) => (mock.stubbed = false), unstubAllGlobals);
  vi.restoreAllMocks = () => cleanup((mock) => mock.spies.clear(), restoreAllMocks);
  vi.spyOn = (object, key, ...rest) => {
    if (object !== globalThis) return spyOn(object, key, ...rest);
    // vi.spyOn of a spy returns it.
    const [mock, spy] = mocked(key, () => spyOn(object, key, ...rest));
    if (!mock.spies.has(spy)) {
      mock.spies.add(spy);
      const { mockRestore } = spy;
      spy.mockRestore = function (...args) {
        return cleanup(
          (other) => other === mock && mock.spies.delete(spy),
          () => mockRestore.apply(this, args),
        );
      };
    }
    report(key, mock);
    return spy;
  };
  vi[WRAPPED] = true;
}
const reset = globalThis[Symbol.for('warpdom.vitest.reset')];
if (reset) reset();
// When the file's tests start (its setup files and imports done), the
// global's properties are what the next file's reset keeps: modules load
// once per worker, so what they set must stay.
const mark = globalThis[Symbol.for('warpdom.vitest.mark')];
if (mark) beforeAll(() => mark());
