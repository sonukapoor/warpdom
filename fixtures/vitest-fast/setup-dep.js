import { vi } from 'vitest';

globalThis.__setupLoaded = (globalThis.__setupLoaded ?? 0) + 1;
// Loaded once per worker without isolation: window members it changes
// stay changed for every later file, and are the original values of the
// setup file's stub and spy (#201).
Object.defineProperty(window, 'outerWidth', { value: 900, writable: true, configurable: true });
Object.defineProperty(window, 'screenY', { get: () => 900, configurable: true });
// A member setup.js mocks twice: Vitest's cleanup puts this back (#228 review).
const fromDep = (f) => Object.assign(f, { fromDep: true });
Object.defineProperty(window, 'moveTo', { value: fromDep(() => {}), writable: true, configurable: true });
// A member setup.js stubs without changing it, redefines and stubs again (#230).
Object.defineProperty(window, 'pageXOffset', { value: 900, writable: true, enumerable: true, configurable: true });
// A vi.fn() each setup spies on, and a test many times (#236 review).
globalThis.__persistentMock = vi.fn();
// Held by a window member too, whose descriptor setup.js changes (#236 review).
Object.defineProperty(window, 'stop', { value: globalThis.__persistentMock, writable: true, configurable: true });
// One vi.fn() held by two members (#236 review).
const shared = vi.fn();
// One vi.fn() held by two members with different descriptors (#236 review).
for (const key of ['resizeBy', 'resizeTo'])
  Object.defineProperty(window, key, { value: shared, writable: true, enumerable: key === 'resizeTo', configurable: true });
