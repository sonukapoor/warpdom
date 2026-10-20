import { fileURLToPath } from 'node:url';
// VIEWPORT_JSDOM: the jsdom profile for warpdom (environmentOptions.warpdom.jsdom).
export default {
  test: {
    include: ['*.spec.js'],
    environment: fileURLToPath(new URL('../../src/vitest.js', import.meta.url)),
    environmentOptions: process.env.VIEWPORT_JSDOM ? { warpdom: { jsdom: process.env.VIEWPORT_JSDOM } } : {},
  },
};
