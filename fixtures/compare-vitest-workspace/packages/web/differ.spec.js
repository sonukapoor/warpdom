import { test, expect } from 'vitest';

// warpdom's user agent names it after jsdom's compatibility token.
const onWarpdom = () => navigator.userAgent.includes('warpdom/');

test('passes on jsdom only', () => {
  expect(onWarpdom()).toBe(false);
});

test('passes on warpdom only', () => {
  expect(onWarpdom()).toBe(true);
});

test.skip('skipped on both', () => {});
