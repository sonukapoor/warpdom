import { describe, test, expect } from 'vitest';

// warpdom's user agent names it after jsdom's compatibility token.
const onWarpdom = () => navigator.userAgent.includes('warpdom/');

// Names with a timestamp, new in every run (as in n8n's it.each over
// new Date() values).
describe('valueType', () => {
  test.each([
    [Date.now(), 'number'],
    ['text', 'string'],
  ])('valueType(%s) is %s', (value, type) => {
    expect(typeof value).toBe(type);
  });

  test(`at ${new Date().toISOString()}: passes on jsdom only`, () => {
    expect(onWarpdom()).toBe(false);
  });
});

describe(`run of ${new Date().toISOString()}`, () => {
  test('in a describe whose name varies', () => {
    expect(document.body).toBeTruthy();
  });
});
