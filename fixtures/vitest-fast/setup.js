// A setup file runs before each file; its imports load once per worker without isolation.
import { vi } from 'vitest';
import './setup-dep.js';

globalThis.__setupRuns = (globalThis.__setupRuns ?? 0) + 1;
// A member the setup stubs and unstubs, and an import it loads once then
// changes: each later file starts with the import's (#230).
globalThis.__statusAtSetup ??= [];
if (globalThis.__setupRuns > 1) globalThis.__statusAtSetup.push(window.status);
// Whether warpdom's reset (run before this file) put back a previous
// file's mocks of the members mocked twice below, or left the spy of one
// (#230), for any file so far (it must not; this file's setup would undo
// some of them again).
const accessors = (key) => Object.values(Object.getOwnPropertyDescriptor(window, key));
const leftMocks = [window.moveTo, window.scrollBy, window.moveBy, ...accessors('pageYOffset'), ...accessors('scrollY')]
  .filter((f) => typeof f === 'function')
  .map((f) => vi.isMockFunction(f));
globalThis.__mocksAtSetup = (globalThis.__mocksAtSetup ?? leftMocks.map(() => false)).map((left, i) => left || leftMocks[i]);
// Spies on both accessors of one member, Vitest's restoreAllMocks (4 and
// 5 leave the getter spy), and a spy of the getter again, which returns
// that spy: their original is the member before the first spies (#236 review).
vi.spyOn(window, 'scrollY', 'get').mockReturnValue(1);
vi.spyOn(window, 'scrollY', 'set');
vi.restoreAllMocks();
vi.spyOn(window, 'scrollY', 'get').mockReturnValue(1);
// A spy of a global vi.fn() a module loaded once set returns that vi.fn().
vi.spyOn(window, '__persistentMock');
// A stub and a spy undone during the setup, then made again after an import
// loaded once changed the members: their originals are the import's (#201).
vi.stubGlobal('devicePixelRatio', 2);
// Stubs the import then matches: it defines each member with the stub's
// descriptor, value included (#230).
vi.stubGlobal('screenLeft', 500);
vi.stubGlobal('screenTop', 900);
// Not stubbed again after the import changes it.
vi.stubGlobal('status', 'stub');
// A stub and a spy of it, both undone by unstubbing, then a stub after the
// import changes the member: its original is the import's (#236 review).
vi.stubGlobal('moveBy', () => {});
vi.spyOn(window, 'moveBy');
vi.unstubAllGlobals();
vi.spyOn(window, 'screenX', 'get').mockReturnValue(2).mockRestore();
vi.spyOn(window, 'scrollBy').mockRestore();
await import('./setup-later-dep.js');
vi.stubGlobal('devicePixelRatio', 500);
// Stubs whose originals are the import's, equal to the earlier stubs (#230).
vi.stubGlobal('screenLeft', 600);
vi.stubGlobal('screenTop', 500);
vi.stubGlobal('moveBy', () => {});
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
// A stub that leaves setup-dep.js's descriptor as it is, a redefinition,
// and a second stub: Vitest keeps the first stub's original, 900 (#230).
vi.stubGlobal('pageXOffset', 900);
Object.defineProperty(window, 'pageXOffset', { value: 800, writable: true, enumerable: true, configurable: true });
vi.stubGlobal('pageXOffset', 500);
// Spies on both accessors of one member: Vitest 4 and 5's restoreAllMocks
// leaves the getter spy; the reset must not leave it, or put the spies
// back, for the next file (#230).
vi.spyOn(window, 'pageYOffset', 'get').mockReturnValue(1);
vi.spyOn(window, 'pageYOffset', 'set');
