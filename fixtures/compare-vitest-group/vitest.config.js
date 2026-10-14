// Fixture for test/compare.test.js: a project on jsdom whose test files
// share workers (isolate: false), two of them pinned to jsdom with a
// comment. Vitest groups such files by environment name: on jsdom and on
// warpdom all four form one group and share the one worker.
export default {
  test: {
    include: ['*.spec.js'],
    environment: 'jsdom',
    isolate: false,
  },
};
