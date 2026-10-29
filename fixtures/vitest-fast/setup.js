// A setup file runs before each file; its imports load once per worker without isolation.
import './setup-dep.js';

globalThis.__setupRuns = (globalThis.__setupRuns ?? 0) + 1;
// A global only later runs add, and a window member each run replaces (a
// matchMedia mock): warpdom's reset, run before this file, must keep both.
if (globalThis.__setupRuns > 1) globalThis.__setupLater = globalThis.__setupRuns;
const matchMedia = () => ({ matches: false });
matchMedia.run = globalThis.__setupRuns;
Object.defineProperty(window, 'matchMedia', { value: matchMedia, writable: true, configurable: true });
