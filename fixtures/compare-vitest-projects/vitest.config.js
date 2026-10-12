// Fixture for test/compare.test.js: a Vitest config with projects, copied
// to a temporary directory and compared with warpdom. Inline projects on
// jsdom and node (one test file in both), and project directories found
// by a glob: one with its own config on happy-dom, one without a config
// (Vitest's defaults: node).
export default {
  test: {
    projects: [
      { test: { name: 'dom', environment: 'jsdom', include: ['dom/*.spec.js', 'shared/*.spec.js'] } },
      { test: { name: 'server', environment: 'node', include: ['server/*.spec.js', 'shared/*.spec.js'] } },
      'packages/*',
    ],
  },
};
