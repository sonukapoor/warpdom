// warpdom/vitest/environment (src/vitest-environment.js).
import './vitest-options.js';

export type { WarpdomVitestOptions, WarpdomVitestEnvironmentOptions } from './vitest-options.js';

/**
 * The path of warpdom's Vitest environment, for `test.environment`:
 *
 *     import { environment } from 'warpdom/vitest/environment';
 *     export default defineConfig({ test: { environment } });
 */
export const environment: string;
