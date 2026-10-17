import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environmentMatchGlobs: [
      ['**/*.dom.test.ts', 'happy-dom'],
    ],
    projects: [
      {
        test: {
          name: 'unit',
          environment: 'jsdom',
          include: ['src/**/*.test.ts'],
        },
      },
      {
        test: { name: 'node', environment: 'node', include: ['server/**/*.test.ts'] },
      },
    ],
  },
});
