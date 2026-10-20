import { fileURLToPath } from 'node:url';
export default {
  test: { include: ['msw.spec.js', 'nock.spec.js'], environment: fileURLToPath(new URL('../../src/vitest.js', import.meta.url)) },
};
