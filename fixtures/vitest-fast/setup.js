// A setup file runs before each file; its imports load once per worker without isolation.
import { vi } from 'vitest';
import './setup-dep.js';

globalThis.__setupRuns = (globalThis.__setupRuns ?? 0) + 1;
// A global only later runs add, and a window member each run replaces (a
// matchMedia mock): warpdom's reset, run before this file, must keep both.
if (globalThis.__setupRuns > 1) globalThis.__setupLater = globalThis.__setupRuns;
const matchMedia = () => ({ matches: false });
matchMedia.run = globalThis.__setupRuns;
Object.defineProperty(window, 'matchMedia', { value: matchMedia, writable: true, configurable: true });
// A Vitest stub and an accessor spy each run makes: Vitest's cleanup before
// the next file undoes them, and warpdom's reset must not put them back
// (the next run's stub would then take the stub as the original value).
vi.stubGlobal('innerHeight', 500);
vi.spyOn(window, 'outerHeight', 'get').mockReturnValue(1);
