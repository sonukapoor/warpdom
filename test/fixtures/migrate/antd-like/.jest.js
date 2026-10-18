const compileModules = [
  'react-sticky-box',
  '@babel',
  '.pnpm',
  '@asamuzakjp',
  '@rc-component',
  // jsdom 27+ pulls ESM dependencies that need transform
  'parse5',
  'entities',
  '@exodus',
  'jsdom',
  '@csstools',
];

const transformIgnorePatterns = [
  `[/\\\\]node_modules[/\\\\](?!${compileModules.join('|')})[^/\\\\]+?[/\\\\](?!(es)[/\\\\])`,
];

module.exports = {
  testEnvironment: 'jsdom',
  setupFiles: ['./tests/setup.ts'],
  transformIgnorePatterns,
  testEnvironmentOptions: {
    url: 'http://localhost',
  },
};
