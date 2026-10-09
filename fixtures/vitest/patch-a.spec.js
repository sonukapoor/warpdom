import { test, expect } from 'vitest';

test('a file may patch DOM prototypes', () => {
  Object.defineProperty(HTMLElement.prototype, 'offsetWidth', { get: () => 99, configurable: true });
  document.body.setAttribute('data-file', 'a');
  expect(document.createElement('div').offsetWidth).toBe(99);
});
