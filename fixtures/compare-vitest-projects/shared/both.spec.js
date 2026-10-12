import { test, expect } from 'vitest';

// Included by two projects: its tests are told apart by project.
test('runs in each project', () => {
  expect(1 + 1).toBe(2);
});
