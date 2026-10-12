import { test, expect } from 'vitest';

test('creates an element', () => {
  expect(document.createElement('p').tagName).toBe('P');
});
