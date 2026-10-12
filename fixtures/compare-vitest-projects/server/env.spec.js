import { test, expect } from 'vitest';

test('runs without a DOM', () => {
  expect(typeof document).toBe('undefined');
});
