// Fixture for test/compare.test.js: a Vitest workspace file (Vitest 2 and
// 3) without a root config: project directories found by a glob (one on
// jsdom, one on node) and an inline project on jsdom.
export default [
  'packages/*',
  { test: { name: 'inline', environment: 'jsdom', include: ['shared/*.spec.js'] } },
];
