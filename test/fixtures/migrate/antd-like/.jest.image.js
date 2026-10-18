const { transformIgnorePatterns } = require('./.jest');

module.exports = {
  setupFiles: ['./tests/setup.ts'],
  testRegex: 'image\\.test\\.ts$',
  transformIgnorePatterns,
  preset: 'jest-puppeteer',
};
