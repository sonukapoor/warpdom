import { test, expect } from 'vitest';

test('c: the window is fresh', () => {
  expect(document.querySelectorAll('p').length).toBe(0);
  document.body.appendChild(document.createElement('p'));
});
