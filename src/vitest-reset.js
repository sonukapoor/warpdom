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
  // The mocks in place of each key, in the order they replaced the member,
  // each with what it replaced: { stub: true, original } (one, for Vitest's
  // stubs since vi.unstubAllGlobals) or { spy, original }.
  const mocks = new Map();
  const layersOf = (key) => {
    if (!mocks.has(key)) mocks.set(key, []);
    return mocks.get(key);
  };
  // Every spy of the global, with its keys and, for the key whose member
  // vi.spyOn replaced with it, what it replaced (not for a vi.fn() the
  // member held: vi.spyOn returns it and replaces nothing) (#236 review).
  const spies = new WeakMap();
  // The member before, with a spy Vitest's cleanup left (vi.restoreAllMocks
  // leaves the getter spy of a member spied on through both accessors,
  // Vitest 4 and 5; vi.spyOn of it returns it) as that spy found it
  // (#236 review).
  const slots = (descriptor) => [descriptor?.get, descriptor?.set, descriptor?.value];
  const clean = (key, descriptor) => {
    const left = slots(descriptor).find((f) => spies.get(f)?.originals.has(key));
    return left ? spies.get(left).originals.get(key) : descriptor;
  };
  // Runs a cleanup after change() has removed the mocks it undoes, and
  // reports the keys left with none.
  const cleanup = (change, call) => {
    change();
    const ended = [];
    for (const [key, layers] of mocks)
      if (!layers.length) {
        mocks.delete(key);
        ended.push(key);
      }
    const result = call();
    for (const key of ended) report(key, null);
    return result;
  };
  const reportMock = (key) => report(key, { original: mocks.get(key)[0].original });
  vi.stubGlobal = (name, value) => {
    const before = clean(name, Object.getOwnPropertyDescriptor(globalThis, name));
    const result = stubGlobal(name, value);
    const layers = layersOf(name);
    const stub = layers.findIndex((layer) => layer.stub);
    // A stub replaces the spies of the earlier stub; Vitest keeps its original.
    if (stub >= 0) layers.length = stub + 1;
    else layers.push({ stub: true, original: before });
    reportMock(name);
    return result;
  };
  // Unstubbing puts back what the stub replaced: the spies of the stub go too.
  vi.unstubAllGlobals = () =>
    cleanup(() => {
      for (const layers of mocks.values()) {
        const stub = layers.findIndex((layer) => layer.stub);
        if (stub >= 0) layers.length = stub;
      }
    }, unstubAllGlobals);
  vi.restoreAllMocks = () =>
    cleanup(() => {
      for (const [key, layers] of mocks)
        mocks.set(
          key,
          layers.filter((layer) => layer.stub),
        );
    }, restoreAllMocks);
  vi.spyOn = (object, key, ...rest) => {
    if (object !== globalThis) return spyOn(object, key, ...rest);
    const raw = Object.getOwnPropertyDescriptor(globalThis, key);
    const before = clean(key, raw);
    // vi.spyOn of a spy (or of a vi.fn()) returns it.
    const spy = spyOn(object, key, ...rest);
    let record = spies.get(spy);
    if (!record) {
      // One wrapper per spy, however often it is spied on and restored,
      // and for each key whose member holds it (two members may hold one
      // vi.fn()) (#236 review).
      record = { keys: new Set(), originals: new Map() };
      spies.set(spy, record);
      const { mockRestore } = spy;
      spy.mockRestore = function (...args) {
        return cleanup(
          () => {
            // Restoring puts back the member the spy found: the spies made
            // since (another accessor's) go too; a stub keeps its original.
            for (const key of record.keys) {
              const layers = mocks.get(key);
              const index = layers ? layers.findIndex((layer) => layer.spy === spy) : -1;
              if (index >= 0)
                mocks.set(key, [...layers.slice(0, index), ...layers.slice(index + 1).filter((layer) => layer.stub)]);
            }
          },
          () => mockRestore.apply(this, args),
        );
      };
    }
    record.keys.add(key);
    if (!slots(raw).includes(spy)) record.originals.set(key, before);
    const layers = layersOf(key);
    if (!layers.some((layer) => layer.spy === spy)) layers.push({ spy, original: before });
    reportMock(key);
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
