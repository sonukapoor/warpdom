// The path of warpdom's Vitest environment, for test.environment. Vitest
// accepts a package named vitest-environment-<name> or a path, so
// environment: 'warpdom' does not resolve; this does:
//
//   import { environment } from 'warpdom/vitest/environment';
//   export default { test: { environment } };
//
// Kept separate from vitest.js so the config does not load the DOM.
import { fileURLToPath } from 'node:url';

export const environment = fileURLToPath(new URL('./vitest.js', import.meta.url));
