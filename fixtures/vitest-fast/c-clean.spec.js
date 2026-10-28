import { test, expect } from 'vitest';
import { helper } from './helper.js';

test('c: the window is fresh', () => {
  expect(document.querySelectorAll('p').length).toBe(0);
  document.body.appendChild(document.createElement('p'));
});

test("c: no globals a previous file's tests added; its setup's and modules' stay", () => {
  expect([globalThis.__mark, globalThis.__global, globalThis.__script, globalThis.__defined]).toEqual([
    undefined,
    undefined,
    undefined,
    undefined,
  ]);
  expect(Symbol.for('warpdom.fixture') in window).toBe(false);
  expect([window.innerWidth, typeof window.scrollTo]).toEqual([1024, 'function']);
  // Set once, when the modules were first loaded (shared between files).
  expect([helper, globalThis.__helperLoaded, globalThis.__setupLoaded]).toEqual([1, 1, 1]);
  expect(globalThis.__setupRuns).toBeGreaterThan(0);
});
