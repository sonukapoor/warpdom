// Sets a global when first loaded; without isolation the files share it.
globalThis.__helperLoaded = (globalThis.__helperLoaded ?? 0) + 1;
export const helper = 1;
