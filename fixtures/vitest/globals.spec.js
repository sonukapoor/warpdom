import { test, expect } from 'vitest';

test('window globals are installed like Vitest installs jsdom', () => {
  expect(window).toBe(globalThis);
  expect(document.defaultView).toBe(globalThis);
  const div = document.createElement('div');
  expect(div).toBeInstanceOf(HTMLElement);
  expect(div).toBeInstanceOf(HTMLDivElement);
  document.body.appendChild(div);
  expect(document.body.childNodes.length).toBe(1);
});
