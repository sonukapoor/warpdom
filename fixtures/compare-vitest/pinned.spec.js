// @vitest-environment jsdom
import { test, expect } from 'vitest';

// The comment pins jsdom; compare switches it to warpdom in the warpdom run.
test('pinned to jsdom: passes on jsdom only', () => {
  expect(navigator.userAgent.includes('warpdom/')).toBe(false);
});
