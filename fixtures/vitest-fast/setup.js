// A setup file runs before each file; its imports load once per worker without isolation.
import { vi } from 'vitest';
import './setup-dep.js';

globalThis.__setupRuns = (globalThis.__setupRuns ?? 0) + 1;
// Whether warpdom's reset (run before this file) put back a previous
// file's mocks of the members mocked twice below, for any file so far (it
// must not; this file's setup would undo some of them again).
const leftMocks = [window.moveTo, window.scrollBy].map((f) => vi.isMockFunction(f));
globalThis.__mocksAtSetup = (globalThis.__mocksAtSetup ?? [false, false]).map((left, i) => left || leftMocks[i]);
// A stub and a spy undone during the setup, then made again after an import
// loaded once changed the members: their originals are the import's (#201).
vi.stubGlobal('devicePixelRatio', 2);
vi.unstubAllGlobals();
vi.spyOn(window, 'screenX', 'get').mockReturnValue(2).mockRestore();
vi.spyOn(window, 'scrollBy').mockRestore();
await import('./setup-later-dep.js');
vi.stubGlobal('devicePixelRatio', 500);
vi.spyOn(window, 'screenX', 'get').mockReturnValue(1);
// A new spy of the function the import's vi.fn() getter returns.
vi.spyOn(window, 'scrollBy');
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
// A stub and a spy of members setup-dep.js changed once: undone, they are 900 (#201).
vi.stubGlobal('outerWidth', 500);
vi.spyOn(window, 'screenY', 'get').mockReturnValue(1);
// A stub, then a spy of it, of a member setup-dep.js changed: undone (the
// spy first), it is setup-dep.js's.
vi.stubGlobal('moveTo', () => {});
vi.spyOn(window, 'moveTo');
