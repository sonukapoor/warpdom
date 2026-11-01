// Sets a global when first loaded; without isolation the files share it.
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
