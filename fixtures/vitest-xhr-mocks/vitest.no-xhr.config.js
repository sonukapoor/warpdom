import { fileURLToPath } from 'node:url';
// environmentOptions.warpdom.xhr: false: no XMLHttpRequest, so axios takes Node's http client.
export default {
  test: { include: ['no-xhr.spec.js'], environment: fileURLToPath(new URL('../../src/vitest.js', import.meta.url)), environmentOptions: { warpdom: { xhr: false } } },
};
