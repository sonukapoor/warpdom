// Sets a global when first loaded; without isolation the files share it.
import { vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';

globalThis.__helperLoaded = (globalThis.__helperLoaded ?? 0) + 1;
export const helper = 1;
// The window members setup.js stubs and spies on.
export const members = () => [
  window.innerHeight,
  window.outerHeight,
  window.outerWidth,
  window.screenY,
  window.devicePixelRatio,
  window.screenX,
];
// The members setup.js mocks twice (a stub, then a spy of it) or spies on
// after an import made it an accessor with a vi.fn() getter: whether each
// is setup-dep.js's or setup-later-dep.js's again (a spy copies the
// properties of the function it replaces).
const fromDep = (f) => !vi.isMockFunction(f) && f.fromDep === true;
export const layered = () => [
  fromDep(window.moveTo),
  fromDep(window.scrollBy),
];
// Vitest 3's vi.restoreAllMocks also restores a spy restored before (with
// mockRestore): a member the setup spied on, restored, and spied on again
// after an import changed it becomes the window's own again, not the
// import's (measured: Vitest 3.2.4; 4.1.12 and 5 restore the import's).
const vitestPackage = join(dirname(createRequire(import.meta.url).resolve('vitest')), 'package.json');
export const restoresTwice = Number(JSON.parse(readFileSync(vitestPackage, 'utf8')).version.split('.')[0]) < 4;
