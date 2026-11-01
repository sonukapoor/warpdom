import { test, expect, vi } from 'vitest';
import { shared } from './state.js';
import { helper, members } from './helper.js';

test('a: renders, and leaves module state behind', () => {
  document.body.innerHTML = '<p id="a">a</p>';
  expect(document.getElementById('a').textContent).toBe('a');
  shared.count++;
});

// Properties a test adds to the window (the global) or redefines on it,
// which warpdom's reset removes before the next file (#175).
test('a: leaves globals behind', () => {
  expect([helper, globalThis.__helperLoaded, globalThis.__setupLoaded]).toEqual([1, 1, 1]);
  window.__mark = 1;
  globalThis.__global = 1;
  (0, eval)('var __script = 1');
  Object.defineProperty(window, '__defined', { value: 1, configurable: true });
  window[Symbol.for('warpdom.fixture')] = 1;
  Object.defineProperty(window, 'innerWidth', { value: 500, writable: true, configurable: true });
  delete window.scrollTo;
});

// Undone during the file: the next file's reset must not put them back.
test("a: undoes its setup's stub and spy", () => {
  expect(members()).toEqual([500, 1, 500, 1, 500, 1]);
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  expect(members()).toEqual([768, 768, 900, 900, 900, 900]);
});
