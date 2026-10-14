import { test } from 'vitest';

test('b: takes a while', async () => {
  await new Promise((resolve) => setTimeout(resolve, 600));
});
