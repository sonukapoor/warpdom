// Vitest takes a package named vitest-environment-<name> or a path as
// test.environment, so warpdom exports the path, and withFastMode turns
// 'warpdom' into it.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { isAbsolute } from 'node:path';
import { environment } from '../src/vitest-environment.js';
import { withFastMode } from '../src/vitest-fast.js';

test('warpdom/vitest/environment: an absolute path to the Vitest environment', async () => {
  assert.ok(isAbsolute(environment) && existsSync(environment) && environment.endsWith('vitest.js'));
  const mod = await import(environment);
  assert.equal(typeof mod.default.setup, 'function');
});

test("withFastMode: environment 'warpdom' becomes the path, in the root and inline projects", () => {
  const out = withFastMode({ test: { environment: 'warpdom', projects: [{ test: { name: 'a', environment: 'warpdom' } }, { test: { name: 'b', environment: 'node' } }, 'packages/*'] } },
    { cache: '/nonexistent/fast-mode.json', project: 'a' });
  assert.equal(out.test.environment, environment);
  assert.equal(out.test.projects[0].test.environment, environment);
  assert.equal(out.test.projects[1].test.environment, 'node');
  assert.equal(out.test.projects[2], 'packages/*');
  assert.equal(withFastMode({ test: { environment: '/x/env.js' } }, { cache: '/nonexistent' }).test.environment, '/x/env.js');
});
