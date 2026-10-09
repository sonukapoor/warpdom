// Setup file for running test files without isolation (Vitest
// --no-isolate or isolate: false): list it first in setupFiles. Before each
// test file it makes the file start as an isolated one would: the warpdom
// window reset in place (see reset.js), and Vitest's per-file runtime state
// undone (fake timers a previous file left on, its spies, stubbed globals
// and environment variables). Each is a no-op when there is nothing to undo.
import { vi } from 'vitest';

vi.useRealTimers();
vi.restoreAllMocks();
vi.unstubAllGlobals();
vi.unstubAllEnvs();
const reset = globalThis[Symbol.for('warpdom.vitest.reset')];
if (reset) reset();
