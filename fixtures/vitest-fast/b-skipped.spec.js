import { test } from 'vitest';
import './skipped-dep.js';

// Only skipped tests: the file's imports run, its beforeAll hooks (warpdom's
// mark among them) do not. The next file's reset must not delete what the
// imports set (the module stays loaded in the worker).
test.skip('b-skipped: never runs', () => {});
