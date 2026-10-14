import { test, vi } from 'vitest';

// Not awaited: the test passes, and the waitFor rejects 200 ms later.
test('a: leaves a vi.waitFor behind', () => {
  vi.waitFor(() => { throw new Error('a: never ready'); }, { timeout: 200, interval: 50 });
});
