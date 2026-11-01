import { test, expect, vi } from 'vitest';
import { helper, members, layered, restoresTwice } from './helper.js';
import './skipped-dep.js';

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
  // Loaded first by b-skipped.spec.js, whose tests (and so its beforeAll
  // hooks) were all skipped.
  expect(globalThis.__skippedDepLoaded).toBe(1);
  // This file's setup ran after warpdom's reset, even with parallel setup files.
  const runs = globalThis.__setupRuns;
  expect([globalThis.__setupLater, window.matchMedia.run]).toEqual([runs > 1 ? runs : undefined, runs]);
});

test("c: this file's setup stubs and spies undo to the window's own values", () => {
  expect(members()).toEqual([500, 1, 500, 1, 500, 1]);
  expect(globalThis.__mocksAtSetup).toEqual([false, false]);
  expect(layered()).toEqual([false, false]);
  // The spies first: the spy of a stub restores the stub.
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  // The stubs' and spies' originals are what setup-dep.js and setup-later-dep.js
  // set when first loaded (#201).
  expect(members()).toEqual([768, 768, 900, 900, 900, restoresTwice ? 0 : 900]);
  expect(layered()).toEqual([true, !restoresTwice]);
  expect(vi.isMockFunction(Object.getOwnPropertyDescriptor(window, 'outerHeight').get)).toBe(false);
  expect(vi.isMockFunction(Object.getOwnPropertyDescriptor(window, 'screenY').get)).toBe(false);
  expect(vi.isMockFunction(Object.getOwnPropertyDescriptor(window, 'screenX').get)).toBe(false);
});
