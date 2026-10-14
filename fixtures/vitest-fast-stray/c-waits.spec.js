import { test } from 'vitest';

test('c: takes a while', async () => {
  await new Promise((resolve) => setTimeout(resolve, 600));
});
