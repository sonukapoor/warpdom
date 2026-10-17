import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    // jsdom for the component tests
    environment: "jsdom",
    setupFiles: ['./test/setup.ts'],
  },
});
