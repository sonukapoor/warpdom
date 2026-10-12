// Ablation switches for research measurements (docs/research/ablation-plan.md):
// WARPDOM_ABLATE, a comma-separated list, switches off one mechanism at a
// time. Internal and undocumented for users; read once, by the Node adapters
// only (src/vitest.js, src/jest.js), never by the DOM core.
//   eager-interfaces  every interface created with the window (not on first use)
//   no-query-cache    querySelector/querySelectorAll results not cached
//   fresh-window      warpdom/vitest/reset installs a new window per file
//                     instead of resetting the window in place
const ABLATE = new Set(String(globalThis.process?.env?.WARPDOM_ABLATE ?? '').split(',').map((s) => s.trim()).filter(Boolean));
export const ablated = (name) => ABLATE.has(name);

// Creates every interface of the window now (what lazy creation avoids):
// reading each interface constructor property materializes it.
export function materializeAll(window) {
  for (const name of Object.getOwnPropertyNames(window)) {
    const d = Object.getOwnPropertyDescriptor(window, name);
    if (d?.get && /^[A-Z]/.test(name)) void window[name];
  }
}
