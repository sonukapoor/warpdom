globalThis.__setupLoaded = (globalThis.__setupLoaded ?? 0) + 1;
// Loaded once per worker without isolation: window members it changes
// stay changed for every later file, and are the original values of the
// setup file's stub and spy (#201).
Object.defineProperty(window, 'outerWidth', { value: 900, writable: true, configurable: true });
Object.defineProperty(window, 'screenY', { get: () => 900, configurable: true });
