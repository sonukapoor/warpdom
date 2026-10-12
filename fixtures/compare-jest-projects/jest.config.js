// Fixture for test/compare.test.js: Jest projects, copied to a temporary
// directory and compared with warpdom. Project directories found by a glob
// (one on jsdom, one on node) and an inline project on jsdom.
module.exports = {
  projects: [
    '<rootDir>/packages/*',
    { displayName: 'inline', testEnvironment: 'jsdom', testMatch: ['<rootDir>/shared/*.spec.js'] },
  ],
};
