import { test, expect } from 'vitest';

// A project directory without a config: Vitest's defaults (node).
test('runs without a DOM by default', () => {
  expect(typeof document).toBe('undefined');
});
