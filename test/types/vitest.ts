// A vitest.config.ts, and the environment's types.
import { defineConfig } from 'vitest/config';
import { environment } from 'warpdom/vitest/environment';
import { withFastMode, CACHE_FILE, readCache, isolatedName } from 'warpdom/vitest/fast';
import warpdomEnvironment, { jsdomProfile, type WarpdomVitestOptions } from 'warpdom/vitest';
import type { Environment } from 'vitest/runtime';
import 'warpdom/vitest/reset';

const warpdom: WarpdomVitestOptions = { jsdom: '26.1.0', fastFrames: true, xhr: false };
export default defineConfig(
  withFastMode(
    {
      test: { environment, environmentOptions: { warpdom } },
    },
    { project: 'unit' },
  ),
);

defineConfig({
  test: {
    environment: 'warpdom',
    // @ts-expect-error: environmentOptions.warpdom.fastFrames is a boolean (module augmentation of vitest/node)
    environmentOptions: { warpdom: { fastFrames: 'yes' } },
  },
});

// The environment object is a Vitest environment.
const asVitest: Environment = warpdomEnvironment;
const name: 'warpdom' = warpdomEnvironment.name;
const profile = jsdomProfile({ warpdom: { jsdom: 26 } }, process.cwd());
const version: string | number | undefined = profile.jsdom;
const file: string = CACHE_FILE;
const cache = readCache();
const isolate: string[] | undefined = cache?.isolate;
const isolated: string = isolatedName('unit');
void [asVitest, name, version, file, isolate, isolated];

declare const process: { cwd(): string };
