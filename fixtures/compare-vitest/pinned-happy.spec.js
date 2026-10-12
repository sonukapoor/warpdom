/** @vitest-environment happy-dom */
import { test, expect } from 'vitest';

// On a jsdom baseline, compare switches a happy-dom pin to jsdom (warpdom
// gives the same jsdom compatibility token).
test('pinned to happy-dom: runs on jsdom or warpdom', () => {
  expect(navigator.userAgent).toMatch(/jsdom\//);
});
