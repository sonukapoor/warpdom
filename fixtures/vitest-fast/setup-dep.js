globalThis.__setupLoaded = (globalThis.__setupLoaded ?? 0) + 1;
// Loaded once per worker without isolation: window members it changes
// stay changed for every later file, and are the original values of the
// setup file's stub and spy (#201).
Object.defineProperty(window, 'outerWidth', { value: 900, writable: true, configurable: true });
Object.defineProperty(window, 'screenY', { get: () => 900, configurable: true });
// A member setup.js mocks twice: Vitest's cleanup puts this back (#228 review).
const fromDep = (f) => Object.assign(f, { fromDep: true });
Object.defineProperty(window, 'moveTo', { value: fromDep(() => {}), writable: true, configurable: true });
