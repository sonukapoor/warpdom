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
// wrappers report when Vitest takes the member's descriptor as the mock's
// original: a stub of a key not stubbed since vi.unstubAllGlobals (Vitest's
// own list of stubs, per worker as vi is), a spy of a member no spy
// replaces (vi.spyOn returns the existing spy). vi is wrapped once.
const WRAPPED = Symbol.for('warpdom.vitest.wrapped');
if (!vi[WRAPPED]) {
  const mocking = (key, original) => globalThis[Symbol.for('warpdom.vitest.mocking')]?.(key, original);
  const { stubGlobal, unstubAllGlobals, spyOn } = vi;
  const stubbed = new Set();
  vi.stubGlobal = (name, value) => {
    mocking(name, !stubbed.has(name));
    stubbed.add(name);
    return stubGlobal(name, value);
  };
  vi.unstubAllGlobals = () => {
    stubbed.clear();
    return unstubAllGlobals();
  };
  vi.spyOn = (object, key, ...rest) => {
    if (object === globalThis) {
      const descriptor = Object.getOwnPropertyDescriptor(object, key);
      const replaced = descriptor && (rest[0] ? descriptor[rest[0]] : (descriptor.value ?? descriptor.get));
      mocking(key, !vi.isMockFunction(replaced));
    }
    return spyOn(object, key, ...rest);
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
