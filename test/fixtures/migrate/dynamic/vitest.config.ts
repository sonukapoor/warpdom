import { defineConfig } from 'vitest/config';
import { pickEnvironment } from './tools/env';

const env = 'jsdom';
console.log('environment', env);

export default defineConfig({
  test: {
    projects: [
      { test: { name: 'a', environment: pickEnvironment(process.env) } },
      { test: { name: 'b', environment: env } },
    ],
  },
});
