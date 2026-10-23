// µs per Vitest environment setup + teardown (src/vitest.js) on a fresh
// global-like object, plus touching a few common globals as a test file
// would; the per-test-file cost of the environment. Median of 15 samples of 30.
//
//   node bench/env-bench.mjs [warpdomDir]
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
// The warpdom checkout to measure: argv[2], default this repository.
const dir = path.resolve(process.argv[2] ?? fileURLToPath(new URL('..', import.meta.url)));
const load = (file) => import(pathToFileURL(path.join(dir, 'src', file)).href);
const { default: env } = await load('vitest.js');
const run = () => {
  const g = {};
  const r = env.setup(g, {});
  g.document.body.appendChild(g.document.createElement('div'));
  void g.HTMLElement;
  void g.Event;
  void g.MouseEvent;
  void g.KeyboardEvent;
  r.teardown();
};
for (let i = 0; i < 50; i++) run();
const t = [];
for (let r = 0; r < 15; r++) {
  const s = performance.now();
  for (let i = 0; i < 30; i++) run();
  t.push(((performance.now() - s) / 30) * 1000);
}
t.sort((a, b) => a - b);
console.log(t[7].toFixed(0));
