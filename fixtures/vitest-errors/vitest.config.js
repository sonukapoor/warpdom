import { fileURLToPath } from 'node:url';
export default {
  test: { include: ['*.spec.js'], environment: fileURLToPath(new URL('../../src/vitest.js', import.meta.url)) },
};
