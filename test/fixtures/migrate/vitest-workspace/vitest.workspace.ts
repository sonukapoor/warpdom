import { defineWorkspace } from 'vitest/config';

export default defineWorkspace([
  'packages/*',
  {
    test: {
      name: 'inline',
      environment: 'happy-dom',
    },
  },
]);
