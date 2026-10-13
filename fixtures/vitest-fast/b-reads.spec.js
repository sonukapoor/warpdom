import { test, expect } from 'vitest';
import { shared } from './state.js';

// Passes isolated (fresh modules); fails when a-sets.spec.js ran first in
// the same worker without isolation: it leaks through module state, which
// warpdom's window reset cannot reach.
test('b: module state is fresh', () => {
  expect(shared.count).toBe(0);
  expect(document.body.childNodes.length).toBe(0);
});
