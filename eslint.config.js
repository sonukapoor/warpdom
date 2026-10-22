// Readability rules only; formatting is Prettier's job (npm run format).
// Existing violations are listed in eslint-suppressions.json and get fixed
// over time; new code must pass.
export default [
  {
    ignores: [
      'dist/',
      'coverage/',
      'docs/',
      'fixtures/',
      'test/fixtures/',
      'wpt/selftest/',
      'src/bidi-data.js',
      'src/css-data.js',
      'src/css-grammar.js',
      'src/event-handler-names.js',
      'src/html-elements.js',
      'src/html-reflect.js',
      'src/style-surface.js',
    ],
  },
  {
    files: ['**/*.{js,mjs,cjs}'],
    rules: {
      'no-nested-ternary': 'error',
    },
  },
];
