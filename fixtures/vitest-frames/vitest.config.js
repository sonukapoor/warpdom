import { fileURLToPath } from 'node:url';
// FRAMES_JSDOM: the jsdom profile for warpdom (environmentOptions.warpdom.jsdom).
export default {
  test: {
    include: ['*.spec.js'],
    environment: fileURLToPath(new URL('../../src/vitest.js', import.meta.url)),
    environmentOptions: process.env.FRAMES_JSDOM ? { warpdom: { jsdom: process.env.FRAMES_JSDOM } } : {},
  },
};
