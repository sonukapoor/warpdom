// Ablation switches (src/ablate.js, docs/research/ablation-plan.md): each
// switches off only what it names; unset, nothing changes.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
// Each case runs in its own process: the switch is read once at load.
const run = (ablate, code) => {
  const res = spawnSync(process.execPath, ['--input-type=module', '-e', code], { cwd: root, encoding: 'utf8', env: { ...process.env, WARPDOM_ABLATE: ablate } });
  assert.equal(res.status, 0, res.stderr);
  return JSON.parse(res.stdout);
};
const VITEST = `const { default: env } = await import('./src/vitest.js');`;

test('eager-interfaces: materializeAll creates every interface of a window', async () => {
  const { createWindow } = await import('../src/index.js');
  const { materializeAll } = await import('../src/ablate.js');
  const w = createWindow();
  const lazy = () => Object.getOwnPropertyNames(w).filter((n) => /^[A-Z]/.test(n) && Object.getOwnPropertyDescriptor(w, n)?.get).length;
  assert.ok(lazy() > 100, 'interfaces are created on first use');
  materializeAll(w);
  assert.equal(lazy(), 0, 'none left to create');
  assert.equal(typeof w.HTMLDivElement, 'function');
});

test('no-query-cache: same results, nothing cached', () => {
  const code = `${VITEST} const { S } = await import('./src/internal.js'); const g = {}; const r = env.setup(g, {}); const d = g.document;
    d.body.innerHTML = '<p class=a>1</p><p>2</p>'; const a = d.querySelectorAll('p').length; const b = d.querySelector('.a').textContent;
    const cached = Boolean(d[S].queryCache); r.teardown(); console.log(JSON.stringify([a, b, cached]));`;
  assert.deepEqual(run('', code), [2, '1', true]);
  assert.deepEqual(run('no-query-cache', code), [2, '1', false]);
});

test('fresh-window: the reset installs a new window instead of resetting the old one', () => {
  const code = `${VITEST} const g = {}; const r = env.setup(g, {}); const before = g.document; before.body.innerHTML = '<p>x</p>';
    g[Symbol.for('warpdom.vitest.reset')](); const same = g.document === before; const empty = g.document.body.childNodes.length === 0; r.teardown(); console.log(JSON.stringify([same, empty]));`;
  assert.deepEqual(run('', code), [true, true], 'in place: same document, emptied');
  assert.deepEqual(run('fresh-window', code), [false, true], 'fresh: a new document');
});
