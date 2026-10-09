import { test, expect } from 'vitest';

test('patches and document state from other files do not leak', () => {
  expect(document.createElement('div').offsetWidth).toBe(0);
  expect(document.body.hasAttribute('data-file')).toBe(false);
});
