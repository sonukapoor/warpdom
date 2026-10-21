import { fileURLToPath } from 'node:url';
// STYLE_SPY_JSDOM: the jsdom profile for warpdom (environmentOptions.warpdom.jsdom).
export default {
  test: {
    include: ['*.spec.js'],
    environment: fileURLToPath(new URL('../../src/vitest.js', import.meta.url)),
    environmentOptions: process.env.STYLE_SPY_JSDOM ? { warpdom: { jsdom: process.env.STYLE_SPY_JSDOM } } : {},
  },
};
