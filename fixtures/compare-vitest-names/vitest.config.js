// Fixture for test/compare.test.js: tests whose names change in every run,
// matched by position instead of being reported as flaky or missing.
export default {
  test: {
    include: ['*.spec.js'],
    environment: 'jsdom',
  },
};
