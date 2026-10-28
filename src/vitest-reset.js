// Setup file for running test files without isolation (Vitest
// --no-isolate or isolate: false): list it first in setupFiles. Before each
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
const reset = globalThis[Symbol.for('warpdom.vitest.reset')];
if (reset) reset();
// When the file's tests start (its setup files and imports done), the
// global's properties are what the next file's reset keeps: modules load
// once per worker, so what they set must stay.
const mark = globalThis[Symbol.for('warpdom.vitest.mark')];
if (mark) beforeAll(() => mark());
